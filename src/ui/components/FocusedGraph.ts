import { Component } from 'obsidian';
import type { Triple } from '../../models/Triple';
import { projectGraph, type GraphNode, type GraphDisplayOptions } from '../graphModel';

interface FocusedGraphActions {
	canOpenNote: (id: string) => boolean;
	onOpenNote: (id: string) => void | Promise<void>;
	onCentreNote?: (id: string) => void | Promise<void>;
	getAnchorLabel?: () => string;
}

export interface FocusedGraphState {
	page: number;
	selectedId: string | null;
	evidencePage: number;
}

const EVIDENCE_PAGE_SIZE = 8;

/** Deterministic, paged hub map: one note, a few neighbours, selected evidence. */
export class FocusedGraph extends Component {
	private anchorPath = '';
	private triples: Triple[] = [];
	private knownNotePaths: string[] = [];
	private options: GraphDisplayOptions = {};
	private page = 0;
	private selectedId: string | null = null;
	private evidencePage = 0;

	constructor(private container: HTMLElement, private actions: FocusedGraphActions) { super(); }

	setGraph(anchorPath: string, triples: Triple[], knownNotePaths: Iterable<string>, options: GraphDisplayOptions,
		restore?: FocusedGraphState): void {
		this.anchorPath = anchorPath;
		this.triples = triples;
		this.knownNotePaths = Array.from(knownNotePaths);
		this.options = options;
		this.page = restore?.page ?? 0;
		this.selectedId = restore?.selectedId ?? null;
		this.evidencePage = restore?.evidencePage ?? 0;
		this.render();
	}

	getState(): FocusedGraphState {
		return { page: this.page, selectedId: this.selectedId, evidencePage: this.evidencePage };
	}

	clear(): void {
		this.anchorPath = '';
		this.triples = [];
		this.selectedId = null;
		this.container.empty();
	}

	private render(): void {
		this.container.empty();
		if (!this.anchorPath) return;
		const projection = projectGraph(this.anchorPath, this.triples, this.knownNotePaths, {
			...this.options, page: this.page, pageSize: 12,
		});
		this.page = projection.page;
		if (!projection.nodes.some(node => node.id === this.selectedId)) this.selectedId = null;
		const counts = projection.counts;
		const summary = this.container.createDiv({ cls: 'kg-map-summary' });
		summary.setAttribute('role', 'status');
		summary.createSpan({ text: `${counts.shown} of ${counts.matching} matching neighbours`, cls: 'kg-map-count' });
		if (counts.offPage > 0) summary.createSpan({ text: ` · ${counts.offPage} on other pages` });
		if (counts.filtered > 0) summary.createSpan({ text: ` · ${counts.filtered} filtered out` });
		const hidden = [
			counts.hiddenType > 0 ? `${counts.hiddenType} class facts` : '',
			counts.hiddenSources > 0 ? `${counts.hiddenSources} source facts` : '',
			counts.hiddenInferred > 0 ? `${counts.hiddenInferred} inferred links` : '',
			counts.hiddenSelf > 0 ? `${counts.hiddenSelf} self-links` : '',
		].filter(Boolean);
		if (hidden.length > 0) summary.createDiv({ text: `Hidden from the map: ${hidden.join(' · ')}`, cls: 'kg-map-hidden' });

		const map = this.container.createDiv({ cls: 'kg-focused-map' });
		map.setAttribute('aria-label', 'Note relationship map');
		const anchor = map.createDiv({ cls: 'kg-map-anchor', attr: { 'data-note-id': projection.anchor.id } });
		anchor.createDiv({ text: this.actions.getAnchorLabel?.() ?? 'Active note', cls: 'kg-map-eyebrow' });
		anchor.createEl('h5', { text: projection.anchor.label, cls: 'kg-map-anchor-title' });
		anchor.createDiv({ text: this.anchorPath, cls: 'kg-map-anchor-path' });
		if (projection.anchor.types.length > 0) {
			const badges = anchor.createDiv({ cls: 'kg-map-types' });
			for (const type of projection.anchor.types.slice(0, 3)) badges.createSpan({ text: type, cls: 'kg-map-type' });
			if (projection.anchor.types.length > 3) badges.createSpan({ text: `+${projection.anchor.types.length - 3} classes`, cls: 'kg-map-type' });
		}
		const branches = map.createDiv({ cls: 'kg-map-branches' });
		if (projection.nodes.length === 0) {
			branches.createDiv({
				text: counts.total > 0
					? 'No neighbours match this view. Clear the search or filters, or show sources and inferred links.'
					: 'No explicit relationships yet. Add typed links in a Connections section, or show inferred links.',
				cls: 'kg-empty-state',
			});
		}
		for (const node of projection.nodes) this.renderNode(branches, node);
		if (projection.pageCount > 1) {
			this.renderPager(this.container, `Neighbours ${projection.page + 1} / ${projection.pageCount}`,
				projection.page, projection.pageCount, next => {
					this.page = next; this.selectedId = null; this.evidencePage = 0; this.render();
				}, 'kg-map-pager');
		}
		const details = this.container.createDiv({ cls: 'kg-map-details' });
		const selected = projection.nodes.find(node => node.id === this.selectedId);
		if (selected) this.renderDetails(details, selected);
		else details.createDiv({ text: 'Select a neighbour to inspect its relationship and source evidence.', cls: 'kg-map-selection-hint' });
	}

