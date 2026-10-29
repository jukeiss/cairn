'use client'

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Toaster } from 'sonner'
import { useNotes } from '@/lib/notes-store'
import { startVaultSync } from '@/lib/vault-sync'
import { Sidebar } from '@/components/notes/sidebar'
import { NotePage } from '@/components/notes/note-page'
import { QuickSwitcher } from '@/components/notes/quick-switcher'
import { AttachmentViewer, addFiles, useGlobalDrop } from '@/components/notes/attachment'

function subscribeToHydration(onChange: () => void) {
  return useNotes.persist.onFinishHydration(onChange)
}

export default function Page() {
  // wait for the UI prefs, then for the vault to be read from disk
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => useNotes.persist.hasHydrated(),
    () => false
  )
  const ready = useNotes((s) => s.ready)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    startVaultSync().catch(() => setFailed(true))
  }, [hydrated])

  // dropping files outside the editor adds them to the vault (the editor handles its own drops)
  const onFiles = useCallback((files: File[]) => void addFiles(files), [])
  useGlobalDrop(onFiles)

  // Ctrl/Cmd+N creates a note · Ctrl/Cmd+K or Ctrl/Cmd+O jumps to any note
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useNotes.getState()
      if (!s.ready) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        s.createNote()
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'o')) {
        e.preventDefault()
        s.setSwitcherOpen(!s.switcherOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (failed) {
    return (
      <div className="boot-error">
        <h1>Can’t reach your vault</h1>
        <p>
          Cairn couldn’t read its notes folder. Check that the server is running (<code>npm run dev</code>) and that you opened it at{' '}
          <code>http://127.0.0.1:5188</code>.
        </p>
      </div>
    )
  }

  if (!hydrated || !ready) {
    return <div className="boot-splash" aria-hidden="true" />
  }

  return (
    <div className="app-shell">
      {/* the sidebar is a fixture — visible on every screen, never hidden */}
      <Sidebar />

      <NotePage />

      <QuickSwitcher />
      <AttachmentViewer />

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#262626',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#d6d6d6',
            fontSize: '13px',
          },
        }}
      />
    </div>
  )
}
