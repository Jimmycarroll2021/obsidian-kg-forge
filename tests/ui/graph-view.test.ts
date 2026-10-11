import { afterEach, describe, expect, it, vi } from 'vitest';
import { Plugin } from '../mocks/obsidian';
import { createMockApp } from '../helpers/vault';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { PluginWithSettings } from '../../src/ui/types';
import { KnowledgeGraphView } from '../../src/ui/KnowledgeGraphView';
import { FocusedGraph } from '../../src/ui/components/FocusedGraph';
import { TripleExtractor } from '../../src/engine/TripleExtractor';
import { Triple } from '../../src/models/Triple';
import { createProvenance } from '../../src/models/Provenance';

const anchor = 'concepts/Anchor.md';
function fact(target: string, predicate = 'related_to', inferred = false, subject = anchor) {
	return new Triple(subject, predicate, target, createProvenance(subject, {
		confidence: inferred ? 0.6 : 0.95,
		lineage: [subject, inferred ? 'inferred:wikilink' : `connection:${predicate}`],
	}), inferred);
}
function button(container: HTMLElement, label: string): HTMLButtonElement {
	const match = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(element => element.textContent === label);
	if (!match) throw new Error(`Missing button: ${label}`); return match;
}
function toggle(view: KnowledgeGraphView, label: string) {
	const row = Array.from(view.contentEl.querySelectorAll('label')).find(item => item.textContent === label)!;
	const input = row.querySelector('input')!; input.checked = !input.checked; input.dispatchEvent(new Event('change'));
}
function nodeIds(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll<HTMLElement>('.kg-map-node')).map(node => node.dataset.noteId!);
}
async function setupView(triples: Triple[]) {
	const paths = [anchor, ...triples.map(triple => triple.object).filter(path => path.endsWith('.md'))];
	const fixture = createMockApp(Object.fromEntries(paths.map(path => [path, ''])));
	const instance = Object.assign(new Plugin(fixture.app), { settings: structuredClone(DEFAULT_SETTINGS), saveSettings: vi.fn(async () => {}) });
	const extract = vi.spyOn(TripleExtractor.prototype, 'extract').mockResolvedValue(triples);
	const view = new KnowledgeGraphView(fixture.leaf as never, instance as unknown as PluginWithSettings);
	await view.onOpen(); return { ...fixture, view, extract };
}
function setupMap(triples: Triple[], known: string[] = triples.map(triple => triple.object)) {
	const container = document.createElement('div'); const open = vi.fn();
	const map = new FocusedGraph(container, { canOpenNote: id => known.includes(id), onOpenNote: open });
	map.setGraph(anchor, triples, [anchor, ...known], {});
	return { container, map, open };
}

afterEach(() => vi.restoreAllMocks());

