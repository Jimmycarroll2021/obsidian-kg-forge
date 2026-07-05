# Development Guide — Obsidian KG Forge

This document is for contributors and agents working on the plugin. It covers build setup, testing in Obsidian, file layout, and how to add new features without stepping on other modules.

---

## Prerequisites

- Node.js 18+
- npm or pnpm
- Obsidian desktop 0.15.0+ for manual testing

---

## Getting started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Build for development** (watch mode)
   ```bash
   npm run dev
   ```
   This produces `main.js` and `styles.css` in the project root and rebuilds on file changes.

3. **Build for release**
   ```bash
   npm run build
   ```

4. **Bump version** (updates `manifest.json`, `versions.json`, and creates a git tag — commit manually)
   ```bash
   npm run version
   ```

---

## Testing inside Obsidian

The fastest way to test changes is to load the plugin as an unpacked community plugin in a test vault.

### Option A: symlink the dev folder into a test vault (recommended)

On Windows (PowerShell as Administrator):
```powershell
New-Item -ItemType Junction `
  -Path "C:\Path\To\TestVault\.obsidian\plugins\kg-forge" `
  -Target "C:\Users\Jimmy\Documents\00.VECTORS\obsidian-kg-forge"
```

On macOS / Linux:
```bash
ln -s /home/you/projects/obsidian-kg-forge /path/to/testvault/.obsidian/plugins/kg-forge
```

### Option B: copy files manually

After `npm run build`, copy the following files into `TestVault/.obsidian/plugins/kg-forge/`:
- `main.js`
- `styles.css`
- `manifest.json`

### Enable the plugin

1. Open Obsidian → **Settings → Community plugins**.
2. Turn off **Safe mode** if necessary.
3. Enable **KG Forge**.
4. Open **View → Toggle developer tools** to watch the console for errors.

### Reloading

Obsidian does **not** hot-reload plugins. After each build:
- Disable and re-enable the plugin, **or**
- Use the **Reload app without saving** command.

---

## Type checking

Run TypeScript in no-emit mode to catch cross-module errors:

```bash
npx tsc --noEmit
```

This is especially important after modifying shared interfaces in `src/types.ts`, `src/settings.ts`, or `src/models/`.

---

## File layout

```
obsidian-kg-forge/
├── manifest.json          # Obsidian plugin manifest
├── package.json           # npm scripts and dependencies
├── tsconfig.json          # TypeScript config
├── esbuild.config.mjs     # esbuild bundler config
├── versions.json          # Obsidian version compatibility map
├── styles.css             # Plugin UI styles
├── README.md              # User-facing documentation
├── ASSESSMENT.md          # Research-vault assessment
├── DEVELOPMENT.md         # This file
└── src/
    ├── main.ts            # Plugin entry point; wires settings, commands, views
    ├── constants.ts       # Shared constants (view IDs, predicates, defaults)
    ├── settings.ts        # Settings interface + DEFAULT_SETTINGS
    ├── types.ts           # Common type aliases used across modules
    ├── models/
    │   ├── Triple.ts      # Triple class + serialization
    │   ├── Provenance.ts  # Provenance interface + helpers
    │   └── SourceId.ts    # SRC-XXX → file path mapping
    ├── engine/
    │   ├── TripleExtractor.ts   # Parse notes → triples
    │   ├── SchemaValidator.ts   # Validate folder/fileClass/provenance
    │   ├── SourceMapLoader.ts   # Load papers/index.md
    │   └── GraphRAGBuilder.ts   # k-hop subgraph → prompt
    ├── ui/
    │   ├── SettingsTab.ts
    │   ├── KnowledgeGraphView.ts
    │   ├── GraphRAGPanel.ts
    │   ├── CompetencyQuestionView.ts
    │   └── components/TripleList.ts
    └── commands/
        ├── index.ts
        ├── extractTriples.ts
        ├── validateSchema.ts
        ├── buildGraphRAGPrompt.ts
        ├── exportCypher.ts
        └── exportDataview.ts
```

---

## Coding conventions

- **TypeScript strict mode** is enabled. Avoid `any`.
- Use **relative imports** within `src/` (e.g. `import { Triple } from '../models/Triple'`).
- Keep modules **small and single-purpose**.
- Prefix custom CSS classes with `kg-forge--` to avoid collisions.
- Show user feedback with `Notice`; never swallow errors silently.
- All async work should catch errors and report them.

---

## Adding a new command

1. Create `src/commands/yourCommand.ts` exporting a function named `yourCommandCommand(plugin: Plugin): void`.
2. Import and register it in `src/commands/index.ts`.
3. Ensure the command is wired from `src/main.ts` via `registerCommands(this)`.
4. Add the command to the README command table.

---

## Adding a new view

1. Create `src/ui/YourView.ts` extending `ItemView` (or `Modal` for modals).
2. Add a unique view-type constant in `src/constants.ts`.
3. Register the view in `src/main.ts` using `this.registerView()`.
4. Add an opener command or ribbon icon if appropriate.

---

## Release checklist

- [ ] `manifest.json` version bumped.
- [ ] `versions.json` updated with `{ "<plugin-version>": "<min-app-version>" }`.
- [ ] `npm run build` succeeds with no errors.
- [ ] `npx tsc --noEmit` passes.
- [ ] README and CHANGELOG updated.
- [ ] Tag created: `git tag -a <version> -m "Release <version>"`.

---

## Common issues

### `main.js` is not generated

- Run `npm run build`.
- Check that `esbuild.config.mjs` points to the correct `src/main.ts` entry.

### Plugin fails to load in Obsidian

- Confirm `manifest.json` is in the plugin folder alongside `main.js` and `styles.css`.
- Check the developer console for missing imports or runtime errors.
- Verify `minAppVersion` is not higher than your Obsidian version.

### Type errors after another agent adds a module

Run `npx tsc --noEmit` and fix the shared interfaces in `src/types.ts` first; most downstream errors will resolve.
