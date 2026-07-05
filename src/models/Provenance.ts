/**
 * Provenance.ts
 *
 * Every triple in KG Forge carries provenance: who/where it came from,
 * how confident we are, when it was captured, and its derivation lineage.
 *
 * This mirrors the research-vault principle that provenance is non-optional.
 */

export interface Provenance {
	/** Human-readable source, usually the Obsidian file path or SRC-XXX id. */
	source: string;

	/** Confidence in [0, 1]. */
	confidence: number;

	/** Unix epoch ms when the fact was captured. */
	timestamp: number;

	/** Derivation chain, newest step first or single source entry. */
	lineage: string[];
}

export interface ProvenanceJSON {
	source: string;
	confidence: number;
	timestamp: number;
	lineage: string[];
}

const DEFAULT_CONFIDENCE = 0.9;

/**
 * Create a fresh provenance record for a fact.
 */
export function createProvenance(
	source: string,
	overrides: Partial<Provenance> = {}
): Provenance {
	return {
		source,
		confidence: overrides.confidence ?? DEFAULT_CONFIDENCE,
		timestamp: overrides.timestamp ?? Date.now(),
		lineage: overrides.lineage ?? [source],
	};
}

/**
 * Derive a child provenance record, appending a derivation step.
 */
export function withLineage(
	parent: Provenance,
	step: string,
	confidence?: number
): Provenance {
	return {
		source: parent.source,
		confidence: confidence ?? parent.confidence * 0.95,
		timestamp: Date.now(),
		lineage: [step, ...parent.lineage],
	};
}

export function provenanceToJSON(p: Provenance): ProvenanceJSON {
	return {
		source: p.source,
		confidence: p.confidence,
		timestamp: p.timestamp,
		lineage: [...p.lineage],
	};
}

export function provenanceFromJSON(json: ProvenanceJSON): Provenance {
	return {
		source: json.source,
		confidence: json.confidence,
		timestamp: json.timestamp,
		lineage: [...json.lineage],
	};
}

export function formatProvenance(p: Provenance): string {
	const date = new Date(p.timestamp).toISOString();
	return `${p.source} (conf=${p.confidence.toFixed(2)}, ${date})`;
}
