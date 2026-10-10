/**
 * TripleExtractor.ts
 *
 * Parses an Obsidian note into typed S-P-O triples.
 *
 * Sources of triples:
 *   1. YAML frontmatter  → rdf:type from fileClass, source edges from source_ids
 *   2. Breadcrumbs-style inline fields in `## Connections`
 *      (source, requires, enables, related_to, up, down, same, next, prev)
 *   3. Wikilinks in the note body  → inferred links_to triples
 */

import { App, MetadataCache, TFile, Vault } from 'obsidian';
import { Triple, mergeDuplicates } from '../models/Triple';
import { Provenance, createProvenance } from '../models/Provenance';
import { SourceMap, isValidSourceId } from '../models/SourceId';
import type { ForgeSettings } from '../settings';
import { mappedFileClass } from './FolderMapping';

export interface TripleExtractorOptions {
	/** folder name → expected fileClass / node type, e.g. algorithms → algorithm */
	fileClassTypeMap?: Record<string, string>;

	/** Optional source map for resolving SRC-XXX ids. */
	sourceMap?: SourceMap;

	/** Predicate used for plain body wikilinks. */
	bodyLinkPredicate?: string;
}

/** Breadcrumbs edge fields the plugin understands as typed edges. */
const BREADCRUMB_FIELDS = new Set([
	'source',
	'requires',
	'enables',
	'related_to',
	'up',
	'down',
	'same',
	'next',
	'prev',
]);

const MULTI_VALUE_SEP = /[,·|]/;

export class TripleExtractor {
	private readonly bodyLinkPredicate: string;
	private readonly fileClassTypeMap: Record<string, string>;

	constructor(
		private vault: Vault,
		private metadataCache: MetadataCache,
		private options: TripleExtractorOptions = {}
	) {
		this.bodyLinkPredicate = options.bodyLinkPredicate ?? 'links_to';
		this.fileClassTypeMap = options.fileClassTypeMap ?? {
			algorithms: 'algorithm',
			books: 'book',
			concepts: 'concept',
			papers: 'paper',
		};
	}

	/**
	 * Extract triples from a single note.
	 *
	 * The returned array is deduplicated by (s,p,o), keeping the most
	 * confident version of each triple.
	 */
	async extract(file: TFile): Promise<Triple[]> {
		const cache = this.metadataCache.getFileCache(file);
		const content = await this.vault.cachedRead(file);
		const subject = file.path;
		const baseProv = createProvenance(file.path, {
			confidence: 0.9,
			lineage: [file.path],
		});

		const triples: Triple[] = [];

		// 1. Frontmatter-derived triples.
		const frontmatter = cache?.frontmatter ?? {};
		triples.push(...this.extractFrontmatterTriples(subject, frontmatter, baseProv));
		if (typeof frontmatter.fileClass !== 'string' || !frontmatter.fileClass.trim()) {
			const type = mappedFileClass(file.path, this.fileClassTypeMap);
			if (type) triples.push(new Triple(subject, 'rdf:type', type,
				createProvenance(file.path, {
					confidence: 0.85,
					lineage: [file.path, 'inferred:folder-mapping'],
				}), true));
		}

		// 2. Breadcrumbs inline fields in the Connections section.
		const prose = stripInlineCode(stripCodeFences(stripFrontmatter(content)));
		const connections = parseConnectionsSection(prose);
		triples.push(...this.extractConnectionTriples(subject, connections, baseProv));

		// 3. Body wikilinks (exclude code fences, frontmatter and the
		//    Connections section so explicit breadcrumbs are not duplicated).
		const bodyText = removeConnectionsSection(prose);
		triples.push(...this.extractBodyLinkTriples(subject, bodyText, baseProv));

		return mergeDuplicates(triples);
	}

	/**
	 * Convenience used by commands and UI: instantiate an extractor from settings
	 * and extract triples from a single file.
	 */
	static async extractFromFile(
		file: TFile,
		app: App,
		sourceMap: SourceMap,
		settings: ForgeSettings
	): Promise<Triple[]> {
		const extractor = new TripleExtractor(app.vault, app.metadataCache, {
			fileClassTypeMap: settings.fileClassMappings,
			sourceMap,
		});
		return extractor.extract(file);
	}

	/**
	 * Resolve a raw source value to a note identifier.
	 * If it looks like a SRC id and is in the source map, return the map target.
	 */
	resolveSource(value: string, sourcePath = ''): string {
		const trimmed = value.trim();
		if (isValidSourceId(trimmed) && this.options.sourceMap?.has(trimmed)) {
			return this.resolveLink(this.options.sourceMap.get(trimmed)!,
				this.options.sourceMap.sourcePath ?? sourcePath);
		}
		return isValidSourceId(trimmed) ? trimmed : this.resolveLink(trimmed, sourcePath);
	}

	/** Resolve a note link in its owning note's context, preserving missing targets. */
	private resolveLink(value: string, sourcePath: string): string {
		const trimmed = value.trim();
		const link = trimmed.startsWith('[[') && trimmed.endsWith(']]')
			? trimmed.slice(2, -2) : trimmed;
		const target = link.split('|')[0].trim();
		const path = target.split('#')[0];
		if (!path && target.startsWith('#')) return sourcePath || target;
		return this.metadataCache.getFirstLinkpathDest(path, sourcePath)?.path ?? target;
	}

