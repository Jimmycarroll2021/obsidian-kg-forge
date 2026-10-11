import { describe, expect, it, vi, afterEach } from 'vitest';
import { Modal, FuzzySuggestModal, Notice, Plugin, TFile } from '../mocks/obsidian';
import { createMockApp } from '../helpers/vault';
import { DEFAULT_SETTINGS, type ForgeSettings } from '../../src/settings';
import type { PluginWithSettings } from '../../src/ui/types';
import { registerBuildGraphRAGPromptCommand } from '../../src/commands/buildGraphRAGPrompt';
import { GraphRAGPanel } from '../../src/ui/GraphRAGPanel';
import { GraphRAGBuilder, type GraphRAGPrompt } from '../../src/engine/GraphRAGBuilder';
import { TripleExtractor } from '../../src/engine/TripleExtractor';
import { KnowledgeGraphView } from '../../src/ui/KnowledgeGraphView';
import { CompetencyQuestionView } from '../../src/ui/CompetencyQuestionView';
import { TripleList } from '../../src/ui/components/TripleList';
import { Triple } from '../../src/models/Triple';
import { createProvenance } from '../../src/models/Provenance';

const notes = {
	'concepts/Anchor.md': '---\nfileClass: concept\n---\n## Connections\nrelated_to:: [[concepts/Neighbour]]',
	'concepts/Neighbour.md': '---\nfileClass: concept\n---\n## Connections\nenables:: [[concepts/Result]]',
	'concepts/Result.md': '',
	'Knowledge Forge/generated.md': '## Connections\nrequires:: [[concepts/Anchor]]',
};
function setup(initial: Record<string, string> = notes) {
	const fixture = createMockApp(initial);
	const instance = Object.assign(new Plugin(fixture.app), {
		settings: structuredClone(DEFAULT_SETTINGS),
		saveSettings: vi.fn(async () => {}),
	});
	return { ...fixture, plugin: instance as unknown as PluginWithSettings, instance };
}
function button(container: HTMLElement, text: string): HTMLButtonElement {
	const found = [...container.querySelectorAll('button')].find(element => element.textContent === text);
	if (!found) throw new Error(`Button missing: ${text}`);
	return found;
}
function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
	element.value = value;
	element.dispatchEvent(new Event('input', { bubbles: true }));
}
function preview(panel: GraphRAGPanel): HTMLTextAreaElement {
	return panel.contentEl.querySelector('.kg-prompt-preview')!;
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}
const result: GraphRAGPrompt = { anchor: 'concepts/Anchor.md', hops: 2, prompt: 'old prompt', facts: [], evidence: [] };

afterEach(() => vi.restoreAllMocks());

