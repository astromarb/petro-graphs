# Petro Graphs 
<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/e1119134-ed67-4d11-9ed1-887ca87abce2" />

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



