/**
 * Settings for the Knowledge Forge plugin.
 *
 * This file is part of the plugin scaffold; it defines the configurable
 * surface shared by commands, the triple engine, and the UI.
 */

export interface CompetencyQuestion {
	id: string;
	question: string;
	status: 'unvalidated' | 'covered' | 'uncovered';
	notes?: string;
}

export interface ForgeSettings {
	/** User questions persist with plugin settings, never in a temporary view. */
	competencyQuestions: CompetencyQuestion[];
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
	competencyQuestions: [],
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
	cacheFolder: 'Knowledge Forge',
};

/** Clone mutable defaults and migrate old question verdicts to coverage hints. */
export function loadForgeSettings(data: unknown): ForgeSettings {
	const saved = data && typeof data === 'object' ? data as Partial<ForgeSettings> : {};
	const questions = Array.isArray(saved.competencyQuestions) ? saved.competencyQuestions : [];
	return {
		...DEFAULT_SETTINGS,
		...saved,
		cacheFolder: saved.cacheFolder === '.kg-forge' ? DEFAULT_SETTINGS.cacheFolder : saved.cacheFolder ?? DEFAULT_SETTINGS.cacheFolder,
		defaultHopCount: typeof saved.defaultHopCount === 'number' && Number.isFinite(saved.defaultHopCount)
			? Math.max(0, Math.min(5, Math.round(saved.defaultHopCount))) : DEFAULT_SETTINGS.defaultHopCount,
		fileClassMappings: { ...(saved.fileClassMappings ?? DEFAULT_SETTINGS.fileClassMappings) },
		competencyQuestions: questions.filter(q => q && typeof q.id === 'string' && typeof q.question === 'string')
			.map(q => ({
				id: q.id, question: q.question,
				status: q.status === 'covered' || q.status === 'uncovered' ? q.status : 'unvalidated',
				...(typeof q.notes === 'string' ? { notes: q.notes } : {}),
			})),
	};
}
