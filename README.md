# Knowledge Forge

**Plugin ID:** `kg-forge`  
**Package:** `obsidian-kg-forge`  
**Author:** Jimmi (Jimmycarroll2021)  
**License:** MIT

Turn your Obsidian vault into a best-in-class knowledge graph workspace. KG Forge extracts typed **subject-predicate-object triples** from your notes, enforces **provenance** on every fact, and gives you graph-powered tools such as **GraphRAG prompts**, **schema validation**, and **competency-question tracking** — all local-first and offline.

KG Forge is a **standalone** community plugin with **zero external plugin dependencies**. It reads the same markdown conventions used by tools like Breadcrumbs and Dataview, but does not require them to be installed.

---

## What it does

- **Extracts triples** from YAML frontmatter, Breadcrumbs-style `## Connections` fields, and wikilinks.
- **Types every node** using folder → fileClass mappings (`algorithms/=algorithm`, `books/=book`, `concepts/=concept`, `papers/=paper`).
- **Attaches provenance** to every triple: source, confidence, timestamp, and lineage.
- **Validates the vault schema**: missing fileClass, malformed `source_ids`, missing provenance, broken source links.
- **Builds GraphRAG prompts** from a k-hop subgraph of typed triples, serialized as bullet facts with a “say so if facts don’t support” guard.
- **Exports** your graph as Neo4j Cypher `MERGE` statements or as Dataview query templates.
- **Tracks Competency Questions** and checks whether the current schema can answer them.

---

## Installation

### From source (development)

1. Clone or copy this repository into your vault’s `.obsidian/plugins/kg-forge/` folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. In Obsidian, go to **Settings → Community plugins → Installed plugins**, enable **KG Forge**, and reload if prompted.

### From Obsidian Community Plugins (when published)

1. Open **Settings → Community plugins → Browse**.
2. Search for **KG Forge**.
3. Install and enable.

---

## Quick start

1. Open **Settings → KG Forge**.
2. Confirm the folder → fileClass mappings match your vault (defaults: `algorithms`, `books`, `concepts`, `papers`).
3. Set the path to your source map (default: `papers/index.md`).
4. Open any note and run **KG Forge: Extract triples from current note**.
5. Open the **Knowledge Forge Graph** view from the left ribbon or command palette to browse typed edges.
6. Run **KG Forge: Build GraphRAG prompt** to copy a grounded prompt to your clipboard.

---

## Permissions and privacy

KG Forge is local-first and does not send data to remote services. The plugin does request the following capabilities:

- **Vault enumeration:** Commands such as *Validate vault schema*, *Export triples as Cypher*, and *Build GraphRAG prompt* iterate over all markdown files in your vault to extract triples and build the graph. No file contents leave your device.
- **Vault read/write:** The plugin reads note contents via Obsidian's API and writes cache, report, and export files to the configured cache folder (default `.kg-forge`).
- **Clipboard access:** The *Build GraphRAG prompt* command copies the generated prompt to your system clipboard when you click **Copy to clipboard**.

No telemetry, analytics, or network requests are performed by the plugin.

---

## Commands

| Command | What it does |
| --- | --- |
| **KG Forge: Extract triples from current note** | Parses the active note into triples and caches them. Shows a notice with the count. |
| **KG Forge: Validate vault schema** | Scans the vault for schema violations and opens a report. |
| **KG Forge: Build GraphRAG prompt** | Opens a modal to pick an anchor note and hop count, then copies the prompt. |
| **KG Forge: Export triples as Cypher** | Exports the current vault triples to a `.cypher` file (node-then-edge `MERGE`). |
| **KG Forge: Generate Dataview query templates** | Creates a note with Dataview query templates matching the master map. |
| **KG Forge: Open Competency Questions** | Opens the CQ view to add, edit, and validate questions. |
| **KG Forge: Open Knowledge Graph** | Opens the typed triple explorer / graph view. |

---

## Supported edge types

The plugin understands the Breadcrumbs edge vocabulary used in the research vault:

| Predicate | Directionality | Meaning |
| --- | --- | --- |
| `rdf:type` / `type` | — | fileClass typing from folder mapping |
| `source` | outgoing | derived from |
| `requires` ↔ `enables` | inverse pair | prerequisite relationship |
| `related_to` | symmetric | general association |
| `up` ↔ `down` | inverse pair | hierarchy |
| `same` | symmetric | peer equivalence |
| `next` ↔ `prev` | inverse pair | sequence |
| `links_to` | directed | linked by mention |
| `source_id` | outgoing | maps `SRC-XXX` to paper path |

---

## Views

- **Knowledge Forge Graph** (`ItemView`) — browse triples as typed edges, filter by predicate, and inspect provenance.
- **GraphRAG Panel** — configure anchor + hops, preview the serialized subgraph, and copy the prompt.
- **Competency Questions** — manage CQs and see which ones the current schema can answer.

---

## Compatibility

- **Obsidian:** `1.13.0` and later.
- **Runtime:** fully local; no network calls are required.
- **Integrations:** designed to work alongside Dataview, Datacore, Metadata Menu, Juggl, Breadcrumbs, and Infranodus.

---

## Roadmap

- [ ] D3 / Canvas-based interactive force graph.
- [ ] Infer missing triples with simple rule-based reasoning.
- [ ] SHACL-style shape constraints.
- [ ] SPARQL-like query builder.
- [ ] Sync with external triple stores (Neo4j, RDFLib).
- [ ] LLM-assisted extraction and CQ generation (opt-in, local models only).

---

## Support & Contributing

See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for build instructions and contribution guidelines.

For bugs or feature requests, open an issue with:
- Obsidian version
- Plugin version
- Steps to reproduce
- A sample note (if possible)
