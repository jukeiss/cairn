'use client'

/**
 * The main area — one note, two modes, plus the two big views.
 *
 * The sidebar is ALWAYS visible: Full view and the Graph replace only
 * this column, never the whole screen — like a real desktop tool.
 * A status bar (words · characters · backlinks) sits at the bottom.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  useNotes,
  useActiveNote,
  timeAgo,
  type Note,
} from '@/lib/notes-store'
import { charCount } from '@/lib/markdown'
import { outgoingLinks, backlinksFor, mentionSnippet } from '@/lib/links'
import { Reader } from './reader'
import { Editor } from './editor'
import { FullView } from './full-view'
import { GraphView } from './graph-view'
import {
  BookOpen,
  PencilLine,
  Star,
  Trash2,
  RotateCcw,
  Plus,
  FileText,
  Maximize2,
  Network,
  Folder,
  ChevronDown,
  Check,
  Link2,
  ArrowUpRight,
} from 'lucide-react'

export function NotePage() {
  const note = useActiveNote()
  const mode = useNotes((s) => s.mode)
  const saveState = useNotes((s) => s.saveState)
  const notesCount = useNotes((s) => s.notes.filter((n) => !n.deleted).length)
  const graphOpen = useNotes((s) => s.graphOpen)
  const fullViewOpen = useNotes((s) => s.fullViewOpen)
  const setMode = useNotes((s) => s.setMode)
  const toggleFavorite = useNotes((s) => s.toggleFavorite)
  const trashNote = useNotes((s) => s.trashNote)
  const restoreNote = useNotes((s) => s.restoreNote)
  const deleteForever = useNotes((s) => s.deleteForever)
  const renameNote = useNotes((s) => s.renameNote)
  const createNote = useNotes((s) => s.createNote)
  const setFullViewOpen = useNotes((s) => s.setFullViewOpen)
  const setGraphOpen = useNotes((s) => s.setGraphOpen)

  // the sidebar stays put — these views take over only this column
  if (graphOpen) {
    return (
      <main className="note-area" aria-label="Graph view">
        <GraphView />
      </main>
    )
  }

  if (fullViewOpen && note) {
    return (
      <main className="note-area" aria-label="Full view">
        <FullView />
      </main>
    )
  }

  if (!note) {
    return (
      <main className="note-area">
        <EmptyState hasNotes={notesCount > 0} onCreate={() => createNote()} />
      </main>
    )
  }

  const inTrash = note.deleted

  return (
    <main className="note-area" key={note.id}>
      {/* sticky header: title + actions + the big mode switch */}
      <header className="note-header">
        <div className="note-header-inner">
          {inTrash ? (
            <div className="trash-banner">
              <Trash2 size={15} strokeWidth={2} />
              <span>
                This note is in the <strong>Trash</strong>. Restore it to read or make changes.
              </span>
              <button type="button" className="btn-quiet accent" onClick={() => restoreNote(note.id)}>
                <RotateCcw size={14} strokeWidth={2.2} />
                Restore
              </button>
              <button
                type="button"
                className="btn-quiet danger"
                onClick={() => deleteForever(note.id)}
              >
                Delete forever
              </button>
            </div>
          ) : (
            <>
              <div className="title-row">
                <TitleInput
                  value={note.title}
                  editable={mode === 'edit' || !note.title}
                  onCommit={(t) => renameNote(note.id, t)}
                />
                <div className="note-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    title="Full view — focused reading with outline, links and backlinks"
                    onClick={() => setFullViewOpen(true)}
                  >
                    <Maximize2 size={14} strokeWidth={2.2} />
                    <span className="btn-ghost-text">Full view</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Show this vault as a graph"
                    aria-label="Show this vault as a graph"
                    onClick={() => setGraphOpen(true)}
                  >
                    <Network size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn${note.favorite ? ' starred' : ''}`}
                    title={note.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                    aria-label={note.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                    onClick={() => toggleFavorite(note.id)}
                  >
                    <Star size={16} strokeWidth={2} fill={note.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Move to Trash"
                    aria-label="Move to Trash"
                    onClick={() => trashNote(note.id)}
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="meta-row">
                <FolderPicker note={note} />
                <span className="meta-dot">·</span>
                <span className="meta-item">Edited {timeAgo(note.updatedAt)}</span>
                <span className={`save-flag${saveState === 'saving' ? ' busy' : ''}`}>
                  {saveState === 'saving' ? 'Saving…' : 'Saved'}
                </span>
              </div>

              {/* THE switch — impossible to miss */}
              <div className="mode-row">
                <div className="mode-switch" role="tablist" aria-label="Note mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'view'}
                    className={`mode-btn${mode === 'view' ? ' on' : ''}`}
                    onClick={() => setMode('view')}
                  >
                    <BookOpen size={15} strokeWidth={2.2} />
                    Reading
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'edit'}
                    className={`mode-btn${mode === 'edit' ? ' on' : ''}`}
                    onClick={() => setMode('edit')}
                  >
                    <PencilLine size={15} strokeWidth={2.2} />
                    Editing
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* the content */}
      {!inTrash &&
        (mode === 'view' ? (
          <div className="note-scroll">
            <Reader content={note.content} />
            <NoteLinksSection note={note} />
            <div className="read-footer">
              <button type="button" className="btn-primary" onClick={() => setMode('edit')}>
                <PencilLine size={15} strokeWidth={2.2} />
                Edit this note
              </button>
            </div>
          </div>
        ) : (
          <div className="note-scroll editor-host">
            <Editor noteId={note.id} initialContent={note.content} />
          </div>
        ))}

      {!inTrash && <StatusBar note={note} />}
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* Links — outgoing and backlinks, right under the note                */
/* ------------------------------------------------------------------ */

function NoteLinksSection({ note }: { note: Note }) {
  const notes = useNotes((s) => s.notes)
  const openOrCreateByTitle = useNotes((s) => s.openOrCreateByTitle)
  const openNote = useNotes((s) => s.openNote)

  const outgoing = useMemo(() => outgoingLinks(note.content), [note.content])
  const back = useMemo(
    () => backlinksFor(note.id, note.title, notes),
    [note.id, note.title, notes]
  )

  if (outgoing.length === 0 && back.length === 0) return null

  return (
    <div className="links-block">
      <div className="links-head">
        <Link2 size={12} strokeWidth={2.2} />
        Links
      </div>

      {outgoing.length > 0 && (
        <div className="links-group">
          <div className="links-label">Outgoing</div>
          {outgoing.map((l) => {
            const resolved = notes.some(
              (n) => !n.deleted && n.title.toLowerCase() === l.target.toLowerCase()
            )
            return (
              <button
                key={l.target.toLowerCase()}
                type="button"
                className={`links-item${resolved ? '' : ' missing'}`}
                title={resolved ? `Open “${l.target}”` : `Create “${l.target}”`}
                onClick={() => openOrCreateByTitle(l.target)}
              >
                <ArrowUpRight size={12} strokeWidth={2} />
                <span className="links-item-name">{l.alias}</span>
                {!resolved && <span className="links-hint">not created yet</span>}
              </button>
            )
          })}
        </div>
      )}

      {back.length > 0 && (
        <div className="links-group">
          <div className="links-label">Backlinks</div>
          {back.map((n) => {
            const snippet = mentionSnippet(n, note.title)
            return (
              <button
                key={n.id}
                type="button"
                className="links-item"
                title={`Open “${n.title || 'Untitled'}”`}
                onClick={() => openNote(n.id)}
              >
                <FileText size={12} strokeWidth={2} />
                <span className="links-item-name">{n.title || 'Untitled'}</span>
                {snippet && <span className="links-snippet">{snippet}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Status bar — quiet facts, always at the bottom (like a real tool)   */
/* ------------------------------------------------------------------ */

function StatusBar({ note }: { note: Note }) {
  const notes = useNotes((s) => s.notes)
  const setFullViewOpen = useNotes((s) => s.setFullViewOpen)
  const back = useMemo(
    () => backlinksFor(note.id, note.title, notes),
    [note.id, note.title, notes]
  )

  return (
    <footer className="status-bar">
      <span className="status-info">
        {wordCountOf(note.content)} words · {charCount(note.content)} characters
      </span>
      <button
        type="button"
        className="status-btn"
        title="Open Full view — outline, links and backlinks"
        onClick={() => setFullViewOpen(true)}
      >
        <Link2 size={11} strokeWidth={2.2} />
        {back.length} backlink{back.length === 1 ? '' : 's'}
      </button>
    </footer>
  )
}

function wordCountOf(content: string): number {
  const text = content.replace(/[#>*`~[\]()!-]/g, ' ').trim()
  if (!text) return 0
  return text.split(/\s+/).length
}

