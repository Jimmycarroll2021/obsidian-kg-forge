/**
 * GraphRAGBuilder.ts
 *
 * Builds a grounded LLM prompt from a k-hop neighbourhood of typed triples.
 *
 * Design notes from the research vault:
 *   - Serialise triples as bullet facts.
 *   - Include a "say so if facts don't support" guard.
 *   - Return both the prompt string and the evidence triples for traceability.
 */

import { App, TFile } from 'obsidian';
import { Triple } from '../models/Triple';
import { SourceMap } from '../models/SourceId';
import { TripleExtractor } from './TripleExtractor';
import type { ForgeSettings } from '../settings';
import { getSourceFiles } from './VaultFiles';

export interface GraphRAGOptions {
	/** Override the default system prompt. May contain {{facts}} and {{question}}. */
	systemPrompt?: string;

	/** The user question to be answered from the subgraph. */
	question?: string;

	/** Cap the number of facts included in the prompt. */
	maxFacts?: number;
}

export interface GraphRAGPromptRequest {
	/** Anchor note selected by the user. */
	anchor: TFile;

	/** Obsidian app instance. */
	app: App;

	/** Plugin settings. */
	settings: ForgeSettings;

	/** Resolved source map for source_ids. */
	sourceMap: SourceMap;

	/** Number of hops to expand around the anchor. */
	hops: number;

	/** Optional user question. */
	question?: string;
}

export interface GraphRAGPrompt {
	/** Identifier of the anchor note/entity. */
	anchor: string;

	/** Hop count used to build the neighbourhood. */
	hops: number;

	/** Bullet facts serialised from the evidence triples. */
	facts: string[];

	/** The full prompt, ready to copy to an LLM. */
	prompt: string;

	/** The actual triples used as evidence. */
	evidence: Triple[];
}

const DEFAULT_SYSTEM_PROMPT = `You are a knowledge-graph assistant. Answer the question using ONLY the facts listed below.
If the facts do not support an answer, say so clearly.

Facts:
{{facts}}

Question: {{question}}`;

export class GraphRAGBuilder {
	private readonly adjacency = new Map<string, Triple[]>();
	private readonly noteNodes: Set<string>;

	/** Pass scanned vault paths to include real notes that have no outgoing facts. */
	constructor(triples: Triple[], notePaths?: Iterable<string>) {
		this.noteNodes = new Set(notePaths ?? triples.map(triple => triple.subject));
		for (const triple of triples) {
			this.addAdjacent(triple.subject, triple);
			// A class label is a fact about a note, not a shared entity to traverse.
			if (triple.predicate !== 'rdf:type' && triple.object !== triple.subject) {
				this.addAdjacent(triple.object, triple);
			}
		}
	}

	private addAdjacent(node: string, triple: Triple): void {
		const adjacent = this.adjacency.get(node) ?? [];
		adjacent.push(triple);
		this.adjacency.set(node, adjacent);
	}

	/**
	 * Convenience used by commands: extract all vault triples and build a prompt.
	 */
	static async buildPrompt(request: GraphRAGPromptRequest): Promise<string> {
		return (await GraphRAGBuilder.buildFromRequest(request)).prompt;
	}

	/** Build the prompt and the exact evidence used by command and modal consumers. */
	static async buildFromRequest(request: GraphRAGPromptRequest): Promise<GraphRAGPrompt> {
		const { anchor, app, settings, sourceMap, hops, question } = request;
		const extractor = new TripleExtractor(app.vault, app.metadataCache, {
			fileClassTypeMap: settings.fileClassMappings,
			sourceMap,
		});

		const allTriples: Triple[] = [];
		const files = getSourceFiles(app.vault, settings.cacheFolder);
		for (const file of files) {
			allTriples.push(...(await extractor.extract(file)));
		}

		const builder = new GraphRAGBuilder(allTriples, files.map(file => file.path));
		return builder.build(anchor.path, hops, {
			systemPrompt: settings.graphRAGPromptTemplate,
			question,
		});
	}

	/**
	 * Build a GraphRAG prompt for an anchor subject.
	 *
	 * @param anchor Canonical vault-relative note path.
	 * @param hops   Number of relationship hops to expand around the anchor.
	 */
	build(anchor: string, hops: number, options: GraphRAGOptions = {}): GraphRAGPrompt {
		const maxFacts = Number.isFinite(options.maxFacts)
			? Math.max(0, Math.floor(options.maxFacts!)) : 500;
		const hopCount = Number.isFinite(hops) ? Math.max(0, Math.floor(hops)) : 0;
		const evidence = this.collectKHops(anchor, hopCount, maxFacts);
		const facts = evidence.map((t) => t.toBullet());
		const question = options.question ?? '';
		const system = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

		const serializedFacts = facts.join('\n') || '- No facts available.';
		// One substitution pass avoids replacement-string expansion and prevents
		// question placeholders inside a fact (or facts inside a question) from changing.
		let prompt = system.replace(/\{\{(facts|question)\}\}/g,
			(_match, field: string) => field === 'facts' ? serializedFacts : question);
		if (!system.includes('{{facts}}')) prompt += `\n\nFacts:\n${serializedFacts}`;

		// If the custom template did not explicitly place the question, append it.
		if (question && !system.includes('{{question}}')) {
			prompt += `\n\nQuestion: ${question}`;
		}

		return {
			anchor,
			hops: hopCount,
			facts,
			prompt,
			evidence,
		};
	}

	/**
	 * Serialise an arbitrary set of triples as bullet facts.
	 */
	static serializeFacts(triples: Triple[]): string[] {
		return triples.map((t) => t.toBullet());
	}

	/**
	 * Collect the k-hop undirected neighbourhood of an anchor node.
	 */
	private collectKHops(anchor: string, hops: number, maxFacts: number): Triple[] {
		if (maxFacts === 0) return [];
		if (hops <= 0) {
			// Anchor-only: return triples that originate from the anchor.
			const evidence = new Map<string, Triple>();
			for (const triple of this.adjacency.get(anchor) ?? []) {
				if (triple.subject !== anchor) continue;
				evidence.set(triple.id(), triple);
				if (evidence.size >= maxFacts) break;
			}
			return Array.from(evidence.values());
		}

		const visited = new Set<string>([anchor]);
		let frontier = new Set<string>([anchor]);
		const evidence = new Map<string, Triple>();

		for (let i = 0; i < hops; i++) {
			const nextFrontier = new Set<string>();
			for (const node of frontier) {
				for (const t of this.adjacency.get(node) ?? []) {
					evidence.set(t.id(), t);
					if (evidence.size >= maxFacts) return Array.from(evidence.values());
					if (t.predicate === 'rdf:type') continue;
					const other = t.subject === node ? t.object : t.subject;
					if (this.noteNodes.has(other) && !visited.has(other)) {
						visited.add(other);
						nextFrontier.add(other);
					}
				}
			}
			frontier = nextFrontier;
			if (frontier.size === 0) break;
		}

		return Array.from(evidence.values());
	}
}
