# Reliability repair verification

Baseline: `5330b2d5c6213cfd12101b45b80da7267a1687da`. Repair branch: `delivery/reliable-vault-workflow`. Source identity is the Git revision containing this record; GitHub CI binds its run to the published PR head. The browser fixture manifest separately records exact component and fixture hashes.

## Observed checks

Environment: Linux, Node.js 22.22.2, npm 10.9.7, Obsidian API types 1.13.1, Vitest 4.0.18, jsdom 26.1.0.

- `npm run check`: passed; 59 tests in 10 files, production lint with zero warnings, TypeScript no-emit checks, production esbuild bundle.
- `git diff --check`: passed.
- Sample-vault integration: extraction from same-basename notes, contextual source resolution, grounded prompt generation, validation, repeated Cypher and Dataview generation, and first use without an index/output directory.
- Persistence: saved/reloaded questions, ordered settings snapshots, failure recovery, unsaved-state visibility across reopened views, and cross-view edit/add/remove/check races.
- Output safety: nested directories, protected ordinary content, traversal/absolute-path rejection, hidden/config-directory rejection, generated-file updates, output exclusion, and old-default migration.

## Independent review

The reviewer inspected the combined source and acceptance rather than relying only on test results. It found two P1 defects: the hidden output folder could not use Obsidian's visible-file Vault API; a delayed coverage scan in one view could overwrite an edit in another.

Both were repaired. Independent re-review reran the original stale-edit reproduction on a fresh source snapshot, checked migration/preserved old artifacts/visible outputs/rejected unsupported paths, and passed all three independent checks. The reviewer also ran 38 focused repository regressions and reported no remaining required fixes for the scoped repair.

Original failing reproduction was preserved at `/tmp/forge-readonly-review-ay65cq6w/review.test.ts`; passing re-review at `/tmp/forge-readonly-rereview-a3bl3y8b/review.test.ts`. Portable repository regressions live in `tests/ui/concurrency.test.ts`, `tests/engine/VaultFiles.test.ts`, and `tests/settings.test.ts`.

## Browser fixture

The connected browser was unavailable after documented discovery/troubleshooting. A standalone Chromium fixture bundled the actual UI/engine components with the test Obsidian adapter and synthetic sample notes.

Observed: question to source-labelled preview; browser clipboard equal to displayed prompt; copy invalidation after changes; question add/check/reopen/edit; graph clearing when the active note is removed; desktop and 420px screenshots. No browser exceptions or horizontal overflow were observed. Screenshots were visually inspected.

Machine-readable result and component identity: [verification/browser-fixture.json](verification/browser-fixture.json). Local fixture/evidence: `/tmp/forge-browser-qa-hcmz7ek4/` (`check.mjs`, `desktop.png`, `narrow.png`, `result.json`). This uses a mocked host and a simple fixture theme; it is not a native Obsidian session or platform styling proof.

## Remaining runtime observations

Native Obsidian loading, actual desktop clipboard/metadata behaviour, and real Neo4j execution were not observed. This repair preserves offline operation and prepares a testable branch/build; it does not publish a plugin release, assert model answer quality, migrate an existing graph database, or install into a personal vault.

Before an intended release, follow [the native sample-vault walkthrough](../examples/README.md), check the developer console and searchable settings, and execute the export in a disposable Neo4j store if that integration is part of release acceptance.