	private extractFrontmatterTriples(
		subject: string,
		frontmatter: Record<string, unknown>,
		baseProv: Provenance
	): Triple[] {
		const out: Triple[] = [];

		// fileClass → rdf:type edge.
		if (typeof frontmatter.fileClass === 'string' && frontmatter.fileClass.trim()) {
			out.push(
				new Triple(
					subject,
					'rdf:type',
					frontmatter.fileClass.trim(),
					createProvenance(baseProv.source, {
						confidence: 1.0,
						lineage: [...baseProv.lineage, 'frontmatter:fileClass'],
					})
				)
			);
		}

		// source_ids → source edges.
		if (Array.isArray(frontmatter.source_ids)) {
			for (const raw of frontmatter.source_ids) {
				if (typeof raw !== 'string') continue;
				if (!raw.trim()) continue;
				const resolved = this.resolveSource(raw, baseProv.source);
				out.push(
					new Triple(
						subject,
						'source',
						resolved,
						createProvenance(baseProv.source, {
							confidence: 0.95,
							lineage: [...baseProv.lineage, `frontmatter:source_id:${raw}`],
						})
					)
				);
			}
		}

		return out;
	}

	private extractConnectionTriples(
		subject: string,
		connections: Record<string, string[]>,
		baseProv: Provenance
	): Triple[] {
		const out: Triple[] = [];
		for (const [field, values] of Object.entries(connections)) {
			for (const raw of values) {
				const object = field === 'source'
					? this.resolveSource(raw, baseProv.source) : this.resolveLink(raw, baseProv.source);
				out.push(
					new Triple(
						subject,
						field,
						object,
						createProvenance(baseProv.source, {
							confidence: 0.95,
							lineage: [...baseProv.lineage, `connection:${field}`],
						})
					)
				);
			}
		}
		return out;
	}

	private extractBodyLinkTriples(
		subject: string,
		bodyText: string,
		baseProv: Provenance
	): Triple[] {
		const targets = extractWikilinks(bodyText);
		const seen = new Set<string>();
		const out: Triple[] = [];
		for (const raw of targets) {
			const target = this.resolveLink(raw, baseProv.source);
			if (seen.has(target)) continue;
			seen.add(target);
			out.push(
				new Triple(
					subject,
					this.bodyLinkPredicate,
					target,
					createProvenance(baseProv.source, {
						confidence: 0.6,
						lineage: [...baseProv.lineage, 'inferred:wikilink'],
					}),
					true
				)
			);
		}
		return out;
	}
}

/**
 * Parse the `## Connections` section into field-name → values.
 * Parsing stops at the next Markdown heading.
 */
function parseConnectionsSection(text: string): Record<string, string[]> {
	const sectionMatch = /^## Connections\s*$/im.exec(text);
	if (!sectionMatch) return {};

	const start = sectionMatch.index + sectionMatch[0].length;
	const rest = text.slice(start);
	const nextHeading = rest.search(/^#{1,6}\s/im);
	const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

	const result: Record<string, string[]> = {};
	for (const rawLine of section.split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('>')) continue;

		const inline = line.match(/^\s*([a-zA-Z0-9_]+)::\s*(.*)$/);
		if (!inline) continue;

		const key = inline[1].toLowerCase();
		if (!BREADCRUMB_FIELDS.has(key)) continue;

		result[key] = (result[key] ?? []).concat(extractValues(inline[2]));
	}
	return result;
}

/** Pull wikilink targets from text, ignoring display aliases. */
function extractWikilinks(text: string): string[] {
	const re = /\[\[(.*?)\]\]/g;
	const out: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		const target = match[1].split('|')[0].trim();
		if (target) out.push(target);
	}
	return out;
}

/** Split a raw value string into individual target identifiers. */
function extractValues(raw: string): string[] {
	const text = raw.trim();
	if (!text) return [];
	const links = extractWikilinks(text);
	const values = text.replace(/\[\[.*?\]\]/g, '')
		.split(MULTI_VALUE_SEP)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return links.concat(values);
}

/** Remove fenced code blocks so we do not extract links from examples. */
function stripCodeFences(text: string): string {
	let fence: { marker: string; length: number } | undefined;
	return text.split('\n').map((line) => {
		const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (delimiter && delimiter[1][0] === fence.marker
				&& delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
			return '';
		}
		if (delimiter) {
			fence = { marker: delimiter[1][0], length: delimiter[1].length };
			return '';
		}
		return line;
	}).join('\n');
}

/** Backtick spans may use any matching run length and can cross line breaks. */
function stripInlineCode(text: string): string {
	return text.replace(/(?<!`)(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/g,
		(span) => span.replace(/[^\n]/g, ' '));
}

/** Remove the YAML frontmatter block at the top of a note. */
function stripFrontmatter(text: string): string {
	return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
}

/** Remove the Connections section so its explicit links are not re-inferred. */
function removeConnectionsSection(text: string): string {
	const match = /^## Connections\s*$/im.exec(text);
	if (!match) return text;
	const start = match.index;
	const rest = text.slice(start + match[0].length);
	const nextHeading = rest.search(/^#{1,6}\s/im);
	const end = nextHeading === -1 ? text.length : start + match[0].length + nextHeading;
	return text.slice(0, start) + text.slice(end);
}
