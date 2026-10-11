import { afterEach, describe, expect, it, vi } from 'vitest';
import { Plugin, TFile } from '../mocks/obsidian';
import { createMockApp } from '../helpers/vault';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { KnowledgeGraphView } from '../../src/ui/KnowledgeGraphView';

const views: KnowledgeGraphView[] = [];
function button(view: KnowledgeGraphView, label: string): HTMLButtonElement {
	const match = Array.from(view.contentEl.querySelectorAll<HTMLButtonElement>('button'))
		.find(item => item.textContent === label || item.getAttribute('aria-label') === label);
	if (!match) throw new Error(`Missing action ${label}`);
	return match;
}
function checkbox(view: KnowledgeGraphView, label: string): HTMLInputElement {
	return Array.from(view.contentEl.querySelectorAll('label')).find(item => item.textContent === label)!.querySelector('input')!;
}
function toggle(view: KnowledgeGraphView, label: string, value: boolean): void {
	const input = checkbox(view, label); input.checked = value; input.dispatchEvent(new Event('change'));
}
function search(view: KnowledgeGraphView, value: string): void {
	const input = view.contentEl.querySelector<HTMLInputElement>('input[type=search]')!;
	input.value = value; input.dispatchEvent(new Event('input'));
}
const focus = (view: KnowledgeGraphView) => view.contentEl.querySelector<HTMLElement>('.kg-map-anchor')?.dataset.noteId;
const ids = (view: KnowledgeGraphView) => Array.from(view.contentEl.querySelectorAll<HTMLElement>('.kg-map-node')).map(item => item.dataset.noteId);
const waitForFocus = (view: KnowledgeGraphView, path: string) => vi.waitFor(() => expect(focus(view)).toBe(path), { interval: 1 });
function moveFolder(f: Awaited<ReturnType<typeof setup>>, oldPath: string, newPath: string): void {
	const folder = f.folders.get(oldPath)!; f.folders.delete(oldPath); folder.path = newPath; f.folders.set(newPath, folder);
	for (const [path, file] of [...f.files]) {
		if (!path.startsWith(oldPath + '/')) continue;
		const content = f.contents.get(path)!; f.files.delete(path); f.contents.delete(path);
		file.path = newPath + path.slice(oldPath.length); f.files.set(file.path, file); f.contents.set(file.path, content);
	}
	f.app.vault.trigger('rename', folder, oldPath);
}
async function setup(notes: Record<string, string>, active = Object.keys(notes)[0]) {
	const fixture = createMockApp(notes); fixture.setActiveFile(active);
	const plugin = Object.assign(new Plugin(fixture.app), { settings: structuredClone(DEFAULT_SETTINGS) });
	const view = new KnowledgeGraphView(fixture.leaf as never, plugin as never); views.push(view);
	document.body.append(view.contentEl); await view.onOpen();
	return { ...fixture, view };
}
async function centre(view: KnowledgeGraphView, path: string): Promise<void> {
	button(view, `Inspect ${path}`).click(); button(view, 'Centre in graph').click(); await waitForFocus(view, path);
}
afterEach(async () => {
	for (const view of views.splice(0)) { await view.onClose(); view.unload(); view.contentEl.remove(); }
	vi.restoreAllMocks();
});

