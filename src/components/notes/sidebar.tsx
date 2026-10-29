'use client'

/**
 * Sidebar — one obvious place for everything:
 *
 *   All notes / Favorites / Trash  (filters)
 *   Folders                        (a real tree, like a vault)
 *   Notes                          (everything not in a folder)
 *
 * When you search, the tree gets out of the way and shows flat results.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  useNotes,
  visibleNotes,
  type Section,
  type Note,
  type Folder,
} from '@/lib/notes-store'
import {
  Plus,
  Search,
  FileText,
  Star,
  Trash2,
  RotateCcw,
  ChevronRight,
  Folder as FolderIcon,
  Network,
  Command,
} from 'lucide-react'
import { AttachmentList } from './attachment'

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All notes', icon: <FileText size={15} strokeWidth={2} /> },
  { id: 'favorites', label: 'Favorites', icon: <Star size={15} strokeWidth={2} /> },
  { id: 'trash', label: 'Trash', icon: <Trash2 size={15} strokeWidth={2} /> },
]

export function Sidebar() {
  const notes = useNotes((s) => s.notes)
  const folders = useNotes((s) => s.folders)
  const section = useNotes((s) => s.section)
  const query = useNotes((s) => s.query)
  const activeId = useNotes((s) => s.activeId)
  const setSection = useNotes((s) => s.setSection)
  const setQuery = useNotes((s) => s.setQuery)
  const openNote = useNotes((s) => s.openNote)
  const createNote = useNotes((s) => s.createNote)
  const restoreNote = useNotes((s) => s.restoreNote)
  const deleteForever = useNotes((s) => s.deleteForever)
  const emptyTrash = useNotes((s) => s.emptyTrash)
  const setGraphOpen = useNotes((s) => s.setGraphOpen)
  const setSwitcherOpen = useNotes((s) => s.setSwitcherOpen)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const flat = visibleNotes(notes, section, query)
  const counts = {
    all: notes.filter((n) => !n.deleted).length,
    favorites: notes.filter((n) => n.favorite && !n.deleted).length,
    trash: notes.filter((n) => n.deleted).length,
  }

  const live = notes.filter((n) => !n.deleted)
  const treeMode = section === 'all' && !query.trim()
  const folderNotes = (f: Folder) =>
    live
      .filter((n) => n.folderId === f.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  const unfiled = live
    .filter((n) => !n.folderId || !folders.some((f) => f.id === n.folderId))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const toggleFolder = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="sidebar" aria-label="Notes navigation">
      <div className="sidebar-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="16" height="16">
              <path
                d="M16 5l9 11-9 11-9-11z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="brand-name">Cairn</span>
          <span className="brand-count">{counts.all} notes</span>
        </div>

        <button
          type="button"
          className="new-note-btn"
          onClick={() => createNote()}
        >
          <Plus size={16} strokeWidth={2.4} />
          New note
        </button>

        <div className="search-box">
          <Search size={14} strokeWidth={2} aria-hidden="true" />
          <input
            type="text"
            value={query}
            placeholder="Search notes…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search notes"
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <nav className="section-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`section-item${section === s.id ? ' active' : ''}`}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
            >
              {s.icon}
              <span>{s.label}</span>
              <span className="section-count">{counts[s.id]}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-list" role="list">
        {section === 'trash' && counts.trash > 0 && (
          <div className="trash-actions">
            <span>Deleted notes stay here.</span>
            <button type="button" className="link-btn danger" onClick={emptyTrash}>
              Empty trash
            </button>
          </div>
        )}

        {treeMode ? (
          <>
            {/* ---- Folders ---- */}
            <div className="tree-head">
              <span className="tree-label">Folders</span>
              <button
                type="button"
                className="tree-add"
                title="New folder"
                aria-label="New folder"
                onClick={() => setCreating(true)}
              >
                <Plus size={13} strokeWidth={2.4} />
              </button>
            </div>

            {folders.map((f) => {
              const kids = folderNotes(f)
              const isOpen = !collapsed.has(f.id)
              return (
                <div className="tree-folder" key={f.id}>
                  <FolderRow
                    folder={f}
                    count={kids.length}
                    open={isOpen}
                    onToggle={() => toggleFolder(f.id)}
                  />
                  {isOpen &&
                    kids.map((note) => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        active={note.id === activeId}
                        inTrash={false}
                        query=""
                        indent
                        onOpen={() => openNote(note.id)}
                        onRestore={() => restoreNote(note.id)}
                        onDelete={() => deleteForever(note.id)}
                      />
                    ))}
                </div>
              )
            })}

            {creating && (
              <NewFolderInput
                onDone={(name) => {
                  if (name) useNotes.getState().createFolder(name)
                  setCreating(false)
                }}
              />
            )}

            {/* ---- Loose notes ---- */}
            <div className={`tree-head${folders.length === 0 && !creating ? ' first' : ''}`}>
              <span className="tree-label">Notes</span>
            </div>
            {unfiled.length === 0 && folders.length === 0 && !creating ? (
              <div className="list-empty">No notes yet — create one above.</div>
            ) : (
              unfiled.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  active={note.id === activeId}
                  inTrash={false}
                  query=""
                  onOpen={() => openNote(note.id)}
                  onRestore={() => restoreNote(note.id)}
                  onDelete={() => deleteForever(note.id)}
                />
              ))
            )}
            <AttachmentList />
          </>
        ) : flat.length === 0 ? (
          <div className="list-empty">
            {query
              ? 'Nothing matches your search.'
              : section === 'favorites'
                ? 'Star a note to keep it here.'
                : 'Trash is empty.'}
          </div>
        ) : (
          flat.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              active={note.id === activeId}
              inTrash={section === 'trash'}
              query={query}
              onOpen={() => openNote(note.id)}
              onRestore={() => restoreNote(note.id)}
              onDelete={() => deleteForever(note.id)}
            />
          ))
        )}
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className="foot-btn"
          title="Jump to any note (Ctrl K)"
          onClick={() => setSwitcherOpen(true)}
        >
          <Command size={14} strokeWidth={2} />
          Quick switcher
          <span className="foot-hint">Ctrl K</span>
        </button>
        <button type="button" className="foot-btn" onClick={() => setGraphOpen(true)}>
          <Network size={14} strokeWidth={2} />
          Graph view
          <span className="foot-hint">see how notes connect</span>
        </button>
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------------ */

