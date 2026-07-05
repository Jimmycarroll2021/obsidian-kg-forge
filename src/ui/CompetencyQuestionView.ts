import { ItemView, WorkspaceLeaf, Notice, TextComponent, ButtonComponent } from 'obsidian';
import { SchemaValidator } from '../engine/SchemaValidator';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import { TripleExtractor } from '../engine/TripleExtractor';
import type { Triple } from '../models/Triple';
import { VIEW_TYPE_COMPETENCY_QUESTIONS, type PluginWithSettings } from './types';

/**
 * Lightweight representation of a Competency Question (CQ).
 *
 * A CQ is a natural-language question the graph should be able to answer.
 * The view tracks validation status and explanatory notes.
 */
export interface CompetencyQuestion {
	id: string;
	question: string;
	status: 'unvalidated' | 'passing' | 'failing';
	notes?: string;
}

/**
 * Leaf view for managing Competency Questions.
 *
 * Users can add questions, validate them against the current vault triples
 * and schema, and see which questions the knowledge graph can currently answer.
 */
export class CompetencyQuestionView extends ItemView {
	private plugin: PluginWithSettings;
	private questions: CompetencyQuestion[] = [];
	private listContainer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: PluginWithSettings) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_COMPETENCY_QUESTIONS;
	}

	getDisplayText(): string {
		return 'Competency questions';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('kg-competency-question-view');

		this.contentEl.createEl('h4', { text: 'Competency questions', cls: 'kg-view-title' });
		this.contentEl.createEl('p', {
			text: 'Define questions your vault should answer, then validate them against the current schema and triples.',
			cls: 'setting-item-description',
		});

		const controls = this.contentEl.createDiv({ cls: 'kg-cq-controls' });
		const addButton = controls.createEl('button', { text: 'Add question', cls: 'kg-button' });
		addButton.addEventListener('click', () => this.addQuestion());

		const validateButton = controls.createEl('button', { text: 'Validate all', cls: 'kg-button' });
		validateButton.addEventListener('click', () => {
			this.validateAll().catch((err) => console.error(err));
		});

		this.listContainer = this.contentEl.createDiv({ cls: 'kg-cq-list' });
		this.renderQuestions();
	}

	private renderQuestions(): void {
		if (!this.listContainer) return;
		this.listContainer.empty();

		if (this.questions.length === 0) {
			this.listContainer.createDiv({
				text: 'No competency questions yet. Click "add question" to start.',
				cls: 'kg-empty-state',
			});
			return;
		}

		for (const question of this.questions) {
			this.renderQuestionRow(question);
		}
	}

	private renderQuestionRow(question: CompetencyQuestion): void {
		if (!this.listContainer) return;

		const row = this.listContainer.createDiv({ cls: 'kg-cq-row' });

		const text = new TextComponent(row)
			.setPlaceholder('Type a competency question...')
			.setValue(question.question)
			.onChange(value => {
				question.question = value;
			});
		text.inputEl.addClass('kg-cq-input');

		row.createSpan({
			text: question.status,
			cls: `kg-cq-status kg-cq-status-${question.status}`,
		});

		const removeButton = new ButtonComponent(row)
			.setButtonText('×')
			.setTooltip('Remove question')
			.onClick(() => {
				this.questions = this.questions.filter(q => q.id !== question.id);
				this.renderQuestions();
			});
		removeButton.buttonEl.addClass('kg-cq-remove');

		if (question.notes) {
			row.createDiv({
				text: question.notes,
				cls: 'kg-cq-notes',
			});
		}
	}

	private addQuestion(): void {
		this.questions.push({
			id: this.generateId(),
			question: '',
			status: 'unvalidated',
		});
		this.renderQuestions();
	}

	private async validateAll(): Promise<void> {
		try {
			const settings = this.plugin.settings;
			const vault = this.app.vault;

			const sourceMap = await SourceMapLoader.loadFromPath(vault, settings.sourceMapPath);

			const validator = new SchemaValidator(vault, this.app.metadataCache, {
				fileClassTypeMap: settings.fileClassMappings,
				provenanceRequired: settings.provenanceEnforced,
				sourceMap,
			});
			const schemaIssues = await validator.validateAll();
			const schemaErrors = schemaIssues.filter(i => i.severity === 'error');

			const extractor = new TripleExtractor(vault, this.app.metadataCache, {
				fileClassTypeMap: settings.fileClassMappings,
				sourceMap,
			});
			const allTriples: Triple[] = [];
			for (const file of vault.getMarkdownFiles()) {
				allTriples.push(...(await extractor.extract(file)));
			}

			const termIndex = this.buildTermIndex(allTriples);

			for (const question of this.questions) {
				const result = this.validateQuestion(question, schemaErrors, termIndex);
				question.status = result.canAnswer ? 'passing' : 'failing';
				question.notes = result.notes;
			}

			this.renderQuestions();
			new Notice(`Validated ${this.questions.length} competency questions.`);
		} catch (error) {
			new Notice('Failed to validate questions: ' + (error as Error).message);
		}
	}

	private validateQuestion(
		question: CompetencyQuestion,
		schemaErrors: { file: string; message: string }[],
		termIndex: Set<string>
	): { canAnswer: boolean; notes?: string } {
		if (!question.question.trim()) {
			return { canAnswer: false, notes: 'Question text is empty.' };
		}

		if (schemaErrors.length > 0) {
			return {
				canAnswer: false,
				notes: `Schema has ${schemaErrors.length} error(s); the graph cannot reliably answer questions until they are fixed.`,
			};
		}

		const terms = question.question.toLowerCase().split(/\W+/).filter(t => t.length > 2);
		const matched = terms.filter(t => termIndex.has(t));
		const coverage = terms.length > 0 ? matched.length / terms.length : 0;

		if (coverage >= 0.5) {
			return {
				canAnswer: true,
				notes: `Matched ${matched.length}/${terms.length} question terms against the vault graph.`,
			};
		}

		return {
			canAnswer: false,
			notes: `Only ${matched.length}/${terms.length} question terms were found in the graph.`,
		};
	}

	private buildTermIndex(triples: Triple[]): Set<string> {
		const index = new Set<string>();
		for (const t of triples) {
			for (const token of [t.subject, t.predicate, t.object]) {
				for (const word of token.toLowerCase().split(/\W+/)) {
					if (word.length > 2) index.add(word);
				}
			}
		}
		return index;
	}

	private generateId(): string {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
		return `cq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	async onClose(): Promise<void> {
		// Persist questions could be added here once a storage strategy is defined.
	}
}