	private renderNode(container: HTMLElement, node: GraphNode): void {
		const branch = container.createDiv({ cls: 'kg-map-branch' });
		const relation = branch.createDiv({ cls: 'kg-map-relations' });
		for (const edge of node.relations.slice(0, 2)) {
			relation.createSpan({
				text: `${edge.direction === 'incoming' ? '←' : '→'} ${edge.predicate.replace(/_/g, ' ')}`,
				cls: 'kg-map-relation',
			});
		}
		if (node.relations.length > 2) relation.createSpan({ text: `+${node.relations.length - 2} relationships`, cls: 'kg-map-relation-more' });
		const button = branch.createEl('button', { cls: 'kg-map-node', attr: { 'data-note-id': node.id } });
		button.setAttribute('aria-pressed', String(this.selectedId === node.id));
		button.setAttribute('aria-label', `Inspect ${node.id}`);
		button.title = node.id;
		button.createSpan({ text: node.label, cls: 'kg-map-node-name' });
		if (node.context) button.createSpan({ text: node.context, cls: 'kg-map-node-context' });
		if (!node.resolved) button.createSpan({ text: 'Unresolved', cls: 'kg-map-unresolved' });
		button.addEventListener('click', () => {
			this.selectedId = node.id; this.evidencePage = 0; this.render();
			const selectedButton = Array.from(this.container.querySelectorAll<HTMLButtonElement>('.kg-map-node'))
				.find(element => element.dataset.noteId === node.id);
			selectedButton?.focus();
		});
	}

	private renderDetails(container: HTMLElement, node: GraphNode): void {
		const header = container.createDiv({ cls: 'kg-map-detail-header' });
		header.createEl('h5', { text: node.label });
		const open = header.createEl('button', { text: 'Open note', cls: 'kg-button' });
		open.disabled = !node.resolved || !this.actions.canOpenNote(node.id);
		open.addEventListener('click', () => { void this.actions.onOpenNote(node.id); });
		if (this.actions.onCentreNote) {
			const centre = header.createEl('button', { text: 'Centre in graph', cls: 'kg-button' });
			centre.disabled = !node.resolved || !this.actions.canOpenNote(node.id);
			centre.addEventListener('click', () => { void this.actions.onCentreNote?.(node.id); });
		}
		container.createDiv({ text: node.id, cls: 'kg-map-detail-path' });
		if (!node.resolved) container.createDiv({ text: 'This target has no matching note in the vault.', cls: 'kg-map-selection-hint' });
		const evidence = node.relations.flatMap(relation => relation.triples.map(triple => ({ relation, triple })));
		const pageCount = Math.max(1, Math.ceil(evidence.length / EVIDENCE_PAGE_SIZE));
		this.evidencePage = Math.min(this.evidencePage, pageCount - 1);
		container.createDiv({ text: `${evidence.length} relationship facts · evidence ${this.evidencePage + 1} / ${pageCount}`, cls: 'kg-map-evidence-summary' });
		const list = container.createEl('ul', { cls: 'kg-map-evidence' });
		const anchorLabel = this.actions.getAnchorLabel?.() ?? 'Active note';
		for (const { relation, triple } of evidence.slice(this.evidencePage * EVIDENCE_PAGE_SIZE, (this.evidencePage + 1) * EVIDENCE_PAGE_SIZE)) {
			const row = list.createEl('li');
			row.createDiv({
				text: relation.direction === 'incoming'
					? `${node.label} → ${triple.predicate.replace(/_/g, ' ')} → ${anchorLabel.toLowerCase()}`
					: `${anchorLabel} → ${triple.predicate.replace(/_/g, ' ')} → ${node.label}`,
				cls: 'kg-map-evidence-fact',
			});
			row.createDiv({ text: `Source: ${triple.provenance.source}`, cls: 'kg-map-evidence-source' });
			row.createDiv({ text: `Confidence ${Math.round(triple.provenance.confidence * 100)}%${triple.inferred ? ' · Inferred from link' : ' · Explicit relationship'}`, cls: 'kg-map-evidence-meta' });
			row.createDiv({ text: `Derivation: ${triple.provenance.lineage.join(' → ')}`, cls: 'kg-map-evidence-meta' });
		}
		if (pageCount > 1) this.renderPager(container, `Evidence ${this.evidencePage + 1} / ${pageCount}`,
			this.evidencePage, pageCount, next => { this.evidencePage = next; this.render(); }, 'kg-map-evidence-pager');
	}

	private renderPager(container: HTMLElement, label: string, page: number, pageCount: number,
		change: (page: number) => void, cls: string): void {
		const activate = (nextPage: number, direction: 'Previous' | 'Next'): void => {
			change(nextPage);
			// Rendering replaces the controls. Preserve keyboard position on the
			// equivalent enabled action, or the reverse action at a page boundary.
			const controls = Array.from(this.container.querySelectorAll<HTMLButtonElement>(`.${cls} button`));
			const equivalent = controls.find(button => button.textContent === direction && !button.disabled);
			(equivalent ?? controls.find(button => !button.disabled))?.focus({ preventScroll: true });
		};
		const pager = container.createDiv({ cls: `kg-map-pagination ${cls}` });
		const previous = pager.createEl('button', { text: 'Previous', attr: { 'aria-label': `${cls === 'kg-map-pager' ? 'Neighbour' : 'Evidence'} previous page` } });
		previous.disabled = page === 0;
		previous.addEventListener('click', () => activate(page - 1, 'Previous'));
		pager.createSpan({ text: label });
		const next = pager.createEl('button', { text: 'Next', attr: { 'aria-label': `${cls === 'kg-map-pager' ? 'Neighbour' : 'Evidence'} next page` } });
		next.disabled = page >= pageCount - 1;
		next.addEventListener('click', () => activate(page + 1, 'Next'));
	}

	onunload(): void { this.clear(); }
}
