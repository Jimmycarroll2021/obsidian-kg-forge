import { afterEach, describe, expect, it, vi } from 'vitest';
import { Plugin } from '../mocks/obsidian';
import { createMockApp } from '../helpers/vault';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { KnowledgeGraphView } from '../../src/ui/KnowledgeGraphView';

const views: KnowledgeGraphView[] = [];
const nodeIds = (v: KnowledgeGraphView) => Array.from(v.contentEl.querySelectorAll<HTMLElement>('.kg-map-node')).map(e => e.dataset.noteId);
async function setup(notes: Record<string, string>, links: Record<string, Record<string, number>> = {}) {
	const f = createMockApp(notes); f.app.metadataCache.resolvedLinks = links; f.setActiveFile('B.md');
	const plugin = Object.assign(new Plugin(f.app), { settings: structuredClone(DEFAULT_SETTINGS) });
	const v = new KnowledgeGraphView(f.leaf as never, plugin as never); views.push(v); await v.onOpen(); return { ...f, v };
}
afterEach(async () => { for (const v of views.splice(0)) { await v.onClose(); v.unload(); } vi.restoreAllMocks(); });

describe('indexed incoming graph', () => {
	it('reads only real referring notes and retains typed direction/source while excluding generated artifacts', async () => {
		const f = await setup({ 'B.md': '', 'A.md': '## Connections\nrequires:: [[B]]', 'Unrelated.md': '', 'Knowledge Forge/report.md': '## Connections\nrequires:: [[B]]' }, { 'A.md': { 'B.md': 1 }, 'Knowledge Forge/report.md': { 'B.md': 1 } });
		expect(nodeIds(f.v)).toEqual(['A.md']);
		f.v.contentEl.querySelector<HTMLButtonElement>('.kg-map-node')!.click();
		expect(f.v.contentEl.querySelector('.kg-map-evidence-fact')?.textContent).toBe('A → requires → active note');
		expect(f.v.contentEl.querySelector('.kg-map-evidence-source')?.textContent).toBe('Source: A.md');
		expect(f.app.vault.cachedRead.mock.calls.map((c: any[]) => c[0].path).sort()).toEqual(['A.md', 'B.md']);
	});
	it('refreshes removed and newly resolved referring links, not just active-note metadata', async () => {
		const f = await setup({ 'B.md': '', 'A.md': '## Connections\nrequires:: [[B]]', 'C.md': '## Connections\nenables:: [[B]]' }, { 'A.md': { 'B.md': 1 } });
		expect(nodeIds(f.v)).toEqual(['A.md']);
		f.contents.set('A.md', 'no relation'); f.app.metadataCache.resolvedLinks['A.md'] = {};
		f.app.metadataCache.trigger('resolve', f.files.get('A.md'));
		await vi.waitFor(() => expect(nodeIds(f.v)).toEqual([]));
		f.app.metadataCache.resolvedLinks['C.md'] = { 'B.md': 1 }; f.app.metadataCache.trigger('resolve', f.files.get('C.md'));
		await vi.waitFor(() => expect(nodeIds(f.v)).toEqual(['C.md']));
	});
	it('bounds initial incoming reads and loads another requested batch without rereading cached notes', async () => {
		const notes: Record<string, string> = { 'B.md': '' }; const links: Record<string, Record<string, number>> = {};
		for (let i = 0; i < 105; i++) { const p = `N${String(i).padStart(3, '0')}.md`; notes[p] = '## Connections\nrequires:: [[B]]'; links[p] = { 'B.md': 1 }; }
		const f = await setup(notes, links);
		expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(101);
		expect(f.v.contentEl.querySelector('.kg-workflow-status')?.textContent).toContain('100 of 105');
		const more = [...f.v.contentEl.querySelectorAll('button')].find(b => b.textContent === 'Load more incoming notes')!;
		expect(more.hidden).toBe(false); more.click();
		await vi.waitFor(() => expect(f.v.contentEl.querySelector('.kg-workflow-status')?.textContent).toContain('105 of 105'));
		expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(106); expect(more.hidden).toBe(true);
		expect(nodeIds(f.v)).toHaveLength(12);
	});
	it('keeps successful evidence with an honest partial-result message when one referring note fails', async () => {
		const f = createMockApp({ 'B.md': '', 'A.md': '## Connections\nrequires:: [[B]]', 'C.md': '## Connections\nrequires:: [[B]]' });
		f.app.metadataCache.resolvedLinks = { 'A.md': { 'B.md': 1 }, 'C.md': { 'B.md': 1 } }; f.setActiveFile('B.md');
		const original = f.app.vault.cachedRead.getMockImplementation()!;
		f.app.vault.cachedRead.mockImplementation(async (file: any) => { if (file.path === 'C.md') throw new Error('cannot read'); return original(file); });
		const plugin = Object.assign(new Plugin(f.app), { settings: structuredClone(DEFAULT_SETTINGS) });
		const v = new KnowledgeGraphView(f.leaf as never, plugin as never); views.push(v); await v.onOpen();
		expect(nodeIds(v)).toEqual(['A.md']); expect(v.contentEl.querySelector('.kg-workflow-status')?.textContent).toContain('1 could not be read; partial map');
		expect([...v.contentEl.querySelectorAll('button')].find(b => b.textContent === 'Load more incoming notes')?.hidden).toBe(true);
	});
});
