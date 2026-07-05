/**
 * SourceId.ts
 *
 * Source identifiers such as SRC-003 are resolved through the vault's
 * source map (usually papers/index.md). This module parses and exposes
 * that mapping.
 */

export type SourceId = string;

export interface SourceMap {
	/** Resolve a source id to its canonical note identifier (basename, no .md). */
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
 * Target File with the .md extension removed.
 */
export function parseSourceMap(content: string): SourceMap {
	const map = new Map<SourceId, string>();
	let inTable = false;

	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (!line.startsWith('|')) {
			// A non-table line resets parsing once we have entered the table.
			if (inTable && line.length > 0) break;
			continue;
		}

		const cells = line
			.split('|')
			.map((c) => c.trim())
			.filter((c) => c.length > 0);

		if (!inTable) {
			if (cells.length >= 3 && cells[0].toLowerCase().includes('source id')) {
				inTable = true;
			}
			continue;
		}

		// Separator row.
		if (cells.every((c) => /^[-:\s]+$/.test(c))) {
			continue;
		}

		if (cells.length >= 4) {
			const id = cells[0];
			const targetFile = cells[2];
			const wikilinkCell = cells[3];

			const linkMatch = wikilinkCell.match(/\[\[(.*?)\]\]/);
			const target = linkMatch
				? linkMatch[1].split('|')[0].trim()
				: targetFile.replace(/\.md$/i, '');

			if (id && target) {
				map.set(id, target);
			}
		}
	}

	return {
		get: (id) => map.get(id),
		has: (id) => map.has(id),
		ids: () => Array.from(map.keys()),
		entries: () => Array.from(map.entries()),
	};
}
