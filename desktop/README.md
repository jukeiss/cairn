# Cairn desktop app

A macOS wrapper that runs Cairn in its own window. Notes are plain `.md` files in `~/Documents/Cairn`.

**Build it yourself** (from the repo root):

```bash
npm install && npm run build
cp -R . desktop/cairn-app.tmp && rm -rf desktop/cairn-app && mv desktop/cairn-app.tmp desktop/cairn-app
cd desktop && npm install && npx electron-builder --mac dmg --arm64
```

The `.dmg` lands in `desktop/dist/`. It's unsigned, so macOS asks you to right-click and choose **Open** the first time.
