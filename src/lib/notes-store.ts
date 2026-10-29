'use client'

/**
 * Cairn notes store — deliberately simple.
 *
 * One note open at a time, one global mode ("Reading" or "Editing"),
 * a sidebar tree (Folders + loose Notes) with All/Favorites/Trash filters.
 * Notes live on disk as plain .md files (see vault-sync.ts); only small UI bits
 * (which note is open, which section) are remembered in localStorage.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { toast } from 'sonner'

export type FileInfo = { size: number }

export interface Note {
  id: string
  title: string
  content: string
  folderId: string | null
  favorite: boolean
  deleted: boolean
  createdAt: number
  updatedAt: number
}

export interface Folder {
  id: string
  name: string
}

export type Mode = 'view' | 'edit'
export type Section = 'all' | 'favorites' | 'trash'
export type SaveState = 'idle' | 'saving' | 'saved'

let idCounter = 0
function nextId() {
  idCounter += 1
  return `n-${Date.now().toString(36)}-${idCounter}`
}

function touch(note: Note): Note {
  return { ...note, updatedAt: Date.now() }
}

/* ------------------------------------------------------------------ */
/* Seed content — teaches the app on first launch                      */
/* ------------------------------------------------------------------ */

export const SEED_FOLDERS: Folder[] = [
  { id: 'f-seed-daily', name: 'Daily' },
  { id: 'f-seed-wiki', name: 'Wiki' },
]

export const SEED_NOTES: Note[] = [
  {
    id: 'n-seed-start',
    title: 'Start here',
    folderId: null,
    favorite: true,
    deleted: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    content: `Welcome to **Cairn** — a calm place for your notes, and for the connections between them.

## The two things worth knowing

1. Every note has one switch at the top: **Reading** for a clean page, **Editing** for writing. Opening a note always lands you in Reading.
2. The **Full view** button (top right) opens a focused reading layout — the outline, links and backlinks sit in a rail beside the note. Press **Esc** to leave it.
3. Press **Ctrl K** (Cmd K on Mac) to jump to any note without touching the mouse.

## Folders keep things tidy

The sidebar has two parts: **Folders** and loose **Notes**. Create a folder with the plus button next to the Folders label, then move any note into it with the folder button near the note's title. Two folders came with this vault as examples: Daily and Wiki.

## Links are the good part

Type **[[** and a note's title to connect two notes. Try [[Markdown examples]] or [[Weekly plan — template]]. Every link shows up in three places:

- under the note, in the Links section
- in the Full view rail
- as a line in the **Graph view** (bottom of the sidebar) — your notes as a map

Backlinks work the other way too: open [[Markdown examples]] and it will show that this page mentions it.

## Try it

- [ ] Create a folder and move a note into it
- [ ] Press **Ctrl K** and jump straight to any note
- [ ] Type **[[** in any note and link two pages together

Renaming a note is safe — links written as [[Start here]] follow the new title automatically.`,
  },
  {
    id: 'n-seed-basics',
    title: 'Markdown examples',
    folderId: 'f-seed-wiki',
    favorite: false,
    deleted: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
    updatedAt: Date.now() - 1000 * 60 * 60 * 26,
    content: `A quick tour of what the page can render, so you can steal any piece of it.

## Text

Plain paragraphs are just writing. You get **bold**, *italic*, ~~strikethrough~~, ==highlight==, \`inline code\`, and [links](https://example.com).

## Lists and to-dos

1. Ordered lists count themselves
2. So you never renumber anything

- [x] Ship the first version
- [ ] Collect feedback
    - [ ] From three people, minimum

## Quotes

> Simple things should be simple, complex things should be possible.
> — Alan Kay

## Code

\`\`\`ts
function greet(name: string) {
  return \`Hello, \${name}!\`
}
\`\`\`

## Tables

| Thing | Where it lives | Notes |
| --- | --- | --- |
| Search | Top of the sidebar | Searches titles and contents |
| Star | Note header | Puts the note in Favorites |
| Delete | Note header | Moves the note to Trash |

#tags work too — click #example to see it filter the list.

Back to [[Start here]].`,
  },
  {
    id: 'n-seed-week',
    title: 'Weekly plan — template',
    folderId: 'f-seed-daily',
    favorite: false,
    deleted: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    updatedAt: Date.now() - 1000 * 60 * 30,
    content: `Copy this into a new note each week. It takes twenty seconds and saves the whole week.

## Focus

One sentence: what would make this week a win?

- [ ] ...

## Days

| Day | Main thing | Also |
| --- | --- | --- |
| Mon | | |
| Tue | | |
| Wed | | |
| Thu | | |
| Fri | | |

## Notes to self

> Done is better than perfect. Ship small, ship often.

See also: [[Start here]] · [[Markdown examples]]`,
  },
]

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

