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

	it('does not invent conjunction targets and preserves mixed source-ID lists', async () => {
		const { app, files } = createMockApp({
			'Anchor.md': '## Connections\nrequires:: [[A]] and [[B]]\nsource:: SRC-1, [[C]]',
			'A.md': '', 'B.md': '', 'C.md': '',
		});
		const triples = await new TripleExtractor(app.vault, app.metadataCache).extract(files.get('Anchor.md')! as TFile);
		expect(triples.map(triple => [triple.predicate, triple.object]))
			.toEqual([['requires', 'A.md'], ['requires', 'B.md'], ['source', 'C.md'], ['source', 'SRC-1']]);
	});

	it('preserves plain and unsupported Connections links while repeated fields remain typed', async () => {
		const { app, files } = createMockApp({
			'Anchor.md': ['## Connections', '[[A]]', 'depends_on:: [[B]]', 'requires:: [[C]]',
				'## Notes', '[A label](A.md#Section)', '## Connections', '- enables:: [[D]]'].join('\n'),
			'A.md': '', 'B.md': '', 'C.md': '', 'D.md': '',
		});
		const triples = await new TripleExtractor(app.vault, app.metadataCache).extract(files.get('Anchor.md')! as TFile);
		expect(triples.filter(triple => !triple.inferred).map(triple => [triple.predicate, triple.object]))
			.toEqual([['requires', 'C.md'], ['enables', 'D.md']]);
		expect(triples.filter(triple => triple.inferred).map(triple => triple.object)).toEqual(['A.md', 'B.md']);
	});

	it('suppresses comments and escaped literals without suppressing an even-backslash link', async () => {
		const { app, files } = createMockApp({
			'Anchor.md': [
				'<!-- [[Hidden]]\n## Connections\nrequires:: [[Hidden]] -->',
				'\\[[Literal]] \\[literal](Literal.md) \\\\[[Actual]]',
				'## Connections', 'requires:: \\[[Literal]]',
				'<!-- unclosed [[Hidden]]',
			].join('\n'),
			'Actual.md': '', 'Hidden.md': '', 'Literal.md': '',
		});
		const triples = await new TripleExtractor(app.vault, app.metadataCache).extract(files.get('Anchor.md')! as TFile);
		expect(triples.map(triple => [triple.predicate, triple.object])).toEqual([['links_to', 'Actual.md']]);
	});

	it('resolves Markdown aliases, anchors and space URLs while excluding external destinations', async () => {
		const { app, files } = createMockApp({
			'concepts/Anchor.md': [
				'[alias](../books/Space%20Name.md#Summary)', '[same target](<../books/Space Name.md#Part>)',
				'[my heading](#Summary)', '[missing](Missing.md#Part)',
				'[web](https://example.com) [mail](mailto:test@example.com) [relative web](//example.com)',
				'## Connections', 'enables:: [label](../books/Space%20Name.md#Part)',
				'source:: [web](https://example.com)',
			].join('\n'),
			'books/Space Name.md': '',
		});
		const triples = await new TripleExtractor(app.vault, app.metadataCache)
			.extract(files.get('concepts/Anchor.md')! as TFile);
		expect(triples.map(triple => [triple.predicate, triple.object])).toEqual([
			['rdf:type', 'concept'], ['enables', 'books/Space Name.md'],
			['links_to', 'books/Space Name.md'], ['links_to', 'concepts/Anchor.md'], ['links_to', 'Missing.md#Part'],
		]);
		expect(triples.find(triple => triple.predicate === 'links_to')?.provenance.lineage)
			.toContain('inferred:note-link');
	});

	it('prefers current native cached link spans and ignores masked or stale cache entries', async () => {
		const content = '<!-- [[Hidden]] -->\n[reference][paper]\nrequires:: [[NotAField]]';
		const { app, files } = createMockApp({ 'Anchor.md': content, 'Native.md': '', 'Hidden.md': '' });
		const cacheLink = (original: string, link: string) => {
			const start = content.indexOf(original);
			return { original, link, position: { start: { offset: start }, end: { offset: start + original.length } } };
		};
		vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue({ links: [
			cacheLink('[[Hidden]]', 'Hidden'), cacheLink('[reference][paper]', 'Native'),
			{ original: '[[Stale]]', link: 'Stale', position: { start: { offset: 0 }, end: { offset: 9 } } },
		] });
		const triples = await new TripleExtractor(app.vault, app.metadataCache).extract(files.get('Anchor.md')! as TFile);
		expect(triples.map(triple => [triple.predicate, triple.object])).toEqual([['links_to', 'Native.md'], ['links_to', 'NotAField']]);
	});
	it('masks Obsidian comments while code delimiters cannot swallow real prose', async () => {
		for (const content of ['%%\n## Connections\nrequires:: [[Hidden]]\n%%\n[[Real]]', '```html\n<!--\n```\n[[Real]]', '`<!--` [[Real]]', '%% ` ``` \nrequires:: [[Hidden]]\n%%\n[[Real]]']) {
			const { app, files } = createMockApp({ 'Anchor.md': content, 'Real.md': '', 'Hidden.md': '' });
			const triples = await new TripleExtractor(app.vault, app.metadataCache).extract(files.get('Anchor.md')! as TFile);
			expect(triples.map(t => [t.predicate, t.object])).toEqual([['links_to', 'Real.md']]);
		}
	});
	it('retains valid source IDs beside escaped examples and handles incomplete native indexing', async () => {
		const { app, files } = createMockApp({ 'Anchor.md': '## Connections\nsource:: SRC-1, \\[[Hidden]]\n\n## Notes\n[[Real]]', 'Real.md': '' });
		vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue({ links: [] } as never);
		const triples = await new TripleExtractor(app.vault, app.metadataCache).extract(files.get('Anchor.md')! as TFile);
		expect(triples.map(t => [t.predicate, t.object])).toEqual([['source', 'SRC-1'], ['links_to', 'Real.md']]);
	});
	it('preserves balanced Markdown destinations with and without native spans', async () => {
		const content = '[read](Paper_(draft).md) [web](https://example.com/a(b))';
		for (const native of [false, true]) {
			const { app, files } = createMockApp({ 'Anchor.md': content, 'Paper_(draft).md': '' });
			if (native) vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue({ links: [{
				original: '[read](Paper_(draft).md)', link: 'Paper_(draft).md',
				position: { start: { offset: 0 }, end: { offset: '[read](Paper_(draft).md)'.length } },
			}] } as never);
			const triples = await new TripleExtractor(app.vault, app.metadataCache).extract(files.get('Anchor.md')! as TFile);
			expect(triples.map(t => t.object)).toEqual(['Paper_(draft).md']);
		}
	});

});
