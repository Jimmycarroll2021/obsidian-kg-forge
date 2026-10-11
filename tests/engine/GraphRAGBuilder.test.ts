import { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { createMockApp } from '../helpers/vault';
import { GraphRAGBuilder } from '../../src/engine/GraphRAGBuilder';
import { Triple } from '../../src/models/Triple';
import { createProvenance } from '../../src/models/Provenance';
import { parseSourceMap } from '../../src/models/SourceId';
import { DEFAULT_SETTINGS } from '../../src/settings';

const fact = (subject: string, predicate: string, object: string) =>
	new Triple(subject, predicate, object, createProvenance(subject));

describe('GraphRAGBuilder', () => {
	it('retains type facts without crossing shared class labels into unrelated notes', () => {
		const builder = new GraphRAGBuilder([
			fact('A.md', 'rdf:type', 'concept'), fact('Unrelated.md', 'rdf:type', 'concept'),
			fact('Unrelated.md', 'source', 'Private.md'), fact('A.md', 'requires', 'B.md'),
			fact('B.md', 'rdf:type', 'algorithm'),
		]);
		const result = builder.build('A.md', 3);
		expect(result.evidence.map(triple => triple.subject)).toEqual(['A.md', 'A.md', 'B.md']);
		expect(result.facts.every(line => line.includes('[source: '))).toBe(true);
		expect(result.prompt).not.toContain('Unrelated.md');
	});

	it('stops collecting at maxFacts rather than traversing the entire neighbourhood', () => {
		const triples = Array.from({ length: 50 }, (_, index) => fact('A.md', 'requires', `B${index}.md`));
		const skippedId = vi.spyOn(triples[2], 'id');
		const builder = new GraphRAGBuilder(triples);
		expect(builder.build('A.md', 4, { maxFacts: 2 }).evidence).toHaveLength(2);
		expect(skippedId).not.toHaveBeenCalled();
		expect(builder.build('A.md', 0, { maxFacts: 1 }).evidence).toHaveLength(1);
		expect(builder.build('A.md', 3, { maxFacts: 0 }).evidence).toEqual([]);
	});

	it('keeps unresolved references as facts without joining unrelated notes through them', () => {
		const builder = new GraphRAGBuilder([
			fact('A.md', 'links_to', 'Missing'), fact('B.md', 'links_to', 'Missing'),
			fact('A.md', 'source', 'SRC-unmapped'), fact('C.md', 'source', 'SRC-unmapped'),
			fact('A.md', 'links_to', 'Missing.md'), fact('D.md', 'links_to', 'Missing.md'),
		]);
		const result = builder.build('A.md', 4);
		expect(result.evidence.map(triple => triple.object)).toEqual(['Missing', 'SRC-unmapped', 'Missing.md']);
		expect(result.evidence.every(triple => triple.subject === 'A.md')).toBe(true);
	});

	it('can traverse a real empty note when canonical vault paths are supplied', () => {
		const triples = [fact('A.md', 'links_to', 'Empty.md'), fact('B.md', 'links_to', 'Empty.md')];
		const knownNotes = ['A.md', 'B.md', 'Empty.md'];
		expect(new GraphRAGBuilder(triples, knownNotes).build('A.md', 2).evidence).toHaveLength(2);
		expect(new GraphRAGBuilder(triples).build('A.md', 2).evidence).toHaveLength(1);
	});

	it('keeps facts and literal dollar/placeholder text intact under custom templates', () => {
		const triple = fact('A$&.md', 'related_to', '{{question}}$`$\'');
		const question = 'Explain $& and {{facts}}';
		const builder = new GraphRAGBuilder([triple]);
		const custom = builder.build('A$&.md', 0, { question, systemPrompt: '{{facts}}\n{{question}}' });
		expect(custom.prompt).toContain(triple.toBullet());
		expect(custom.prompt).toContain(question);
		const omitted = builder.build('A$&.md', 0, { question, systemPrompt: 'Please answer.' });
		expect(omitted.prompt).toContain(triple.toBullet());
		expect(omitted.prompt).toContain(question);
	});

	it('uses the anchor path and excludes generated Markdown from request extraction', async () => {
		const { app } = createMockApp({
			'concepts/Shared.md': { content: '[[Related]]' },
			'books/Shared.md': { content: '[[Other]]' },
			'concepts/Related.md': { content: '' },
			'generated/report.md': { content: '[[concepts/Shared]] [[Poison]]' },
		});
		const read = vi.spyOn(app.vault, 'cachedRead');
		const result = await GraphRAGBuilder.buildFromRequest({
			app, anchor: app.vault.getAbstractFileByPath('concepts/Shared.md') as TFile,
			settings: { ...DEFAULT_SETTINGS, cacheFolder: 'generated' }, sourceMap: parseSourceMap(''), hops: 2,
		});
		expect(result.anchor).toBe('concepts/Shared.md');
		expect(result.prompt).toContain('concepts/Related.md');
		expect(result.prompt).not.toContain('Other');
		expect(result.prompt).not.toContain('Poison');
		expect(read.mock.calls.some(([file]) => file.path === 'generated/report.md')).toBe(false);
	});
});
