import { ItemView, WorkspaceLeaf, Notice, TextComponent, ButtonComponent } from 'obsidian';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import { TripleExtractor } from '../engine/TripleExtractor';
import { getSourceFiles } from '../engine/VaultFiles';
import type { Triple } from '../models/Triple';
import type { CompetencyQuestion } from '../settings';
import { VIEW_TYPE_COMPETENCY_QUESTIONS, type PluginWithSettings } from './types';

export type { CompetencyQuestion } from '../settings';

const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'what', 'which', 'when', 'where',
	'who', 'why', 'how', 'does', 'can', 'could', 'should', 'would', 'with', 'from', 'that', 'this', 'into', 'has', 'have']);

interface QuestionSaveState {
	queue: Promise<boolean>;
	pending: number;
	error: string | null;
	saved: boolean;
	listeners: Set<() => void>;
	generation: number;
	questionListeners: Set<(source: HTMLElement | null) => void>;
}
// Share writes, errors and mutation identity across every view for this plugin.
const saveStates = new WeakMap<PluginWithSettings, QuestionSaveState>();

/** Persistent questions with explicitly limited lexical coverage hints. */
export class CompetencyQuestionView extends ItemView {
	private listContainer: HTMLElement | null = null;
	private saveStatusEl: HTMLElement | null = null;
	private checkStatusEl: HTMLElement | null = null;
	private checkButton: HTMLButtonElement | null = null;
	private retryButton: HTMLButtonElement | null = null;
	private saveState: QuestionSaveState;
	private refreshSaveStatus = (): void => this.updateSaveStatus();
	private refreshSharedQuestions = (source: HTMLElement | null): void => {
		if (source !== this.contentEl) this.renderQuestions();
		this.checkStatusEl?.setText(this.checking
			? 'A question change or newer check superseded this coverage check.' : '');
	};
	private revision = 0;
	private opened = false;
	private checking = false;

	constructor(leaf: WorkspaceLeaf, private plugin: PluginWithSettings) {
		super(leaf);
		this.saveState = saveStates.get(plugin) ?? {
			queue: Promise.resolve(true), pending: 0, error: null, saved: false, listeners: new Set(),
			generation: 0, questionListeners: new Set(),
		};
		saveStates.set(plugin, this.saveState);
	}
	getViewType(): string { return VIEW_TYPE_COMPETENCY_QUESTIONS; }
	getDisplayText(): string { return 'Competency questions'; }
	private get questions(): CompetencyQuestion[] { return this.plugin.settings.competencyQuestions; }

	async onOpen(): Promise<void> {
		this.opened = true;
		this.saveState.listeners.add(this.refreshSaveStatus);
		this.saveState.questionListeners.add(this.refreshSharedQuestions);
		this.revision++;
		this.contentEl.empty();
		this.contentEl.addClass('kg-competency-question-view');
		this.contentEl.createEl('h4', { text: 'Competency questions', cls: 'kg-view-title' });
		this.contentEl.createEl('p', {
			text: 'Keep questions you want your vault to answer. Check coverage for a lexical hint; matching terms do not prove that the graph can answer a question.',
			cls: 'setting-item-description',
		});
		const controls = this.contentEl.createDiv({ cls: 'kg-cq-controls' });
		const addButton = controls.createEl('button', { text: 'Add question', cls: 'kg-button' });
		addButton.addEventListener('click', () => this.addQuestion());
		this.checkButton = controls.createEl('button', { text: 'Check coverage', cls: 'kg-button' });
		this.checkButton.disabled = this.questions.length === 0 || this.checking;
		this.checkButton.addEventListener('click', () => { void this.checkCoverage(); });
		this.retryButton = controls.createEl('button', { text: 'Retry save', cls: 'kg-button' });
		this.retryButton.hidden = this.saveState.error === null;
		this.retryButton.addEventListener('click', () => { void this.persistQuestions(); });
		this.saveStatusEl = this.contentEl.createDiv({ cls: 'kg-workflow-status' });
		this.saveStatusEl.setAttribute('role', 'status');
		this.checkStatusEl = this.contentEl.createDiv({ cls: 'kg-workflow-status' });
		this.checkStatusEl.setAttribute('role', 'status');
		this.updateSaveStatus();
		this.listContainer = this.contentEl.createDiv({ cls: 'kg-cq-list' });
		this.renderQuestions();
	}