/* ------------------------------------------------------------------ */

function FolderPicker({ note }: { note: Note }) {
  const folders = useNotes((s) => s.folders)
  const moveNote = useNotes((s) => s.moveNote)
  const [open, setOpen] = useState(false)
  const current = folders.find((f) => f.id === note.folderId)

  return (
    <div className="move-wrap">
      <button
        type="button"
        className="meta-folder"
        title="Move this note to a folder"
        onClick={() => setOpen((o) => !o)}
      >
        <Folder size={12} strokeWidth={2} />
        <span>{current ? current.name : 'No folder'}</span>
        <ChevronDown size={11} strokeWidth={2.2} className={`move-chev${open ? ' open' : ''}`} />
      </button>
      {open && (
        <>
          <div className="pop-veil" onClick={() => setOpen(false)} />
          <div className="move-pop" role="menu" aria-label="Move to folder">
            <div className="move-pop-label">Move to folder</div>
            <button
              type="button"
              role="menuitem"
              className={`move-item${!note.folderId ? ' current' : ''}`}
              onClick={() => {
                moveNote(note.id, null)
                setOpen(false)
              }}
            >
              <span className="move-item-name">No folder</span>
              {!note.folderId && <Check size={13} strokeWidth={2.4} />}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitem"
                className={`move-item${note.folderId === f.id ? ' current' : ''}`}
                onClick={() => {
                  moveNote(note.id, f.id)
                  setOpen(false)
                }}
              >
                <Folder size={13} strokeWidth={2} className="move-item-ic" />
                <span className="move-item-name">{f.name}</span>
                {note.folderId === f.id && <Check size={13} strokeWidth={2.4} />}
              </button>
            ))}
            {folders.length === 0 && (
              <div className="move-none">Create a folder in the sidebar first.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function TitleInput({
  value,
  editable,
  onCommit,
}: {
  value: string
  editable: boolean
  onCommit: (t: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const draft = useRef(value)

  useEffect(() => {
    draft.current = value
    if (ref.current) ref.current.value = value
  }, [value])

  return (
    <input
      ref={ref}
      className="note-title"
      defaultValue={value}
      placeholder="Untitled"
      readOnly={!editable}
      maxLength={120}
      aria-label="Note title"
      onChange={(e) => {
        draft.current = e.target.value
      }}
      onBlur={(e) => {
        const t = e.target.value.trim()
        if (t !== value) onCommit(t)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function EmptyState({ hasNotes, onCreate }: { hasNotes: boolean; onCreate: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <span className="empty-icon" aria-hidden="true">
          <FileText size={22} strokeWidth={1.8} />
        </span>
        <h2>{hasNotes ? 'Pick a note from the sidebar' : 'A clean start'}</h2>
        <p>
          {hasNotes
            ? 'Click any note on the left to open it in Reading mode — a clean page, easy on the eyes.'
            : 'Write your first note. Switch between Reading and Editing any time with the switch at the top of the page.'}
        </p>
        <button type="button" className="btn-primary" onClick={onCreate}>
          <Plus size={16} strokeWidth={2.4} />
          Create a note
        </button>
      </div>
    </div>
  )
}
