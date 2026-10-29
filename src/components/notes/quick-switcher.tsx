'use client'

/**
 * Quick switcher — Ctrl K (or Ctrl O), type, Enter. Like the tools
 * you already know: fuzzy title search over the whole vault,
 * arrow keys to move, Esc to bail. Nothing to learn.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNotes, timeAgo } from '@/lib/notes-store'
import { fuzzyScore } from '@/lib/markdown'
import { Search, CornerDownLeft } from 'lucide-react'

const MAX_RESULTS = 9

export function QuickSwitcher() {
  const open = useNotes((s) => s.switcherOpen)
  if (!open) return null
  // mounting fresh every open gives clean state for free
  return <SwitcherPanel />
}

function SwitcherPanel() {
  const setOpen = useNotes((s) => s.setSwitcherOpen)
  const notes = useNotes((s) => s.notes)
  const activeId = useNotes((s) => s.activeId)
  const openNote = useNotes((s) => s.openNote)

  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // recent notes (newest first) — what you see before typing anything
  const pool = useMemo(
    () => notes.filter((n) => !n.deleted).sort((a, b) => b.updatedAt - a.updatedAt),
    [notes]
  )

  const results = useMemo(() => {
    const query = q.trim()
    if (!query) return pool.slice(0, MAX_RESULTS)
    return pool
      .map((n) => ({ note: n, score: fuzzyScore(query, n.title || 'Untitled') }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
      .slice(0, MAX_RESULTS)
      .map((r) => r.note)
  }, [q, pool])

  // focus the input on mount (this panel only exists while open)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // keep the selected row in view while arrowing
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.qs-row.selected')
    el?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIdx((i) => (results.length ? (i + 1) % results.length : 0))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIdx((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const pick = results[idx]
        if (pick) {
          openNote(pick.id)
          setOpen(false)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, idx, openNote, setOpen])

  return (
    <div
      className="qs-overlay"
      onMouseDown={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Quick switcher"
    >
      <div className="qs-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="qs-search">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <input
            ref={inputRef}
            className="qs-input"
            type="text"
            value={q}
            placeholder="Jump to a note…"
            maxLength={120}
            aria-label="Search note titles"
            onChange={(e) => {
              setQ(e.target.value)
              setIdx(0)
            }}
          />
        </div>

        <div className="qs-list" ref={listRef} role="listbox" aria-label="Notes">
          {results.length === 0 ? (
            <div className="qs-empty">
              No notes match “{q.trim()}”.
              <span className="qs-empty-sub">Titles only — search in the sidebar looks inside notes.</span>
            </div>
          ) : (
            results.map((n, i) => (
              <button
                key={n.id}
                type="button"
                role="option"
                aria-selected={i === idx}
                className={`qs-row${i === idx ? ' selected' : ''}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  openNote(n.id)
                  setOpen(false)
                }}
              >
                <span className="qs-row-title">{n.title || 'Untitled'}</span>
                {n.id === activeId && <span className="qs-row-open">open</span>}
                <span className="qs-row-time">{timeAgo(n.updatedAt)}</span>
              </button>
            ))
          )}
        </div>

        <div className="qs-foot">
          <span>
            <kbd className="qs-kbd">↑</kbd> <kbd className="qs-kbd">↓</kbd> to move
          </span>
          <span>
            <kbd className="qs-kbd">
              <CornerDownLeft size={9} strokeWidth={2.4} />
            </kbd>{' '}
            to open
          </span>
          <span>
            <kbd className="qs-kbd">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  )
}
