# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts both Vite dev server and Tauri app)
npm run tauri dev

# Build for production
npm run tauri build

# Frontend only (Vite dev server, no Tauri window)
npm run dev

# TypeScript check
npx tsc --noEmit
```

Rust compilation happens automatically when running `tauri dev` or `tauri build`.

## Architecture

This is a **Tauri 2 + React 19 + TypeScript** desktop application.

**Frontend** (`src/`): React with Vite. Communicates with the Rust backend via `invoke()` from `@tauri-apps/api/core`.

**Backend** (`src-tauri/src/lib.rs`): Rust. Commands are defined with `#[tauri::command]` and registered in `invoke_handler`. The `greet` command is the current example.

**IPC pattern**: Frontend calls `invoke('command_name', { arg: value })`, backend returns a value from the Rust function. New commands must be added to both the function definition in `lib.rs` and the `tauri::generate_handler![]` macro.

**Permissions** (`src-tauri/capabilities/default.json`): Controls what APIs the frontend window can access. New Tauri plugins require adding their permission here.

**Dev server port**: Fixed at `1420` (required by Tauri's `devUrl` config in `tauri.conf.json`).

### Code Style

- Do not add new comments when editing existing code

### Styling

- Tailwind CSS 4 via `@import "tailwindcss"` in `src/styles/globals.css`
- Prettier formats Tailwind class order via `prettier-plugin-tailwindcss`

## Checking Documention

- **important** When implementing any lib/framework-specific features, ALWAYS check the approrpiate lib/framework
  documention using the Context7 MCP sever before writing any code.