function FolderRow({
  folder,
  count,
  open,
  onToggle,
}: {
  folder: Folder
  count: number
  open: boolean
  onToggle: () => void
}) {
  const renameFolder = useNotes((s) => s.renameFolder)
  const deleteFolder = useNotes((s) => s.deleteFolder)
  const createNote = useNotes((s) => s.createNote)
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div className="folder-row editing">
        <RenameInput
          initial={folder.name}
          onDone={(name) => {
            if (name) renameFolder(folder.id, name)
            setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div
      className="folder-row"
      onClick={onToggle}
      onDoubleClick={() => setEditing(true)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      title="Click to expand — double-click to rename"
    >
      <ChevronRight size={13} strokeWidth={2.2} className={`folder-chev${open ? ' open' : ''}`} />
      <FolderIcon size={14} strokeWidth={2} className="folder-ic" />
      <span className="folder-name">{folder.name}</span>
      <span className="folder-count">{count}</span>
      <span className="folder-actions">
        <button
          type="button"
          className="row-btn"
          title="New note in this folder"
          aria-label={`New note in ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation()
            createNote(folder.id)
          }}
        >
          <Plus size={13} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          className="row-btn danger"
          title="Delete folder (notes are kept)"
          aria-label={`Delete folder ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation()
            deleteFolder(folder.id)
          }}
        >
          <Trash2 size={13} strokeWidth={2.2} />
        </button>
      </span>
    </div>
  )
}

function NewFolderInput({ onDone }: { onDone: (name: string | null) => void }) {
  return (
    <div className="folder-row editing">
      <RenameInput initial="" placeholder="Folder name" onDone={onDone} autoFocus />
    </div>
  )
}

function RenameInput({
  initial,
  placeholder,
  onDone,
  autoFocus,
}: {
  initial: string
  placeholder?: string
  onDone: (name: string | null) => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  return (
    <input
      ref={ref}
      className="tree-input"
      defaultValue={initial}
      placeholder={placeholder ?? 'Folder name'}
      maxLength={60}
      aria-label="Folder name"
      onBlur={(e) => onDone(e.target.value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(e.currentTarget.value.trim() || null)
        if (e.key === 'Escape') onDone(null)
      }}
    />
  )
}

/* ------------------------------------------------------------------ */

export function NoteRow({
  note,
  active,
  inTrash,
  query,
  indent,
  onOpen,
  onRestore,
  onDelete,
}: {
  note: Note
  active: boolean
  inTrash: boolean
  query: string
  indent?: boolean
  onOpen: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const q = query.trim().toLowerCase()
  const snippet = note.content
    .replace(/[#>*`~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const hit = q && !note.title.toLowerCase().includes(q)
    ? snippet.toLowerCase().indexOf(q)
    : -1
  const show =
    hit >= 0
      ? (hit > 24 ? '…' : '') + snippet.slice(Math.max(0, hit - 24), hit + 60) + '…'
      : snippet.slice(0, 90)

  return (
    <div
      role="listitem"
      className={`note-row${active ? ' active' : ''}${indent ? ' in-folder' : ''}`}
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="note-row-title">
        <span className="note-row-name">{note.title || 'Untitled'}</span>
        {note.favorite && !inTrash && <Star size={12} className="row-star" fill="currentColor" />}
      </div>
      {show && <div className="note-row-snippet">{show}</div>}
      <div className="note-row-meta">{relativeDate(note.updatedAt)}</div>

      {inTrash && (
        <div className="row-actions">
          <button
            type="button"
            className="row-btn"
            title="Restore note"
            aria-label="Restore note"
            onClick={(e) => {
              e.stopPropagation()
              onRestore()
            }}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="row-btn danger"
            title="Delete forever"
            aria-label="Delete forever"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

function relativeDate(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d === 1) return 'yesterday'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
