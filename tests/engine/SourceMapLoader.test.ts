import { describe, expect, it, vi } from 'vitest';
import { createMockApp } from '../helpers/vault';
import { SourceMapLoader } from '../../src/engine/SourceMapLoader';
import { parseSourceMap } from '../../src/models/SourceId';

describe('source maps', () => {
	it('preserves empty columns and wikilink aliases, and admits only valid IDs', () => {
		const map = parseSourceMap([
			'| Source ID | Type | Target File | Wikilink |', '| --- | --- | --- | --- |',
			'| SRC-1 | | papers/A.md | [[papers/A#Part|A label]] |',
			'| SRC-2 | paper | papers/B.md | |',
			'| SRC-3 | | | [[C\\|escaped alias]] |',
			'| invalid | paper | papers/Wrong.md | |',
			'| SRC-empty | | | |',
		].join('\n'), 'sources/index.md');
		expect(map.entries()).toEqual([['SRC-1', 'papers/A#Part'], ['SRC-2', 'papers/B.md'], ['SRC-3', 'C']]);
		expect(map.sourcePath).toBe('sources/index.md');
	});

	it('allows an absent source index for first-use extraction', async () => {
		const { app } = createMockApp({ 'A.md': { content: '' } });
		expect((await SourceMapLoader.load(app.vault, 'papers/index.md')).entries()).toEqual([]);
	});

	it('surfaces real read failures instead of silently replacing them with an empty map', async () => {
		const { app } = createMockApp({ 'papers/index.md': { content: '' } });
		vi.spyOn(app.vault, 'cachedRead').mockRejectedValue(new Error('read denied'));
		await expect(SourceMapLoader.load(app.vault, 'papers/index.md')).rejects.toThrow('read denied');
	});
});
