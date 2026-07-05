import { Component } from 'obsidian';
import type { Triple } from '../../models/Triple';

/**
 * Options for the reusable triple list component.
 */
export interface TripleListOptions {
	/** Optional filter applied before rendering. */
	filter?: (triple: Triple) => boolean;
	/** Called when a triple row is clicked. */
	onTripleClick?: (triple: Triple) => void;
	/** Message shown when the filtered list is empty. */
	emptyMessage?: string;
}

/**
 * Reusable component that renders a list of typed triples as an HTML list.
 *
 * Each row displays subject → predicate → object, plus provenance confidence
 * and an inferred badge when applicable. The component extends Obsidian's
 * Component so it can be attached as a child view and cleaned up uniformly.
 */
export class TripleList extends Component {
	private container: HTMLElement;
	private triples: Triple[] = [];
	private options: TripleListOptions;

	constructor(container: HTMLElement, options: TripleListOptions = {}) {
		super();
		this.container = container;
		this.options = options;
	}

	/**
	 * Update the data and re-render.
	 */
	setTriples(triples: Triple[]): void {
		this.triples = triples;
		this.render();
	}

	/**
	 * Re-render the list from the current triple set and filter.
	 */
	render(): void {
		this.container.empty();

		const filtered = this.options.filter
			? this.triples.filter(this.options.filter)
			: this.triples;

		if (filtered.length === 0) {
			this.container.createDiv({
				text: this.options.emptyMessage ?? 'No triples to display.',
				cls: 'kg-empty-state',
			});
			return;
		}

		const list = this.container.createEl('ul', { cls: 'kg-triple-list' });
		for (const triple of filtered) {
			this.renderTripleRow(list, triple);
		}
	}

	private renderTripleRow(list: HTMLUListElement, triple: Triple): void {
		const row = list.createEl('li', { cls: 'kg-triple-item' });

		row.createSpan({ text: triple.subject, cls: 'kg-node kg-subject' });
		row.createSpan({ text: ` ${triple.predicate} `, cls: 'kg-predicate' });
		row.createSpan({ text: triple.object, cls: 'kg-node kg-object' });

		const confidence = triple.provenance?.confidence;
		if (typeof confidence === 'number') {
			row.createSpan({
				text: ` (${Math.round(confidence * 100)}%)`,
				cls: 'kg-confidence',
			});
		}

		if (triple.inferred) {
			row.createSpan({ text: ' Inferred', cls: 'kg-inferred' });
		}

		if (this.options.onTripleClick) {
			row.addClass('kg-clickable');
			row.addEventListener('click', () => this.options.onTripleClick!(triple));
		}
	}

	onunload(): void {
		this.container.empty();
	}
}