describe('GraphRAG preview workflow', () => {
	it('opens from the command, uses the active full path, and copies the exact grounded preview', async () => {
		const fixture = setup();
		const writeText = vi.fn(async () => {});
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
		registerBuildGraphRAGPromptCommand(fixture.plugin);
		fixture.instance.commands[0].callback();
		const panel = Modal.instances[0] as unknown as GraphRAGPanel;
		expect(panel).toBeInstanceOf(GraphRAGPanel);
		expect(panel.contentEl.querySelector('.kg-anchor-path')?.textContent).toBe('concepts/Anchor.md');
		expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(true);
		input(panel.contentEl.querySelector('[aria-label="Question for grounded prompt"]')!, 'How does Anchor enable Result?');
		button(panel.contentEl, 'Generate preview').click();
		await vi.waitFor(() => expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(false));
		expect(preview(panel).value).toContain('How does Anchor enable Result?');
		expect(preview(panel).value).toContain('concepts/Anchor.md');
		expect(preview(panel).value).toContain('[source: concepts/Anchor.md]');
		expect(preview(panel).value).not.toContain('Knowledge Forge/generated.md');
		expect(panel.contentEl.querySelector('.kg-evidence-list')?.textContent).toContain('Source: concepts/Anchor.md');
		expect(panel.contentEl.querySelector('.kg-workflow-status')?.textContent).toMatch(/facts from .* source notes/);
		button(panel.contentEl, 'Copy prompt').click();
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(preview(panel).value));
	});

	it('invalidates preview and copy when the question, hops or anchor changes', async () => {
		const fixture = setup();
		const panel = new GraphRAGPanel(fixture.app, fixture.plugin);
		panel.open();
		const generate = async () => {
			button(panel.contentEl, 'Generate preview').click();
			await vi.waitFor(() => expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(false));
		};
		await generate();
		input(panel.contentEl.querySelector('[aria-label="Question for grounded prompt"]')!, 'A new question');
		expect(preview(panel).value).toBe('');
		expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(true);
		await generate();
		const slider = panel.contentEl.querySelector<HTMLInputElement>('input[type=range]')!;
		expect(slider.min).toBe('0'); expect(slider.max).toBe('5');
		input(slider, '0');
		expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(true);
		await generate();
		button(panel.contentEl, 'Choose note').click();
		const picker = Modal.instances.at(-1) as FuzzySuggestModal<TFile>;
		expect(picker.getItems().map(file => file.path)).not.toContain('Knowledge Forge/generated.md');
		picker.onChooseItem(fixture.files.get('concepts/Neighbour.md')!, new MouseEvent('click'));
		expect(preview(panel).value).toBe('');
		expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(true);
		expect(panel.contentEl.querySelector('.kg-anchor-path')?.textContent).toBe('concepts/Neighbour.md');
	});

	it('requires a source note when no eligible Markdown note is active', () => {
		const fixture = setup(); fixture.setActiveFile('Knowledge Forge/generated.md');
		const panel = new GraphRAGPanel(fixture.app, fixture.plugin); panel.open();
		expect(button(panel.contentEl, 'Generate preview').disabled).toBe(true);
		button(panel.contentEl, 'Choose note').click();
		const picker = Modal.instances.at(-1) as FuzzySuggestModal<TFile>;
		picker.onChooseItem(fixture.files.get('concepts/Anchor.md')!, new MouseEvent('click'));
		expect(button(panel.contentEl, 'Generate preview').disabled).toBe(false);
	});

	it('prevents duplicate generation and rejects a stale async result after editing', async () => {
		const fixture = setup(); const pending = deferred<GraphRAGPrompt>();
		const build = vi.spyOn(GraphRAGBuilder, 'buildFromRequest').mockReturnValue(pending.promise);
		const panel = new GraphRAGPanel(fixture.app, fixture.plugin); panel.open();
		button(panel.contentEl, 'Generate preview').click();
		button(panel.contentEl, 'Generate preview').click();
		await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
		input(panel.contentEl.querySelector('[aria-label="Question for grounded prompt"]')!, 'Changed during extraction');
		pending.resolve(result);
		await vi.waitFor(() => expect(button(panel.contentEl, 'Generate preview').disabled).toBe(false));
		expect(preview(panel).value).toBe('');
		expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(true);
		expect(panel.contentEl.textContent).toContain('Generate a new preview');
	});

	it('does not repopulate or report success after the panel closes', async () => {
		const fixture = setup(); const pending = deferred<GraphRAGPrompt>();
		const build = vi.spyOn(GraphRAGBuilder, 'buildFromRequest').mockReturnValue(pending.promise);
		const panel = new GraphRAGPanel(fixture.app, fixture.plugin); panel.open();
		button(panel.contentEl, 'Generate preview').click();
		await vi.waitFor(() => expect(build).toHaveBeenCalled()); panel.close(); pending.resolve(result);
		await pending.promise; await Promise.resolve();
		expect(panel.contentEl.textContent).toBe(''); expect(Notice.messages).toEqual([]);
	});

	it('shows generation and clipboard failures without claiming success', async () => {
		const fixture = setup(); const panel = new GraphRAGPanel(fixture.app, fixture.plugin); panel.open();
		const build = vi.spyOn(GraphRAGBuilder, 'buildFromRequest').mockRejectedValueOnce(new Error('read failed'));
		button(panel.contentEl, 'Generate preview').click();
		await vi.waitFor(() => expect(panel.contentEl.textContent).toContain('read failed'));
		expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(true);
		build.mockRestore();
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) } });
		button(panel.contentEl, 'Generate preview').click();
		await vi.waitFor(() => expect(button(panel.contentEl, 'Copy prompt').disabled).toBe(false));
		button(panel.contentEl, 'Copy prompt').click();
		await vi.waitFor(() => expect(panel.contentEl.textContent).toContain('copy the preview manually'));
		expect(Notice.messages.join(' ')).not.toContain('prompt copied');
	});
});

