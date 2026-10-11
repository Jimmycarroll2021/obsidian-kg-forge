import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { GraphNeighbourhood } from '../engine/GraphNeighbourhood';
import { getSourceFiles } from '../engine/VaultFiles';
import type { Triple } from '../models/Triple';
import { FocusedGraph, type FocusedGraphState } from './components/FocusedGraph';
import { VIEW_TYPE_KG_GRAPH, type PluginWithSettings } from './types';

interface GraphLocation {
	path: string;
	predicate: string | null;
	query: string;
	showSources: boolean;
	showInferred: boolean;
	incomingLimit: number;
	graph: FocusedGraphState;
}
const EMPTY_GRAPH_STATE: FocusedGraphState = { page: 0, selectedId: null, evidencePage: 0 };
const HISTORY_LIMIT = 50;

/** A bounded note map with independent exploration and optional editor following. */
export class KnowledgeGraphView extends ItemView {
	private graph: FocusedGraph | null = null;
	private triples: Triple[] = [];
	private anchor: TFile | null = null;
	private activePredicate: string | null = null;
	private showSources = false;
	private showInferred = false;
	private query = '';
	private focusPath: string | null = null;
	private followActive = true;
	private backHistory: GraphLocation[] = [];
	private forwardHistory: GraphLocation[] = [];
	private pendingGraphState: FocusedGraphState | undefined;
	private backButton: HTMLButtonElement | null = null;
	private forwardButton: HTMLButtonElement | null = null;
	private refreshButton: HTMLButtonElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private followCheckbox: HTMLInputElement | null = null;
	private sourcesCheckbox: HTMLInputElement | null = null;
	private inferredCheckbox: HTMLInputElement | null = null;
	private filterSelect: HTMLSelectElement | null = null;
	private statusEl: HTMLElement | null = null;
	private revision = 0;
	private opened = false;
	private neighbourhood: GraphNeighbourhood;
	private incomingLimit = 100;
	private incomingPaths = new Set<string>();
	private moreIncoming: HTMLButtonElement | null = null;
	private refreshTimer: number | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: PluginWithSettings) {
		super(leaf);
		this.neighbourhood = new GraphNeighbourhood(this.app, plugin.settings);
	}
	getViewType(): string { return VIEW_TYPE_KG_GRAPH; }
	getDisplayText(): string { return 'Knowledge forge graph'; }

	async onOpen(): Promise<void> {
		this.opened = true;
		if (this.followActive) this.focusPath = this.app.workspace.getActiveFile()?.path ?? null;
		this.contentEl.empty();
		this.contentEl.addClass('kg-knowledge-graph-view');
		this.contentEl.createEl('h4', { text: 'Relationships', cls: 'kg-view-title' });
		this.contentEl.createEl('p', {
			text: 'Select a neighbour to inspect its evidence, or centre it here to explore without changing the editor.',
			cls: 'setting-item-description',
		});
		const navigation = this.contentEl.createDiv({ cls: 'kg-graph-navigation' });
		this.backButton = navigation.createEl('button', { text: 'Graph back', cls: 'kg-button' });
		this.forwardButton = navigation.createEl('button', { text: 'Graph forward', cls: 'kg-button' });
		this.backButton.addEventListener('click', () => this.navigateHistory('back'));
		this.forwardButton.addEventListener('click', () => this.navigateHistory('forward'));
		this.followCheckbox = this.addVisibilityToggle(navigation, 'Follow active note', this.followActive, value => {
			this.followActive = value;
			if (value) this.followEditor();
			else this.applyFilter(this.graph?.getState());
		});
		this.updateNavigation();
		const controls = this.contentEl.createDiv({ cls: 'kg-graph-controls' });
		this.refreshButton = controls.createEl('button', { text: 'Refresh', cls: 'kg-button' });
		this.refreshButton.addEventListener('click', () => { this.neighbourhood.invalidate(); void this.refresh(); });
		this.filterSelect = controls.createEl('select', { cls: 'kg-filter-select' });
		this.filterSelect.setAttribute('aria-label', 'Filter graph predicate');
		this.filterSelect.addEventListener('change', () => {
			this.activePredicate = this.filterSelect?.value || null;
			this.applyFilter();
		});
		const search = controls.createEl('input', { cls: 'kg-graph-search', attr: { type: 'search', placeholder: 'Find a neighbour…' } });
		this.searchInput = search;
		search.value = this.query;
		search.setAttribute('aria-label', 'Find a graph neighbour');
		search.addEventListener('input', () => { this.query = search.value; this.applyFilter(); });
		const toggles = this.contentEl.createDiv({ cls: 'kg-graph-toggles' });
		this.sourcesCheckbox = this.addVisibilityToggle(toggles, 'Show sources', this.showSources, value => {
			this.showSources = value; this.populatePredicateFilter(); this.applyFilter();
		});
		this.inferredCheckbox = this.addVisibilityToggle(toggles, 'Show inferred links', this.showInferred, value => {
			this.showInferred = value; this.populatePredicateFilter(); this.applyFilter();
		});
		this.populatePredicateFilter();
		this.statusEl = this.contentEl.createDiv({ cls: 'kg-workflow-status' });
		this.statusEl.setAttribute('role', 'status');
		this.statusEl.title = 'Incoming links use Obsidian’s resolved-link index. Plain source identifiers are not indexed note links.';
		this.moreIncoming = this.contentEl.createEl('button', { text: 'Load more incoming notes', cls: 'kg-button' });
		this.moreIncoming.hidden = true;
		this.moreIncoming.addEventListener('click', () => { this.incomingLimit += 100; void this.refresh(); });
		this.graph = new FocusedGraph(this.contentEl.createDiv({ cls: 'kg-graph-content' }), {
			canOpenNote: id => this.isSourceNote(id),
			onOpenNote: id => this.openNote(id),
			onCentreNote: id => this.centreNote(id),
			getAnchorLabel: () => this.followActive ? 'Active note' : 'Graph centre',
		});
		this.addChild(this.graph);
		this.registerEvent(this.app.workspace.on('file-open', () => { if (this.followActive) this.followEditor(); }));
		this.registerEvent(this.app.metadataCache.on('changed', file => {
			this.neighbourhood.invalidate(file.path);
			if (this.isRelevant(file.path)) this.scheduleRefresh();
		}));
		this.registerEvent(this.app.metadataCache.on('resolve', file => {
			this.neighbourhood.invalidate(file.path);
			if (this.isRelevant(file.path)) this.scheduleRefresh();
		}));
		this.registerEvent(this.app.metadataCache.on('resolved', () => this.scheduleRefresh()));
		this.registerEvent(this.app.metadataCache.on('deleted', file => {
			this.neighbourhood.invalidate(file.path); this.scheduleRefresh();
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			this.renameLocation(oldPath, file.path);
			this.neighbourhood.invalidate(); this.scheduleRefresh();
		}));
		this.registerEvent(this.app.vault.on('delete', file => {
			this.neighbourhood.invalidate(file instanceof TFile ? file.path : undefined);
			const survives = (location: GraphLocation) => location.path !== file.path && !location.path.startsWith(file.path + '/');
			this.backHistory = this.backHistory.filter(survives);
			this.forwardHistory = this.forwardHistory.filter(survives);
			this.updateNavigation();
			this.scheduleRefresh();
		}));
		await this.refresh();
	}

	private isRelevant(path: string): boolean {
		const active = this.focusPath;
		return path === active || path === this.plugin.settings.sourceMapPath || this.incomingPaths.has(path)
			|| Boolean(active && this.app.metadataCache.resolvedLinks?.[path]?.[active]);
	}

	private scheduleRefresh(): void {
		if (!this.opened) return;
		this.revision++;
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => { this.refreshTimer = null; void this.refresh(); }, 40);
	}

	private addVisibilityToggle(container: HTMLElement, name: string, checked: boolean, change: (value: boolean) => void): HTMLInputElement {
		const label = container.createEl('label', { cls: 'kg-graph-toggle' });
		const checkbox = label.createEl('input', { attr: { type: 'checkbox' } });
		checkbox.checked = checked;
		label.createSpan({ text: name });
		checkbox.addEventListener('change', () => change(checkbox.checked));
		return checkbox;
	}

	private isSourceNote(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) instanceof TFile
			&& getSourceFiles(this.app.vault, this.plugin.settings.cacheFolder).some(file => file.path === path);
	}

	private captureLocation(): GraphLocation | null {
		if (!this.focusPath) return null;
		return {
			path: this.focusPath, predicate: this.activePredicate, query: this.query,
			showSources: this.showSources, showInferred: this.showInferred, incomingLimit: this.incomingLimit,
			graph: { ...(this.pendingGraphState ?? this.graph?.getState() ?? EMPTY_GRAPH_STATE) },
		};
	}

	private restoreLocation(location: GraphLocation): void {
		this.focusPath = location.path;
		this.activePredicate = location.predicate;
		this.query = location.query;
		this.showSources = location.showSources;
		this.showInferred = location.showInferred;
		this.incomingLimit = location.incomingLimit;
		this.pendingGraphState = { ...location.graph };
		if (this.searchInput) this.searchInput.value = this.query;
		if (this.sourcesCheckbox) this.sourcesCheckbox.checked = this.showSources;
		if (this.inferredCheckbox) this.inferredCheckbox.checked = this.showInferred;
	}

	private centreNote(path: string): void {
		if (!this.opened || !this.isSourceNote(path) || path === this.focusPath) return;
		const previous = this.captureLocation();
		if (previous) this.backHistory.push(previous);
		this.forwardHistory = [];
		this.trimHistory();
		this.followActive = false;
		this.restoreLocation({ path, predicate: null, query: '', showSources: this.showSources,
			showInferred: this.showInferred, incomingLimit: 100, graph: EMPTY_GRAPH_STATE });
		this.updateNavigation();
		void this.refresh();
		this.focusNavigation('back');
	}

	private navigateHistory(direction: 'back' | 'forward'): void {
		const source = direction === 'back' ? this.backHistory : this.forwardHistory;
		let destination = source.pop();
		while (destination && !this.isSourceNote(destination.path)) destination = source.pop();
		if (!destination) { this.updateNavigation(); this.focusNavigation(direction); return; }
		const current = this.captureLocation();
		if (current && this.isSourceNote(current.path)) {
			(direction === 'back' ? this.forwardHistory : this.backHistory).push(current);
		}
		this.trimHistory();
		this.followActive = false;
		this.restoreLocation(destination);
		this.updateNavigation();
		void this.refresh();
		this.focusNavigation(direction);
	}

	private trimHistory(): void {
		while (this.backHistory.length + this.forwardHistory.length > HISTORY_LIMIT) {
			if (this.backHistory.length > this.forwardHistory.length) this.backHistory.shift();
			else this.forwardHistory.shift();
		}
	}

	private updateNavigation(): void {
		if (this.backButton) this.backButton.disabled = this.backHistory.length === 0;
		if (this.forwardButton) this.forwardButton.disabled = this.forwardHistory.length === 0;
		if (this.followCheckbox) this.followCheckbox.checked = this.followActive;
	}

	private focusNavigation(direction: 'back' | 'forward'): void {
		const preferred = direction === 'back' ? this.backButton : this.forwardButton;
		const fallback = direction === 'back' ? this.forwardButton : this.backButton;
		(preferred && !preferred.disabled ? preferred : fallback && !fallback.disabled ? fallback : this.refreshButton)
			?.focus({ preventScroll: true });
	}

	private followEditor(): void {
		this.focusPath = this.app.workspace.getActiveFile()?.path ?? null;
		this.incomingLimit = 100;
		this.backHistory = [];
		this.forwardHistory = [];
		this.pendingGraphState = { ...EMPTY_GRAPH_STATE };
		this.updateNavigation();
		void this.refresh();
	}

	private renameLocation(oldPath: string, newPath: string): void {
		const remap = (path: string): string => path === oldPath ? newPath
			: path.startsWith(oldPath + '/') ? newPath + path.slice(oldPath.length) : path;
		const renameState = (state: FocusedGraphState): void => {
			if (state.selectedId) state.selectedId = remap(state.selectedId);
		};
		for (const location of [...this.backHistory, ...this.forwardHistory]) {
			location.path = remap(location.path);
			renameState(location.graph);
		}
		if (!this.pendingGraphState && this.anchor) this.pendingGraphState = this.graph?.getState();
		if (this.pendingGraphState) renameState(this.pendingGraphState);
		if (this.focusPath) this.focusPath = remap(this.focusPath);
	}

	async refresh(): Promise<void> {
		if (!this.opened) return;
		const revision = ++this.revision;
		const path = this.focusPath;
		const activeFile = path ? this.app.vault.getAbstractFileByPath(path) : null;
		if (!this.pendingGraphState && this.anchor?.path === path) this.pendingGraphState = this.graph?.getState();
		this.clearTriples();
		try {
			if (!(activeFile instanceof TFile) || !path || !this.isSourceNote(path)) {
				this.pendingGraphState = undefined;
				this.statusEl?.setText(this.followActive ? 'Open a source Markdown note to inspect its relationships.'
					: 'The graph centre is no longer an available source note. Use Graph back or Follow active note.');
				return;
			}
			this.statusEl?.setText(`Reading ${activeFile.path}…`);
			const isCurrent = () => this.opened && revision === this.revision
				&& this.focusPath === path && activeFile.path === path
				&& this.app.vault.getAbstractFileByPath(path) === activeFile;
			const result = await this.neighbourhood.load(activeFile, { incomingLimit: this.incomingLimit, isCurrent });
			if (!isCurrent()) return;
			if (result.cancelled) { this.scheduleRefresh(); return; }
			this.anchor = activeFile;
			this.triples = result.triples;
			this.incomingPaths = new Set(result.incomingPaths);
			this.populatePredicateFilter();
			this.applyFilter(this.pendingGraphState);
			this.statusEl?.setText(`${activeFile.path} · Incoming: ${result.incomingRead} of ${result.incomingCandidates} indexed notes loaded${result.failedPaths.length ? ` · ${result.failedPaths.length} could not be read; partial map` : ''}`);
			if (this.moreIncoming) this.moreIncoming.hidden = this.incomingLimit >= result.incomingCandidates;
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
		if (this.moreIncoming) this.moreIncoming.hidden = true;
		this.populatePredicateFilter();
		this.graph?.clear();
	}

	private applyFilter(restore?: FocusedGraphState): void {
		this.pendingGraphState = restore;
		if (!this.anchor) { this.graph?.clear(); return; }
		this.graph?.setGraph(this.anchor.path, this.triples, this.app.vault.getMarkdownFiles().map(file => file.path), {
			predicate: this.activePredicate, showSources: this.showSources,
			showInferred: this.showInferred, query: this.query,
		}, restore);
		this.pendingGraphState = undefined;
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
		if (!(file instanceof TFile) || !this.isSourceNote(id)) return;
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
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = null;
		this.neighbourhood.invalidate();
		this.clearTriples();
		this.graph?.unload();
	}
}