	private renderQuestions(): void {
		if (!this.listContainer) return;
		const focused = document.activeElement;
		const input = focused instanceof HTMLInputElement && this.listContainer.contains(focused) ? focused : null;
		const focusId = input?.dataset.questionId;
		const selection = input ? [input.selectionStart, input.selectionEnd] : null;
		this.listContainer.empty();
		if (this.checkButton) this.checkButton.disabled = this.questions.length === 0 || this.checking;
		if (this.questions.length === 0) {
			this.listContainer.createDiv({ text: 'No questions yet. Add the first question you want your vault to answer.', cls: 'kg-empty-state' });
			return;
		}
		for (const question of this.questions) this.renderQuestionRow(question);
		if (focusId) {
			const replacement = Array.from(this.listContainer.querySelectorAll<HTMLInputElement>('.kg-cq-input'))
				.find(element => element.dataset.questionId === focusId);
			replacement?.focus();
			if (selection && replacement) replacement.setSelectionRange(selection[0], selection[1]);
		}
	}

	private renderQuestionRow(question: CompetencyQuestion): void {
		if (!this.listContainer) return;
		const row = this.listContainer.createDiv({ cls: 'kg-cq-row' });
		const text = new TextComponent(row)
			.setPlaceholder('What should this vault help you answer?').setValue(question.question);
		text.inputEl.addClass('kg-cq-input');
		text.inputEl.dataset.questionId = question.id;
		text.inputEl.setAttribute('aria-label', 'Competency question');
		const status = row.createSpan({ text: this.statusLabel(question), cls: `kg-cq-status kg-cq-status-${question.status}` });
		const remove = new ButtonComponent(row).setButtonText('Remove').setTooltip('Remove this question').onClick(() => {
			this.plugin.settings.competencyQuestions = this.questions.filter(item => item.id !== question.id);
			this.invalidateCheck();
			this.renderQuestions();
			void this.persistQuestions();
		});
		remove.buttonEl.addClass('kg-cq-remove');
		remove.buttonEl.setAttribute('aria-label', 'Remove competency question');
		const notes = row.createDiv({ text: question.notes ?? '', cls: 'kg-cq-notes' });
		text.onChange(value => {
			// Resolve by identity rather than mutate an object captured by an older render.
			const current = this.questions.find(item => item.id === question.id);
			if (!current) return;
			current.question = value;
			current.status = 'unvalidated';
			delete current.notes;
			status.setText(this.statusLabel(current));
			status.className = 'kg-cq-status kg-cq-status-unvalidated';
			notes.empty();
			this.invalidateCheck();
			void this.persistQuestions();
		});
	}

	private statusLabel(question: CompetencyQuestion): string {
		return question.status === 'covered' ? 'Coverage hint' : question.status === 'uncovered' ? 'Low coverage hint' : 'Unchecked';
	}

	private addQuestion(): void {
		this.questions.push({ id: this.generateId(), question: '', status: 'unvalidated' });
		this.invalidateCheck();
		this.renderQuestions();
		this.listContainer?.querySelector<HTMLInputElement>('.kg-cq-row:last-child input')?.focus();
		void this.persistQuestions();
	}

	private invalidateCheck(): void {
		this.revision++;
		this.saveState.generation++;
		this.saveState.questionListeners.forEach(refresh => refresh(this.contentEl));
	}

	/** Queue writes so an older write cannot finish after a newer edit. */
	private persistQuestions(): Promise<boolean> {
		const state = this.saveState;
		state.pending++;
		state.listeners.forEach(refresh => refresh());
		state.queue = state.queue.then(async () => {
			try {
				await this.plugin.saveSettings();
				state.error = null;
				state.saved = true;
				return true;
			} catch (error) {
				state.error = error instanceof Error ? error.message : String(error);
				new Notice(`KG Forge: questions could not be saved — ${state.error}`);
				return false;
			} finally {
				state.pending--;
				state.listeners.forEach(refresh => refresh());
			}
		});
		return state.queue;
	}

