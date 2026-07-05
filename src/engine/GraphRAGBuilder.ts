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
	constructor(private triples: Triple[]) {}

	/**
	 * Convenience used by commands: extract all vault triples and build a prompt.
	 */
	static async buildPrompt(request: GraphRAGPromptRequest): Promise<string> {
		const { anchor, app, settings, sourceMap, hops, question } = request;
		const extractor = new TripleExtractor(app.vault, app.metadataCache, {
			fileClassTypeMap: settings.fileClassMappings,
			sourceMap,
		});

		const allTriples: Triple[] = [];
		for (const file of app.vault.getMarkdownFiles()) {
			allTriples.push(...(await extractor.extract(file)));
		}

		const builder = new GraphRAGBuilder(allTriples);
		const result = builder.build(anchor.basename, hops, {
			systemPrompt: settings.graphRAGPromptTemplate,
			question,
		});
		return result.prompt;
	}

	/**
	 * Build a GraphRAG prompt for an anchor subject.
	 *
	 * @param anchor Subject identifier (usually the note basename).
	 * @param hops   Number of relationship hops to expand around the anchor.
	 */
	build(anchor: string, hops: number, options: GraphRAGOptions = {}): GraphRAGPrompt {
		const maxFacts = options.maxFacts ?? 500;
		const evidence = this.collectKHops(anchor, hops).slice(0, maxFacts);
		const facts = evidence.map((t) => t.toBullet());
		const question = options.question ?? '';
		const system = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

		let prompt = system
			.replace(/\{\{facts\}\}/g, facts.join('\n') || '- No facts available.')
			.replace(/\{\{question\}\}/g, question);

		// If the custom template did not explicitly place the question, append it.
		if (question && !prompt.includes(question)) {
			prompt += `\n\nQuestion: ${question}`;
		}

		return {
			anchor,
			hops,
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
	private collectKHops(anchor: string, hops: number): Triple[] {
		if (hops <= 0) {
			// Anchor-only: return triples that originate from the anchor.
			return this.triples.filter((t) => t.subject === anchor);
		}

		// Build an undirected adjacency index: node -> triples touching it.
		const adj = new Map<string, Triple[]>();
		for (const t of this.triples) {
			if (!adj.has(t.subject)) adj.set(t.subject, []);
			if (!adj.has(t.object)) adj.set(t.object, []);
			adj.get(t.subject)!.push(t);
			adj.get(t.object)!.push(t);
		}

		const visited = new Set<string>([anchor]);
		let frontier = new Set<string>([anchor]);
		const evidence = new Map<string, Triple>();

		for (let i = 0; i < hops; i++) {
			const nextFrontier = new Set<string>();
			for (const node of frontier) {
				for (const t of adj.get(node) ?? []) {
					evidence.set(t.id(), t);
					const other = t.subject === node ? t.object : t.subject;
					if (!visited.has(other)) {
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
