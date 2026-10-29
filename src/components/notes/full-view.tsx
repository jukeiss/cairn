'use client'

/**
 * Full view — one button, the focused page.
 *
 * A distraction-free reading layout of the current note with a rail
 * beside it: the outline, outgoing links, backlinks and tags.
 * It takes over the note column only — the sidebar stays where it is.
 * Esc or the close button returns to the normal layout.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { useNotes, useActiveNote } from '@/lib/notes-store'
import { outgoingLinks, backlinksFor } from '@/lib/links'
import { Reader } from './reader'
import { X, PencilLine, Link2, ArrowUpRight, Hash } from 'lucide-react'

interface HeadingInfo {
  level: number
  text: string
}

/** Extract headings and tags while skipping fenced code blocks */
function analyzeHeadingsTags(content: string) {
  const headings: HeadingInfo[] = []
  const tags = new Set<string>()
  let fenced = false

  const plainText = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/==([^=]+)==/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^\[\]|]+)(?:\|([^\]]+))?\]\]/g, '$1')
      .trim()

  const tagRe = /(^|[\s("'])#([A-Za-z0-9][\w/-]*)/g

  for (const raw of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue

    const h = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(raw)
    if (h) headings.push({ level: h[1].length, text: plainText(h[2]) })

    tagRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = tagRe.exec(raw))) tags.add(m[2])
  }

  return { headings, tags: [...tags].sort() }
}

export function FullView() {
  const open = useNotes((s) => s.fullViewOpen)
  const note = useActiveNote()
  const notes = useNotes((s) => s.notes)
  const setFullViewOpen = useNotes((s) => s.setFullViewOpen)
  const setMode = useNotes((s) => s.setMode)
  const openOrCreateByTitle = useNotes((s) => s.openOrCreateByTitle)
  const openNote = useNotes((s) => s.openNote)
  const setSection = useNotes((s) => s.setSection)
  const setQuery = useNotes((s) => s.setQuery)
  const scrollRef = useRef<HTMLDivElement>(null)

  const headingsData = useMemo(
    () => (note ? analyzeHeadingsTags(note.content) : null),
    [note]
  )
  const outgoing = useMemo(() => (note ? outgoingLinks(note.content) : []), [note])
  const backlinks = useMemo(
    () => (note ? backlinksFor(note.id, note.title, notes) : []),
    [note, notes]
  )

  // Esc closes; page behind stays put
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (useNotes.getState().switcherOpen) return
      if (e.key === 'Escape') setFullViewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setFullViewOpen])

  if (!open || !note || !headingsData) return null

  const jumpToHeading = (index: number) => {
    const container = scrollRef.current
    if (!container) return
    const els = container.querySelectorAll<HTMLElement>('h1, h2, h3, h4')
    const target = els[index]
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const gotoNote = (title: string) => {
    openOrCreateByTitle(title)
  }

  return (
    <div className="fv-view" aria-label="Full view">
      <div className="fv-topbar">
        <span className="fv-crumb">Full view</span>
        <span className="fv-title">{note.title || 'Untitled'}</span>
        <div className="fv-topbar-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setFullViewOpen(false)
              setMode('edit')
            }}
          >
            <PencilLine size={14} strokeWidth={2.2} />
            <span className="btn-ghost-text">Edit</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setFullViewOpen(false)}
            aria-label="Close full view"
            title="Close (Esc)"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="fv-body">
        <div className="fv-content" ref={scrollRef}>
          <Reader content={note.content} />
        </div>

        <aside className="fv-rail" aria-label="Outline and links">
          <div className="fv-group">
            <div className="fv-rail-label">Outline</div>
            {headingsData.headings.length === 0 ? (
              <div className="fv-none">No headings yet</div>
            ) : (
              headingsData.headings.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  className={`fv-item lvl-${h.level}`}
                  onClick={() => jumpToHeading(i)}
                >
                  {h.text}
                </button>
              ))
            )}
          </div>

          {outgoing.length > 0 && (
            <div className="fv-group">
              <div className="fv-rail-label">
                <Link2 size={11} strokeWidth={2.4} className="fv-label-icon" /> Outgoing links
              </div>
              {outgoing.map((l) => (
                <button
                  key={l.target.toLowerCase()}
                  type="button"
                  className="fv-item"
                  onClick={() => gotoNote(l.target)}
                >
                  <ArrowUpRight size={12} strokeWidth={2} className="fv-item-icon" />
                  {l.alias}
                </button>
              ))}
            </div>
          )}

          {backlinks.length > 0 && (
            <div className="fv-group">
              <div className="fv-rail-label">Backlinks</div>
              {backlinks.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="fv-item"
                  onClick={() => {
                    openNote(n.id)
                    setFullViewOpen(false)
                  }}
                >
                  {n.title || 'Untitled'}
                </button>
              ))}
            </div>
          )}

          {headingsData.tags.length > 0 && (
            <div className="fv-group">
              <div className="fv-rail-label">
                <Hash size={11} strokeWidth={2.4} className="fv-label-icon" /> Tags
              </div>
              <div className="fv-tags">
                {headingsData.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="tag-pill"
                    onClick={() => {
                      setSection('all')
                      setQuery('#' + t)
                      setFullViewOpen(false)
                    }}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
