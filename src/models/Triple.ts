/**
 * Triple.ts
 *
 * The universal primitive of KG Forge: Subject – Predicate – Object.
 * Every triple is typed, carries provenance, and can be marked as inferred.
 */

import {
	Provenance,
	ProvenanceJSON,
	createProvenance,
	provenanceFromJSON,
	provenanceToJSON,
} from './Provenance';

export interface TripleJSON {
	subject: string;
	predicate: string;
	object: string;
	provenance: ProvenanceJSON;
	inferred: boolean;
}

export class Triple {
	constructor(
		public subject: string,
		public predicate: string,
		public object: string,
		public provenance: Provenance,
		public inferred = false
	) {}

	/** Stable identity for deduplication. */
	id(): string {
		return `${this.subject}::${this.predicate}::${this.object}`;
	}

	toString(): string {
		return `(${this.subject})-[${this.predicate}]->(${this.object})`;
	}

	/** Serialise as a single bullet fact (used by GraphRAG prompts). */
	toBullet(): string {
		return `- (${this.subject}) → ${this.predicate} → (${this.object}) [source: ${this.provenance.source}]`;
	}

	/**
	 * Serialise to a compact Cypher MERGE block.
	 * Labels can be supplied via the optional mapping.
	 */
	toCypherMerge(labels?: Record<string, string>): string {
		const validateLabel = (label: string) => {
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) {
				throw new Error(`Invalid Cypher label ${JSON.stringify(label)}. Use letters, numbers and underscores, starting with a letter or underscore.`);
			}
			return label;
		};
		const sLabel = validateLabel(labels?.[this.subject] ?? 'Node');
		const oLabel = validateLabel(labels?.[this.object] ?? 'Node');
		const rel = this.predicate.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
		validateLabel(rel);
		return [
			`MERGE (a:${sLabel} {id: ${JSON.stringify(this.subject)}})`,
			`MERGE (b:${oLabel} {id: ${JSON.stringify(this.object)}})`,
			`MERGE (a)-[:${rel}]->(b);`,
		].join('\n');
	}

	toJSON(): TripleJSON {
		return {
			subject: this.subject,
			predicate: this.predicate,
			object: this.object,
			provenance: provenanceToJSON(this.provenance),
			inferred: this.inferred,
		};
	}

	static fromJSON(json: TripleJSON): Triple {
		return new Triple(
			json.subject,
			json.predicate,
			json.object,
			provenanceFromJSON(json.provenance),
			json.inferred
		);
	}

	static fromLink(
		subject: string,
		object: string,
		predicate = 'links_to',
		source?: string,
		inferred = true
	): Triple {
		return new Triple(
			subject,
			predicate,
			object,
			createProvenance(source ?? subject, {
				confidence: inferred ? 0.6 : 0.9,
				lineage: [source ?? subject, inferred ? 'inferred:wikilink' : 'explicit:link'],
			}),
			inferred
		);
	}
}

/** Keep the triple with the highest confidence. */
export function mergeDuplicates(triples: Triple[]): Triple[] {
	const map = new Map<string, Triple>();
	for (const t of triples) {
		const existing = map.get(t.id());
		if (!existing || t.provenance.confidence > existing.provenance.confidence) {
			map.set(t.id(), t);
		}
	}
	return Array.from(map.values());
}
