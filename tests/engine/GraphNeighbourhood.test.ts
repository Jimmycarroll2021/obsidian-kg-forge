import { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { createMockApp } from '../helpers/vault';
import { GraphNeighbourhood } from '../../src/engine/GraphNeighbourhood';
import { DEFAULT_SETTINGS } from '../../src/settings';

function fixture(notes: Record<string, string>, links: Record<string, Record<string, number>> = {}) {
	const vault = createMockApp(notes);
	vault.app.metadataCache.resolvedLinks = links;
	const settings = structuredClone(DEFAULT_SETTINGS);
	const loader = new GraphNeighbourhood(vault.app, settings);
	return { ...vault, settings, loader };
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

describe('indexed graph neighbourhood', () => {
	it('extracts only actual indexed referring notes and keeps their original typed provenance', async () => {
		const f = fixture({
			'Anchor.md': '## Connections\nenables:: [[Outgoing]]',
			'A.md': '## Connections\nrequires:: [[Anchor]]\nrelated_to:: [[Unrelated]]',
			'B.md': '## Connections\nenables:: [[Anchor#Part|alias]]',
			'Outgoing.md': '', 'Unrelated.md': '', 'Zero.md': '', 'Negative.md': '', 'Infinite.md': '',
			'Knowledge Forge/report.md': '## Connections\nrequires:: [[Anchor]]',
		}, {
			'A.md': { 'Anchor.md': 1 }, 'B.md': { 'Anchor.md': 2 }, 'Anchor.md': { 'Anchor.md': 1 },
			'Knowledge Forge/report.md': { 'Anchor.md': 1 }, 'Missing.md': { 'Anchor.md': 1 },
			'Zero.md': { 'Anchor.md': 0 }, 'Negative.md': { 'Anchor.md': -1 }, 'Infinite.md': { 'Anchor.md': Infinity },
		});
		const result = await f.loader.load(f.files.get('Anchor.md')! as TFile);
		expect(result.incomingPaths).toEqual(['A.md', 'B.md']);
		expect(result.incomingCandidates).toBe(2);
		expect(result.incomingRead).toBe(2);
		expect(result.triples.map(triple => [triple.subject, triple.predicate, triple.object])).toEqual([
			['Anchor.md', 'enables', 'Outgoing.md'], ['A.md', 'requires', 'Anchor.md'], ['B.md', 'enables', 'Anchor.md'],
		]);
		expect(result.triples[1].provenance.source).toBe('A.md');
		expect(f.app.vault.cachedRead.mock.calls.map(([file]: [TFile]) => file.path)).toEqual(['Anchor.md', 'A.md', 'B.md']);
		expect(result.knownNotePaths).not.toContain('Knowledge Forge/report.md');
	});

	it('caps default incoming reads honestly and loads only additional uncached notes when the cap grows', async () => {
		const notes: Record<string, string> = { 'Anchor.md': '' };
		const links: Record<string, Record<string, number>> = {};
		for (let index = 0; index < 105; index++) {
			const path = `N${String(index).padStart(3, '0')}.md`;
			notes[path] = '## Connections\nrequires:: [[Anchor]]'; links[path] = { 'Anchor.md': 1 };
		}
		const f = fixture(notes, links);
		const initial = await f.loader.load(f.files.get('Anchor.md')! as TFile);
		expect(initial.incomingCandidates).toBe(105); expect(initial.incomingPaths).toHaveLength(105);
		expect(initial.incomingRead).toBe(100); expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(101);
		f.app.vault.cachedRead.mockClear();
		const more = await f.loader.load(f.files.get('Anchor.md')! as TFile, { incomingLimit: 103 });
		expect(more.incomingRead).toBe(103); expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(3);
	});

	it('uses at most four concurrent incoming reads', async () => {
		const notes: Record<string, string> = { 'Anchor.md': '' };
		const links: Record<string, Record<string, number>> = {};
		for (let index = 0; index < 9; index++) { notes[`N${index}.md`] = '[[Anchor]]'; links[`N${index}.md`] = { 'Anchor.md': 1 }; }
		const f = fixture(notes, links); const gate = deferred<void>();
		let active = 0, peak = 0;
		f.app.vault.cachedRead.mockImplementation(async (file: TFile) => {
			if (file.path === 'Anchor.md') return '';
			active++; peak = Math.max(peak, active); await gate.promise; active--;
			return f.contents.get(file.path)!;
		});
		const pending = f.loader.load(f.files.get('Anchor.md')! as TFile);
		await vi.waitFor(() => expect(active).toBe(4)); gate.resolve();
		expect((await pending).incomingRead).toBe(9); expect(peak).toBe(4);
	});

	it('preserves outgoing evidence after an incoming read failure and retries failures without caching them', async () => {
		const f = fixture({ 'Anchor.md': '[[Outgoing]]', 'Outgoing.md': '', 'A.md': '[[Anchor]]', 'B.md': '[[Anchor]]' },
			{ 'A.md': { 'Anchor.md': 1 }, 'B.md': { 'Anchor.md': 1 } });
		let fail = true;
		f.app.vault.cachedRead.mockImplementation(async (file: TFile) => {
			if (file.path === 'B.md' && fail) throw new Error('unreadable');
			return f.contents.get(file.path)!;
		});
		const result = await f.loader.load(f.files.get('Anchor.md')! as TFile);
		expect(result.incomingRead).toBe(1); expect(result.failedPaths).toEqual(['B.md']);
		expect(result.triples.map(triple => triple.subject)).toEqual(['Anchor.md', 'A.md']);
		fail = false; f.app.vault.cachedRead.mockClear();
		expect((await f.loader.load(f.files.get('Anchor.md')! as TFile)).incomingRead).toBe(2);
		expect(f.app.vault.cachedRead.mock.calls.map(([file]: [TFile]) => file.path)).toEqual(['B.md']);
	});

	it('reuses immutable extraction results and reloads a note whose mtime or size changes', async () => {
		const f = fixture({ 'Anchor.md': '[[A]]', 'A.md': '', 'B.md': '' });
		const anchor = f.files.get('Anchor.md')! as TFile;
		const initial = await f.loader.load(anchor); initial.triples[0].object = 'Mutated.md';
		initial.triples[0].provenance.lineage.push('caller mutation'); f.app.vault.cachedRead.mockClear();
		const cached = await f.loader.load(anchor);
		expect(cached.triples[0].object).toBe('A.md');
		expect(cached.triples[0].provenance.lineage).not.toContain('caller mutation');
		expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
		f.contents.set('Anchor.md', '[[B]]'); anchor.stat.size++;
		expect((await f.loader.load(anchor)).triples[0].object).toBe('B.md');
		f.contents.set('Anchor.md', '[[A]]'); anchor.stat.mtime++;
		expect((await f.loader.load(anchor)).triples[0].object).toBe('A.md');
		expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(2);
	});

	it('reuses the source index and changes extraction context when the index or mappings change', async () => {
		const table = (target: string) => `| Source ID | Wikilink |\n| --- | --- |\n| SRC-1 | [[../${target}]] |`;
		const f = fixture({ 'concepts/Anchor.md': '---\nsource_ids: [SRC-1]\n---', 'A.md': '', 'B.md': '', 'papers/index.md': table('A') });
		const anchor = f.files.get('concepts/Anchor.md')! as TFile;
		expect((await f.loader.load(anchor)).triples.find(triple => triple.predicate === 'source')?.object).toBe('A.md');
		f.app.vault.cachedRead.mockClear(); await f.loader.load(anchor);
		expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
		f.contents.set('papers/index.md', table('B')); f.files.get('papers/index.md')!.stat.mtime++;
		expect((await f.loader.load(anchor)).triples.find(triple => triple.predicate === 'source')?.object).toBe('B.md');
		f.settings.fileClassMappings.concepts = 'algorithm';
		expect((await f.loader.load(anchor)).triples.find(triple => triple.predicate === 'rdf:type')?.object).toBe('algorithm');
	});

	it('does not publish a stale incoming completion into the cache after invalidation', async () => {
		const f = fixture({ 'Anchor.md': '', 'A.md': '[[Anchor]]' }, { 'A.md': { 'Anchor.md': 1 } });
		const gate = deferred<string>(); let defer = true;
		f.app.vault.cachedRead.mockImplementation(async (file: TFile) => file.path === 'A.md' && defer
			? gate.promise : f.contents.get(file.path)!);
		const pending = f.loader.load(f.files.get('Anchor.md')! as TFile);
		await vi.waitFor(() => expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(2));
		f.loader.invalidate('A.md'); f.contents.set('A.md', 'No relationship'); defer = false; gate.resolve('[[Anchor]]');
		const cancelled = await pending; expect(cancelled.cancelled).toBe(true); expect(cancelled.triples).toEqual([]);
		f.app.vault.cachedRead.mockClear();
		expect((await f.loader.load(f.files.get('Anchor.md')! as TFile)).triples).toEqual([]);
		expect(f.app.vault.cachedRead.mock.calls.map(([file]: [TFile]) => file.path)).toEqual(['A.md']);
	});

	it('cancels changed file snapshots and honours isCurrent before any reads', async () => {
		const f = fixture({ 'Anchor.md': '[[A]]', 'A.md': '' }); const anchor = f.files.get('Anchor.md')! as TFile;
		expect((await f.loader.load(anchor, { isCurrent: () => false })).cancelled).toBe(true);
		expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
		const gate = deferred<string>(); f.app.vault.cachedRead.mockReturnValueOnce(gate.promise);
		const pending = f.loader.load(anchor); await vi.waitFor(() => expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(1));
		anchor.stat.mtime++; gate.resolve('[[A]]');
		expect((await pending).cancelled).toBe(true);
		f.app.vault.cachedRead.mockClear();
		await f.loader.load(anchor); expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(1);
	});

	it('does not cache a source index that completes after full invalidation', async () => {
		const f = fixture({ 'Anchor.md': '', 'papers/index.md': '' }); const gate = deferred<string>();
		f.app.vault.cachedRead.mockReturnValueOnce(gate.promise);
		const pending = f.loader.load(f.files.get('Anchor.md')! as TFile);
		await vi.waitFor(() => expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(1));
		f.loader.invalidate('papers/index.md'); gate.resolve(''); expect((await pending).cancelled).toBe(true);
		f.app.vault.cachedRead.mockClear(); await f.loader.load(f.files.get('Anchor.md')! as TFile);
		expect(f.app.vault.cachedRead.mock.calls.map(([file]: [TFile]) => file.path)).toEqual(['papers/index.md', 'Anchor.md']);
	});

	it('bounds cached paths and evicts older extraction results', async () => {
		const notes = Object.fromEntries(Array.from({ length: 270 }, (_, index) => [`N${index}.md`, '']));
		const f = fixture(notes);
		for (const file of f.files.values()) await f.loader.load(file as TFile, { incomingLimit: 0 });
		f.app.vault.cachedRead.mockClear(); await f.loader.load(f.files.get('N269.md')! as TFile);
		expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
		await f.loader.load(f.files.get('N0.md')! as TFile); expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(1);
	});
});
