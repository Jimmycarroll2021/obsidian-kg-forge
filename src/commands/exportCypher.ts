import { Notice, Plugin, TFile } from 'obsidian';
import { TripleExtractor } from '../engine/TripleExtractor';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import type { Triple } from '../models/Triple';
import type { ForgeSettings } from '../settings';

type PluginWithSettings = Plugin & { settings: ForgeSettings };

const COMMAND_ID = 'export-cypher';
const COMMAND_NAME = 'Export triples as Cypher';

/**
 * Register the "Export triples as Cypher" command.
 *
 * Walks the whole vault, extracts triples from every markdown file, and writes
 * Neo4j-compatible MERGE statements to a `.cypher` file. Nodes are merged
 * first, then typed edges, so the file is safe to run against an empty graph.
 */
export function registerExportCypherCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: COMMAND_ID,
		name: COMMAND_NAME,
		callback: async () => {
			try {
				await exportVaultToCypher(plugin as PluginWithSettings);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(`[KG Forge] ${COMMAND_NAME} failed`, err);
				new Notice(`KG Forge: Cypher export failed — ${message}`);
			}
		},
	});
}

async function exportVaultToCypher(plugin: PluginWithSettings): Promise<void> {
	const { settings } = plugin;
	const vault = plugin.app.vault;

	const sourceMap = await SourceMapLoader.load(vault, settings.sourceMapPath);
	const files = vault.getMarkdownFiles();

	const allTriples: Triple[] = [];
	for (const file of files) {
		const triples = await TripleExtractor.extractFromFile(file, plugin.app, sourceMap, settings);
		allTriples.push(...triples);
	}

	const cypher = triplesToCypher(allTriples);
	const outPath = `${normalizePath(settings.cacheFolder)}/kg-forge-export.cypher`;

	const existing = vault.getAbstractFileByPath(outPath);
	if (existing instanceof TFile) {
		await vault.modify(existing, cypher);
	} else {
		await vault.create(outPath, cypher);
	}

	new Notice(`KG Forge: exported ${allTriples.length} triples to ${outPath}`);
}

function triplesToCypher(triples: Triple[]): string {
	const lines: string[] = [
		'// KG Forge Cypher Export',
		`// Generated: ${new Date().toISOString()}`,
		`// Triples: ${triples.length}`,
		'',
		'// Nodes',
	];

	const nodeIds = new Set<string>();
	for (const t of triples) {
		nodeIds.add(nodeId(t.subject));
		nodeIds.add(nodeId(t.object));
	}

	for (const id of nodeIds) {
		lines.push(`MERGE (n:Entity {id: '${id}'});`);
	}

	lines.push('', '// Typed edges');

	for (const t of triples) {
		const sId = nodeId(t.subject);
		const oId = nodeId(t.object);
		const relType = sanitizePredicate(t.predicate);
		const confidence = typeof t.provenance?.confidence === 'number' ? t.provenance.confidence : 1.0;
		const source = sanitizeLiteral(t.provenance?.source ?? 'unknown');
		const timestamp = t.provenance?.timestamp ?? Date.now();
		lines.push(
			`MERGE (a:Entity {id: '${sId}'}) ` +
			`MERGE (b:Entity {id: '${oId}'}) ` +
			`MERGE (a)-[:${relType} {predicate: '${sanitizeLiteral(t.predicate)}', confidence: ${confidence}, source: '${source}', timestamp: ${timestamp}}]->(b);`,
		);
	}

	return lines.join('\n');
}

/** Stable node identifier from a triple term. */
function nodeId(term: string): string {
	return sanitizeLiteral(term);
}

/** Escape single quotes and backslashes for Cypher string literals. */
function sanitizeLiteral(input: string): string {
	return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Turn a predicate into a valid Neo4j relationship type (alphanumeric + underscore). */
function sanitizePredicate(input: string): string {
	const safe = input.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
	return safe || 'RELATED';
}

function normalizePath(path: string): string {
	return path.replace(/\/+/g, '/').replace(/\/$/, '') || '.';
}
