'use client'

/**
 * Graph view — the whole vault as a map.
 *
 * Notes are dots, [[wiki links]] are lines, colors follow folders.
 * Drag to pan, scroll to zoom, click a dot to open the note.
 * The layout is computed once per open (a short force simulation),
 * so panning and zooming stay perfectly smooth.
 *
 * It fills the note column only — the sidebar stays visible.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNotes, type Note, type Folder } from '@/lib/notes-store'
import { X, Plus, Minus, Maximize, Network } from 'lucide-react'

interface GNode {
  id: string
  title: string
  color: string
  x: number
  y: number
  vx: number
  vy: number
  degree: number
}
interface GEdge {
  a: number
  b: number
}

/* muted, print-like palette — one hue per folder, in insertion order */
const PALETTE = ['#c99a5b', '#7f9db9', '#9c8ab8', '#6ea89b', '#c47f6f', '#8ba05f', '#c08fa8', '#b0a080']
const UNFILED_COLOR = '#8a8a8a'

function folderColor(folders: Folder[], folderId: string | null): string {
  if (!folderId) return UNFILED_COLOR
  const i = folders.findIndex((f) => f.id === folderId)
  return i >= 0 ? PALETTE[i % PALETTE.length] : UNFILED_COLOR
}

function buildGraph(notes: Note[], folders: Folder[]) {
  const active = notes.filter((n) => !n.deleted)
  const titleToId = new Map<string, string>()
  for (const n of active) titleToId.set(n.title.trim().toLowerCase(), n.id)

  const nodes: GNode[] = active.map((n, i) => ({
    id: n.id,
    title: n.title || 'Untitled',
    color: folderColor(folders, n.folderId),
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    degree: 0,
  }))
  const R = Math.max(140, Math.sqrt(nodes.length) * 90)
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2
    n.x = Math.cos(a) * R + (Math.random() - 0.5) * 24
    n.y = Math.sin(a) * R + (Math.random() - 0.5) * 24
  })

  const idToIndex = new Map<string, number>()
  nodes.forEach((n, i) => idToIndex.set(n.id, i))

  const wikiRe = /\[\[([^\[\]|]+)(?:\|([^\]]+))?\]\]/g
  const seen = new Set<string>()
  const edges: GEdge[] = []
  for (const n of active) {
    const selfIdx = idToIndex.get(n.id)!
    wikiRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = wikiRe.exec(n.content))) {
      const target = titleToId.get(m[1].trim().toLowerCase())
      if (!target || target === n.id) continue
      const other = idToIndex.get(target)!
      const key = selfIdx < other ? `${selfIdx}-${other}` : `${other}-${selfIdx}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ a: selfIdx, b: other })
      nodes[selfIdx].degree += 1
      nodes[other].degree += 1
    }
  }
  return { nodes, edges }
}

/* one-shot force simulation — repulsion, link springs, centering */
function simulate(nodes: GNode[], edges: GEdge[], iterations: number) {
  const REP = 2800
  const SPRING = 0.028
  const REST = 120
  const GRAV = 0.02
  const DAMP = 0.85

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          d2 = 1
        }
        const d = Math.sqrt(d2)
        const f = REP / d2
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }
    for (const e of edges) {
      const a = nodes[e.a]
      const b = nodes[e.b]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.max(1, Math.hypot(dx, dy))
      const f = (d - REST) * SPRING
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }
    for (const n of nodes) {
      n.vx -= n.x * GRAV
      n.vy -= n.y * GRAV
      n.vx *= DAMP
      n.vy *= DAMP
      n.x += n.vx
      n.y += n.vy
    }
  }
}

interface View {
  x: number
  y: number
  k: number
}

export function GraphView() {
  const open = useNotes((s) => s.graphOpen)
  const notes = useNotes((s) => s.notes)
  const folders = useNotes((s) => s.folders)
  const setGraphOpen = useNotes((s) => s.setGraphOpen)
  const openNote = useNotes((s) => s.openNote)

  const [layout, setLayout] = useState<{ nodes: GNode[]; edges: GEdge[] } | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ on: boolean; sx: number; sy: number; ox: number; oy: number } | null>(null)

  const stats = useMemo(() => {
    const live = notes.filter((n) => !n.deleted)
    return { noteCount: live.length }
  }, [notes])

  const fit = useCallback((g: { nodes: GNode[] } | null) => {
    const el = wrapRef.current
    if (!el || !g || g.nodes.length === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of g.nodes) {
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x > maxX) maxX = n.x
      if (n.y > maxY) maxY = n.y
    }
    const w = el.clientWidth
    const h = el.clientHeight
    const bw = Math.max(1, maxX - minX)
    const bh = Math.max(1, maxY - minY)
    const k = Math.min(1.5, Math.max(0.25, Math.min((w - 120) / bw, (h - 140) / bh)))
    setView({ x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k, k })
  }, [])

  /* compute layout once per open — inside rAF so the click that opened
     the graph paints first; reads fresh state at open time */
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      const { notes, folders } = useNotes.getState()
      const g = buildGraph(notes, folders)
      if (g.nodes.length > 0) simulate(g.nodes, g.edges, 260)
      setLayout(g)
      setHover(null)
      fit(g)
    })
    return () => cancelAnimationFrame(raf)
  }, [open, fit])

  /* Esc closes */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (useNotes.getState().switcherOpen) return
      if (e.key === 'Escape') setGraphOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setGraphOpen])

  /* wheel zoom around the cursor — native listener so we can preventDefault */
  useEffect(() => {
    if (!open) return
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setView((v) => {
        const k = Math.min(4, Math.max(0.15, v.k * Math.exp(-e.deltaY * 0.0013)))
        const s = k / v.k
        return { k, x: px - (px - v.x) * s, y: py - (py - v.y) * s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open, layout])

  const zoomBy = (factor: number) => {
    const el = wrapRef.current
    if (!el) return
    const px = el.clientWidth / 2
    const py = el.clientHeight / 2
    setView((v) => {
      const k = Math.min(4, Math.max(0.15, v.k * factor))
      const s = k / v.k
      return { k, x: px - (px - v.x) * s, y: py - (py - v.y) * s }
    })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { on: true, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d?.on) return
    setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  if (!open) return null

  const nodes = layout?.nodes ?? []
  const edges = layout?.edges ?? []
  const neighbors = new Set<number>()
  if (hover !== null) {
    neighbors.add(hover)
    for (const e of edges) {
      if (e.a === hover) neighbors.add(e.b)
      if (e.b === hover) neighbors.add(e.a)
    }
  }

  const legendItems = [
    ...folders.map((f, i) => ({
      name: f.name,
      color: PALETTE[i % PALETTE.length],
      count: notes.filter((n) => !n.deleted && n.folderId === f.id).length,
    })),
    {
      name: 'No folder',
      color: UNFILED_COLOR,
      count: notes.filter((n) => !n.deleted && !n.folderId).length,
    },
  ].filter((l) => l.count > 0)

  return (
    <div className="graph-view" aria-label="Graph view">
      <div className="graph-topbar">
        <span className="graph-brand">
          <Network size={14} strokeWidth={2} />
          Graph
        </span>
        <span className="graph-sub">
          {stats.noteCount} note{stats.noteCount === 1 ? '' : 's'} · {edges.length} link
          {edges.length === 1 ? '' : 's'}
        </span>
        <div className="graph-topbar-actions">
          <button type="button" className="icon-btn" title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
            <Minus size={15} strokeWidth={2.2} />
          </button>
          <button type="button" className="icon-btn" title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
            <Plus size={15} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Fit to screen"
            aria-label="Fit to screen"
            onClick={() => fit(layout)}
          >
            <Maximize size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Close graph (Esc)"
            aria-label="Close graph"
            onClick={() => setGraphOpen(false)}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="graph-canvas" ref={wrapRef}>
        {nodes.length === 0 ? (
          <div className="graph-empty">No notes to map yet — write something first.</div>
        ) : (
          <svg
            ref={svgRef}
            className="graph-svg"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {edges.map((e, i) => {
                const lit = hover !== null && (e.a === hover || e.b === hover)
                return (
                  <line
                    key={i}
                    x1={nodes[e.a].x}
                    y1={nodes[e.a].y}
                    x2={nodes[e.b].x}
                    y2={nodes[e.b].y}
                    className={`graph-edge${lit ? ' lit' : ''}${hover !== null && !lit ? ' dim' : ''}`}
                  />
                )
              })}
              {nodes.map((n, i) => {
                const dim = hover !== null && !neighbors.has(i)
                const r = 4.5 + Math.min(5, n.degree * 1.4)
                return (
                  <g
                    key={n.id}
                    className={`graph-node${dim ? ' dim' : ''}`}
                    transform={`translate(${n.x},${n.y})`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                    onClick={() => {
                      openNote(n.id)
                      setGraphOpen(false)
                    }}
                  >
                    <circle r={r + 8} className="graph-hit" />
                    <circle r={r} fill={n.color} className="graph-dot" />
                    <text y={r + 12} textAnchor="middle" className="graph-label">
                      {n.title.length > 26 ? n.title.slice(0, 25) + '…' : n.title}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        )}

        {legendItems.length > 0 && nodes.length > 0 && (
          <div className="graph-legend" aria-hidden="true">
            {legendItems.map((l) => (
              <span key={l.name} className="legend-item">
                <span className="legend-dot" style={{ background: l.color }} />
                {l.name}
              </span>
            ))}
          </div>
        )}
        <div className="graph-help">Drag to pan · Scroll to zoom · Click a dot to open</div>
      </div>
    </div>
  )
}
