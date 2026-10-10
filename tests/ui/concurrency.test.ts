import { describe, expect, it, vi, afterEach } from 'vitest';
import { Plugin } from '../mocks/obsidian';
import { createMockApp } from '../helpers/vault';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { PluginWithSettings } from '../../src/ui/types';
import { CompetencyQuestionView } from '../../src/ui/CompetencyQuestionView';
import { TripleExtractor } from '../../src/engine/TripleExtractor';
import { Triple } from '../../src/models/Triple';
import { createProvenance } from '../../src/models/Provenance';

function button(view: CompetencyQuestionView, label: string): HTMLButtonElement {
	const found = [...view.contentEl.querySelectorAll('button')].find(item => item.textContent === label);
	if (!found) throw new Error(`Missing ${label}`);
	return found;
}
function edit(element: HTMLInputElement, value: string): void {
	element.value = value; element.dispatchEvent(new Event('input', { bubbles: true }));
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}
async function twoViews() {
	const fixture = createMockApp({ 'concepts/Anchor.md': '---\nfileClass: concept\n---' });
	const instance = Object.assign(new Plugin(fixture.app), {
		settings: structuredClone(DEFAULT_SETTINGS), saveSettings: vi.fn(async () => {}),
	});
	instance.settings.competencyQuestions = [{ id: 'original', question: 'Original question', status: 'unvalidated' }];
	const plugin = instance as unknown as PluginWithSettings;
	const one = new CompetencyQuestionView(fixture.leaf as never, plugin);
	const two = new CompetencyQuestionView(fixture.leaf as never, plugin);
	await one.onOpen(); await two.onOpen();
	return { one, two, plugin, instance };
}

afterEach(() => vi.restoreAllMocks());

describe('Concurrent competency-question views', () => {
	it('preserves an edit in another view while an old coverage scan finishes', async () => {
		const { one, two, plugin } = await twoViews(); const pending = deferred<Triple[]>();
		const extract = vi.spyOn(TripleExtractor.prototype, 'extract').mockReturnValue(pending.promise);
		button(one, 'Check coverage').click();
		await vi.waitFor(() => expect(extract).toHaveBeenCalled());
		edit(two.contentEl.querySelector('input')!, 'Newest user edit');
		expect(one.contentEl.querySelector<HTMLInputElement>('input')?.value).toBe('Newest user edit');
		pending.resolve([]);
		await vi.waitFor(() => expect(button(one, 'Check coverage').disabled).toBe(false));
		expect(plugin.settings.competencyQuestions).toEqual([{ id: 'original', question: 'Newest user edit', status: 'unvalidated' }]);
		expect(one.contentEl.textContent).toContain('Run a new coverage check');
	});

	it('preserves a newly added question and does not resurrect a removed question after a delayed scan', async () => {
		const { one, two, plugin } = await twoViews(); const pending = deferred<Triple[]>();
		const extract = vi.spyOn(TripleExtractor.prototype, 'extract').mockReturnValue(pending.promise);
		button(one, 'Check coverage').click();
		await vi.waitFor(() => expect(extract).toHaveBeenCalled());
		button(two, 'Add question').click();
		const rows = two.contentEl.querySelectorAll('.kg-cq-row');
		edit(rows[1].querySelector('input')!, 'New question added during scan');
		rows[0].querySelector<HTMLButtonElement>('button')!.click();
		const added = structuredClone(plugin.settings.competencyQuestions[0]);
		expect(one.contentEl.querySelectorAll('.kg-cq-row')).toHaveLength(1);
		pending.resolve([]);
		await vi.waitFor(() => expect(button(one, 'Check coverage').disabled).toBe(false));
		expect(plugin.settings.competencyQuestions).toEqual([added]);
		expect(added.question).toBe('New question added during scan');
		expect(one.contentEl.querySelector<HTMLInputElement>('input')?.value).toBe(added.question);
	});

	it('updates coverage in place and keeps all open views editable after another view renders', async () => {
		const { one, two, plugin } = await twoViews();
		const question = plugin.settings.competencyQuestions[0];
		const previousInput = two.contentEl.querySelector<HTMLInputElement>('input')!;
		button(one, 'Check coverage').click();
		await vi.waitFor(() => expect(question.status).toBe('uncovered'));
		expect(plugin.settings.competencyQuestions[0]).toBe(question);
		expect(two.contentEl.textContent).toContain('Low coverage hint');
		// A stale element's closure also resolves the canonical object by ID.
		edit(previousInput, 'Edit using a previous render');
		expect(plugin.settings.competencyQuestions[0].question).toBe('Edit using a previous render');
		expect(plugin.settings.competencyQuestions[0].status).toBe('unvalidated');
		edit(two.contentEl.querySelector('input')!, 'Current visible edit');
		expect(plugin.settings.competencyQuestions[0].question).toBe('Current visible edit');
		expect(one.contentEl.querySelector<HTMLInputElement>('input')?.value).toBe('Current visible edit');
	});

	it('keeps the newer coverage result when checks overlap across views', async () => {
		const { one, two, plugin } = await twoViews();
		edit(one.contentEl.querySelector('input')!, 'Anchor');
		const pending = deferred<Triple[]>();
		const triple = new Triple('concepts/Anchor.md', 'rdf:type', 'concept', createProvenance('concepts/Anchor.md'));
		const extract = vi.spyOn(TripleExtractor.prototype, 'extract')
			.mockReturnValueOnce(pending.promise).mockResolvedValue([triple]);
		button(one, 'Check coverage').click();
		await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(1));
		button(two, 'Check coverage').click();
		await vi.waitFor(() => expect(plugin.settings.competencyQuestions[0].status).toBe('covered'));
		pending.resolve([]);
		await vi.waitFor(() => expect(button(one, 'Check coverage').disabled).toBe(false));
		expect(plugin.settings.competencyQuestions[0].status).toBe('covered');
		expect(plugin.settings.competencyQuestions[0].notes).toContain('Matched 1/1');
		expect(one.contentEl.textContent).toContain('Coverage hint');
	});

	it('preserves a focused input and caret while another view edits a different question', async () => {
		const { one, two } = await twoViews();
		button(one, 'Add question').click();
		document.body.append(one.contentEl, two.contentEl);
		const input = two.contentEl.querySelector<HTMLInputElement>('input')!;
		input.focus(); input.setSelectionRange(3, 8);
		edit(one.contentEl.querySelector<HTMLInputElement>('.kg-cq-row:last-child input')!, 'Updated second question');
		const replacement = two.contentEl.querySelector<HTMLInputElement>('[data-question-id=original]')!;
		expect(document.activeElement).toBe(replacement);
		expect(replacement.selectionStart).toBe(3); expect(replacement.selectionEnd).toBe(8);
		expect(replacement.value).toBe('Original question');
		expect(two.contentEl.querySelectorAll('.kg-cq-row')).toHaveLength(2);
	});
});
