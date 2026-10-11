import type { Triple } from '../models/Triple';

export interface GraphDisplayOptions {
	showSources?: boolean;
	showInferred?: boolean;
	predicate?: string | null;
	query?: string;
	/** Zero-based page; neighbours are bounded even for very connected notes. */
	page?: number;
	pageSize?: number;
}

export interface GraphRelation {
	predicate: string;
	direction: 'outgoing' | 'incoming';
	triples: Triple[];
}

export interface GraphNode {
	id: string;
	label: string;
	/** Folder context appears when compact labels would be ambiguous. */
	context: string;
	resolved: boolean;
	relations: GraphRelation[];
}

export interface GraphProjection {
	anchor: { id: string; label: string; context: string; types: string[] };
	nodes: GraphNode[];
	predicates: string[];
	page: number;
	pageCount: number;
	pageSize: number;
	counts: {
		total: number;
		shown: number;
		matching: number;
		hiddenType: number;
		hiddenSources: number;
		hiddenInferred: number;
		hiddenSelf: number;
		filtered: number;
		offPage: number;
	};
}

const PREDICATE_ORDER = ['requires', 'enables', 'up', 'down', 'same', 'next', 'prev', 'related_to', 'source', 'links_to'];
function order(predicate: string): number {
	const index = PREDICATE_ORDER.indexOf(predicate);
	return index < 0 ? 80 : index;
}

function label(id: string): string {
	return (id.split('/').pop() ?? id).replace(/\.md$/i, '');
}
function folder(id: string): string {
	return id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : 'Vault root';
}

/** Keep canonical identities and evidence while projecting a quiet, bounded map. */
export function projectGraph(
	anchorPath: string,
	triples: Triple[],
	knownNotePaths: Iterable<string>,
	options: GraphDisplayOptions = {},
): GraphProjection {
	const known = new Set(knownNotePaths);
	const allNeighbours = new Set<string>();
	const byTarget = new Map<string, GraphNode>();
	const types = new Set<string>();
	let hiddenType = 0, hiddenSources = 0, hiddenInferred = 0, hiddenSelf = 0;
	for (const triple of triples) {
		const outgoing = triple.subject === anchorPath;
		const incoming = triple.object === anchorPath && triple.predicate !== 'rdf:type';
		if (!outgoing && !incoming) continue;
		if (triple.predicate === 'rdf:type') {
			types.add(triple.object);
			hiddenType++;
			continue;
		}
		const target = outgoing ? triple.object : triple.subject;
		if (target === anchorPath) { hiddenSelf++; continue; }
		allNeighbours.add(target);
		if (triple.predicate === 'source' && !options.showSources) { hiddenSources++; continue; }
		if (triple.inferred && !options.showInferred) { hiddenInferred++; continue; }
		const node = byTarget.get(target) ?? {
			id: target, label: label(target), context: '', resolved: known.has(target), relations: [],
		};
		const direction = outgoing ? 'outgoing' : 'incoming';
		let relation = node.relations.find(item => item.predicate === triple.predicate && item.direction === direction);
		if (!relation) { relation = { predicate: triple.predicate, direction, triples: [] }; node.relations.push(relation); }
		relation.triples.push(triple);
		byTarget.set(target, node);
	}
	// Include hidden neighbours and the anchor so names stay stable across toggles/pages.
	const sameNames = new Map<string, number>();
	for (const id of new Set([anchorPath, ...allNeighbours])) {
		const name = label(id).toLowerCase();
		sameNames.set(name, (sameNames.get(name) ?? 0) + 1);
	}
	for (const node of byTarget.values()) {
		if ((sameNames.get(node.label.toLowerCase()) ?? 0) > 1) node.context = folder(node.id);
		node.relations.sort((a, b) => order(a.predicate) - order(b.predicate) || a.predicate.localeCompare(b.predicate));
	}
	const eligible = [...byTarget.values()];
	const predicates = [...new Set(eligible.flatMap(node => node.relations.map(relation => relation.predicate)))]
		.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
	const query = options.query?.trim().toLowerCase() ?? '';
	const matching = eligible.map(node => ({
		...node,
		relations: options.predicate ? node.relations.filter(relation => relation.predicate === options.predicate) : node.relations,
	})).filter(node => node.relations.length > 0 && (!query || node.id.toLowerCase().includes(query)
		|| node.relations.some(relation => relation.predicate.toLowerCase().includes(query))));
	matching.sort((a, b) => Number(b.resolved) - Number(a.resolved)
		|| Number(a.relations.every(relation => relation.triples.every(triple => triple.inferred)))
			- Number(b.relations.every(relation => relation.triples.every(triple => triple.inferred)))
		|| order(a.relations[0].predicate) - order(b.relations[0].predicate)
		|| a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
	const pageSize = Number.isFinite(options.pageSize) ? Math.max(1, Math.min(24, Math.floor(options.pageSize!))) : 12;
	const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
	const requestedPage = Number.isFinite(options.page) ? Math.floor(options.page!) : 0;
	const page = Math.max(0, Math.min(pageCount - 1, requestedPage));
	const nodes = matching.slice(page * pageSize, (page + 1) * pageSize);
	return {
		anchor: { id: anchorPath, label: label(anchorPath), context: folder(anchorPath), types: [...types].sort() },
		nodes, predicates, page, pageCount, pageSize,
		counts: {
			total: allNeighbours.size, shown: nodes.length, matching: matching.length,
			hiddenType, hiddenSources, hiddenInferred, hiddenSelf,
			filtered: eligible.length - matching.length, offPage: matching.length - nodes.length,
		},
	};
}
