# Reliability repair and focused graph verification

Baseline: `5330b2d5c6213cfd12101b45b80da7267a1687da`. Repair branch: `delivery/reliable-vault-workflow`. Source identity is the Git revision containing this record; GitHub CI binds its run to the published PR head. The browser fixture manifest separately records exact component and fixture hashes.

## Initial reliability checks

Environment: Linux, Node.js 22.22.2, npm 10.9.7, Obsidian API types 1.13.1, Vitest 4.0.18, jsdom 26.1.0.

- Initial increment `8a273631a0128e3fd2808f9dd2bdecbd6c820d9d`, `npm run check`: passed; 59 tests in 10 files, production lint with zero warnings, TypeScript no-emit checks, production esbuild bundle.
- `git diff --check`: passed.
- Sample-vault integration: extraction from same-basename notes, contextual source resolution, grounded prompt generation, validation, repeated Cypher and Dataview generation, and first use without an index/output directory.
- Persistence: saved/reloaded questions, ordered settings snapshots, failure recovery, unsaved-state visibility across reopened views, and cross-view edit/add/remove/check races.
- Output safety: nested directories, protected ordinary content, traversal/absolute-path rejection, hidden/config-directory rejection, generated-file updates, output exclusion, and old-default migration.

## Independent review

The reviewer inspected the combined source and acceptance rather than relying only on test results. It found two P1 defects: the hidden output folder could not use Obsidian's visible-file Vault API; a delayed coverage scan in one view could overwrite an edit in another.

Both were repaired. Independent re-review reran the original stale-edit reproduction on a fresh source snapshot, checked migration/preserved old artifacts/visible outputs/rejected unsupported paths, and passed all three independent checks. The reviewer also ran 38 focused repository regressions and reported no remaining required fixes for the scoped repair.

Original failing reproduction was preserved at `/tmp/forge-readonly-review-ay65cq6w/review.test.ts`; passing re-review at `/tmp/forge-readonly-rereview-a3bl3y8b/review.test.ts`. Portable repository regressions live in `tests/ui/concurrency.test.ts`, `tests/engine/VaultFiles.test.ts`, and `tests/settings.test.ts`.

## Initial browser fixture

The connected browser was unavailable after documented discovery/troubleshooting. A standalone Chromium fixture bundled the actual UI/engine components with the test Obsidian adapter and synthetic sample notes.

Observed: question to source-labelled preview; browser clipboard equal to displayed prompt; copy invalidation after changes; question add/check/reopen/edit; graph clearing when the active note is removed; desktop and 420px screenshots. No browser exceptions or horizontal overflow were observed. Screenshots were visually inspected.

Historical initial-increment result and component identity: [verification/browser-fixture.json](verification/browser-fixture.json). Local fixture/evidence: `/tmp/forge-browser-qa-hcmz7ek4/` (`check.mjs`, `desktop.png`, `narrow.png`, `result.json`). This uses a mocked host and a simple fixture theme; it is not a native Obsidian session or platform styling proof.

## Focused graph increment

The current source adds the focused active-note map in response to visual-noise feedback. `npm run check` passes **76 tests in 12 files**, lint with zero warnings, TypeScript no-emit checks, and the production build. `git diff --check` passes.

The map shows at most 12 neighbours per page and groups target identities without losing their relationship evidence. Class facts become badges; source/inferred facts need explicit reveal; self references are omitted. Selected details show at most eight evidence facts per page. Tests cover counts, filtering, duplicate names, canonical IDs, incoming/outgoing directions, unresolved-safe opening, retained async guards, clearing, and attached-DOM keyboard focus.

Independent review reproduced focus dropping to the document body for both pagers. That required fix is complete: an enabled equivalent/reverse pager action receives focus after rendering. Fresh re-review passed the two original reproductions plus two forward/reverse boundary checks, and all 17 graph model/view regressions. The historical failure is `/tmp/forge-graph-independent-review-dafdzqch/review.test.ts`; passing evidence is `/tmp/forge-graph-independent-rereview-6tsme9w_/review.test.ts`.

Current Chromium fixture checks exercise quiet defaults, selection via Enter, opt-in sources/inferred links, a dense note (103 explicit neighbours, 151 inferred links hidden), disjoint neighbour pages, keyboard pager focus, evidence-page boundaries via Enter/Space, duplicate names, unresolved targets, predicate/search controls, clear-active-note state, and dark styling. Desktop and 420px screenshots were visually inspected by the builder and independent reviewer. No browser exceptions or horizontal overflow were observed. The visible map adds no full-vault content read; it enumerates note paths and reads the active note plus source index.

Current component/fixture hashes and check results: [verification/focused-graph-fixture.json](verification/focused-graph-fixture.json). Screenshot: [images/focused-graph.png](images/focused-graph.png). Local fixture: `/tmp/forge-graph-qa-eup0wtwu/`; initial BODY-focus evidence is preserved separately under `initial-pager-failure/`. The earlier browser-fixture manifest remains historical; its old graph/CSS hashes are not current graph evidence.

These are actual plugin components in Chromium with synthetic data, mocked Obsidian APIs, and a fixture theme. Native Obsidian rendering and Obsidian's built-in graph were not observed or changed by this increment.

## Remaining runtime observations

Native Obsidian loading, actual desktop clipboard/metadata behaviour, and real Neo4j execution were not observed. This repair preserves offline operation and prepares a testable branch/build; it does not publish a plugin release, assert model answer quality, migrate an existing graph database, or install into a personal vault.

Before an intended release, follow [the native sample-vault walkthrough](../examples/README.md), check the developer console and searchable settings, and execute the export in a disposable Neo4j store if that integration is part of release acceptance.
