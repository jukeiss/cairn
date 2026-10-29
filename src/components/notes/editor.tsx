'use client'

/**
 * Editing mode — a simple, friendly editor.
 *
 * Performance notes:
 * - Keystrokes only touch local state; the store (and localStorage)
 *   are updated on a short debounce.
 * - Pending changes are flushed on blur, unmount, and Escape.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNotes } from '@/lib/notes-store'
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListChecks,
  Quote,
  Code,
  Link2,
  Brackets,
  Paperclip,
} from 'lucide-react'
import { addFiles } from './attachment'

interface ToolAction {
  icon: React.ReactNode
  label: string
  wrap?: [string, string]
  prefix?: string
}

const TOOLS: ToolAction[] = [
  { icon: <Bold size={15} strokeWidth={2.2} />, label: 'Bold', wrap: ['**', '**'] },
  { icon: <Italic size={15} strokeWidth={2.2} />, label: 'Italic', wrap: ['*', '*'] },
  { icon: <Heading2 size={15} strokeWidth={2.2} />, label: 'Heading', prefix: '## ' },
  { icon: <List size={15} strokeWidth={2.2} />, label: 'Bullet list', prefix: '- ' },
  { icon: <ListChecks size={15} strokeWidth={2.2} />, label: 'To-do', prefix: '- [ ] ' },
  { icon: <Quote size={15} strokeWidth={2.2} />, label: 'Quote', prefix: '> ' },
  { icon: <Code size={15} strokeWidth={2.2} />, label: 'Code', wrap: ['`', '`'] },
  { icon: <Link2 size={15} strokeWidth={2.2} />, label: 'Link', wrap: ['[', '](https://)'] },
  { icon: <Brackets size={15} strokeWidth={2.2} />, label: 'Link a note', wrap: ['[[', ']]'] },
]

export function Editor({
  noteId,
  initialContent,
}: {
  noteId: string
  initialContent: string
}) {
  const updateContent = useNotes((s) => s.updateContent)
  const setMode = useNotes((s) => s.setMode)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(initialContent)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (pending.current !== null) {
      updateContent(noteId, pending.current)
      pending.current = null
    }
  }, [noteId, updateContent])

  // flush anything unsaved when leaving the editor or closing the tab
  useEffect(() => flush, [flush])

  const push = (value: string) => {
    pending.current = value
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 180)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)
    push(value)
  }

  /** Insert text at the caret (used for embeds after an upload). */
  const insertAtCaret = (insert: string) => {
    const el = ref.current
    const value = el?.value ?? text
    const at = el ? el.selectionStart : value.length
    const lead = at > 0 && value[at - 1] !== '\n' ? '\n' : ''
    const next = value.slice(0, at) + lead + insert + value.slice(el ? el.selectionEnd : at)
    setText(next)
    push(next)
    const caret = at + lead.length + insert.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  const fileInput = useRef<HTMLInputElement>(null)

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files]
    if (!files.length) return
    e.preventDefault()
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.')
    void addFiles(
      files.map((f) =>
        /^image\.\w+$/i.test(f.name) ? new File([f], `Pasted image ${stamp}.${f.type.split('/')[1] || 'png'}`, { type: f.type }) : f
      ),
      insertAtCaret
    )
  }

  const onDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    e.stopPropagation()
    document.body.classList.remove('dragging-files')
    void addFiles([...e.dataTransfer.files], insertAtCaret)
  }

  const applyTool = (tool: ToolAction) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const value = text
    const selected = value.slice(start, end)

    let next = value
    let caret = end

    if (tool.wrap) {
      const [a, b] = tool.wrap
      const inner = selected || 'text'
      next = value.slice(0, start) + a + inner + b + value.slice(end)
      caret = start + a.length + inner.length
    } else if (tool.prefix) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const lineText = value.slice(lineStart, end)
      const already = lineText.startsWith(tool.prefix)
      const replacement = already
        ? lineText.replace(tool.prefix, '')
        : tool.prefix + lineText
      next = value.slice(0, lineStart) + replacement + value.slice(end)
      caret = lineStart + replacement.length
    }

    setText(next)
    push(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Esc leaves editing — back to the calm reading page
    if (e.key === 'Escape') {
      e.preventDefault()
      flush()
      setMode('view')
      return
    }
    // Tab inserts spaces instead of leaving the editor
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const { selectionStart: s, selectionEnd: t, value } = el
      const next = value.slice(0, s) + '  ' + value.slice(t)
      setText(next)
      push(next)
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault()
      applyTool(e.key === 'b' ? TOOLS[0] : TOOLS[1])
    }
  }

  return (
    <div className="editor-wrap">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            className="tool-btn"
            title={tool.label}
            aria-label={tool.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyTool(tool)}
          >
            {tool.icon}
          </button>
        ))}
        <button
          type="button"
          className="tool-btn"
          title="Attach files (or drop / paste them)"
          aria-label="Attach files"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip size={15} strokeWidth={2.2} />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])], insertAtCaret)
            e.target.value = ''
          }}
        />
        <span className="toolbar-hint">Autosaves as you type · drop or paste files to attach</span>
      </div>
      <textarea
        ref={ref}
        className="editor-textarea"
        value={text}
        placeholder={'Start writing…\n\nTip: the toolbar above can add bold, lists and headings for you. Esc returns to Reading.'}
        onChange={handleChange}
        onBlur={flush}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={onDrop}
        spellCheck={false}
        aria-label="Note content"
      />
    </div>
  )
}
