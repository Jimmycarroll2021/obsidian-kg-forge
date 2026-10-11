import { describe, expect, it } from 'vitest';
import { Triple } from '../../src/models/Triple';
import { createProvenance } from '../../src/models/Provenance';

describe('Cypher serialization', () => {
	it('escapes backslashes, quotes, newlines and tabs without changing note identities', () => {
		const triple = new Triple('notes/Back\\slash "quote"\nline.md', 'rdf:type',
			'paths/Tab\tfile\r.md', createProvenance('A.md'));
		expect(triple.toCypherMerge()).toBe([
			'MERGE (a:Node {id: "notes/Back\\\\slash \\"quote\\"\\nline.md"})',
			'MERGE (b:Node {id: "paths/Tab\\tfile\\r.md"})',
			'MERGE (a)-[:RDF_TYPE]->(b);',
		].join('\n'));
	});

	it('accepts simple labels and rejects labels that would alter Cypher syntax', () => {
		const triple = Triple.fromLink('A.md', 'B.md');
		expect(triple.toCypherMerge({ 'A.md': 'Concept_1', 'B.md': '_Paper' }))
			.toContain('MERGE (a:Concept_1');
		for (const label of ['bad label', '0bad', '', 'Note) SET a.admin=true //', 'Name:Injected']) {
			expect(() => triple.toCypherMerge({ 'A.md': label })).toThrow('Invalid Cypher label');
			expect(() => triple.toCypherMerge({ 'B.md': label })).toThrow('Invalid Cypher label');
		}
	});

	it('rejects an invalid relationship identifier after normalizing predicate punctuation', () => {
		expect(() => Triple.fromLink('A.md', 'B.md', '123').toCypherMerge())
			.toThrow('Invalid Cypher label');
	});
});