interface NotesState {
  /** false until the vault has been read from disk */
  ready: boolean
  notes: Note[]
  folders: Folder[]
  /** attachments in the vault, keyed by path ("attachments/photo.png") */
  files: Record<string, FileInfo>
  activeId: string | null
  mode: Mode
  section: Section
  query: string
  saveState: SaveState
  fullViewOpen: boolean
  graphOpen: boolean
  switcherOpen: boolean

  createNote: (folderId?: string | null) => void
  openNote: (id: string) => void
  renameNote: (id: string, title: string) => void
  updateContent: (id: string, content: string) => void
  toggleFavorite: (id: string) => void
  trashNote: (id: string) => void
  restoreNote: (id: string) => void
  deleteForever: (id: string) => void
  emptyTrash: () => void

  createFolder: (name: string) => void
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  moveNote: (id: string, folderId: string | null) => void

  setMode: (mode: Mode) => void
  setSection: (section: Section) => void
  setQuery: (query: string) => void
  setFullViewOpen: (open: boolean) => void
  setGraphOpen: (open: boolean) => void
  setSwitcherOpen: (open: boolean) => void
  openOrCreateByTitle: (title: string) => void
  /** attachments */
  setFiles: (files: Record<string, FileInfo>) => void
  openAttachment: (path: string | null) => void
  attachment: string | null
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useNotes = create<NotesState>()(
  persist(
    (set, get) => ({
      ready: false,
      notes: [],
      folders: [],
      files: {},
      attachment: null,
      activeId: null,
      mode: 'view',
      section: 'all',
      query: '',
      saveState: 'idle',
      fullViewOpen: false,
      graphOpen: false,
      switcherOpen: false,

      createNote: (folderId) => {
        const now = Date.now()
        const note: Note = {
          id: nextId(),
          title: '',
          content: '',
          folderId: folderId ?? null,
          favorite: false,
          deleted: false,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({
          notes: [note, ...s.notes],
          activeId: note.id,
          mode: 'edit',
          section: 'all',
          query: '',
          fullViewOpen: false,
          graphOpen: false,
        }))
      },

      openNote: (id) => set({ activeId: id, mode: 'view' }),

      renameNote: (id, title) => {
        const old = get().notes.find((n) => n.id === id)?.title
        const nextNotes = title && old && old !== title
          ? rewriteLinks(get().notes, id, old, title)
          : get().notes
        set((s) => ({
          notes: nextNotes.map((n) => (n.id === id ? touch({ ...n, title }) : n)),
          saveState: 'saving',
        }))
        scheduleSaved()
      },

      updateContent: (id, content) => {
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? touch({ ...n, content }) : n)),
          saveState: 'saving',
        }))
        scheduleSaved()
      },

      toggleFavorite: (id) => {
        const note = get().notes.find((n) => n.id === id)
        if (!note) return
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? touch({ ...n, favorite: !n.favorite }) : n)),
        }))
        if (!note.favorite) toast.success('Added to Favorites')
      },

      trashNote: (id) => {
        const note = get().notes.find((n) => n.id === id)
        if (!note) return
        const remaining = get().notes.filter((n) => !n.deleted && n.id !== id)
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, deleted: true, favorite: false } : n)),
          activeId: s.activeId === id ? (remaining[0]?.id ?? null) : s.activeId,
          mode: 'view',
        }))
        toast('Moved to Trash', {
          description: note.title || 'Untitled',
          action: { label: 'Undo', onClick: () => get().restoreNote(id) },
        })
      },

      restoreNote: (id) => {
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, deleted: false } : n)),
          activeId: id,
          mode: 'view',
          section: 'all',
        }))
        toast.success('Restored')
      },

      deleteForever: (id) => {
        const note = get().notes.find((n) => n.id === id)
        set((s) => ({
          notes: s.notes.filter((n) => n.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
          fullViewOpen: false,
          graphOpen: false,
        }))
        toast(`Deleted forever`, { description: note?.title || 'Untitled' })
      },

      emptyTrash: () => {
        const count = get().notes.filter((n) => n.deleted).length
        if (count === 0) return
        set((s) => ({
          notes: s.notes.filter((n) => !n.deleted),
          activeId: s.notes.find((n) => n.id === s.activeId)?.deleted ? null : s.activeId,
          fullViewOpen: false,
          graphOpen: false,
        }))
        toast(`Trash emptied — ${count} note${count === 1 ? '' : 's'} removed`)
      },

      createFolder: (name) => {
        const clean = name.trim()
        if (!clean) return
        set((s) => ({ folders: [...s.folders, { id: nextId(), name: clean }] }))
      },

      renameFolder: (id, name) => {
        const clean = name.trim()
        if (!clean) return
        set((s) => ({
          folders: s.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)),
        }))
      },

      deleteFolder: (id) => {
        const folder = get().folders.find((f) => f.id === id)
        set((s) => ({
          folders: s.folders.filter((f) => f.id !== id),
          notes: s.notes.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
        }))
        if (folder) toast('Folder removed', { description: 'Its notes are still in All notes.' })
      },

      moveNote: (id, folderId) => {
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? touch({ ...n, folderId }) : n)),
          saveState: 'saving',
        }))
        scheduleSaved()
      },

      setMode: (mode) => set({ mode, saveState: 'idle' }),
      setSection: (section) => set({ section }),
      setQuery: (query) => set({ query }),
      // the two big views are exclusive — opening one leaves the other
      setFullViewOpen: (open) =>
        set(open ? { fullViewOpen: true, graphOpen: false } : { fullViewOpen: false }),
      setGraphOpen: (open) =>
        set(open ? { graphOpen: true, fullViewOpen: false } : { graphOpen: false }),
      setSwitcherOpen: (open) => set({ switcherOpen: open }),

      setFiles: (files) => set({ files }),
      openAttachment: (path) => set({ attachment: path }),

      openOrCreateByTitle: (title) => {
        const target = title.trim()
        if (!target) return
        const existing = get().notes.find(
          (n) => !n.deleted && n.title.toLowerCase() === target.toLowerCase()
        )
        if (existing) {
          get().openNote(existing.id)
          set({ fullViewOpen: false, graphOpen: false, switcherOpen: false })
          return
        }
        get().createNote()
        const fresh = get().activeId
        if (fresh) get().renameNote(fresh, target)
      },
    }),
    {
      name: 'cairn.ui.v1',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? (undefined as never) : window.localStorage)),
      partialize: (s) => ({ activeId: s.activeId, section: s.section }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<NotesState>
        return { ...current, activeId: p.activeId ?? null, section: p.section ?? current.section }
      },
    }
  )
)

