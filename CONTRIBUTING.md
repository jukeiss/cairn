# Contributing to Cairn

Thanks for helping! Cairn's promise is simple: **local-first, plain Markdown, no lock-in, no telemetry.**
Changes that keep that promise are very welcome.

## Setup

```bash
npm install
npm run dev        # http://127.0.0.1:5188 (uses ./vault, which is git-ignored)
npm run typecheck
npm run build
```

## Guidelines

- No network calls, analytics or remote assets. Cairn must work offline.
- Notes stay plain `.md` files; never invent a proprietary format.
- Anything that touches the filesystem goes through `src/lib/vault.ts` and must stay inside the vault.
- Keep dependencies minimal — the app currently runs on `next`, `react`, `zustand`, `sonner`, `lucide-react`.
- Run `npm run typecheck` and `npm run build` before opening a PR.

## Ideas

Keyboard-driven `[[` autocomplete, a live-preview editor, tag index page, rename/move for attachments,
and a packaged desktop build are all good first projects.