	private updateSaveStatus(): void {
		const state = this.saveState;
		this.saveStatusEl?.setText(state.pending > 0 ? 'Saving questions…' : state.error
			? `Questions are not saved: ${state.error}. Your edits remain in this session; retry saving.`
			: state.saved ? 'Questions saved locally.' : 'Local plugin storage · coverage hints are advisory.');
		if (this.retryButton) {
			this.retryButton.hidden = state.error === null;
			this.retryButton.disabled = state.pending > 0;
		}
	}

	private async checkCoverage(): Promise<void> {
		if (this.checking || this.questions.length === 0 || !this.opened) return;
		const revision = this.revision;
		const generation = ++this.saveState.generation;
		const settings = this.plugin.settings;
		const questions = this.questions.map(question => ({ ...question }));
		const isCurrent = (): boolean => this.opened && revision === this.revision
			&& generation === this.saveState.generation && questions.length === this.questions.length
			&& questions.every(snapshot => this.questions.some(current => current.id === snapshot.id && current.question === snapshot.question));
		this.checking = true;
		this.saveState.questionListeners.forEach(refresh => refresh(this.contentEl));
		if (this.checkButton) this.checkButton.disabled = true;
		this.checkStatusEl?.setText('Reading source-note relationships for lexical coverage…');
		try {
			const sourceMap = await SourceMapLoader.loadFromPath(this.app.vault, settings.sourceMapPath);
			const extractor = new TripleExtractor(this.app.vault, this.app.metadataCache, {
				fileClassTypeMap: settings.fileClassMappings, sourceMap,
			});
			const triples: Triple[] = [];
			for (const file of getSourceFiles(this.app.vault, settings.cacheFolder)) {
				triples.push(...await extractor.extract(file));
				if (!isCurrent()) return;
			}
			const index = this.buildTermIndex(triples);
			if (!isCurrent()) return;
			for (const question of questions) {
				const current = this.questions.find(item => item.id === question.id && item.question === question.question);
				if (!current) continue;
				const terms = this.terms(question.question);
				const matched = terms.filter(term => index.has(term));
				current.status = terms.length > 0 && matched.length / terms.length >= 0.5 ? 'covered' : 'uncovered';
				current.notes = question.question.trim()
					? `Matched ${matched.length}/${terms.length} distinct question terms${matched.length > 0 ? `: ${matched.join(', ')}` : ''}. Lexical hint only; answerability still needs review.`
					: 'Question text is empty. Add a question before checking coverage.';
			}
			// Update statuses in place; never replace live user data with a scan snapshot.
			this.saveState.questionListeners.forEach(refresh => refresh(null));
			this.checkStatusEl?.setText(`Checked ${questions.length} questions. These are lexical coverage hints, not verified answers.`);
			await this.persistQuestions();
		} catch (error) {
			if (!isCurrent()) return;
			const message = error instanceof Error ? error.message : String(error);
			this.checkStatusEl?.setText(`Could not check coverage: ${message}`);
			new Notice(`KG Forge: could not check question coverage — ${message}`);
		} finally {
			this.checking = false;
			if (this.opened && this.checkButton) {
				this.checkButton.disabled = this.questions.length === 0;
				if (!isCurrent()) this.checkStatusEl?.setText('Questions changed or another check started. Run a new coverage check.');
			}
		}
	}

	private terms(value: string): string[] {
		return [...new Set(value.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(term => term.length > 2 && !STOP_WORDS.has(term)))];
	}

	private buildTermIndex(triples: Triple[]): Set<string> {
		return new Set(triples.flatMap(triple => this.terms(`${triple.subject} ${triple.predicate} ${triple.object}`)));
	}

	private generateId(): string {
		return typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID() : `cq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	async onClose(): Promise<void> {
		this.opened = false;
		this.revision++;
		this.saveState.listeners.delete(this.refreshSaveStatus);
		this.saveState.questionListeners.delete(this.refreshSharedQuestions);
	}
}
