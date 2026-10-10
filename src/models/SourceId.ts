/**
 * SourceId.ts
 *
 * Source identifiers such as SRC-003 are resolved through the vault's
 * source map (usually papers/index.md). This module parses and exposes
 * that mapping.
 */

export type SourceId = string;

export interface SourceMap {
	/** Source-index path used as context when resolving relative note links. */
	readonly sourcePath?: string;

	/** Target link spelling. The extractor resolves it to a canonical vault path. */
	get(id: SourceId): string | undefined;

	/** True if the id is known. */
	has(id: SourceId): boolean;

	/** All registered source ids. */
	ids(): SourceId[];

	/** Iterate id → target entries. */
	entries(): [SourceId, string][];
}

const SOURCE_ID_RE = /^SRC-[A-Za-z0-9_-]+$/;

export function isValidSourceId(id: unknown): id is SourceId {
	return typeof id === 'string' && SOURCE_ID_RE.test(id);
}

/**
 * Parse the markdown table used in papers/index.md.
 *
 * Expected columns: | Source ID | Type | Target File | Wikilink |
 *
 * The target is taken from the Wikilink column if present, otherwise from
 * Target File. Preserve paths and extensions until the metadata cache resolves them.
 */
export function parseSourceMap(content: string, sourcePath?: string): SourceMap {
	const map = new Map<SourceId, string>();
	let columns: { id: number; file: number; link: number } | undefined;

	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (!line.includes('|')) {
			columns = undefined;
			continue;
		}

		const cells = tableCells(line);
		const headers = cells.map((cell) => cell.toLowerCase().replace(/[_-]/g, ' '));
		const idColumn = headers.findIndex((cell) => cell === 'source id');
		if (idColumn !== -1) {
			columns = {
				id: idColumn,
				file: headers.findIndex((cell) => cell === 'target file'),
				link: headers.findIndex((cell) => cell === 'wikilink'),
			};
			continue;
		}
		if (!columns) continue;

		// Separator row.
		if (cells.every((c) => /^[-:\s]+$/.test(c))) {
			continue;
		}

		const id = cells[columns.id];
		const linkMatch = cells[columns.link]?.match(/\[\[(.*?)\]\]/);
		const target = linkMatch
			? linkMatch[1].split('|')[0].trim()
			: cells[columns.file]?.trim();
		if (isValidSourceId(id) && target) map.set(id, target);
	}

	return {
		sourcePath,
		get: (id) => map.get(id),
		has: (id) => map.has(id),
		ids: () => Array.from(map.keys()),
		entries: () => Array.from(map.entries()),
	};
}

/** Table separators inside aliased wikilinks or escaped pipes are cell content. */
function tableCells(line: string): string[] {
	const cells: string[] = [];
	let cell = '';
	let inLink = false;
	for (let i = 0; i < line.length; i++) {
		if (line[i] === '\\' && line[i + 1] === '|') {
			cell += '|';
			i++;
		} else if (line.slice(i, i + 2) === '[[') {
			inLink = true;
			cell += '[[';
			i++;
		} else if (line.slice(i, i + 2) === ']]') {
			inLink = false;
			cell += ']]';
			i++;
		} else if (line[i] === '|' && !inLink) {
			cells.push(cell.trim());
			cell = '';
		} else {
			cell += line[i];
		}
	}
	cells.push(cell.trim());
	if (line.startsWith('|')) cells.shift();
	if (line.endsWith('|')) cells.pop();
	return cells;
}
