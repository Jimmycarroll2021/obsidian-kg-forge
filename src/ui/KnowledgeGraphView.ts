import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { TripleExtractor } from '../engine/TripleExtractor';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import { getSourceFiles } from '../engine/VaultFiles';
import type { Triple } from '../models/Triple';
import { TripleList } from './components/TripleList';
import { VIEW_TYPE_KG_GRAPH, type PluginWithSettings } from './types';

/** Traceable relationships for the active note, with a predicate filter. */
export class KnowledgeGraphView extends ItemView {
	private tripleList: TripleList | null = null;
	private triples: Triple[] = [];
	private activePredicate: string | null = null;
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
		this.contentEl.createEl('h4', { text: 'Knowledge forge graph', cls: 'kg-view-title' });
		const controls = this.contentEl.createDiv({ cls: 'kg-graph-controls' });
		const refreshButton = controls.createEl('button', { text: 'Refresh', cls: 'kg-button' });
		refreshButton.addEventListener('click', () => { void this.refresh(); });
		controls.createSpan({ text: 'Predicate:', cls: 'kg-filter-label' });
		this.filterSelect = controls.createEl('select', { cls: 'kg-filter-select' });
		this.filterSelect.setAttribute('aria-label', 'Filter graph predicate');
		this.filterSelect.addEventListener('change', () => {
			this.activePredicate = this.filterSelect?.value || null;
			this.applyFilter();
		});
		this.populatePredicateFilter();
		this.statusEl = this.contentEl.createDiv({ cls: 'kg-workflow-status' });
		this.statusEl.setAttribute('role', 'status');
		this.tripleList = new TripleList(this.contentEl.createDiv({ cls: 'kg-graph-content' }), {
			onTripleClick: triple => this.onTripleClick(triple),
			emptyMessage: 'No relationships to display for the active note.',
		});
		this.addChild(this.tripleList);
		this.registerEvent(this.app.workspace.on('file-open', () => { void this.refresh(); }));
		this.registerEvent(this.app.metadataCache.on('changed', file => {
			if (file.path === this.app.workspace.getActiveFile()?.path) void this.refresh();
		}));
		await this.refresh();
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
			this.triples = triples;
			this.populatePredicateFilter();
			this.applyFilter();
			this.statusEl?.setText(`${activeFile.path} · ${triples.length} relationships`);
		} catch (error) {
			if (!this.opened || revision !== this.revision) return;
			this.clearTriples();
			const message = error instanceof Error ? error.message : String(error);
			this.statusEl?.setText(`Could not read relationships: ${message}`);
		}
	}

	private clearTriples(): void {
		this.triples = [];
		this.populatePredicateFilter();
		this.applyFilter();
	}

	private applyFilter(): void {
		this.tripleList?.setTriples(this.activePredicate
			? this.triples.filter(triple => triple.predicate === this.activePredicate) : this.triples);
	}

	private populatePredicateFilter(): void {
		if (!this.filterSelect) return;
		const predicates = Array.from(new Set(this.triples.map(triple => triple.predicate))).sort();
		if (this.triples.length > 0 && this.activePredicate && !predicates.includes(this.activePredicate)) {
			this.activePredicate = null;
		}
		this.filterSelect.empty();
		this.filterSelect.createEl('option', { text: 'All predicates', value: '' });
		for (const predicate of predicates) this.filterSelect.createEl('option', { text: predicate, value: predicate });
		this.filterSelect.value = this.activePredicate ?? '';
	}

	private onTripleClick(triple: Triple): void {
		const targetPath = triple.predicate === 'rdf:type' ? triple.subject : triple.object;
		const canonical = this.app.vault.getAbstractFileByPath(targetPath);
		const file = canonical instanceof TFile ? canonical
			: this.app.metadataCache.getFirstLinkpathDest(targetPath, triple.provenance.source);
		const origin = this.app.vault.getAbstractFileByPath(triple.provenance.source);
		const target = file ?? (origin instanceof TFile ? origin : null);
		if (target) void this.app.workspace.openLinkText(target.path, triple.provenance.source, false);
	}

	async onClose(): Promise<void> {
		this.opened = false;
		this.revision++;
		this.clearTriples();
		this.tripleList?.unload();
	}
}
