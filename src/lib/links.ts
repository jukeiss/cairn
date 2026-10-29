/**
 * Vault link helpers — one place that knows how [[wiki links]] work.
 *
 * Used by the note page (links section + status bar), the full view rail
 * and anywhere else that needs outgoing links or backlinks.
 */

import type { Note } from './notes-store'

/** `![[photo.png]]` and `[[report.pdf]]` point at attachments, not notes. */
export const ATTACHMENT_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|pdf|mp3|wav|ogg|m4a|mp4|webm|mov|canva|txt|csv|json|zip)$/i

export interface OutgoingLink {
  target: string
  alias: string
}

/** Wiki links used in a note, deduped, code fences skipped. */
export function outgoingLinks(content: string): OutgoingLink[] {
  const out: OutgoingLink[] = []
  const seen = new Set<string>()
  let fenced = false

  for (const raw of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue

    const re = /\[\[([^\[\]|]+)(?:\|([^\]]+))?\]\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(raw))) {
      const target = m[1].trim()
      if (!target || raw[m.index - 1] === '!' || ATTACHMENT_EXT.test(target)) continue
      const key = target.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ target, alias: (m[2] || '').trim() || target })
    }
  }
  return out
}

/** Notes whose content links to the given title (case-insensitive, whole link). */
export function backlinksFor(selfId: string, selfTitle: string, notes: Note[]): Note[] {
  const needle = selfTitle.trim().toLowerCase()
  if (!needle) return []
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\[\\[\\s*${esc}\\s*(\\||\\]\\])`, 'i')
  return notes.filter((n) => !n.deleted && n.id !== selfId && re.test(n.content))
}

/** The first line of a backlinking note that mentions the title, cleaned up. */
export function mentionSnippet(note: Note, title: string): string {
  const esc = title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const probe = new RegExp(`\\[\\[\\s*${esc}\\s*(\\||\\]\\])`, 'i')
  for (const raw of note.content.split('\n')) {
    if (!probe.test(raw)) continue
    return raw
      .replace(/\[\[([^\[\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t: string, a?: string) => a || t)
      .replace(/[#>*`~\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 110)
  }
  return ''
}
