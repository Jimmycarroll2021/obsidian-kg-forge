# Primary-source comparison

Research date: 2026-10-11. Category: readable local exploration of typed note relationships with inspectable evidence. Read-only specialist examined current official docs; no competitor was executed by this research. Features below are advertised capabilities, not measured quality or speed.

| Comparator | Documented relevant capability | Forge gap at c4596bd |
| --- | --- | --- |
| [Native Obsidian Graph](https://obsidian.md/help/plugins/graph) | Local depth, directional arrows, note opening, search filtering, groups, keyboard pan/zoom | A quiet view must also supply meaningful typed context |
| [ExcaliBrain](https://github.com/zsviczian/excalibrain) | Structured parents/children/friends/siblings; explicit Dataview relations and inferred forward/back/mutual links | Incoming context is already an established useful capability |
| [Juggl](https://github.com/HEmile/juggl), [typed links](https://juggl.io/link-types.html), [workspaces](https://juggl.io/features/workspace-mode/workspace-mode.html) | Selective expansion/collapse, pins/hiding, saved workspaces, typed labels, layouts, styling/API | Users need controlled exploration and recovery |
| [K-Plex](https://github.com/zsviczian/kplex) | Standalone structured navigator; incoming/outgoing role areas, vault search, history/pins, keyboard navigation, cached index; author says real-world testing continues | Standalone readable rendering alone is insufficient for a leadership claim |

Selected first hypotheses: accurate extracted facts; actual incoming links; graph-only recenter/back navigation. Preserve quiet defaults and canonical identities. Configurable custom predicates/YAML properties, a complete semantic source-ID index, saved workspaces, and broader graph layouts are distinct remaining product capabilities.

The public installed Obsidian seam is `MetadataCache.resolvedLinks`: referring path -> canonical destination path -> count. Its `resolve` events may follow `changed`; renames require vault events. [Official API source](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts). Native index candidates establish links, not typed predicates: read their source notes to retain only real extracted incoming facts. Plain source IDs are not native links and require honest completeness wording.

Category leadership remains unproven until representative native tasks and user outcomes are compared fairly. An internally passing suite and advertised feature table cannot establish that claim.