describe('Active-note graph and evidence list', () => {
	it('refreshes on active-file and metadata events, and clears old data without a note or on error', async () => {
		const fixture = setup(); const view = new KnowledgeGraphView(fixture.leaf as never, fixture.plugin);
		await view.onOpen();
		expect(view.contentEl.textContent).toContain('concepts/Anchor.md');
		expect(view.contentEl.querySelectorAll('.kg-map-node').length).toBeGreaterThan(0);
		fixture.setActiveFile('concepts/Neighbour.md');
		await vi.waitFor(() => expect(view.contentEl.querySelector('.kg-workflow-status')?.textContent).toMatch(/^concepts\/Neighbour.md ·/));
		expect(view.contentEl.querySelector('.kg-map-anchor')?.getAttribute('data-note-id')).toBe('concepts/Neighbour.md');
		fixture.contents.set('concepts/Neighbour.md', '## Connections\nrequires:: [[concepts/Anchor]]');
		fixture.app.metadataCache.trigger('changed', fixture.files.get('concepts/Neighbour.md'));
		await vi.waitFor(() => expect([...view.contentEl.querySelectorAll('.kg-map-relation')].map(el => el.textContent).join(' ')).toContain('requires'));
		fixture.setActiveFile(null);
		expect(view.contentEl.querySelectorAll('.kg-map-node')).toHaveLength(0);
		view.contentEl.querySelector('select')!.dispatchEvent(new Event('change'));
		expect(view.contentEl.querySelectorAll('.kg-map-node')).toHaveLength(0);
		fixture.app.vault.cachedRead.mockRejectedValueOnce(new Error('vault read failed'));
		fixture.setActiveFile('concepts/Anchor.md');
		await vi.waitFor(() => expect(view.contentEl.textContent).toContain('vault read failed'));
		expect(view.contentEl.querySelectorAll('.kg-map-node')).toHaveLength(0);
	});

	it('discards a delayed extraction for the previous active note', async () => {
		const fixture = setup(); const pending = deferred<Triple[]>();
		const a = new Triple('concepts/Anchor.md', 'related_to', 'concepts/Neighbour.md', createProvenance('concepts/Anchor.md'));
		const b = new Triple('concepts/Neighbour.md', 'enables', 'concepts/Result.md', createProvenance('concepts/Neighbour.md'));
		const extract = vi.spyOn(TripleExtractor.prototype, 'extract').mockImplementation(file => file.path === a.subject ? pending.promise : Promise.resolve([b]));
		const view = new KnowledgeGraphView(fixture.leaf as never, fixture.plugin); const opening = view.onOpen();
		await vi.waitFor(() => expect(extract).toHaveBeenCalled());
		fixture.setActiveFile('concepts/Neighbour.md');
		await vi.waitFor(() => expect(view.contentEl.querySelector('.kg-map-anchor')?.getAttribute('data-note-id')).toBe(b.subject));
		pending.resolve([a]); await opening;
		expect(view.contentEl.querySelector('.kg-map-anchor')?.getAttribute('data-note-id')).toBe(b.subject);
	});

	it('renders source identity and inference, and supports keyboard opening', () => {
		const container = document.createElement('div'); const click = vi.fn();
		const triple = new Triple('a/Note.md', 'links_to', 'b/Note.md', createProvenance('a/Note.md', { confidence: 0.6 }), true);
		new TripleList(container, { onTripleClick: click }).setTriples([triple]);
		expect(container.textContent).toContain('Source: a/Note.md');
		expect(container.textContent).toContain('Inferred from link');
		const row = container.querySelector<HTMLElement>('[role=button]')!; expect(row.tabIndex).toBe(0);
		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); expect(click).toHaveBeenCalledWith(triple);
	});
});

