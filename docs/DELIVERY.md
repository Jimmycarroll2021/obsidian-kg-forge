# Reliable vault workflow

The first repair increment makes the existing local-first plugin usable in an ordinary vault. The user owns a collection of Markdown notes and needs accurate relationships, traceable GraphRAG context, safe exports, and questions that survive reopening. Preserve the existing plugin identity and offline behaviour.

Route: existing repository workflow. A focused feature branch, ordinary Git history, checks, and this record are sufficient; no additional controller or workflow database.

## Observed baseline

Base revision: `5330b2d5c6213cfd12101b45b80da7267a1687da`.

- Clean checkout; production build and TypeScript checks pass.
- ESLint passes with one settings-search warning.
- No automated behaviour tests. CI checks only type checking and bundling.
- GraphRAG command never opens its picker.
- Missing source index/output directory prevents first-use commands.
- Basename-only subjects merge different notes and fail to join pathful links.
- Shared type labels connect unrelated notes during retrieval.
- Competency questions are held only in the view and disappear when it closes.

## Acceptance for this increment

1. Extraction works without a source-index note. Configured source IDs remain unresolved or diagnostic when a mapping is missing; no source is invented.
2. Canonical vault paths identify notes. Aliases, headings, relative/pathful links, and source-map links resolve through Obsidian's metadata resolver. Duplicate basenames stay distinct. Folder typing uses the configured mapping.
3. GraphRAG opens a working modal, accepts a question and anchor, previews grounded source-labelled facts, and copies the displayed prompt. Retrieval is bounded and type labels cannot join unrelated notes. Generated reports/exports are excluded from scans.
4. Extraction caches, validation reports, Cypher, and Dataview outputs create their own configured directories safely. Same-name notes have separate caches. Output cannot escape the vault or overwrite a note through an unsafe cache path.
5. Competency questions persist through plugin data and reopening. Lexical matches are labelled coverage hints, not proof of answerability. Editing invalidates stale coverage.
6. Relevant regression tests, type checking, lint, and build pass; CI runs them. A small sample vault and accurate setup/behaviour documentation make the path reproducible.

## Ownership and integration

- Engine worker: extraction, source-map parsing/loading, schema validation, GraphRAG traversal, triple model, and engine tests.
- UI worker: GraphRAG command/panel, graph and question views, triple-list component, their tests, and plugin styles.
- Integration owner: shared settings/persistence, safe vault-file utilities, output commands, test infrastructure, CI, docs, sample vault, review, and final delivery.

Shared contracts: note IDs are full vault-relative `.md` paths; source-map entries retain link spelling until resolved with source-note context. `GraphRAGBuilder.buildFromRequest()` returns prompt/evidence; `buildPrompt()` remains its command convenience. `getSourceFiles(vault, cacheFolder)` excludes generated output. `writeGeneratedFile(vault, cacheFolder, relativePath, content)` creates and updates generated artifacts. Questions are persisted in `settings.competencyQuestions` through `saveSettings()`.

## State

Implementation and independent re-review are complete. The combined increment passes 59 regression tests, zero-warning lint, TypeScript checks, and the production bundle. Chromium fixture interaction and screenshots passed at desktop and 420px widths. No personal vault was edited or production plugin installed. Native Obsidian verification is distinct from automated mocks or browser-host rendering.

See [VERIFICATION.md](VERIFICATION.md) for evidence and remaining runtime limits. Branch: `delivery/reliable-vault-workflow`. Publication is a reviewable PR, not a release tag.

Next action for release readiness: run the native Obsidian sample-vault walkthrough before merging/releasing a version intended for users.

## Review corrections

Independent review found that the original hidden `.kg-forge` default was incompatible with the visible-file Vault API. Default output now uses `Knowledge Forge`; the old default setting migrates without deleting its old files. Hidden output paths are rejected. See https://docs.obsidian.md/Plugins/Vault for the native API boundary.

Independent review reproduced an overlapping-view competency-question race that restored an old question over a new edit. Shared change tracking, live-ID updates, and five multi-view regressions now preserve edits. Independent re-review reran the original failing proof successfully and closed both P1 findings.

## Visual focus increment — user feedback

The user reports that the graphic is too noisy to be useful. Continue on the existing repair branch/PR; preserve the completed reliability work. The current Knowledge Forge view is a raw relationship list, repeating full paths and provenance on every row. Improve the plugin's own view; clarification about Obsidian's built-in graph has been requested separately.

Acceptance:

1. A deterministic active-note relationship map shows compact, unambiguous note names and directional relationship labels; canonical identities remain unchanged.
2. Class facts become anchor metadata. Sources, inferred links, and self references do not crowd the default map. Explicit controls reveal secondary sources/inferred relationships with honest hidden counts.
3. A connected note can show only a bounded page of neighbours (12 by default) with navigation/search/filter controls. Multiple relationships to one target produce one target card, with all evidence retained.
4. Selected-note details expose provenance and an explicit Open note action; keyboard selection/navigation works. Unresolved targets are marked and never open an unrelated note.
5. The view continues to follow active note/metadata changes and reject stale reads. No full-vault content scan is added for drawing the map.
6. Dense synthetic notes, duplicate names, selection, filtering, source/inferred reveal, and narrow/dark layouts receive model/DOM regression checks and visually inspected Chromium fixture evidence. Native Obsidian host proof stays separate.

Ownership: UI worker owns graph view/component/styles and UI regressions; integration owner owns graph projection/model regressions, evidence, documentation, review, and publication.

Visual implementation and independent re-review are complete. The combined branch passes 76 tests in 12 files, zero-warning lint, TypeScript checks, and the production build. Chromium interaction checks cover small/dense notes, reveal controls, filtering, duplicate names, unresolved targets, selected evidence, active-note clearing, and real keyboard selection/paging. Desktop/light and 420px/dark screenshots were visually inspected; the narrow layout has no horizontal overflow.

Independent review found focus loss when pagination replaced its controls. Both pagers now restore an enabled action and handle first/final boundaries. The original two failing checks plus two boundary checks pass independently. Historical failure and passing records are linked in the graph fixture manifest. No source changes remain required by that review.

Current evidence: [focused graph fixture](verification/focused-graph-fixture.json), [screenshot](images/focused-graph.png), and [verification](VERIFICATION.md). This increment changes Knowledge Forge's own view. Obsidian's built-in graph and a native-host test remain outside the observed result.
