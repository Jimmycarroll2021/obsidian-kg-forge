import { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { createMockApp } from '../helpers/vault';
import { TripleExtractor } from '../../src/engine/TripleExtractor';
import { parseSourceMap } from '../../src/models/SourceId';

describe('TripleExtractor', () => {
	it('uses full paths and Obsidian context for aliases, headings and relative links', async () => {
		const { app } = createMockApp({
			'concepts/Shared.md': { content: '[[Shared#Details|this note]] [[../books/Shared|book]] [[Missing#Part|missing]]' },
			'books/Shared.md': { content: '' },
		});
		const resolve = vi.spyOn(app.metadataCache, 'getFirstLinkpathDest');
		const extractor = new TripleExtractor(app.vault, app.metadataCache);
		const triples = await extractor.extract(app.vault.getAbstractFileByPath('concepts/Shared.md') as TFile);
		expect(triples.every(triple => triple.subject === 'concepts/Shared.md')).toBe(true);
		expect(triples.filter(triple => triple.predicate === 'links_to').map(triple => triple.object))
			.toEqual(['concepts/Shared.md', 'books/Shared.md', 'Missing#Part']);
		expect(resolve).toHaveBeenCalledWith('../books/Shared', 'concepts/Shared.md');
		expect(resolve).toHaveBeenCalledWith('Shared', 'concepts/Shared.md');
		const bookTriples = await extractor.extract(app.vault.getAbstractFileByPath('books/Shared.md') as TFile);
		expect(bookTriples[0].subject).toBe('books/Shared.md');
	});

	it('resolves frontmatter and explicit sources relative to the source index', async () => {
		const { app } = createMockApp({
			'concepts/Study.md': {
				content: '## Connections\nsource:: SRC-2, [[books/Reference#Part|reference]]\nrequires:: [[Study#Part|local]]',
				frontmatter: { source_ids: ['SRC-1', 'SRC-unknown'], fileClass: 'concept' },
			},
			'papers/Study.md': { content: '' },
			'papers/Other.md': { content: '' },
			'books/Reference.md': { content: '' },
		});
		const map = parseSourceMap('| Source ID | Target File | Wikilink |\n| --- | --- | --- |\n'
			+ '| SRC-1 | | [[Study#Abstract|study]] |\n| SRC-2 | papers/Other.md | |', 'papers/index.md');
		const extractor = new TripleExtractor(app.vault, app.metadataCache, { sourceMap: map });
		const triples = await extractor.extract(app.vault.getAbstractFileByPath('concepts/Study.md') as TFile);
		expect(triples.filter(triple => triple.predicate === 'source').map(triple => triple.object))
			.toEqual(['papers/Study.md', 'SRC-unknown', 'books/Reference.md', 'papers/Other.md']);
		expect(triples.find(triple => triple.predicate === 'requires')?.object).toBe('concepts/Study.md');
		expect(triples.some(triple => triple.predicate === 'links_to')).toBe(false);
	});

	it('shares longest-folder typing, with explicit metadata taking precedence', async () => {
		const { app } = createMockApp({
			'knowledge/deep/A.md': { content: '' },
			'knowledge/deep/B.md': { content: '', frontmatter: { fileClass: 'book' } },
			'knowledge-other/C.md': { content: '' },
		});
		const extractor = new TripleExtractor(app.vault, app.metadataCache, {
			fileClassTypeMap: { 'knowledge/': 'concept', 'knowledge/deep/': 'algorithm' },
		});
		const a = await extractor.extract(app.vault.getAbstractFileByPath('knowledge/deep/A.md') as TFile);
		const b = await extractor.extract(app.vault.getAbstractFileByPath('knowledge/deep/B.md') as TFile);
		expect(a[0]).toMatchObject({ predicate: 'rdf:type', object: 'algorithm', inferred: true });
		expect(b[0]).toMatchObject({ predicate: 'rdf:type', object: 'book', inferred: false });
		expect(await extractor.extract(app.vault.getAbstractFileByPath('knowledge-other/C.md') as TFile)).toEqual([]);
	});

	it('ignores fenced and inline code in body and Connections examples', async () => {
		const { app } = createMockApp({
			'Example.md': { content: [
				'[[Real]] `[[Inline]]` ``[[DoubleInline]]``',
				'`outer `` nested [[StillCode]] `` code`',
				'~~~md', '[[TildeExample]]', '## Connections', 'source:: [[FencedSource]]', '~~~',
				'```md', '[[BacktickExample]]', '```',
				'## Connections', 'requires:: [[Dependency]] `[[InlineDependency]]`',
				'~~~', 'requires:: [[ExampleDependency]]', '~~~',
				'## Next', '[[Last]]', '```', '[[UnclosedFence]]',
			].join('\n') },
		});
		const triples = await new TripleExtractor(app.vault, app.metadataCache)
			.extract(app.vault.getAbstractFileByPath('Example.md') as TFile);
		expect(triples.map(triple => [triple.predicate, triple.object]))
			.toEqual([['requires', 'Dependency'], ['links_to', 'Real'], ['links_to', 'Last']]);
	});
});
