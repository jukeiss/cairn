/**
 * Cairn markdown engine.
 *
 * A pragmatic Markdown parser tuned for an Obsidian-like vault:
 * headings, lists (with tasks), blockquotes, fenced code, tables,
 * wiki links [[Note]] / [[Note|alias]], #tags, ==highlights==,
 * inline code, bold/italic/strike, links and frontmatter.
 */

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'wiki'; target: string; alias: string }
  | { type: 'embed'; target: string; width?: number }
  | { type: 'link'; href: string; label: string }
  | { type: 'bold'; children: InlineToken[] }
  | { type: 'italic'; children: InlineToken[] }
  | { type: 'strike'; children: InlineToken[] }
  | { type: 'highlight'; children: InlineToken[] }
  | { type: 'tag'; value: string }

export type ListItem = {
  indent: number
  ordered: boolean
  marker: string
  task: boolean
  checked: boolean
  line: number
  inline: InlineToken[]
}

export type Block =
  | { type: 'heading'; level: number; text: string; inline: InlineToken[]; id: string; line: number }
  | { type: 'paragraph'; inline: InlineToken[] }
  | { type: 'list'; items: ListItem[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'quote'; lines: InlineToken[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' }

export type FrontMatter = { key: string; value: string }[]

export type ParsedNote = {
  frontmatter: FrontMatter
  blocks: Block[]
}

let headingCounter = 0
export function resetHeadingIds() {
  headingCounter = 0
}
function nextHeadingId() {
  headingCounter += 1
  return `h-${headingCounter}`
}

/* ------------------------------------------------------------------ */
/* Frontmatter                                                         */
/* ------------------------------------------------------------------ */

export function splitFrontmatter(src: string): { frontmatter: FrontMatter; body: string } {
  const lines = src.split('\n')
  if (lines[0]?.trim() !== '---') return { frontmatter: [], body: src }

  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
  }
  if (end === -1) return { frontmatter: [], body: src }

  const fm: FrontMatter = []
  let currentKey = ''
  for (let i = 1; i < end; i++) {
    const raw = lines[i]
    const listMatch = raw.match(/^\s+-\s+(.*)$/)
    if (listMatch && currentKey) {
      const prev = fm.find((f) => f.key === currentKey)
      if (prev) prev.value += ', ' + listMatch[1].trim()
      continue
    }
    const kv = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (kv) {
      currentKey = kv[1]
      const value = kv[2].trim()
      const existing = fm.find((f) => f.key === currentKey)
      if (existing) existing.value = value
      else fm.push({ key: currentKey, value })
    }
  }
  return { frontmatter: fm, body: lines.slice(end + 1).join('\n') }
}

/* ------------------------------------------------------------------ */
/* Inline tokenizer                                                    */
/* ------------------------------------------------------------------ */

export function tokenizeInline(src: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let buf = ''
  let i = 0

  const flush = () => {
    if (buf) {
      tokens.push({ type: 'text', value: buf })
      buf = ''
    }
  }

  while (i < src.length) {
    const rest = src.slice(i)

    // inline code
    const code = rest.match(/^`([^`\n]+)`/)
    if (code) {
      flush()
      tokens.push({ type: 'code', value: code[1] })
      i += code[0].length
      continue
    }

    // embed ![[file.png]] / ![[file.png|300]]
    const embed = rest.match(/^!\[\[([^\[\]|]+)(?:\|(\d+))?\]\]/)
    if (embed) {
      flush()
      tokens.push({ type: 'embed', target: embed[1].trim(), width: embed[2] ? Number(embed[2]) : undefined })
      i += embed[0].length
      continue
    }

    // wiki link
    const wiki = rest.match(/^\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]/)
    if (wiki) {
      flush()
      const target = wiki[1].trim()
      const alias = (wiki[2] ?? '').trim() || target
      tokens.push({ type: 'wiki', target, alias })
      i += wiki[0].length
      continue
    }

    // external link [text](url)
    const link = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/)
    if (link) {
      flush()
      tokens.push({ type: 'link', href: link[2], label: link[1] })
      i += link[0].length
      continue
    }

    // bold (** first, then __ at word boundaries)
    const bold = rest.match(/^\*\*([\s\S]+?)\*\*/) || rest.match(/^__([\s\S]+?)__/)
    if (bold) {
      flush()
      tokens.push({ type: 'bold', children: tokenizeInline(bold[1]) })
      i += bold[0].length
      continue
    }

    // highlight
    const hl = rest.match(/^==([\s\S]+?)==/)
    if (hl) {
      flush()
      tokens.push({ type: 'highlight', children: tokenizeInline(hl[1]) })
      i += hl[0].length
      continue
    }

    // strike
    const st = rest.match(/^~~([\s\S]+?)~~/)
    if (st) {
      flush()
      tokens.push({ type: 'strike', children: tokenizeInline(st[1]) })
      i += st[0].length
      continue
    }

    // italic
    const it = rest.match(/^\*([^*\n]+)\*/)
    if (it) {
      flush()
      tokens.push({ type: 'italic', children: tokenizeInline(it[1]) })
      i += it[0].length
      continue
    }
    const itU = i > 0 && /\s/.test(src[i - 1] ?? ' ') ? rest.match(/^_([^_\n]+)_(?=\s|$|[.,;:!?)])/) : null
    if (itU) {
      flush()
      tokens.push({ type: 'italic', children: tokenizeInline(itU[1]) })
      i += itU[0].length
      continue
    }

    // tag — must start at whitespace or beginning
    const prevChar = i === 0 ? ' ' : src[i - 1]
    if (prevChar === ' ' || prevChar === '\t' || prevChar === '(') {
      const tag = rest.match(/^#([A-Za-z][A-Za-z0-9_/-]*)/)
      if (tag) {
        flush()
        tokens.push({ type: 'tag', value: tag[1] })
        i += tag[0].length
        continue
      }
    }

    buf += src[i]
    i += 1
  }

  flush()
  return tokens
}

export function plainText(tokens: InlineToken[]): string {
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'text':
          return t.value
        case 'code':
          return t.value
        case 'wiki':
          return t.alias
        case 'embed':
          return ''
        case 'link':
          return t.label
        case 'tag':
          return '#' + t.value
        default:
          return plainText(t.children)
      }
    })
    .join('')
}

/* ------------------------------------------------------------------ */
/* Block parser                                                        */
/* ------------------------------------------------------------------ */

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && /-/.test(line) && /\|/.test(line)
}

function splitTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

export function parseBlocks(src: string): Block[] {
  const lines = src.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // blank
    if (!line.trim()) {
      i += 1
      continue
    }

    // fenced code
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      const lang = fence[1] ?? ''
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i += 1
      }
      i += 1 // closing fence
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') })
      continue
    }

    // heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2],
        inline: tokenizeInline(heading[2]),
        id: nextHeadingId(),
        line: i,
      })
      i += 1
      continue
    }

    // hr
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    // quote (consecutive > lines)
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: InlineToken[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        const inner = lines[i].replace(/^\s*>\s?/, '')
        if (inner.trim()) quoteLines.push(...tokenizeInline(inner))
        i += 1
      }
      blocks.push({ type: 'quote', lines: quoteLines })
      continue
    }

    // list (consecutive list items, supports one nesting level by indentation)
    const lm = line.match(LIST_RE)
    if (lm) {
      const items: ListItem[] = []
      while (i < lines.length) {
        const cur = lines[i]
        const m = cur.match(LIST_RE)
        if (!m) break
        const indent = m[1].length
        const ordered = /\d/.test(m[2][0])
        let body = m[3]
        let task = false
        let checked = false
        const taskM = body.match(/^\[([ xX])\]\s+(.*)$/)
        if (taskM) {
          task = true
          checked = taskM[1].toLowerCase() === 'x'
          body = taskM[2]
        }
        items.push({
          indent,
          ordered,
          marker: m[2],
          task,
          checked,
          line: i,
          inline: tokenizeInline(body),
        })
        i += 1
        // soft-continuation lines (indented text under a list item)
        while (
          i < lines.length &&
          lines[i].trim() &&
          !LIST_RE.test(lines[i]) &&
          !/^(#{1,6})\s/.test(lines[i]) &&
          !/^```/.test(lines[i]) &&
          !/^\s*>/.test(lines[i])
        ) {
          const last = items[items.length - 1]
          last.inline = [
            ...last.inline,
            { type: 'text', value: ' ' },
            ...tokenizeInline(lines[i].trim()),
          ]
          i += 1
        }
      }
      blocks.push({ type: 'list', items })
      continue
    }

    // paragraph (consume until blank line or another block starter)
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !LIST_RE.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i += 1
    }
    if (paraLines.length) {
      blocks.push({ type: 'paragraph', inline: tokenizeInline(paraLines.join('\n')) })
    } else {
      i += 1 // safety: skip unparseable line
    }
  }

  return blocks
}

