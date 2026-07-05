/**
 * Settings for the Knowledge Forge plugin.
 *
 * This file is part of the plugin scaffold; it defines the configurable
 * surface shared by commands, the triple engine, and the UI.
 */

export interface ForgeSettings {
	/** Require source/confidence/timestamp signals on extracted triples. */
	provenanceEnforced: boolean;

	/** Default k-hop radius for GraphRAG prompts. */
	defaultHopCount: number;

	/** Template wrapping serialized triple facts. Uses {{facts}} / {{question}}. */
	graphRAGPromptTemplate: string;

	/** Vault-relative path to the paper source-id index. */
	sourceMapPath: string;

	/** Folder → FileClass schema contract, e.g. { algorithms: 'algorithm' }. */
	fileClassMappings: Record<string, string>;

	/** Folder where generated caches, reports, and exports are written. */
	cacheFolder: string;
}

export const DEFAULT_SETTINGS: ForgeSettings = {
	provenanceEnforced: true,
	defaultHopCount: 2,
	graphRAGPromptTemplate: `You are a knowledge-graph assistant. Answer the question using ONLY the facts listed below.
If the facts do not support an answer, say so clearly.

Facts:
{{facts}}

Question: {{question}}`,
	sourceMapPath: 'papers/index.md',
	fileClassMappings: {
		algorithms: 'algorithm',
		books: 'book',
		concepts: 'concept',
		papers: 'paper',
	},
	cacheFolder: '.kg-forge',
};
