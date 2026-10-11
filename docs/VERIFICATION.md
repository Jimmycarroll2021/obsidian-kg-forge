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

## Historical focused graph increment

Revision c4596bd adds the focused active-note map in response to visual-noise feedback. `npm run check` passes **76 tests in 12 files**, lint with zero warnings, TypeScript no-emit checks, and the production build. `git diff --check` passes.

The map shows at most 12 neighbours per page and groups target identities without losing their relationship evidence. Class facts become badges; source/inferred facts need explicit reveal; self references are omitted. Selected details show at most eight evidence facts per page. Tests cover counts, filtering, duplicate names, canonical IDs, incoming/outgoing directions, unresolved-safe opening, retained async guards, clearing, and attached-DOM keyboard focus.

Independent review reproduced focus dropping to the document body for both pagers. That required fix is complete: an enabled equivalent/reverse pager action receives focus after rendering. Fresh re-review passed the two original reproductions plus two forward/reverse boundary checks, and all 17 graph model/view regressions. The historical failure is `/tmp/forge-graph-independent-review-dafdzqch/review.test.ts`; passing evidence is `/tmp/forge-graph-independent-rereview-6tsme9w_/review.test.ts`.

The focused-map Chromium fixture checks exercise quiet defaults, selection via Enter, opt-in sources/inferred links, a dense note (103 explicit neighbours, 151 inferred links hidden), disjoint neighbour pages, keyboard pager focus, evidence-page boundaries via Enter/Space, duplicate names, unresolved targets, predicate/search controls, clear-active-note state, and dark styling. Desktop and 420px screenshots were visually inspected by the builder and independent reviewer. No browser exceptions or horizontal overflow were observed. The visible map adds no full-vault content read; it enumerates note paths and reads the active note plus source index.

Frozen component/fixture hashes and check results: [verification/focused-graph-fixture.json](verification/focused-graph-fixture.json). Screenshot: [images/focused-graph.png](images/focused-graph.png). Local fixture: `/tmp/forge-graph-qa-eup0wtwu/`; initial BODY-focus evidence is preserved separately under `initial-pager-failure/`. The earlier browser-fixture manifest remains historical; its old graph/CSS hashes are not current graph evidence.

These are actual plugin components in Chromium with synthetic data, mocked Obsidian APIs, and a fixture theme. Native Obsidian rendering and Obsidian's built-in graph were not observed or changed by this increment.

## Historical runtime limits at the focused-map increment

Native Obsidian loading, actual desktop clipboard/metadata behaviour, and real Neo4j execution were not observed. This repair preserves offline operation and prepares a testable branch/build; it does not publish a plugin release, assert model answer quality, migrate an existing graph database, or install into a personal vault.

Before an intended release, follow [the native sample-vault walkthrough](../examples/README.md), check the developer console and searchable settings, and execute the export in a disposable Neo4j store if that integration is part of release acceptance.

## Native baseline and graph quality programme

The earlier native-host gap is now closed for revision `c4596bd47bba3051e44ee4e79f9ab6a59161911e`. Official Linux Obsidian 1.14.4, Electron 43.7.7 and Chromium 150.0.7871.250 loaded the actual bundled plugin in isolated disposable profiles/vaults. The downloaded host asset matched its published SHA-256. The initial Electron automation handshake timed out; its log was preserved, and native process/CDP attachment provided the working host seam. Xvfb software rendering supplies this Linux observation; it does not prove a mobile or other operating-system host.

All 14 native baseline checks passed: plugin loading, quiet defaults, a real 300px sidebar without horizontal overflow, selected provenance, separate source identity, resolved inferred links, exact note opening, grounded GraphRAG preview, actual Electron clipboard equal to that preview, stale-copy disabling, distinct basename caches, schema report, persistent questions and cold plugin reload. No page or plugin errors were observed. The [baseline receipt](verification/native-baseline.json) binds runtime/input/host hashes. [Native window screenshot](images/native-baseline-window.png).

A separate fixed nine-note native fixture reproduced the original product failures: the link index correctly resolved incoming references while the map was empty, and prose joining two typed links created an extra unresolved `and` target. The [product-baseline receipt](verification/native-product-baseline.json) retains those failures and the comparison identities. Later candidate acceptance requires the same inputs and host; these baseline passes cannot establish acceptance of changed source.

The [frozen eight-task contract](experiments/graph-quality/CONTRACT.md) measured the source baseline at 2/8. Faithful extraction reached 5/8; indexed incoming discovery and fresh backlink removal reached 7/8. All previously passed tasks were retained. Candidate snapshots and results are append-only; [the ledger](experiments/graph-quality/results.jsonl) includes repair dispositions and the timing-accounting correction. The fixed 5,000-fact projection measures synthetic model cost, not host interaction latency.

Independent E1 review required repairs for comments, literal masking, source IDs, cache lag and balanced Markdown destinations. Its final repair passed all six original failure reproductions, two additional cases and twelve extractor tests (20/20). The supported-mobile regex compatibility correction separately passed the same 20 assertions. E2 review passed 34/34 target and independent lifecycle assertions, including caller cancellation, rename, backlink removal during a pending read and changed settings. Native reads cannot be physically aborted; four workers is a per-load bound, and overlapping refreshes can temporarily exceed four outstanding reads overall.

The repaired E3 and unchanged final confirmation both pass **8/8**. The current production check passes **110 tests in 15 files**, zero-warning lint, TypeScript and build. Independent E3 re-review passed **55/55**, including two previously failing parent-folder rename cases. Graph centre/history/selected state now remap descendants at path-segment boundaries and survive later child events; folder deletion prunes descendant history. A native screenshot also exposed host styling overriding the exhausted incoming button’s hidden property. Its scoped CSS correction is present in the repaired build. Reviewed, confirmed and live product hashes match. The [internal quality receipt](verification/graph-quality.json) binds source files and metrics. Final native candidate workflow verification remains in progress. Category leadership remains unproven: official comparator research establishes advertised features, while fair native competitor benchmarks and representative user outcomes have not been measured. Neo4j execution and mobile-host verification also remain outside this evidence.
