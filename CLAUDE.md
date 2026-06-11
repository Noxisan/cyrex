# CLAUDE.md — Cyrex

> Guidance for Claude Code when working in this repository. Read this fully before making changes.

---

## 1. Project Overview

**Cyrex** is a cross-platform, **visual Git client** for **Windows**, **Linux**, and **macOS** — in the spirit of GitKraken, Fork, and GitHub Desktop, but with a calmer, flatter design and a genuinely powerful feature set. It turns everyday Git work (commit, branch, merge, rebase, stash, remotes) into a fast, readable, graphical experience without hiding what Git is actually doing.

**Core principles**
1. **Git-truthful** — Cyrex is a UI over real Git. Never fake state; always reflect the true repository state. Power users must be able to see exactly what command-equivalent action ran.
2. **Fast & responsive** — large repos and long histories stay smooth. Heavy Git work happens off the UI thread, in the main process.
3. **Safe by default** — destructive actions (force-push, hard reset, branch delete, history rewrite) are clearly flagged and confirmable; nothing irreversible happens silently.
4. **Calm UX** — a tool people enjoy looking at all day: flat, minimal, low-noise.

---

## 2. Tech Stack (authoritative — do not drift)

| Layer | Choice |
|---|---|
| Runtime | **Electron 42** |
| Language | **TypeScript 6** (`strict: true`, no implicit `any`) |
| UI | **React 19** |
| Build/dev | **electron-vite 5** (Vite 7) → output to `out/` |
| Packaging | **electron-builder 26** |
| └ Windows | `nsis` (installer) + `portable` |
| └ Linux | `AppImage` + `deb` |
| └ macOS | `dmg` |
| Node | **20 LTS or newer** |
| Styling | **Tailwind 4** + **CSS variables** for theming |
| Icons | **lucide-react** |

> Before adding any dependency, check for a peer-dependency conflict (Vite/Electron versions are sensitive). If a transitive pin is required, document **why** in a comment next to the dependency in `package.json`.