describe('Independent graph navigation', () => {
	it('retains a pinned descendant when only its parent folder emits a rename', async () => {
		const f = await setup({ 'Folder/A.md': '## Connections\nrequires:: [[B]]', 'Folder/B.md': '' });
		await centre(f.view, 'Folder/B.md'); moveFolder(f, 'Folder', 'Moved');
		await waitForFocus(f.view, 'Moved/B.md');
		f.app.vault.trigger('rename', f.files.get('Moved/B.md'), 'Folder/B.md');
		await waitForFocus(f.view, 'Moved/B.md');
		expect(f.app.workspace.openLinkText).not.toHaveBeenCalled();
	});
	it('remaps folder history and selection on a segment boundary, then prunes deleted descendants', async () => {
		const f = await setup({ 'Folder/A.md': '## Connections\nrequires:: [[B]]',
			'Folder/B.md': '## Connections\nrequires:: [[../Folderish/C]]', 'Folderish/C.md': '' });
		await centre(f.view, 'Folder/B.md'); await centre(f.view, 'Folderish/C.md'); moveFolder(f, 'Folder', 'Moved');
		await waitForFocus(f.view, 'Folderish/C.md');
		button(f.view, 'Graph back').click(); await waitForFocus(f.view, 'Moved/B.md');
		button(f.view, 'Graph back').click(); await waitForFocus(f.view, 'Moved/A.md');
		expect(button(f.view, 'Inspect Moved/B.md').getAttribute('aria-pressed')).toBe('true');
		button(f.view, 'Graph forward').click(); await waitForFocus(f.view, 'Moved/B.md');
		button(f.view, 'Graph forward').click(); await waitForFocus(f.view, 'Folderish/C.md');
		const folder = f.folders.get('Moved')!;
		for (const path of ['Moved/A.md', 'Moved/B.md']) { f.files.delete(path); f.contents.delete(path); }
		f.app.vault.trigger('delete', folder);
		expect(button(f.view, 'Graph back').disabled).toBe(true);
		expect(f.app.workspace.openLinkText).not.toHaveBeenCalled();
	});
	it('centres the canonical selected note without changing the editor, then restores filters and forward state', async () => {
		const f = await setup({ 'A.md': '## Connections\nrequires:: [[folder/B]]', 'folder/B.md': '## Connections\nenables:: [[C]]', 'other/B.md': '', 'C.md': '' });
		toggle(f.view, 'Show sources', true); toggle(f.view, 'Show inferred links', true);
		const predicate = f.view.contentEl.querySelector('select')!;
		predicate.value = 'requires'; predicate.dispatchEvent(new Event('change')); search(f.view, 'B');
		await centre(f.view, 'folder/B.md');
		expect(f.app.workspace.getActiveFile().path).toBe('A.md'); expect(f.app.workspace.openLinkText).not.toHaveBeenCalled();
		expect(checkbox(f.view, 'Follow active note').checked).toBe(false);
		expect(f.view.contentEl.querySelector('.kg-map-eyebrow')?.textContent).toBe('Graph centre');
		expect(f.view.contentEl.querySelector<HTMLInputElement>('input[type=search]')!.value).toBe('');
		search(f.view, 'C');
		button(f.view, 'Graph back').click(); await waitForFocus(f.view, 'A.md');
		expect(f.view.contentEl.querySelector<HTMLInputElement>('input[type=search]')!.value).toBe('B');
		expect(predicate.value).toBe('requires'); expect(ids(f.view)).toEqual(['folder/B.md']);
		expect(checkbox(f.view, 'Show sources').checked).toBe(true); expect(checkbox(f.view, 'Show inferred links').checked).toBe(true);
		expect(f.view.contentEl.querySelector('.kg-map-detail-path')?.textContent).toBe('folder/B.md');
		button(f.view, 'Graph forward').click(); await waitForFocus(f.view, 'folder/B.md');
		expect(f.view.contentEl.querySelector<HTMLInputElement>('input[type=search]')!.value).toBe('C');
		expect(f.app.workspace.getActiveFile().path).toBe('A.md');
	});

	it('restores neighbour page, selected identity and evidence page together', async () => {
		const notes: Record<string, string> = { 'A.md': '' };
		for (let i = 0; i < 25; i++) notes[`Neighbour-${String(i).padStart(2, '0')}.md`] = '';
		notes['A.md'] = '## Connections\n' + Object.keys(notes).slice(1).map(path => `requires:: [[${path}]]`).join('\n')
			+ '\n' + ['enables', 'up', 'down', 'same', 'next', 'prev', 'related_to', 'source'].map(field => `${field}:: [[Neighbour-12]]`).join('\n');
		notes['Neighbour-12.md'] = '## Connections\n' + ['requires', 'enables', 'up', 'down', 'same', 'next', 'prev', 'related_to', 'source']
			.map(field => `${field}:: [[A]]`).join('\n');
		const f = await setup(notes);
		f.app.metadataCache.resolvedLinks = { 'Neighbour-12.md': { 'A.md': 1 } };
		f.app.metadataCache.trigger('resolved');
		await vi.waitFor(() => expect(f.view.contentEl.querySelector('.kg-workflow-status')?.textContent).toContain('1 of 1'));
		toggle(f.view, 'Show sources', true);
		search(f.view, 'Neighbour'); button(f.view, 'Neighbour next page').click();
		button(f.view, 'Inspect Neighbour-12.md').click(); button(f.view, 'Evidence next page').click();
		expect(f.view.contentEl.querySelector('.kg-map-evidence-summary')?.textContent).toContain('evidence 2 / 3');
		button(f.view, 'Centre in graph').click(); await waitForFocus(f.view, 'Neighbour-12.md');
		button(f.view, 'Graph back').click(); await waitForFocus(f.view, 'A.md');
		expect(f.view.contentEl.querySelector('.kg-map-pager')?.textContent).toContain('Neighbours 2 / 3');
		expect(f.view.contentEl.querySelector('.kg-map-detail-path')?.textContent).toBe('Neighbour-12.md');
		expect(f.view.contentEl.querySelector('.kg-map-evidence-summary')?.textContent).toContain('evidence 2 / 3');
		expect(f.view.contentEl.querySelectorAll('.kg-map-evidence li')).toHaveLength(8);
	});

	it('retains keyboard focus on persistent navigation actions at history boundaries', async () => {
		const f = await setup({ 'A.md': '## Connections\nrequires:: [[B]]', 'B.md': '' });
		button(f.view, 'Inspect B.md').click(); const action = button(f.view, 'Centre in graph'); action.focus(); action.click();
		await waitForFocus(f.view, 'B.md'); expect(document.activeElement).toBe(button(f.view, 'Graph back'));
		button(f.view, 'Graph back').click(); await waitForFocus(f.view, 'A.md');
		expect(button(f.view, 'Graph back').disabled).toBe(true);
		expect(document.activeElement).toBe(button(f.view, 'Graph forward'));
		button(f.view, 'Graph forward').click(); await waitForFocus(f.view, 'B.md');
		expect(document.activeElement).toBe(button(f.view, 'Graph back'));
	});

	it('follows editor changes by default, pins exploration and explicitly resumes following', async () => {
		const f = await setup({ 'A.md': '## Connections\nrequires:: [[B]]', 'B.md': '## Connections\nenables:: [[C]]', 'C.md': '' });
		expect(checkbox(f.view, 'Follow active note').checked).toBe(true);
		f.setActiveFile('B.md'); await waitForFocus(f.view, 'B.md');
		await centre(f.view, 'C.md'); f.setActiveFile('A.md');
		expect(focus(f.view)).toBe('C.md');
		toggle(f.view, 'Follow active note', true); await waitForFocus(f.view, 'A.md');
		expect(button(f.view, 'Graph back').disabled).toBe(true); expect(button(f.view, 'Graph forward').disabled).toBe(true);
	});

	it('does not centre or open unresolved targets and excludes generated notes from navigation', async () => {
		const f = await setup({ 'A.md': '## Connections\nrequires:: [[Missing]], [[Knowledge Forge/report]]', 'Knowledge Forge/report.md': '' });
		button(f.view, 'Inspect Missing').click();
		expect(button(f.view, 'Centre in graph').disabled).toBe(true); expect(button(f.view, 'Open note').disabled).toBe(true);
		button(f.view, 'Centre in graph').click(); expect(focus(f.view)).toBe('A.md');
		button(f.view, 'Inspect Knowledge Forge/report.md').click();
		expect(button(f.view, 'Centre in graph').disabled).toBe(true); expect(button(f.view, 'Open note').disabled).toBe(true);
		expect(f.app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it('discards a delayed navigation result after back without following unrelated editor changes', async () => {
		const f = await setup({ 'A.md': '## Connections\nrequires:: [[B]]', 'B.md': '## Connections\nenables:: [[C]]', 'C.md': '' });
		const original = f.app.vault.cachedRead.getMockImplementation()!;
		let release!: (content: string) => void;
		f.app.vault.cachedRead.mockImplementation((file: TFile) => file.path === 'B.md'
			? new Promise<string>(resolve => { release = resolve; }) : original(file));
		button(f.view, 'Inspect B.md').click(); button(f.view, 'Centre in graph').click();
		await vi.waitFor(() => expect(release).toBeTypeOf('function'), { interval: 1 });
		f.setActiveFile('C.md'); button(f.view, 'Graph back').click(); await waitForFocus(f.view, 'A.md');
		release('## Connections\nenables:: [[C]]'); await new Promise(resolve => window.setTimeout(resolve, 10));
		expect(focus(f.view)).toBe('A.md'); expect(ids(f.view)).toEqual(['B.md']);
		expect(f.app.workspace.getActiveFile().path).toBe('C.md');
	});

	it('cancels a pinned read when following resumes and ignores its completion after the view closes', async () => {
		const f = await setup({ 'A.md': '## Connections\nrequires:: [[B]]', 'B.md': '## Connections\nenables:: [[C]]', 'C.md': '' });
		const original = f.app.vault.cachedRead.getMockImplementation()!;
		const releases: Array<(content: string) => void> = [];
		f.app.vault.cachedRead.mockImplementation((file: TFile) => file.path === 'B.md'
			? new Promise<string>(resolve => releases.push(resolve)) : original(file));
		button(f.view, 'Inspect B.md').click(); button(f.view, 'Centre in graph').click();
		await vi.waitFor(() => expect(releases).toHaveLength(1), { interval: 1 });
		f.setActiveFile('C.md'); toggle(f.view, 'Follow active note', true); await waitForFocus(f.view, 'C.md');
		releases[0]('## Connections\nenables:: [[C]]'); await new Promise(resolve => window.setTimeout(resolve, 10));
		expect(focus(f.view)).toBe('C.md'); expect(checkbox(f.view, 'Follow active note').checked).toBe(true);
		f.setActiveFile('B.md'); await vi.waitFor(() => expect(releases).toHaveLength(2), { interval: 1 });
		await f.view.onClose(); releases[1]('## Connections\nenables:: [[C]]');
		await new Promise(resolve => window.setTimeout(resolve, 10));
		expect(focus(f.view)).toBeUndefined(); expect(ids(f.view)).toEqual([]);
	});

	it('refreshes metadata relevant to the pinned centre and ignores the editor’s unrelated metadata', async () => {
		const f = await setup({ 'A.md': '## Connections\nrequires:: [[B]]', 'B.md': '## Connections\nenables:: [[C]]', 'C.md': '', 'D.md': '' });
		await centre(f.view, 'B.md'); f.setActiveFile('D.md'); f.app.vault.cachedRead.mockClear();
		f.app.metadataCache.trigger('changed', f.files.get('D.md'));
		await new Promise(resolve => window.setTimeout(resolve, 60));
		expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
		f.contents.set('B.md', '## Connections\nenables:: [[D]]'); f.app.metadataCache.trigger('changed', f.files.get('B.md'));
		await vi.waitFor(() => expect(ids(f.view)).toEqual(['D.md'])); expect(focus(f.view)).toBe('B.md');
	});

	it('updates canonical history identities on rename and safely clears a deleted centre', async () => {
		const f = await setup({ 'A.md': '## Connections\nrequires:: [[B]]', 'B.md': '' });
		await centre(f.view, 'B.md');
		const a = f.files.get('A.md')!; a.path = 'Renamed.md'; f.files.delete('A.md'); f.files.set(a.path, a);
		f.contents.set(a.path, '## Connections\nrequires:: [[B]]'); f.app.vault.trigger('rename', a, 'A.md');
		button(f.view, 'Graph back').click(); await waitForFocus(f.view, 'Renamed.md');
		await centre(f.view, 'B.md'); const b = f.files.get('B.md')!; b.path = 'Moved.md';
		f.files.delete('B.md'); f.files.set(b.path, b); f.contents.set(b.path, ''); f.app.vault.trigger('rename', b, 'B.md');
		await waitForFocus(f.view, 'Moved.md');
		f.files.delete('Moved.md'); f.contents.delete('Moved.md'); f.app.vault.trigger('delete', b);
		await vi.waitFor(() => expect(focus(f.view)).toBeUndefined());
		expect(f.view.contentEl.querySelector('.kg-workflow-status')?.textContent).toContain('no longer an available source note');
		button(f.view, 'Graph back').click(); await waitForFocus(f.view, 'Renamed.md');
		expect(f.app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it('bounds history at fifty locations and drops a forward branch when exploring elsewhere', async () => {
		const notes: Record<string, string> = {};
		for (let i = 0; i < 56; i++) notes[`N${i}.md`] = i < 55 ? `## Connections\nrequires:: [[N${i + 1}]]` : '';
		const f = await setup(notes);
		for (let i = 1; i <= 55; i++) await centre(f.view, `N${i}.md`);
		for (let i = 54; i >= 5; i--) { button(f.view, 'Graph back').click(); await waitForFocus(f.view, `N${i}.md`); }
		expect(button(f.view, 'Graph back').disabled).toBe(true); expect(button(f.view, 'Graph forward').disabled).toBe(false);
		await centre(f.view, 'N6.md'); expect(button(f.view, 'Graph forward').disabled).toBe(true);
		expect(f.app.workspace.getActiveFile().path).toBe('N0.md');
	});
});