export function parseNote(src: string): ParsedNote {
  const { frontmatter, body } = splitFrontmatter(src)
  resetHeadingIds()
  return { frontmatter, blocks: parseBlocks(body) }
}

/* ------------------------------------------------------------------ */
/* Vault-level helpers                                                 */
/* ------------------------------------------------------------------ */

export function extractWikiTargets(content: string): string[] {
  const targets: string[] = []
  const re = /\[\[([^\[\]|]+)(?:\|[^\[\]]*)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    targets.push(m[1].trim())
  }
  return targets
}

export function extractTags(content: string): string[] {
  const body = splitFrontmatter(content).body
  const tags = new Set<string>()

  // frontmatter tags
  const fm = splitFrontmatter(content).frontmatter
  const fmTags = fm.find((f) => f.key.toLowerCase() === 'tags')
  if (fmTags) {
    fmTags.value.split(',').forEach((t) => {
      const v = t.trim()
      if (v) tags.add(v)
    })
  }

  const re = /(?:^|[\s(])#([A-Za-z][A-Za-z0-9_/-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    tags.add(m[1])
  }
  return [...tags]
}

export function wordCount(content: string): number {
  const body = splitFrontmatter(content).body
  const m = body.match(/[A-Za-z0-9'’\u00C0-\u024F\u4E00-\u9FFF]+/g)
  return m ? m.length : 0
}

export function charCount(content: string): number {
  return splitFrontmatter(content).body.replace(/\s/g, '').length
}

export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 1
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - t.length
  const idx = t.indexOf(q)
  if (idx >= 0) return 600 - idx - t.length * 0.05

  // subsequence match
  let ti = 0
  let score = 0
  let streak = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return -1
    streak = found === ti ? streak + 1 : 0
    score += 10 - Math.min(found - ti, 9) + streak
    ti = found + 1
  }
  return score
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