describe('Persistent competency questions', () => {
	it('saves add/edit/remove and restores questions and honest coverage hints on reopen', async () => {
		const fixture = setup(); let stored: ForgeSettings | null = null;
		fixture.instance.saveSettings.mockImplementation(async () => { stored = structuredClone(fixture.plugin.settings); });
		const view = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await view.onOpen();
		button(view.contentEl, 'Add question').click();
		input(view.contentEl.querySelector('.kg-cq-input')!, 'How is Anchor related to Neighbour?');
		await vi.waitFor(() => expect(stored?.competencyQuestions[0]?.question).toBe('How is Anchor related to Neighbour?'));
		button(view.contentEl, 'Check coverage').click();
		await vi.waitFor(() => expect(stored?.competencyQuestions[0]?.status).toBe('covered'));
		expect(view.contentEl.textContent).toContain('Lexical hint only');
		expect(view.contentEl.textContent).not.toContain('passing');
		await view.onClose();
		fixture.plugin.settings = structuredClone(stored!);
		const reopened = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await reopened.onOpen();
		expect(reopened.contentEl.querySelector<HTMLInputElement>('.kg-cq-input')?.value).toBe('How is Anchor related to Neighbour?');
		expect(reopened.contentEl.textContent).toContain('Coverage hint');
		input(reopened.contentEl.querySelector('.kg-cq-input')!, 'A different question');
		expect(reopened.contentEl.textContent).toContain('Unchecked');
		expect(reopened.contentEl.textContent).not.toContain('Matched');
		await vi.waitFor(() => expect(stored?.competencyQuestions[0]?.status).toBe('unvalidated'));
		button(reopened.contentEl, 'Remove').click();
		await vi.waitFor(() => expect(stored?.competencyQuestions).toEqual([]));
	});

	it('keeps failed saves visible and allows a retry without losing the edit', async () => {
		const fixture = setup(); fixture.instance.saveSettings.mockRejectedValueOnce(new Error('disk full'));
		const view = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await view.onOpen();
		button(view.contentEl, 'Add question').click();
		await vi.waitFor(() => expect(view.contentEl.textContent).toContain('Questions are not saved: disk full'));
		expect(fixture.plugin.settings.competencyQuestions).toHaveLength(1);
		expect(button(view.contentEl, 'Retry save').hidden).toBe(false);
		button(view.contentEl, 'Retry save').click();
		await vi.waitFor(() => expect(button(view.contentEl, 'Retry save').hidden).toBe(true));
		expect(fixture.instance.saveSettings).toHaveBeenCalledTimes(2);
		expect(button(view.contentEl, 'Retry save').hidden).toBe(true);
	});

	it('does not use generated output for coverage', async () => {
		const fixture = setup({ 'Anchor.md': '[[Neighbour]]', 'Neighbour.md': '', 'Knowledge Forge/generated.md': '[[Forbiddensecret]]' });
		fixture.plugin.settings.competencyQuestions = [{ id: 'one', question: 'Forbiddensecret', status: 'unvalidated' }];
		const view = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await view.onOpen();
		button(view.contentEl, 'Check coverage').click();
		await vi.waitFor(() => expect(fixture.plugin.settings.competencyQuestions[0].status).toBe('uncovered'));
		expect(view.contentEl.textContent).toContain('Matched 0/1');
	});

	it('preserves an unsaved error through closing and reopening the view', async () => {
		const fixture = setup(); fixture.instance.saveSettings.mockRejectedValueOnce(new Error('storage unavailable'));
		const first = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await first.onOpen();
		button(first.contentEl, 'Add question').click();
		await vi.waitFor(() => expect(first.contentEl.textContent).toContain('Questions are not saved'));
		await first.onClose();
		const second = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await second.onOpen();
		expect(second.contentEl.textContent).toContain('Questions are not saved: storage unavailable');
		expect(button(second.contentEl, 'Retry save').hidden).toBe(false);
	});

	it('serializes pending writes across reopened views so the newest edit is stored last', async () => {
		const fixture = setup(); const pending = deferred<void>(); let activeWrites = 0; let maxWrites = 0;
		let stored: ForgeSettings | null = null;
		fixture.instance.saveSettings.mockImplementation(async () => {
			activeWrites++; maxWrites = Math.max(maxWrites, activeWrites);
			const snapshot = structuredClone(fixture.plugin.settings);
			if (fixture.instance.saveSettings.mock.calls.length === 1) await pending.promise;
			stored = snapshot; activeWrites--;
		});
		const first = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await first.onOpen();
		button(first.contentEl, 'Add question').click();
		await vi.waitFor(() => expect(fixture.instance.saveSettings).toHaveBeenCalledTimes(1));
		await first.onClose();
		const second = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await second.onOpen();
		input(second.contentEl.querySelector('.kg-cq-input')!, 'Latest question');
		expect(fixture.instance.saveSettings).toHaveBeenCalledTimes(1);
		pending.resolve();
		await vi.waitFor(() => expect(stored?.competencyQuestions[0]?.question).toBe('Latest question'));
		expect(maxWrites).toBe(1);
	});

	it('discards coverage when a question is edited during an asynchronous scan', async () => {
		const fixture = setup(); fixture.plugin.settings.competencyQuestions = [{ id: 'one', question: 'Anchor Neighbour', status: 'unvalidated' }];
		const pending = deferred<Triple[]>();
		const extract = vi.spyOn(TripleExtractor.prototype, 'extract').mockReturnValue(pending.promise);
		const view = new CompetencyQuestionView(fixture.leaf as never, fixture.plugin); await view.onOpen();
		button(view.contentEl, 'Check coverage').click();
		await vi.waitFor(() => expect(extract).toHaveBeenCalled());
		input(view.contentEl.querySelector('.kg-cq-input')!, 'New question'); pending.resolve([]);
		await vi.waitFor(() => expect(button(view.contentEl, 'Check coverage').disabled).toBe(false));
		expect(fixture.plugin.settings.competencyQuestions[0]).toEqual({ id: 'one', question: 'New question', status: 'unvalidated' });
		expect(view.contentEl.textContent).toContain('Run a new coverage check');
	});
});