describe('Focused relationship map', () => {
	it('defaults to grouped explicit relationships and keeps metadata out of the map', () => {
		const triples = [fact('concept', 'rdf:type'), fact('concepts/Neighbour.md', 'requires'),
			fact('concepts/Neighbour.md', 'enables'), fact('papers/Source.md', 'source'),
			fact('concepts/Inferred.md', 'links_to', true), fact(anchor)];
		const { container } = setupMap(triples);
		expect(nodeIds(container)).toEqual(['concepts/Neighbour.md']);
		expect(container.querySelector('.kg-map-type')?.textContent).toBe('concept');
		expect(container.querySelector('.kg-map-summary')?.textContent).toContain('1 class facts');
		expect(container.querySelector('.kg-map-summary')?.textContent).toContain('1 source facts');
		expect(container.querySelector('.kg-map-summary')?.textContent).toContain('1 inferred links');
		expect(container.querySelector('.kg-map-summary')?.textContent).toContain('1 self-links');
		expect(container.textContent).not.toContain('Confidence');
		expect(container.textContent).not.toContain('Source:');
		expect(container.querySelectorAll('.kg-map-relation')).toHaveLength(2);
	});

	it('renders at most twelve neighbours and provides honest bounded paging for a highly connected note', () => {
		const triples = Array.from({ length: 137 }, (_, index) => fact(`concepts/Neighbour-${String(index).padStart(3, '0')}.md`));
		const { container } = setupMap(triples);
		expect(container.querySelectorAll('.kg-map-node')).toHaveLength(12);
		expect(container.querySelector('.kg-map-summary')?.textContent).toContain('12 of 137 matching neighbours');
		expect(container.querySelector('.kg-map-summary')?.textContent).toContain('125 on other pages');
		const firstPage = nodeIds(container);
		button(container.querySelector('.kg-map-pager')!, 'Next').click();
		expect(container.querySelectorAll('.kg-map-node')).toHaveLength(12);
		expect(nodeIds(container)).not.toEqual(firstPage);
		expect(container.querySelector('.kg-map-pager')?.textContent).toContain('Neighbours 2 / 12');
		button(container.querySelector('.kg-map-pager')!, 'Previous').click();
		expect(nodeIds(container)).toEqual(firstPage);
	});

	it('uses compact labels with folder context when basenames collide, while preserving exact IDs', () => {
		const { container } = setupMap([fact('algorithms/Same.md'), fact('concepts/Same.md'), fact('concepts/Distinct.md')]);
		const sameNodes = Array.from(container.querySelectorAll<HTMLElement>('.kg-map-node')).filter(node => node.querySelector('.kg-map-node-name')?.textContent === 'Same');
		expect(sameNodes).toHaveLength(2);
		expect(sameNodes.map(node => node.querySelector('.kg-map-node-context')?.textContent).sort()).toEqual(['algorithms', 'concepts']);
		expect(sameNodes.map(node => node.dataset.noteId).sort()).toEqual(['algorithms/Same.md', 'concepts/Same.md']);
		expect(container.querySelector('[data-note-id="concepts/Distinct.md"] .kg-map-node-context')).toBeNull();
	});

	it('retains neighbour pager focus on the equivalent enabled action and reverses at boundaries', () => {
		const { container } = setupMap(Array.from({ length: 25 }, (_, index) => fact(`concepts/Neighbour-${index}.md`)));
		document.body.append(container);
		const pageButton = (label: string) => button(container.querySelector('.kg-map-pager')!, label);
		const activate = (label: string) => { const control = pageButton(label); control.focus(); control.click(); };
		activate('Next');
		expect(document.activeElement).toBe(pageButton('Next'));
		expect(container.querySelector('.kg-map-pager')?.textContent).toContain('Neighbours 2 / 3');
		activate('Next');
		expect(pageButton('Next').disabled).toBe(true);
		expect(document.activeElement).toBe(pageButton('Previous'));
		activate('Previous');
		expect(document.activeElement).toBe(pageButton('Previous'));
		activate('Previous');
		expect(pageButton('Previous').disabled).toBe(true);
		expect(document.activeElement).toBe(pageButton('Next'));
	});

	it('retains evidence pager focus and the selected note across forward and reverse paging', () => {
		const { container } = setupMap(Array.from({ length: 17 }, (_, index) => fact('concepts/Neighbour.md', `custom_${index}`)));
		document.body.append(container);
		container.querySelector<HTMLButtonElement>('.kg-map-node')!.click();
		const pageButton = (label: string) => button(container.querySelector('.kg-map-evidence-pager')!, label);
		const activate = (label: string) => { const control = pageButton(label); control.focus(); control.click(); };
		activate('Next');
		expect(document.activeElement).toBe(pageButton('Next'));
		expect(container.querySelector('.kg-map-detail-path')?.textContent).toBe('concepts/Neighbour.md');
		expect(container.querySelector('.kg-map-node')?.getAttribute('aria-pressed')).toBe('true');
		activate('Next');
		expect(document.activeElement).toBe(pageButton('Previous'));
		expect(container.querySelectorAll('.kg-map-evidence li')).toHaveLength(1);
		activate('Previous');
		expect(document.activeElement).toBe(pageButton('Previous'));
		activate('Previous');
		expect(document.activeElement).toBe(pageButton('Next'));
		expect(container.querySelector('.kg-map-detail-path')?.textContent).toBe('concepts/Neighbour.md');
		expect(container.querySelectorAll('.kg-map-evidence li')).toHaveLength(8);
	});

	it('shows selected evidence only, with bounded details and an explicit open action', () => {
		const triples = Array.from({ length: 25 }, (_, index) => fact('concepts/Neighbour.md', `custom_${index}`));
		const { container, open } = setupMap(triples);
		const node = container.querySelector<HTMLButtonElement>('.kg-map-node')!;
		expect(node.tagName).toBe('BUTTON'); expect(node.tabIndex).toBe(0);
		expect(node.getAttribute('aria-label')).toBe('Inspect concepts/Neighbour.md');
		expect(container.querySelector('.kg-map-evidence')).toBeNull();
		node.click();
		expect(open).not.toHaveBeenCalled();
		expect(container.querySelector('.kg-map-node')?.getAttribute('aria-pressed')).toBe('true');
		expect(container.querySelector('.kg-map-detail-path')?.textContent).toBe('concepts/Neighbour.md');
		expect(container.querySelectorAll('.kg-map-evidence li')).toHaveLength(8);
		expect(container.textContent).toContain('Source: concepts/Anchor.md');
		expect(container.textContent).toContain('Confidence 95%');
		expect(container.textContent).toContain('Derivation: concepts/Anchor.md → connection:');
		button(container.querySelector('.kg-map-evidence-pager')!, 'Next').click();
		expect(container.querySelectorAll('.kg-map-evidence li')).toHaveLength(8);
		expect(container.querySelector('.kg-map-evidence-pager')?.textContent).toContain('Evidence 2 / 4');
		button(container, 'Open note').click(); expect(open).toHaveBeenCalledWith('concepts/Neighbour.md');
	});

	it('keeps unresolved targets inspectable without pretending an open action exists', () => {
		const { container, open } = setupMap([fact('SRC-017', 'source')], []);
		const map = new FocusedGraph(container, { canOpenNote: () => false, onOpenNote: open });
		map.setGraph(anchor, [fact('SRC-017', 'source')], [anchor], { showSources: true });
		container.querySelector<HTMLButtonElement>('.kg-map-node')!.click();
		expect(container.textContent).toContain('Unresolved');
		expect(button(container, 'Open note').disabled).toBe(true);
		expect(container.textContent).toContain('no matching note');
	});

	it('preserves incoming and outgoing directional cues without a force layout', () => {
		const { container } = setupMap([fact('concepts/Outgoing.md', 'enables'), fact(anchor, 'requires', false, 'concepts/Incoming.md')], ['concepts/Incoming.md', 'concepts/Outgoing.md']);
		expect(container.querySelector('.kg-focused-map')).not.toBeNull();
		const labels = Array.from(container.querySelectorAll('.kg-map-relation')).map(element => element.textContent);
		expect(labels).toContain('← requires'); expect(labels).toContain('→ enables');
	});
});

