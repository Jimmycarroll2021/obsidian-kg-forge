import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { TripleExtractor } from '../engine/TripleExtractor';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import type { Triple } from '../models/Triple';
import { TripleList } from './components/TripleList';
import { VIEW_TYPE_KG_GRAPH, type PluginWithSettings } from './types';

/**
 * Leaf view that renders the typed triples around the active note.
 *
 * For the MVP this is a list view with predicate filtering; a D3 force
 * graph can be swapped in later by replacing the TripleList with a canvas.
 */
export class KnowledgeGraphView extends ItemView {
	private plugin: PluginWithSettings;
	private tripleList: TripleList | null = null;
	private triples: Triple[] = [];
	private activePredicate: string | null = null;
	private filterSelect: HTMLSelectElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: PluginWithSettings) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_KG_GRAPH;
	}

	getDisplayText(): string {
		return 'Knowledge forge graph';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('kg-knowledge-graph-view');

		this.contentEl.createEl('h4', { text: 'Knowledge forge graph', cls: 'kg-view-title' });

		const controls = this.contentEl.createDiv({ cls: 'kg-graph-controls' });
		const refreshButton = controls.createEl('button', { text: 'Refresh', cls: 'kg-button' });
		refreshButton.addEventListener('click', () => {
			void this.refresh();
		});

		controls.createSpan({ text: 'Filter predicate:', cls: 'kg-filter-label' });
		this.filterSelect = controls.createEl('select', { cls: 'kg-filter-select' });
		this.filterSelect.addEventListener('change', () => {
			this.activePredicate = this.filterSelect?.value || null;
			this.applyFilter();
		});
		this.populatePredicateFilter();

		const content = this.contentEl.createDiv({ cls: 'kg-graph-content' });
		this.tripleList = new TripleList(content, {
			onTripleClick: triple => this.onTripleClick(triple),
			emptyMessage: 'No triples found. Run "KG Forge: Extract triples from current note".',
		});
		this.addChild(this.tripleList);

		await this.refresh();
	}

	/**
	 * Re-extract triples from the active file and update the view.
	 */
	async refresh(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('Open a note to extract triples for the graph view.');
			this.tripleList?.setTriples([]);
			return;
		}

		try {
			const sourceMap = await SourceMapLoader.loadFromPath(
				this.app.vault,
				this.plugin.settings.sourceMapPath
			);
			const extractor = new TripleExtractor(this.app.vault, this.app.metadataCache, {
				fileClassTypeMap: this.plugin.settings.fileClassMappings,
				sourceMap,
			});
			this.triples = await extractor.extract(activeFile);
			this.populatePredicateFilter();
			this.applyFilter();
		} catch (error) {
			new Notice('Failed to extract triples: ' + (error as Error).message);
		}
	}

	private applyFilter(): void {
		this.tripleList?.setTriples(
			this.activePredicate
				? this.triples.filter(t => t.predicate === this.activePredicate)
				: this.triples
		);
	}

	private populatePredicateFilter(): void {
		if (!this.filterSelect) return;

		this.filterSelect.empty();
		this.filterSelect.createEl('option', { text: 'All', value: '' });

		const predicates = Array.from(new Set(this.triples.map(t => t.predicate))).sort();
		for (const predicate of predicates) {
			this.filterSelect.createEl('option', { text: predicate, value: predicate });
		}

		this.filterSelect.value = this.activePredicate ?? '';
	}

	private onTripleClick(triple: Triple): void {
		// Try to open the object as a file if it looks like an internal link.
		const targetPath = triple.object.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0];
		const file = this.app.metadataCache.getFirstLinkpathDest(targetPath, '');
		if (file) {
			void this.app.workspace.openLinkText(file.path, '', false);
		}
	}

	async onClose(): Promise<void> {
		this.tripleList?.unload();
	}
}
