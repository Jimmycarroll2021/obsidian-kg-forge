import { Component } from 'obsidian';
import type { Triple } from '../../models/Triple';

export interface TripleListOptions {
	filter?: (triple: Triple) => boolean;
	onTripleClick?: (triple: Triple) => void;
	emptyMessage?: string;
}

/** Readable canonical paths and provenance for every displayed relationship. */
export class TripleList extends Component {
	private triples: Triple[] = [];
	constructor(private container: HTMLElement, private options: TripleListOptions = {}) { super(); }

	setTriples(triples: Triple[]): void { this.triples = triples; this.render(); }

	render(): void {
		this.container.empty();
		const filtered = this.options.filter ? this.triples.filter(this.options.filter) : this.triples;
		if (filtered.length === 0) {
			this.container.createDiv({ text: this.options.emptyMessage ?? 'No triples to display.', cls: 'kg-empty-state' });
			return;
		}
		const list = this.container.createEl('ul', { cls: 'kg-triple-list' });
		for (const triple of filtered) this.renderTripleRow(list, triple);
	}

	private renderTripleRow(list: HTMLUListElement, triple: Triple): void {
		const row = list.createEl('li', { cls: 'kg-triple-item' });
		const fact = row.createDiv({ cls: 'kg-triple-fact' });
		fact.createSpan({ text: triple.subject, cls: 'kg-node kg-subject' });
		fact.createSpan({ text: ` → ${triple.predicate} → `, cls: 'kg-predicate' });
		fact.createSpan({ text: triple.object, cls: 'kg-node kg-object' });
		const provenance = row.createDiv({ cls: 'kg-provenance' });
		provenance.createSpan({ text: `Source: ${triple.provenance.source}`, cls: 'kg-source' });
		provenance.createSpan({
			text: ` · Confidence ${Math.round(triple.provenance.confidence * 100)}%`, cls: 'kg-confidence',
		});
		if (triple.inferred) provenance.createSpan({ text: ' · Inferred from link', cls: 'kg-inferred' });
		provenance.title = `Derivation: ${triple.provenance.lineage.join(' → ')}`;
		if (this.options.onTripleClick) {
			const onClick = this.options.onTripleClick;
			row.addClass('kg-clickable');
			row.tabIndex = 0;
			row.setAttribute('role', 'button');
			row.setAttribute('aria-label', `Open note for ${triple.subject}, ${triple.predicate}, ${triple.object}`);
			row.addEventListener('click', () => onClick(triple));
			row.addEventListener('keydown', event => {
				if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(triple); }
			});
		}
	}

	onunload(): void { this.container.empty(); }
}
