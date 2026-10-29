'use client'

/**
 * Attachments — embedding in notes, the preview dialog, and the drop zone.
 * Files live in the vault's attachments/ folder and are served by /api/file.
 */

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, X } from 'lucide-react'
import { useNotes } from '@/lib/notes-store'
import { deleteAttachment, embedFor, fileKind, fileUrl, resolveFile, uploadFiles } from '@/lib/vault-sync'

const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

/** A .canva file is a pointer to a design on canva.com — show it as a card, link out if it holds a URL. */
function CanvaCard({ path }: { path: string }) {
  const [href, setHref] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    fetch(fileUrl(path))
      .then((r) => r.text())
      .then((t) => {
        const m = t.match(/https:\/\/(?:[\w-]+\.)?canva\.com\/[^\s"'<>\\]+/)
        if (live) setHref(m ? m[0] : null)
      })
      .catch(() => live && setHref(null))
    return () => {
      live = false
    }
  }, [path])
  return (
    <span className="canva-card">
      <b>{nameOf(path)}</b>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          Open design in Canva ↗
        </a>
      ) : (
        <span>{href === undefined ? 'Reading…' : 'Canva file — stored in your vault (no design link inside)'}</span>
      )}
    </span>
  )
}

export function AttachmentBody({ path, width }: { path: string; width?: number }) {
  const url = fileUrl(path)
  const name = nameOf(path)
  switch (fileKind(path)) {
    case 'img':
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="embed-img" src={url} alt={name} style={width ? { maxWidth: width } : undefined} />
    case 'pdf':
      return <embed className="embed-pdf" type="application/pdf" src={url} />
    case 'audio':
      return <audio className="embed-audio" controls src={url} />
    case 'video':
      return <video className="embed-video" controls src={url} style={width ? { maxWidth: width } : undefined} />
    case 'canva':
      return <CanvaCard path={path} />
    default:
      return (
        <a className="file-chip" href={url} download={name}>
          <FileText size={14} /> {name}
        </a>
      )
  }
}

/** `![[file.png|300]]` inside a note. */
export function Embed({ target, width }: { target: string; width?: number }) {
  const files = useNotes((s) => s.files)
  const path = resolveFile(files, target)
  if (!path) return <span className="embed-missing">Missing file: {target}</span>
  return (
    <span className="embed" onDoubleClick={() => useNotes.getState().openAttachment(path)}>
      <AttachmentBody path={path} width={width} />
    </span>
  )
}

/** Preview dialog for an attachment (opened from the sidebar or a [[file]] link). */
export function AttachmentViewer() {
  const path = useNotes((s) => s.attachment)
  const meta = useNotes((s) => (s.attachment ? s.files[s.attachment] : undefined))
  const close = () => useNotes.getState().openAttachment(null)

  useEffect(() => {
    if (!path) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path])

  if (!path || !meta) return null
  const name = nameOf(path)
  const kind = fileKind(path)
  return (
    <div className="viewer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="viewer" role="dialog" aria-label={name}>
        <header className="viewer-head">
          <div className="viewer-title">
            <b>{name}</b>
            <small>
              {path} · {fmtSize(meta.size)}
            </small>
          </div>
          <div className="viewer-actions">
            <a className="btn-quiet" href={fileUrl(path)} download={name}>
              <Download size={14} /> Download
            </a>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                navigator.clipboard?.writeText(embedFor(path, useNotes.getState().files))
                toast.success('Link copied')
              }}
            >
              Copy {kind === 'other' ? 'link' : 'embed'}
            </button>
            <button
              type="button"
              className="btn-quiet danger"
              onClick={async () => {
                if (!confirm(`Delete “${name}” from your vault? This can't be undone.`)) return
                try {
                  await deleteAttachment(path)
                  toast('File deleted')
                } catch (e) {
                  toast.error('Could not delete', { description: (e as Error).message })
                }
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
            <button type="button" className="icon-btn" onClick={close} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="viewer-body">
          {kind === 'other' ? (
            <div className="list-empty">No preview for this file type. It is stored safely in your vault — download it to open it.</div>
          ) : (
            <AttachmentBody path={path} />
          )}
        </div>
      </div>
    </div>
  )
}

/** Sidebar list of everything in the attachments folder. */
export function AttachmentList() {
  const files = useNotes((s) => s.files)
  const openAttachment = useNotes((s) => s.openAttachment)
  const paths = Object.keys(files).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  if (!paths.length) return null
  return (
    <>
      <div className="tree-head">
        <span className="tree-label">Attachments</span>
        <span className="section-count">{paths.length}</span>
      </div>
      {paths.map((p) => (
        <button key={p} type="button" className="attach-row" onClick={() => openAttachment(p)} title={p}>
          {fileKind(p) === 'img' ? <ImageIcon size={14} /> : <Paperclip size={14} />}
          <span>{nameOf(p)}</span>
        </button>
      ))}
    </>
  )
}

/** Drop files anywhere in the window to add them to the vault. */
export function useGlobalDrop(onFiles: (files: File[]) => void) {
  useEffect(() => {
    const has = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const over = (e: DragEvent) => {
      if (!has(e)) return
      e.preventDefault()
      document.body.classList.add('dragging-files')
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) document.body.classList.remove('dragging-files')
    }
    const drop = (e: DragEvent) => {
      document.body.classList.remove('dragging-files')
      if (!has(e) || !e.dataTransfer?.files.length) return
      e.preventDefault()
      onFiles([...e.dataTransfer.files])
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [onFiles])
}

/** Upload, then (if a note is being edited) the caller inserts the embeds; otherwise open the file. */
export async function addFiles(list: File[], insert?: (text: string) => void) {
  if (!list.length) return
  const toastId = toast.loading(`Adding ${list.length} file${list.length > 1 ? 's' : ''}…`)
  const paths = await uploadFiles(list)
  toast.dismiss(toastId)
  if (!paths.length) return
  const files = useNotes.getState().files
  if (insert) insert(paths.map((p) => embedFor(p, files)).join('\n') + '\n')
  else if (paths.length === 1) useNotes.getState().openAttachment(paths[0])
  toast.success(`Added ${paths.length} file${paths.length > 1 ? 's' : ''}`)
}
