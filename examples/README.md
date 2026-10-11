# Sample vault

Copy sample-vault to a temporary location and open the copy as an Obsidian vault. Build the plugin with npm ci and npm run check, then copy main.js, manifest.json, and styles.css into the copied vault's .obsidian/plugins/kg-forge folder. Enable Knowledge Forge in Community plugins.

Use Obsidian 1.13.0 or later. This fixture contains synthetic notes and no credentials.

1. Open concepts/Graph.md. Extract triples. The generated JSON should use concepts/Graph.md as its subject and resolve Traversal to concepts/Traversal.md.
2. Open papers/Graph.md and extract again. Confirm both files have separate output paths under Knowledge Forge.
3. Build a GraphRAG prompt with Graph as the anchor, two hops, and the question "What does graph traversal enable?" Generate the preview, inspect the source-labelled evidence, then copy it.
4. Change the question or radius. Copy stays disabled until a new preview is generated.
5. Validate the vault. concepts/Isolated.md deliberately references an unknown source. The index itself and generated reports should not produce schema errors.
6. Generate Cypher and Dataview outputs twice. Directories are created automatically; the second pass updates generated files.
7. Add a competency question, check coverage, close the view, and reopen it. The question and coverage hint should persist. Edit it and confirm the hint resets to Unchecked.
8. Disable/re-enable the plugin and repeat the persistence check. A lexical match is only a coverage hint; review the evidence to determine whether an answer is supported.

For a separate first-use check, remove papers/index.md from the copied vault. Extraction and prompt generation should still work; source IDs remain unresolved and validation reports them.

Open **Knowledge Forge: Open knowledge graph** with `concepts/Graph.md` active. The quiet default shows `Traversal` with a `requires` label and a `concept` badge on the active note. Source and inferred relationships appear only when you enable their toggles. Select `Traversal` and check its source evidence, then use **Open note** to open `concepts/Traversal.md`. Toggle sources to reveal the separate `papers/Graph.md` reference. Confirm that narrow panes stack the map and that keyboard selection keeps visible focus. The map starts at the active note and includes indexed incoming relationships. It uses Knowledge Forge’s own view.

For independent exploration, select `Traversal` and use **Centre in graph**. The graph centre changes while the editor stays on `concepts/Graph.md`; incoming relationships include the referring note with its original evidence. Use **Graph back** and **Graph forward** to restore the map, then **Follow active note** to follow the editor again. Search for a neighbour before centring it and confirm the search is restored when you go back. Remove a typed referring link in a copied note and confirm its incoming relationship disappears after native metadata resolution. Source/inferred visibility still controls what the map reveals; plain source IDs alone do not enter the native incoming index.
