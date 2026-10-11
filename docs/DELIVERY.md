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

## Initial reliability increment state

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

## Knowledge graph quality programme

Current request: assess best-in-class readiness and improve it using the meta, long-horizon and experiment-loop skills. The previous scoped repair remains accepted; category leadership remains unproven. Use delivery-machinery/Karpathy for scope and review, codex-long-horizon-loop for recovery, autoresearch-loop for comparable experiments. State owner stays this file.

Research identified three concrete gaps: real incoming relationships are absent from the map; graph-only exploration/history is absent; ordinary Markdown and literal/comment handling lose or invent facts. Compare advertised capabilities of native Graph, ExcaliBrain, Juggl and K-Plex using their primary documentation; actual competitor/user benchmarking is a distinct unmet observation.

Active comparison: [graph-quality contract](experiments/graph-quality/CONTRACT.md), frozen eight-task evaluator, baseline c4596bd. Local batch: establish baseline, test faithful extraction, indexed incoming links, and independent graph navigation. Native Obsidian baseline was verified in an isolated temporary profile/vault; no personal vault or global app configuration was changed. Exact logs and snapshots: `/tmp/forge-quality-series-az4j9d34/`.

Current state: E3 reaches 8/8 frozen tasks and the full production check passes 110 tests in 15 files. Final independent re-review passed 55/55; repaired exact-bundle native QA passes 14 original workflows, 14 extension checks and two frozen product comparisons. Implementation and verification are complete; final evidence publication is pending. Native QA owns isolated host evidence; the engine worker owns the incoming loader; the integration owner owns evaluator and current state. Next action: commit final evidence, update the draft PR, verify GitHub CI on its exact head and package the tested runtime files. Cumulative earlier session resource usage is unknown; this series records actual run durations and failures rather than treating prior usage as zero.

Baseline evaluated: **2/8 tasks passed**. Passed quiet outgoing view and bounded unrelated-read/unresolved safety. Failed faithful typed links, ordinary/repeated conventions, literal suppression, actual incoming discovery, graph-only history, and incoming invalidation. Projection workload: 5,000 facts, median 4.42ms/max5.59ms over15repetitions. This new task suite exposes missing product behaviour; it does not invalidate the earlier 76 accepted regressions. Baseline raw evidence is preserved. Initial directory-setup failed before an evaluator process began; setup was repaired without changing the frozen evaluator.

E1: faithful extraction, initially owned by the engine worker and repaired by the integration owner after independent findings. Advancement requires one additional frozen task without losing a passed task.

Native baseline is verified for c4596bd: genuine Obsidian 1.14.4 / Electron 43.7.7 in a disposable profile/vault. All 14 original journey checks passed, including plugin load, the actual 300px pane without overflow, selected evidence, exact note opening, GraphRAG clipboard, persistent questions and plugin reload. No page/plugin errors were observed. Earlier native-unverified statements remain historical for the initial delivery. The [native baseline record](verification/native-baseline.json) binds host/runtime/input hashes. It does not establish acceptance of later source changes.

A second fixed nine-note native fixture reproduced the missing incoming map and the phantom `and` target. Its inputs and baseline bundle are preserved at `/tmp/forge-native-product-baseline-wncz1gfy/` for candidate comparison.

E1 candidate-01 and candidate-01-repair both measured 5/8. Independent review required repairs for comments, literal masking, mixed source IDs, stale cache omissions and balanced Markdown destinations. These candidates are retained as requiring repair, not accepted. Candidate-01-repair-02 retains 5/8 and passed independent review: all six original proofs, two added external/balanced-link cases and 12 extractor tests (20/20). A follow-up supported-mobile regex correction passed lint and retained the 7/8 E2 score as candidate-02-compat; compatibility review is included in E2 review.

E2 candidate-02 reaches **7/8**, retaining every earlier passed task. Projection median is 4.38ms and maximum 5.47ms over the fixed 5,000-fact model. This model timing does not measure native latency. Incoming discovery and resolved removal now pass; graph-only centre/history remains the one failed task. Four new view tests verify incoming direction/evidence, index removal/addition, the initial 100-note cap with explicit extension, cache reuse and partial read failures. Old failure-path tests now change the note's mtime before injecting a read error, so they still test a fresh failed read rather than a valid cache hit.

E3 ownership: UI worker owns the view, focused-map component, graph styles and new navigation tests. It must retain E2 bounds and invalidation while implementing graph-only centre, bounded back/forward history, restored filters and keyboard focus. Integration owner owns docs, experiments and independent review. Final acceptance requires the frozen confirmation, the full production checks and genuine native candidate evidence against the preserved inputs. Publication remains the existing draft PR; no merge or release is authorised by this programme.

E2 independent review passed 34/34 assertions, including cancellation without cache pollution, rename during a read, resolved backlink removal during a pending read and settings changes. Mobile-parser compatibility separately passed 20/20 independent assertions. No required source fix remained in the reviewed E2 scope. Four incoming workers is a per-load bound; the native read API cannot abort an obsolete read, so overlapping refreshes may temporarily exceed four reads overall. Final native candidate verification is still pending.