describe('Graph view display controls', () => {
	it('reveals source and inferred notes only on request and opens the selected exact note', async () => {
		const fixture = await setupView([fact('concepts/Explicit.md'), fact('papers/Source.md', 'source'), fact('concepts/Inferred.md', 'links_to', true)]);
		expect(nodeIds(fixture.view.contentEl)).toEqual(['concepts/Explicit.md']);
		toggle(fixture.view, 'Show sources');
		expect(nodeIds(fixture.view.contentEl)).toEqual(['concepts/Explicit.md', 'papers/Source.md']);
		toggle(fixture.view, 'Show inferred links');
		expect(nodeIds(fixture.view.contentEl)).toEqual(['concepts/Explicit.md', 'papers/Source.md', 'concepts/Inferred.md']);
		fixture.view.contentEl.querySelector<HTMLButtonElement>('[data-note-id="papers/Source.md"]')!.click();
		button(fixture.view.contentEl, 'Open note').click();
		await vi.waitFor(() => expect(fixture.app.workspace.openLinkText).toHaveBeenCalledWith('papers/Source.md', anchor, false));
		expect(fixture.extract).toHaveBeenCalledTimes(1);
	});

	it('filters by meaningful predicate or search and clears selected evidence when inputs change', async () => {
		const { view } = await setupView([fact('concepts/Alpha.md', 'requires'), fact('concepts/Beta.md', 'enables'), fact('concepts/Beta.md', 'related_to')]);
		view.contentEl.querySelector<HTMLButtonElement>('.kg-map-node')!.click();
		expect(view.contentEl.querySelector('.kg-map-evidence')).not.toBeNull();
		const select = view.contentEl.querySelector('select')!; select.value = 'enables'; select.dispatchEvent(new Event('change'));
		expect(nodeIds(view.contentEl)).toEqual(['concepts/Beta.md']);
		expect(view.contentEl.querySelector('.kg-map-summary')?.textContent).toContain('1 filtered out');
		expect(view.contentEl.querySelector('.kg-map-evidence')).toBeNull();
		const search = view.contentEl.querySelector<HTMLInputElement>('input[type=search]')!;
		search.value = 'Alpha'; search.dispatchEvent(new Event('input'));
		expect(nodeIds(view.contentEl)).toEqual([]);
		expect(view.contentEl.textContent).toContain('No neighbours match this view');
		select.value = ''; select.dispatchEvent(new Event('change'));
		expect(nodeIds(view.contentEl)).toEqual(['concepts/Alpha.md']);
	});

	it('does not leave old nodes or selected evidence after the active note disappears or fails', async () => {
		const fixture = await setupView([fact('concepts/Target.md')]);
		fixture.view.contentEl.querySelector<HTMLButtonElement>('.kg-map-node')!.click();
		fixture.setActiveFile(null);
		expect(nodeIds(fixture.view.contentEl)).toEqual([]);
		expect(fixture.view.contentEl.querySelector('.kg-map-evidence')).toBeNull();
		fixture.extract.mockRejectedValueOnce(new Error('cannot read note'));
		fixture.files.get(anchor)!.stat.mtime++;
		fixture.setActiveFile(anchor);
		await vi.waitFor(() => expect(fixture.view.contentEl.textContent).toContain('cannot read note'));
		expect(nodeIds(fixture.view.contentEl)).toEqual([]);
		expect(fixture.view.contentEl.querySelector('.kg-focused-map')).toBeNull();
	});
});
