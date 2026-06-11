## Petro Graphs [![PR Checks](https://github.com/astromarb/petro-graphs/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/astromarb/petro-graphs/actions/workflows/ci.yml)

**Desktop application for composing, annotating, and exporting geological photomicrograph figures, purpose-built for cross-polarized and plane-polarized light (XPL/PPL) thin-section photography.**

---

> Built with Tauri 2, Rust, React 19, TypeScript, and Fabric.js 7.
---
<img width="1336" height="824" alt="image" src="https://github.com/user-attachments/assets/058b47de-6084-4cf9-aacc-047af4665c56" />


---
## Running as a Desktop App
Petro Graphs is a native desktop application built with [Tauri](https://tauri.app). You do **not** need a browser or web server to run it.

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
### Notes for Developers

- The Rust build cache is large. The repo symlinks `src-tauri/target` → `D:\petro-graphs-target` to avoid filling the system drive. This symlink is machine-specific and is listed in `.gitignore`.
- `npm run dev` runs the frontend only in a browser (no Tauri APIs). All canvas features work; native file dialogs do not.
- Unit tests (`npm test`) run in jsdom and do not require Rust or Tauri.
---
