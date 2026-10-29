<h1 align="center">Cairn</h1>
<p align="center"><b>A calm, local-first Markdown notebook.</b><br>
Wikilinks, backlinks, a graph view and attachments — and your notes are just <code>.md</code> files on your own disk.</p>

<p align="center">
  <img alt="license MIT" src="https://img.shields.io/badge/license-MIT-5aa893">
  <img alt="runs locally" src="https://img.shields.io/badge/runs-100%25%20locally-5aa893">
  <img alt="no telemetry" src="https://img.shields.io/badge/telemetry-none-5aa893">
</p>

Cairn is an open-source alternative to closed note apps. Everything runs on your machine: no account, no cloud,
no analytics, no external fonts or scripts. Point it at any folder — including an existing Obsidian vault — and
you never get locked in, because the notes stay plain Markdown.

## Features

- **Reading ↔ Editing** — one switch. Opening a note always lands you in a clean reading page.
- **`[[Wikilinks]]`, aliases and backlinks** — links follow when you rename a note; unresolved links create the note on click.
- **Graph view** and a **Full view** reading layout with outline, links and backlinks.
- **Folders, favorites, trash** — trashed notes move to `.trash/` in your vault, not into the void.
- **Quick switcher** (`Ctrl/⌘ K`), **new note** (`Ctrl/⌘ N`), tags, tables, task lists, highlights, code blocks.
- **Attachments** — drag & drop, paste (screenshots!) or use the paperclip. Images, PDFs, audio, video and
  **`.canva` files** are stored in `attachments/` and embedded with `![[photo.png]]` (`![[photo.png|300]]` sets a width).
  Everything else becomes a download link. Max 200 MB per file.
- **Live sync with the disk** — edit a note in any other editor (or `git pull`) and Cairn picks it up within seconds,
  without overwriting your unsaved work.

> **About `.canva` files:** Canva doesn't publish a local design format. A `.canva` file is a pointer to a design on
> canva.com, so Cairn stores it with your notes and shows a card that links to the design. It cannot open or edit
> Canva designs offline.

## Quick start

Requires [Node.js](https://nodejs.org) 20+.

```bash
git clone https://github.com/jukeiss/cairn.git
cd cairn
npm install
npm run dev          # http://127.0.0.1:5188
```

For a faster production server: `npm run build && npm start`.

### Choose where your notes live

By default notes go in `./vault`. Point Cairn at any folder:

```bash
CAIRN_VAULT=~/Documents/Notes npm run dev
```

```
vault/
├── Start here.md
├── Wiki/Markdown examples.md      ← folders are real folders
├── attachments/logo.png           ← dropped / pasted files
├── .trash/Old idea.md             ← trashed notes
└── .cairn/state.json              ← favorites & ids (safe to delete)
```

## Privacy & security

- The server binds to `127.0.0.1` and makes **no outbound requests**; the UI loads nothing from the internet.
- The API only answers requests addressed to a loopback hostname (blocks DNS rebinding) and rejects cross-origin
  writes. It refuses path traversal (`../`) and never touches files outside the vault.
- Uploaded files are served from an allow-list of safe types; anything else (e.g. `.html`) is forced to download and
  can never run script in the app.
- There is **no login**. Don't expose Cairn to a network (`CAIRN_ALLOW_REMOTE=1` disables the host check) unless you
  put authentication in front of it.
- Back up the vault folder like any other folder — it works great with git.

## How it works

| Piece | Where |
| --- | --- |
| UI (Next.js + React, zustand) | `src/components/notes`, `src/app/page.tsx` |
| Markdown engine (own, dependency-free) | `src/lib/markdown.ts` |
| Store ↔ disk sync (diff, flush, poll) | `src/lib/vault-sync.ts` |
| Filesystem + safety (paths, uploads, range requests) | `src/lib/vault.ts` |
| REST API (`/api/vault`, `/note`, `/folder`, `/file`, `/state`) | `src/app/api` |

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