/** After a rename, follow the title change inside [[wiki links]] everywhere. */
function rewriteLinks(notes: Note[], renamedId: string, oldTitle: string, newTitle: string): Note[] {
  const esc = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const probe = new RegExp(`\\[\\[${esc}(\\|\\]|\\])`, 'i')
  return notes.map((n) => {
    if (n.id === renamedId || !probe.test(n.content)) return n
    const global = new RegExp(`\\[\\[${esc}(\\|\\]|\\])`, 'gi')
    return { ...n, content: n.content.replace(global, `[[${newTitle}$1`) }
  })
}

function scheduleSaved() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => useNotes.setState({ saveState: 'saved' }), 500)
}

/* ------------------------------------------------------------------ */
/* Derived helpers                                                     */
/* ------------------------------------------------------------------ */

export function useActiveNote(): Note | null {
  return useNotes((s) => s.notes.find((n) => n.id === s.activeId) ?? null)
}

export function visibleNotes(notes: Note[], section: Section, query: string): Note[] {
  const q = query.trim().toLowerCase()
  let list = notes.filter((n) => {
    if (section === 'trash') return n.deleted
    if (n.deleted) return false
    if (section === 'favorites') return n.favorite
    return true
  })
  if (q) {
    list = list.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    )
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function wordCount(content: string): number {
  const text = content.replace(/[#>*`~\[\]()!-]/g, ' ').trim()
  if (!text) return 0
  return text.split(/\s+/).length
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min === 1) return '1 minute ago'
  if (min < 60) return `${min} minutes ago`
  const hr = Math.floor(min / 60)
  if (hr === 1) return '1 hour ago'
  if (hr < 24) return `${hr} hours ago`
  const d = Math.floor(hr / 24)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} days ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