### Recommended supporting libraries (verify latest before installing)
- **Git engine:** **`nodegit`** (libgit2 bindings) — primary engine, see §3. Native module → needs `electron-rebuild`.
- **Git CLI fallback:** spawn the system `git` binary for operations nodegit doesn't cover well (or where native CLI behavior is desired). See §3.
- **Diff rendering:** `diff` / `diff2html` or a custom renderer over libgit2 diffs; syntax highlighting via `shiki` or `highlight.js`.
- **Commit graph:** custom canvas/SVG renderer (the graph is a core differentiator — see §3 and §7).
- **State:** `zustand` (lightweight) — no Git secrets persisted (see §4).
- **Server state / async:** `@tanstack/react-query 5` for repo data fetching/caching/invalidation.
- **Routing:** `react-router` (hash router; file-based routing doesn't apply in the Electron renderer).
- **Forms/validation:** `zod` for all IPC payload validation.
- **i18n:** `i18next` + `react-i18next` (see §6).
- **Terminal (optional):** `xterm.js` for an embedded terminal pane.

---

## 3. Git Engine (the heart of the app — get this right)

Cyrex is a UI over real Git. The engine layer is where correctness and performance are won or lost.

### Primary: `nodegit` (libgit2)
- **Native bindings to libgit2** — fast, complete, no shelling-out per operation. Use for the bulk of repo operations: status, log/history walk, diffs, staging (index), commit, branch, checkout, merge, stash, remotes, blame, refs.
- **It is a native module.** Pin a `nodegit` version compatible with **Electron 42**'s Node ABI and run **`electron-rebuild`** (or `@electron/rebuild`) after install / on Electron upgrades. Treat an Electron bump as a mandatory rebuild + smoke-test of the engine.
- **SSH support** depends on libssh2 being available in the build. Verify SSH clone/fetch/push works on every target platform before release.

### Fallback: system `git` CLI
- Spawn the user's installed `git` for operations where the CLI is more reliable or where libgit2 lacks parity (e.g. some `rebase -i`, `filter-branch`/`filter-repo`, credential helpers, LFS, hooks behavior).
- Always parse with explicit, machine-readable flags (`--porcelain`, `-z`, `--format=...`) — never scrape human-formatted output.
- Detect `git` presence at startup; surface a clear message if it's missing and an operation needs it.

### Engine abstraction (hard rule)
- All Git access lives behind **one engine module** in `src/main/git/`. The renderer **never** talks to nodegit or spawns `git` directly — it goes through typed, allow-listed IPC (§4, §5).
- Long/expensive operations (history walk, big diffs, blame) run in the **main process** (or a worker), never block the renderer. Stream/paginate results.
- Every operation maps to an auditable, command-equivalent action the user can inspect.

### Safety rules
- Destructive operations (force-push, `reset --hard`, branch/tag delete, history rewrite, discard changes) must be **explicitly confirmed** and clearly labeled in the UI.
- Never auto-resolve merge/rebase conflicts silently — hand control to the user.
- Never run network operations (fetch/pull/push) without the user's action or an explicit, visible auto-fetch setting.

---

## 4. Credential & Process Security (non-negotiable)

Cyrex handles real credentials (HTTPS tokens, SSH keys, host passphrases). Treat them as secrets.

- **OS keychain via Electron `safeStorage`** (DPAPI on Windows, libsecret/kwallet on Linux, Keychain on macOS) for stored tokens. Prefer delegating to the system **git credential helper** where possible rather than storing tokens ourselves.
- **SSH keys stay where the user keeps them**; integrate with the system SSH agent rather than copying private keys into app storage.
- **Secrets never reach the renderer**, never land in `zustand`/`localStorage`/`sessionStorage`, and are **never logged** (scrub tokens from any command echo or error output).
- Follow the official Electron security checklist:
  - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  - All main↔renderer communication via a **typed, allow-listed `contextBridge` preload** — no arbitrary `ipcRenderer` exposure.
  - Validate every IPC payload with `zod` in the main process.
  - Strict **Content-Security-Policy**; no remote code, no `eval`.
  - `webSecurity: true`; block/`deny` `window.open` and external navigation (open links in the system browser).
  - No loading remote URLs into a `BrowserWindow`.
  - Keep Electron patched — treat Electron CVEs as release-blocking.
- No telemetry that ships repo contents, paths, or credentials. If any analytics ever exist, they are opt-in and contain no repo data.

---

## 5. Architecture & Project Structure

```
cyrex/
├─ src/
│  ├─ main/            # Electron main process (Git engine, IPC, OS integration)
│  │  ├─ git/          # THE engine: nodegit wrappers + CLI fallback (only place Git lives)
│  │  │  ├─ engine.ts  # public engine API (status, log, diff, commit, branch…)
│  │  │  ├─ cli.ts     # system `git` spawn helpers (porcelain parsing)
│  │  │  └─ graph.ts   # commit-graph data computation
│  │  ├─ credentials/  # safeStorage + credential-helper integration
│  │  ├─ ipc/          # typed, validated IPC handlers
│  │  └─ index.ts
│  ├─ preload/         # contextBridge API surface (allow-listed)
│  └─ renderer/        # React 19 app
│     ├─ components/   # reusable UI (Sidebar, TopBar, GraphView, DiffView…)
│     ├─ features/     # history, staging, branches, remotes, settings, i18n…
│     ├─ store/        # zustand stores (NO secrets persisted)
│     ├─ styles/       # Tailwind + CSS variables (themes)
│     └─ locales/      # i18n JSON per language
├─ electron.vite.config.ts
├─ electron-builder.yml
└─ CLAUDE.md
```

**Hard rules**
- Git access lives **only** in `src/main/git`. The renderer never imports nodegit or spawns `git`.
- Secrets must **never** be persisted in zustand/localStorage/sessionStorage or logged.
- Use Electron `app.getPath('userData')` for app config; the user's repos live wherever they are on disk — never copy repo contents into app storage.

---

## 6. Internationalization (i18n)

Built-in language switcher. Ship the **top 10 most-spoken world languages plus German**, using `i18next` + `react-i18next`. Locale files in `src/renderer/locales/<code>/translation.json`.

Target languages (verify the current "most spoken" list at implementation time and confirm with the user):
`en` English · `zh` Mandarin Chinese · `hi` Hindi · `es` Spanish · `fr` French · `ar` Arabic · `bn` Bengali · `pt` Portuguese · `ru` Russian · `ur` Urdu · **`de` German**.

- RTL support required for Arabic/Urdu (`dir="rtl"`, logical CSS properties).
- No hardcoded UI strings — everything through `t()`.
- Persist the chosen language in app settings.
- Note: Git terms (commit, branch, rebase, stash) are conventionally kept in English even in localized UIs — translate surrounding UI, keep canonical Git nouns recognizable.

---

## 7. UI / Design Language

**Aesthetic:** flat, calm, minimal. No heavy shadows, no thick borders, no glossy effects. Corners only **slightly rounded (~6px radius)** — never pill-shaped or heavily rounded. Low-opacity borders, a single accent color.

**Accent color:** **crimson red** (`#F7374F`). Define it as a CSS variable (e.g. `--accent: #F7374F`) and theme everything from variables so light/dark themes and accent are swappable. (This red sets Cyrex apart from GitKraken's teal-green, GitHub Desktop's purple-grey, and Fork's blue.)

> **Important — keep accent and "danger" colors separate.** In a Git client, red is semantically loaded: diff deletions, merge conflicts, failed operations, and destructive actions (force-push, hard reset, delete). Do **not** reuse the accent `#F7374F` for those states, or meaning blurs. The accent is for interactive/brand elements (active branch, primary buttons, links, selection). Diff-remove / conflict / danger states use a **separate, distinct red** (a more neutral or slightly desaturated red) defined as its own CSS variable — never the accent. Diff-add stays green; both diff colors and graph lane colors are theme variables too.

### Layout
- **Left Sidebar** — repository & ref navigation:
  - **Repositories** list (recently opened, favorites, searchable).
  - **Local branches**, **remote branches**, **tags**, **stashes** — collapsible sections.
  - **Color dot markers** for branches/remotes for quick visual grouping.
  - Collapsible.
- **Narrow Top Bar** — global actions / tools, e.g.:
  - Fetch / Pull / Push, current branch indicator, Stash, global Search, Settings, language switcher, theme toggle.
- **Center — Commit Graph:** the signature view. A clean, readable DAG of commits with lanes, refs, and selection. This is a core differentiator — invest in it.
- **Right / bottom — Detail & Diff:** selected commit details, changed files, and a clear side-by-side or inline **diff view** with syntax highlighting.
- **Staging area:** unstaged/staged file lists with hunk- and line-level staging.

Use **lucide-react** for all icons. Keep iconography consistent in stroke width and size.

### Theming
- All colors via CSS variables; Tailwind 4 reads from them.
- Light + dark themes; accent stays crimson red (`#F7374F`) across both.
- Respect `prefers-color-scheme` on first run.
- Diff colors (add/remove/conflict) and graph lane colors are theme variables too.

---

## 8. Feature Set (make it genuinely powerful)

**Core Git**
- Open/clone/init repositories; multi-repo management with quick switching.
- **Commit graph** with branches, merges, tags, and refs.
- Stage/unstage by file, **hunk**, and **line**; amend; sign commits (GPG/SSH) where configured.
- Branch create/checkout/rename/delete; **merge**, **rebase** (incl. interactive), **cherry-pick**, **revert**.
- **Stash** create/apply/pop/drop with message support.
- Remotes: add/edit; **fetch/pull/push**, track upstreams, prune.
- **Diff view** (side-by-side + inline), syntax-highlighted; image diffs.
- **Conflict resolution** UI for merges/rebases.
- Tags (lightweight + annotated); push tags.
- **Blame** and per-file **history**.
- Submodules and (where feasible) **Git LFS** awareness.

**Modern features to build toward**
- **Interactive rebase** UI (reorder, squash, fixup, edit, drop) with clear warnings.
- **Undo / reflog surface** — make recovering from mistakes easy and visible.
- **Search** across commits (message, author, hash) and across changed files.
- **Drag-and-drop** branch operations (drag to merge/rebase) — with explicit confirm.
- **Pull-request / hosting integration** (GitHub/GitLab/Gitea) — optional, credential-safe.
- **Embedded terminal** (`xterm.js`) for power users who want the CLI inline.
- **Commit templates / Conventional Commit helper** (fits this repo's own commit style).
- **Visual `.gitignore` editing** and file-status filters.
- **Worktree** support.
- **Keyboard-first** navigation and a command palette.

> When adding any feature, keep the engine abstraction (§3) intact and update the README feature matrix.

---

## 9. Development Workflow

```bash
npm install            # install deps (Node 20+)
npm run rebuild        # electron-rebuild for nodegit (after install / Electron bumps)
npm run dev            # electron-vite dev server
npm run build          # type-check + build to out/
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run dist           # electron-builder → installers/portables (current platform)
```

- **TypeScript strict mode** stays on. Fix types, don't `// @ts-ignore`.
- Run `lint` + `typecheck` before every commit.
- Prefer small, focused modules; the Git engine and IPC get unit tests.
- After any Electron version change, re-run `electron-rebuild` and smoke-test nodegit (clone, status, commit, diff, push).

### Build targets & cross-platform reality (read this before releasing)
Cyrex ships **Windows** (NSIS + portable), **Linux** (deb + AppImage), and **macOS** (dmg). Because **nodegit is a native module**, true cross-compilation across all OSes from one machine (you develop on **CachyOS**) is not practical:

- **Linux (deb + AppImage):** builds natively on CachyOS. ✅
- **macOS (dmg):** requires a **real macOS machine or a macOS CI runner** — cannot be produced on Linux. Code-signing/notarization needs Apple credentials.
- **Windows (nsis + portable):** native modules are most reliable when built **on Windows** (or a Windows CI runner). Building Windows targets from Linux with a native module is fragile — avoid for releases.

**Recommended:** a **GitHub Actions matrix** (`ubuntu-latest`, `windows-latest`, `macos-latest`) that runs `electron-rebuild` + `electron-builder` per OS and uploads artifacts. Local `npm run dist` is for building **your own platform** during development. Document the CI pipeline in the repo once set up.

---

## 10. Git Workflow — Gitflow + Conventional Commits + SemVer

This repo uses **Gitflow** with **Conventional Commits** and **Semantic Versioning**.

### Identity (IMPORTANT)
All commits, tags, and releases must be authored as the repository owner — **never** attribute commits to Claude, and do **not** add "Co-Authored-By: Claude" or any AI signature/trailer. Use the owner's configured git name and email:

```bash
git config user.name
git config user.email
# if not set locally, set explicitly (replace with the owner's real values):
# git config user.name "Noxisan"
# git config user.email "<owner-email>"
```

### Remote (already provided)
```bash
git remote add origin https://github.com/Noxisan/cyrex.git
```

### Branch model
| Branch | Purpose |
|---|---|
| `main` | production-ready, tagged releases only |
| `develop` | integration branch for finished work |
| `feature/*` | new features — branch from `develop`, merge back to `develop` |
| `bugfix/*` | non-urgent fixes — from `develop`, back to `develop` |
| `release/*` | release prep (version bump, changelog) — from `develop`, merge to `main` **and** `develop`, then tag |
| `hotfix/*` | urgent production fixes — from `main`, merge to `main` **and** `develop`, then tag |

### Conventional Commits
Format: `<type>(<scope>): <summary>`
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
Examples:
```
feat(graph): render merge commits with lane coloring
fix(engine): rebuild nodegit binding after Electron 42 bump
docs(readme): add macOS dmg build notes
```
SemVer mapping: `feat` → minor, `fix` → patch, `BREAKING CHANGE:` footer → major.

### Feature flow (use this every time a feature is built)
```bash
git checkout develop
git pull origin develop
git checkout -b feature/interactive-rebase

# ...work, committing with conventional messages...
git add -A
git commit -m "feat(rebase): add interactive rebase UI"
git push -u origin feature/interactive-rebase

# when done, merge back to develop (no fast-forward keeps history readable)
git checkout develop
git merge --no-ff feature/interactive-rebase
git push origin develop
git branch -d feature/interactive-rebase
git push origin --delete feature/interactive-rebase
```

### Release flow
```bash
git checkout develop && git pull origin develop
git checkout -b release/1.2.0
# bump version in package.json, update CHANGELOG.md
git commit -am "chore(release): 1.2.0"
git checkout main && git merge --no-ff release/1.2.0
git tag -a v1.2.0 -m "Cyrex 1.2.0"
git push origin main --tags
git checkout develop && git merge --no-ff release/1.2.0
git push origin develop
git branch -d release/1.2.0
```

### Hotfix flow
```bash
git checkout main && git pull origin main
git checkout -b hotfix/1.2.1
git commit -am "fix(push): handle rejected non-fast-forward gracefully"
git checkout main && git merge --no-ff hotfix/1.2.1
git tag -a v1.2.1 -m "Cyrex 1.2.1"
git push origin main --tags
git checkout develop && git merge --no-ff hotfix/1.2.1
git push origin develop
git branch -d hotfix/1.2.1
```

### GitHub Releases
Create a GitHub Release for each tag, attaching the built artifacts (ideally produced by the CI matrix in §9):
```bash
# requires: gh auth login (one-time, done by the owner)
gh release create v1.2.0 \
  --title "Cyrex 1.2.0" \
  --notes-file CHANGELOG_1.2.0.md \
  dist/*.exe dist/*.AppImage dist/*.deb dist/*.dmg
```
> Confirm with the owner before pushing tags or publishing a public release — these are visible, hard-to-undo actions.

### Initial push (first time)
```bash
git init
git add -A
git commit -m "chore: initial project scaffold"
git branch -M main
git remote add origin https://github.com/Noxisan/cyrex.git
git push -u origin main
git checkout -b develop
git push -u origin develop
```

---

## 11. README

Maintain a polished `README.md` at the repo root. **No emojis anywhere** — not in headings, not as bullet markers, not as status icons. Keep it clean and text-based. For feature/status indicators use words (`Yes`/`No`, `Done`/`Planned`/`In progress`) or task-list checkboxes (`[x]` / `[ ]`), never check-mark or cross emojis.

**Structure (top-to-bottom — the first screenful must answer "what is this, what does it look like, how do I get it"):**

1. **Header** — project name, one-line pitch, and a single row of badges (build status, license, latest release, supported platforms).
2. **Hero screenshot** — one strong image of the commit graph view (the signature feature). Just one here; the gallery comes later.
3. **Highlights** — a short paragraph or 4–6 tight bullets on what makes Cyrex distinct (visual commit graph, hunk/line staging, interactive rebase, multi-repo, calm minimal UI).
4. **Install** — per platform, clearly separated: Windows (NSIS installer + portable), Linux (AppImage + deb), macOS (dmg). This is why most visitors arrive; keep it near the top.
5. **Screenshots gallery** — diff view, sidebar, staging area.
6. **Feature matrix** — a table of core/planned features with text or `[x]`/`[ ]` status (no emoji ticks).
7. **Supported languages** — the 11 shipped languages, noting RTL support.
8. **Build from source** — prerequisites (Node 20+, platform build tools), `npm install`, the **`electron-rebuild`** step for nodegit, and the cross-platform note (dmg needs macOS; Windows targets build on Windows/CI — mirror §9).
9. **Contributing** — Gitflow note, Conventional Commits, link to any CONTRIBUTING.md.
10. **License.**

**Style:** prose over walls of bullets where it reads better; consistent heading levels; keep line length sane. Keep the README in sync whenever a feature ships.

---

## 12. Things Claude Should NOT Do
- Do **not** let the renderer touch nodegit or spawn `git` directly — always go through the main-process engine + IPC.
- Do **not** fake or guess repository state; reflect real Git state, and stream/paginate heavy operations.
- Do **not** run destructive or network operations without explicit user action and confirmation.
- Do **not** expose credentials/tokens/SSH keys to the renderer, logs, localStorage, or telemetry.
- Do **not** attribute commits to Claude or add AI co-author trailers.
- Do **not** push tags, create releases, or publish public content without the owner's confirmation.
- Do **not** drift from the pinned stack versions without flagging the reason.
- Do **not** disable Electron security flags (`contextIsolation`, `sandbox`, CSP) for convenience.
- Do **not** forget `electron-rebuild` after an Electron bump — a stale nodegit binding will crash the engine.
