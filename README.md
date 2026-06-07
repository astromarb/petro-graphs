# Petro Graphs

A desktop application for compositing and annotating geological photomicrograph figures. Built with React, TypeScript, Fabric.js, and Tauri.

Developed at Vanderbilt University in support of master's thesis research on aplite dike geobarometry in the Tuolumne Intrusive Complex (Yosemite National Park).

---

## Features

- Drag-and-drop PPL/XPL image pairs onto an infinite canvas
- Scale bar calibration and annotation
- LaTeX math rendering for labels and annotations
- Image adjustments (brightness, contrast, saturation, hue, grayscale, invert, sharpen)
- Orientation flips, z-ordering, object locking/hiding
- Right-click context menu for object management
- Multi-page document support (up to 5 pages)
- PDF, PNG, and JPEG export
- Infinite canvas with back-canvas brainstorming space
- Full undo/redo history
- Automatic state persistence across sessions

---

## Running as a Desktop App

Petro Graphs is a native desktop application built with [Tauri](https://tauri.app). You do **not** need a browser or web server to run it.

### Prerequisites

Before building or running in development mode, install the following:

#### 1. Node.js (v18 or later)
Download from [nodejs.org](https://nodejs.org).

#### 2. Rust (via rustup)
```
winget install --id Rustlang.Rustup -e
```
Close and reopen your terminal after installation so `rustc` and `cargo` are on the PATH.

#### 3. Microsoft C++ Build Tools
Required by Rust on Windows to link native code.
```
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

#### 4. WebView2 Runtime
Already included on Windows 10 (version 1803+) and Windows 11. If missing, download from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

#### 5. Disk space for Rust build cache
The first build downloads and compiles Rust dependencies (~3–5 GB). By default this project symlinks `src-tauri/target/` to `D:\petro-graphs-target` to keep the build cache off the system drive. If you do not have a D: drive, either:
- Create the directory `D:\petro-graphs-target` manually, or
- Delete the symlink and let cargo create `src-tauri/target/` locally (ensure at least 6 GB free on your system drive)

---

## Development

### Install dependencies
```
npm install
```

### Run in development mode (hot reload)
```
npm run tauri:dev
```
This starts the Vite dev server and opens the app in a native window. Changes to frontend code reload live; Rust backend changes require a recompile.

### Run frontend only (browser, no native features)
```
npm run dev
```

---

## Building a Release Executable

```
npm run tauri:build
```

This produces:
- `src-tauri/target/release/petro-graphs.exe` — standalone executable
- `src-tauri/target/release/bundle/nsis/` — Windows installer (`.exe`)
- `src-tauri/target/release/bundle/msi/` — Windows installer (`.msi`)

The bundled installer includes the WebView2 bootstrapper if the runtime is not already present on the target machine.

---

## App Icon

The app icon files live in `src-tauri/icons/`. To replace the default icon with a custom one:

1. Prepare a square PNG at 1024×1024 px
2. Run:
   ```
   npm run tauri icon path/to/your-icon.png
   ```
   This auto-generates all required sizes (`32x32.png`, `128x128.png`, `icon.ico`, `icon.icns`).

---

## Project Structure

```
petro-graphs/
├── src/                    # React + TypeScript frontend
│   ├── components/         # UI components (Canvas, Sidebar, Topbar, etc.)
│   ├── store.ts            # Zustand state management
│   ├── types.ts            # Shared TypeScript types
│   └── latexRenderer.ts    # KaTeX → Fabric.js image renderer
├── src-tauri/              # Tauri / Rust backend
│   ├── src/lib.rs          # App entry point, plugin registration
│   ├── tauri.conf.json     # App config (name, window size, identifier)
│   ├── capabilities/       # Permission declarations for native APIs
│   └── icons/              # App icon assets
├── public/                 # Static assets
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TypeScript |
| Canvas engine | Fabric.js 7 |
| State management | Zustand 5 + Immer |
| Styling | Tailwind CSS 4 |
| Math rendering | KaTeX |
| Build tool | Vite 8 |
| Desktop runtime | Tauri 2 (Rust + WebView2) |
| Persistence | IndexedDB (idb-keyval) — native fs migration planned |
| Testing | Vitest + Testing Library |

---

## Notes for Developers

- The Rust build cache is large. The repo symlinks `src-tauri/target` → `D:\petro-graphs-target` to avoid filling the system drive. This symlink is machine-specific and is listed in `.gitignore`.
- `npm run dev` runs the frontend only in a browser (no Tauri APIs). All canvas features work; native file dialogs do not.
- Unit tests (`npm test`) run in jsdom and do not require Rust or Tauri.