Independent E2 evidence: `/tmp/forge-e2-independent-review-13qu5tzr/`; mobile parser evidence: `/tmp/forge-e1-mobile-independent-review-rgghcjee/`. The result ledger retains an explicit correction for a temporary pending path written before the final reviewer receipt arrived.

E3 candidate-03 measured **8/8**, projection median 3.94ms / maximum 5.62ms. The full production check passed **108 tests in 15 files**, zero-warning lint, TypeScript and build. Exact runtime hashes were sent to native QA and recorded in the result ledger. The native worker copies that build to a fresh candidate directory so subsequent source changes cannot alter the loaded observation. Independent review and native QA are active; final confirmation and publication remain pending.

Native candidate-03 passed both originally failing product checks against the unchanged nine input notes and original runner. Visual inspection nevertheless found a native-only P2: the Load more button was visibly shown at 2/2 even though its hidden property was true, because Obsidian button styling overrides the browser default. The screenshot/frozen first bundle remain preserved. A scoped CSS hidden rule repairs it; a new bundle/native receipt is required. This finding was not caught by jsdom assertions of the hidden property.

E3 review also reproduced parent-folder rename failures (51 assertions passed, two failed). Segment-boundary remapping now preserves descendant centre/history/selection, remains idempotent with later child events and prunes descendant folder-delete history. Candidate-03-repair retains 8/8; production checks pass 110 tests in 15 files. Independent re-review passes 55/55 and closes both original proofs. First native extension passed seven workflow checks before a GraphRAG dispatch/modal wait timed out; that diagnostic remains preserved and unresolved until the fresh repaired run closes the workflow.

Final frozen confirmation retains **8/8**, median 3.85ms / maximum 5.70ms on the fixed model. Reviewed, confirmed and live production source hashes match exactly (product identity `17dcc2ec120cdf5fca80cd30f1cb744db07dbb9dba75a79cceb6aba273e0cbf3`). First native product candidate evidence is `/tmp/forge-native-candidate-03-lnvim7l7/`; both comparison checks pass and all nine source-note hashes remain unchanged. The startup prompt diagnostic is preserved at `/tmp/forge-native-dispatch-diagnostic-r3144c9k/`: an early command/direct callback returned without visible modal; a later cold launch inserted the modal normally. Cause remains unproven. Final repaired QA waits for the native layout-ready boundary and repeats command/modal verification across reload.

Repaired native frozen comparison passed 2/2, with all nine source hashes unchanged and the exhausted incoming button absent. The ready-host GraphRAG miss also reproduced despite layoutReady/focus/active Markdown and successful dispatch, so startup timing alone is not an established cause. Native Modal inspection excludes a collision with the subclass opened flag: native uses isOpen and attaches to activeWindow.document.body. QA is tracing owner-document/window identity before another acceptance retake. These diagnostic runs are preserved; final native acceptance remains pending.

Native modal ownership diagnosis: the missing-panel instance had isOpen/opened true and a connected container, but its native Modal win/ownerDocument were an additional `about:blank` window, not the evaluated vault window. The panel exists in that other document. Evidence: `/tmp/forge-native-modal-owner-diagnostic-p0_21f_x/modal-inspect-results.json`. This excludes the proposed subclass state collision and explains why querying the vault page saw no modal. QA is inventorying the owned extra window and retaking commands in the verified native vault window across cold/plugin reload; no GraphRAG product change is inferred.

Product committed locally as `06b6aeb755b0296641313586ae2c2583fc105ad1`. A fresh Git archive build reproduced the native frozen main.js/styles.css/manifest.json hashes exactly; build receipt is `/tmp/forge-build-replay-nxwm30h1/receipt.json`. Native window diagnosis identified the extra target as an owned Obsidian Settings popout titled Settings - vault - Obsidian 1.14.4, not a page created by the CDP harness. After closing that verified disposable settings window, all 14 original workflows and two GraphRAG command opens (cold/plugin reload) passed in the actual vault document, plus four narrow/dark/keyboard navigation checks. A selector timeout then occurred because role queries intentionally omit the now-hidden incoming button; the extension resumes on the same profile with an explicit includeHidden query. This changes the test selector only; source remains fixed. Final extension/receipt/cleanup/publication are pending.


Final native acceptance is complete for product commit `06b6aeb755b0296641313586ae2c2583fc105ad1`: 14/14 original workflows, 14/14 extension checks and 2/2 frozen native comparisons; zero page/plugin errors. The [sealed native receipt](verification/native-final.json) binds the exact runtime and product identity, original runner/input hashes, host files, diagnostics, results and screenshots. Root verified every recorded artifact hash and the matching live runtime. QA and root both verified zero owned native/Xvfb processes. The window-routing diagnosis closes the prompt observation: actual panels opened in an owned Settings popout while the runner watched the vault; correctly scoped uninstrumented cold/reload commands pass. Harness failures are preserved, not converted into product passes. No remaining required source fix exists in the reviewed/observed eight-task increment.

Category leadership remains unproven. Primary-source research identifies competitor capabilities and broader gaps; representative user outcomes, fair competitor-native benchmarks, custom predicates/semantic source-ID indexing and saved workspaces are a future quality increment. Current completion means the scoped internal/native acceptance is fulfilled and the reviewable delivery is being published, not that the category-leadership criterion is achieved.
