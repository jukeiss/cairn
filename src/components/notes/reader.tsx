'use client'

/**
 * Reading mode — the clean, rendered page.
 * Reuses the Cairn markdown engine; wiki links and tags are clickable.
 */

import React, { useMemo } from 'react'
import {
  parseNote,
  tokenizeInline,
  splitFrontmatter,
  type Block,
  type InlineToken,
  type ListItem,
} from '@/lib/markdown'
import { useNotes } from '@/lib/notes-store'
import { resolveFile } from '@/lib/vault-sync'
import { Embed } from './attachment'

function InlineRun({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case 'text':
            return <React.Fragment key={i}>{t.value}</React.Fragment>
          case 'code':
            return <code key={i}>{t.value}</code>
          case 'wiki':
            return <WikiLink key={i} target={t.target} alias={t.alias} />
          case 'embed':
            return <Embed key={i} target={t.target} width={t.width} />
          case 'link':
            return (
              <a key={i} className="external-link" href={t.href} target="_blank" rel="noreferrer">
                {t.label}
              </a>
            )
          case 'bold':
            return (
              <strong key={i}>
                <InlineRun tokens={t.children} />
              </strong>
            )
          case 'italic':
            return (
              <em key={i}>
                <InlineRun tokens={t.children} />
              </em>
            )
          case 'strike':
            return (
              <del key={i}>
                <InlineRun tokens={t.children} />
              </del>
            )
          case 'highlight':
            return (
              <mark className="md-highlight" key={i}>
                <InlineRun tokens={t.children} />
              </mark>
            )
          case 'tag':
            return (
              <span
                key={i}
                className="tag-pill"
                onClick={() => {
                  const store = useNotes.getState()
                  store.setSection('all')
                  store.setQuery('#' + t.value)
                }}
              >
                #{t.value}
              </span>
            )
          default:
            return null
        }
      })}
    </>
  )
}

function WikiLink({ target, alias }: { target: string; alias: string }) {
  const notes = useNotes((s) => s.notes)
  const files = useNotes((s) => s.files)
  const resolved = useMemo(
    () => notes.some((n) => !n.deleted && n.title.toLowerCase() === target.toLowerCase()),
    [notes, target]
  )
  const filePath = useMemo(() => (resolved ? null : resolveFile(files, target)), [resolved, files, target])
  if (filePath) {
    return (
      <a
        className="wiki-link"
        data-href={filePath}
        onClick={(e) => {
          e.preventDefault()
          useNotes.getState().openAttachment(filePath)
        }}
      >
        {alias}
      </a>
    )
  }
  return (
    <a
      className={`wiki-link${resolved ? '' : ' unresolved'}`}
      data-href={target}
      onClick={(e) => {
        e.preventDefault()
        useNotes.getState().openOrCreateByTitle(target)
      }}
    >
      {alias}
    </a>
  )
}

/* ------------------------------------------------------------------ */

export function Reader({ content }: { content: string }) {
  const parsed = useMemo(() => parseNote(content), [content])
  const rawBody = useMemo(() => splitFrontmatter(content).body, [content])
  const rawLines = useMemo(() => rawBody.split('\n'), [rawBody])

  const toggleTask = (line: number) => {
    const lines = [...rawLines]
    const target = lines[line]
    if (target === undefined) return
    if (/\[ \]/.test(target)) lines[line] = target.replace('[ ]', '[x]')
    else if (/\[[xX]\]/.test(target)) lines[line] = target.replace(/\[[xX]\]/, '[ ]')
    else return
    const store = useNotes.getState()
    if (store.activeId) store.updateContent(store.activeId, lines.join('\n'))
  }

  return (
    <div className="markdown-preview reader-page">
      {parsed.frontmatter.length > 0 && (
        <div className="frontmatter">
          {parsed.frontmatter.map((f) => (
            <div className="frontmatter-row" key={f.key}>
              <span className="frontmatter-key">{f.key}</span>
              <span className="frontmatter-value">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {parsed.blocks.map((block, i) => (
        <BlockView key={i} block={block} rawLines={rawLines} toggleTask={toggleTask} />
      ))}
    </div>
  )
}

function BlockView({
  block,
  rawLines,
  toggleTask,
}: {
  block: Block
  rawLines: string[]
  toggleTask: (line: number) => void
}) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1'
      return <Tag id={block.id}>{<InlineRun tokens={block.inline} />}</Tag>
    }
    case 'paragraph':
      return (
        <p>
          <InlineRun tokens={block.inline} />
        </p>
      )
    case 'hr':
      return <hr />
    case 'code':
      return (
        <pre>
          {block.lang ? <span className="code-lang">{block.lang}</span> : null}
          <code>{block.code}</code>
        </pre>
      )
    case 'quote':
      return (
        <blockquote>
          <p>
            <InlineRun tokens={block.lines} />
          </p>
        </blockquote>
      )
    case 'table':
      return (
        <table>
          <thead>
            <tr>
              {block.header.map((h, i) => (
                <th key={i}>
                  <InlineRun tokens={tokenizeInline(h)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>
                    <InlineRun tokens={tokenizeInline(cell)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'list': {
      if (block.items.length === 0) return null
      const ordered = block.items[0].ordered
      const ListTag = ordered ? 'ol' : 'ul'
      const cls = block.items.some((it) => it.task) ? 'contains-task-list' : ''
      return (
        <ListTag className={cls}>
          {block.items.map(
            (item, i) =>
              item.indent === 0 && (
                <ListEntry
                  key={i}
                  item={item}
                  siblings={block.items}
                  index={i}
                  rawLines={rawLines}
                  toggleTask={toggleTask}
                />
              )
          )}
        </ListTag>
      )
    }
    default:
      return null
  }
}

function ListEntry({
  item,
  siblings,
  index,
  rawLines,
  toggleTask,
}: {
  item: ListItem
  siblings: ListItem[]
  index: number
  rawLines: string[]
  toggleTask: (line: number) => void
}) {
  const children = siblings.filter(
    (s) => s.indent > item.indent && belongsTo(siblings, index, s)
  )
  const ListTag = item.ordered ? 'ol' : 'ul'
  return (
    <li className={item.task ? 'task-list-item' + (item.checked ? ' done' : '') : undefined}>
      {item.task ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={item.checked}
          aria-label="Toggle to-do"
          className={'task-checkbox' + (item.checked ? ' checked' : '')}
          onClick={() => toggleTask(item.line)}
        />
      ) : null}
      <span className="task-text">
        <InlineRun tokens={item.inline} />
      </span>
      {children.length > 0 && (
        <ListTag>
          {children.map((c) => (
            <ListEntry
              key={siblings.indexOf(c)}
              item={c}
              siblings={siblings}
              index={siblings.indexOf(c)}
              rawLines={rawLines}
              toggleTask={toggleTask}
            />
          ))}
        </ListTag>
      )}
    </li>
  )
}

/** a nested item belongs to the nearest preceding item with smaller indent */
function belongsTo(items: ListItem[], parentIdx: number, candidate: ListItem): boolean {
  const parent = items[parentIdx]
  for (let i = parentIdx + 1; i < items.length; i++) {
    const it = items[i]
    if (it.indent <= parent.indent) return false
    if (it === candidate) return candidate.indent > parent.indent
  }
  return candidate.indent > parent.indent && items.indexOf(candidate) > parentIdx
}
