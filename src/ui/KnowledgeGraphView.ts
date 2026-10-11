import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { TripleExtractor } from '../engine/TripleExtractor';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import { getSourceFiles } from '../engine/VaultFiles';
import type { Triple } from '../models/Triple';
import { FocusedGraph } from './components/FocusedGraph';
import { VIEW_TYPE_KG_GRAPH, type PluginWithSettings } from './types';

/** A bounded relationship map for the active note; metadata is opt-in. */
export class KnowledgeGraphView extends ItemView {
	private graph: FocusedGraph | null = null;
	private triples: Triple[] = [];
	private anchor: TFile | null = null;
	private activePredicate: string | null = null;
	private showSources = false;
	private showInferred = false;
	private query = '';
	private filterSelect: HTMLSelectElement | null = null;
	private statusEl: HTMLElement | null = null;
	private revision = 0;
	private opened = false;

	constructor(leaf: WorkspaceLeaf, private plugin: PluginWithSettings) { super(leaf); }
	getViewType(): string { return VIEW_TYPE_KG_GRAPH; }
	getDisplayText(): string { return 'Knowledge forge graph'; }

	async onOpen(): Promise<void> {
		this.opened = true;
		this.contentEl.empty();
		this.contentEl.addClass('kg-knowledge-graph-view');
		this.contentEl.createEl('h4', { text: 'Relationships', cls: 'kg-view-title' });
		this.contentEl.createEl('p', {
			text: 'A focused map of the active note. Select a neighbour to inspect its evidence.',
			cls: 'setting-item-description',
		});
		const controls = this.contentEl.createDiv({ cls: 'kg-graph-controls' });
		const refreshButton = controls.createEl('button', { text: 'Refresh', cls: 'kg-button' });
		refreshButton.addEventListener('click', () => { void this.refresh(); });
		this.filterSelect = controls.createEl('select', { cls: 'kg-filter-select' });
		this.filterSelect.setAttribute('aria-label', 'Filter graph predicate');
		this.filterSelect.addEventListener('change', () => {
			this.activePredicate = this.filterSelect?.value || null;
			this.applyFilter();
		});
		const search = controls.createEl('input', { cls: 'kg-graph-search', attr: { type: 'search', placeholder: 'Find a neighbour…' } });
		search.value = this.query;
		search.setAttribute('aria-label', 'Find a graph neighbour');
		search.addEventListener('input', () => { this.query = search.value; this.applyFilter(); });
		const toggles = this.contentEl.createDiv({ cls: 'kg-graph-toggles' });
		this.addVisibilityToggle(toggles, 'Show sources', this.showSources, value => {
			this.showSources = value; this.populatePredicateFilter(); this.applyFilter();
		});
		this.addVisibilityToggle(toggles, 'Show inferred links', this.showInferred, value => {
			this.showInferred = value; this.populatePredicateFilter(); this.applyFilter();
		});
		this.populatePredicateFilter();
		this.statusEl = this.contentEl.createDiv({ cls: 'kg-workflow-status' });
		this.statusEl.setAttribute('role', 'status');
		this.graph = new FocusedGraph(this.contentEl.createDiv({ cls: 'kg-graph-content' }), {
			canOpenNote: id => this.app.vault.getAbstractFileByPath(id) instanceof TFile,
			onOpenNote: id => this.openNote(id),
		});
		this.addChild(this.graph);
		this.registerEvent(this.app.workspace.on('file-open', () => { void this.refresh(); }));
		this.registerEvent(this.app.metadataCache.on('changed', file => {
			if (file.path === this.app.workspace.getActiveFile()?.path) void this.refresh();
		}));
		await this.refresh();
	}

	private addVisibilityToggle(container: HTMLElement, name: string, checked: boolean, change: (value: boolean) => void): void {
		const label = container.createEl('label', { cls: 'kg-graph-toggle' });
		const checkbox = label.createEl('input', { attr: { type: 'checkbox' } });
		checkbox.checked = checked;
		label.createSpan({ text: name });
		checkbox.addEventListener('change', () => change(checkbox.checked));
	}

	async refresh(): Promise<void> {
		if (!this.opened) return;
		const revision = ++this.revision;
		const activeFile = this.app.workspace.getActiveFile();
		this.clearTriples();
		try {
			if (!activeFile || !getSourceFiles(this.app.vault, this.plugin.settings.cacheFolder)
				.some(file => file.path === activeFile.path)) {
				this.statusEl?.setText('Open a source Markdown note to inspect its relationships.');
				return;
			}
			this.statusEl?.setText(`Reading ${activeFile.path}…`);
			const sourceMap = await SourceMapLoader.loadFromPath(this.app.vault, this.plugin.settings.sourceMapPath);
			const extractor = new TripleExtractor(this.app.vault, this.app.metadataCache, {
				fileClassTypeMap: this.plugin.settings.fileClassMappings, sourceMap,
			});
			const triples = await extractor.extract(activeFile);
			if (!this.opened || revision !== this.revision) return;
			this.anchor = activeFile;
			this.triples = triples;
			this.populatePredicateFilter();
			this.applyFilter();
			this.statusEl?.setText(`${activeFile.path} · active note only`);
		} catch (error) {
			if (!this.opened || revision !== this.revision) return;
			this.clearTriples();
			const message = error instanceof Error ? error.message : String(error);
			this.statusEl?.setText(`Could not read relationships: ${message}`);
		}
	}

	private clearTriples(): void {
		this.triples = [];
		this.anchor = null;
		this.populatePredicateFilter();
		this.graph?.clear();
	}

	private applyFilter(): void {
		if (!this.anchor) { this.graph?.clear(); return; }
		this.graph?.setGraph(this.anchor.path, this.triples, this.app.vault.getMarkdownFiles().map(file => file.path), {
			predicate: this.activePredicate, showSources: this.showSources,
			showInferred: this.showInferred, query: this.query,
		});
	}

	private populatePredicateFilter(): void {
		if (!this.filterSelect) return;
		const predicates = Array.from(new Set(this.triples.filter(triple => triple.predicate !== 'rdf:type'
			&& (this.showSources || triple.predicate !== 'source') && (this.showInferred || !triple.inferred))
			.map(triple => triple.predicate))).sort();
		if (this.triples.length > 0 && this.activePredicate && !predicates.includes(this.activePredicate)) this.activePredicate = null;
		this.filterSelect.empty();
		this.filterSelect.createEl('option', { text: 'All relationships', value: '' });
		for (const predicate of predicates) this.filterSelect.createEl('option', { text: predicate.replace(/_/g, ' '), value: predicate });
		this.filterSelect.value = this.activePredicate ?? '';
	}

	private async openNote(id: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(id);
		if (!(file instanceof TFile)) return;
		try {
			await this.app.workspace.openLinkText(file.path, this.anchor?.path ?? '', false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not open note: ${message}`);
		}
	}

	async onClose(): Promise<void> {
		this.opened = false;
		this.revision++;
		this.clearTriples();
		this.graph?.unload();
	}
}
