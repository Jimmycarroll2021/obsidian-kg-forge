/**
 * TripleExtractor.ts
 *
 * Parses an Obsidian note into typed S-P-O triples.
 *
 * Sources of triples:
 *   1. YAML frontmatter  → rdf:type from fileClass, source edges from source_ids
 *   2. Breadcrumbs-style inline fields in `## Connections`
 *      (source, requires, enables, related_to, up, down, same, next, prev)
 *   3. Internal note links in prose → inferred links_to triples
 */

import { App, MetadataCache, TFile, Vault, type LinkCache } from 'obsidian';
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
		const content = await this.vault.cachedRead(file);
		const cache = this.metadataCache.getFileCache(file);
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
		const prose = maskNonProse(stripFrontmatter(content));
		const { connections, bodyText } = parseConnectionsSections(prose);
		triples.push(...this.extractConnectionTriples(subject, connections, baseProv));

		// 3. Infer unconsumed links; plain/unknown Connections lines remain prose.
		triples.push(...this.extractBodyLinkTriples(subject, bodyText, baseProv, cache?.links));

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
		baseProv: Provenance,
		cachedLinks?: LinkCache[]
	): Triple[] {
		// Native spans also cover reference-style links. Match them to the current
		// content; supplement ordinary links when metadata indexing lags a read.
		const nativeSpans: Array<{ start: number; end: number }> = [];
		const targets = (cachedLinks ?? []).flatMap(link => {
			const start = link.position.start.offset;
			const end = link.position.end.offset;
			if (isEscaped(bodyText, start) || bodyText.slice(start, end) !== link.original) return [];
			nativeSpans.push({ start, end });
			const target = internalTarget(link.link, !link.original.startsWith('[['));
			return target === null ? [] : [target];
		});
		targets.push(...extractNoteLinks(bodyText)
			.filter(link => !nativeSpans.some(span => link.start < span.end && link.end > span.start))
			.map(link => link.target)
			.filter((target): target is string => target !== null));
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
						lineage: [...baseProv.lineage, 'inferred:note-link'],
					}),
					true
				)
			);
		}
		return out;
	}
}

/**
 * Consume supported fields in each Connections section. Other lines remain
 * available for inferred links, including unsupported inline-field names.
 */
function parseConnectionsSections(text: string): {
	connections: Record<string, string[]>;
	bodyText: string;
} {
	const connections: Record<string, string[]> = {};
	let inConnections = false;
	const bodyText = text.split('\n').map(line => {
		if (/^ {0,3}#{1,6}[ \t]+/.test(line)) {
			inConnections = /^ {0,3}##[ \t]+Connections[ \t]*(?:#+[ \t]*)?$/i.test(line);
			return line;
		}
		if (!inConnections) return line;
		const inline = line.match(/^ {0,3}(?:[-*+][ \t]+)?([a-zA-Z0-9_]+)::[ \t]*(.*)$/);
		if (!inline || !BREADCRUMB_FIELDS.has(inline[1].toLowerCase())) return line;
		const key = inline[1].toLowerCase();
		const values = extractValues(inline[2]);
		connections[key] = (connections[key] ?? []).concat(values);
		return maskText(line);
	}).join('\n');
	return { connections, bodyText };
}

interface NoteLink { target: string | null; start: number; end: number }

/** Minimal offline fallback when Obsidian's parsed link cache is unavailable. */
function extractNoteLinks(text: string): NoteLink[] {
	const links: NoteLink[] = [];
	for (const match of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
		if (isEscaped(text, match.index)) continue;
		links.push({ target: internalTarget(match[1].split('|')[0], false), start: match.index,
			end: match.index + match[0].length });
	}
	const markdown = /(?<!!)\[[^\]\n]*\]\([ \t]*/g;
	for (const match of text.matchAll(markdown)) {
		if (isEscaped(text, match.index) || links.some(link => match.index >= link.start && match.index < link.end)) continue;
		let cursor = match.index + match[0].length;
		const angle = text[cursor] === '<';
		if (angle) cursor++;
		const destinationStart = cursor;
		let depth = 0;
		for (; cursor < text.length; cursor++) {
			const char = text[cursor];
			if (char === '\n') break;
			if (char === '\\' && cursor + 1 < text.length && text[cursor + 1] !== '\n') { cursor++; continue; }
			if (angle) { if (char === '>') break; }
			else if (char === '(') depth++;
			else if (char === ')') { if (!depth) break; depth--; }
			else if (/\s/.test(char)) break;
		}
		if (depth || (angle && text[cursor] !== '>')) continue;
		const destination = text.slice(destinationStart, cursor).replace(/\\([\\()<>])/g, '$1');
		const suffixStart = angle ? cursor + 1 : cursor;
		const suffix = text.slice(suffixStart).match(/^[ \t]*(?:(?:"[^"\n]*"|'[^'\n]*')[ \t]*)?\)/);
		if (!suffix) continue;
		links.push({ target: internalTarget(destination, true), start: match.index,
			end: suffixStart + suffix[0].length });
	}
	return links.sort((a, b) => a.start - b.start);
}

function internalTarget(raw: string, markdown: boolean): string | null {
	let target = raw.trim();
	if (markdown) {
		try { target = decodeURIComponent(target); } catch { /* Preserve malformed URI spelling for diagnostics. */ }
	}
	return !target || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(target) ? null : target;
}

function isEscaped(text: string, start: number): boolean {
	let backslashes = 0;
	for (let index = start - 1; index >= 0 && text[index] === '\\'; index--) backslashes++;
	return backslashes % 2 === 1;
}

/** Split a raw value string into individual target identifiers. */
function extractValues(raw: string): string[] {
	const text = raw.trim();
	if (!text) return [];
	const links = extractNoteLinks(text);
	if (links.length === 0) {
		// Escaped link markup is a literal example, never an unlinked identifier.
		return text.split(MULTI_VALUE_SEP).map(value => value.trim())
			.filter(value => value && !value.includes('[[') && !/\[[^\]]*\]\(/.test(value));
	}
	let remainder = text;
	for (const link of [...links].reverse()) remainder = remainder.slice(0, link.start)
		+ maskText(remainder.slice(link.start, link.end)) + remainder.slice(link.end);
	// Rendered links can be joined by prose. Only standalone SRC IDs in the
	// remaining list cells are identifiers; words such as "and" are not nodes.
	const ids = remainder.split(MULTI_VALUE_SEP).map(value => value.trim()).filter(isValidSourceId);
	return links.map(link => link.target).filter((target): target is string => target !== null).concat(ids);
}

/** Preserve offsets and newlines so indexed link positions remain usable. */
function maskText(text: string): string { return text.replace(/[^\n\r]/g, ' '); }

/** Mask literal regions in source order so delimiters inside code/comments
 * cannot change the interpretation of later prose. Offsets remain native. */
function maskNonProse(text: string): string {
	const tokens = /^ {0,3}(?:`{3,}|~{3,})[^\n]*|<!--|%%|`+/gm;
	let output = '', cursor = 0;
	let match: RegExpExecArray | null;
	while ((match = tokens.exec(text)) !== null) {
		const start = match.index;
		if (isEscaped(text, start)) continue;
		let end = start + match[0].length;
		const fence = /^ {0,3}(`{3,}|~{3,})/.exec(match[0]);
		if (fence && (start === 0 || text[start - 1] === '\n')) {
			const close = new RegExp('^ {0,3}' + fence[1][0] + '{' + fence[1].length + ',}[ \t]*\r?$', 'gm');
			close.lastIndex = end;
			const closing = close.exec(text);
			end = closing ? closing.index + closing[0].length : text.length;
		} else if (match[0] === '<!--' || match[0] === '%%') {
			const marker = match[0] === '<!--' ? '-->' : '%%';
			const closing = text.indexOf(marker, end);
			end = closing === -1 ? text.length : closing + marker.length;
		} else {
			// An unmatched inline delimiter is text, rather than an open code span.
				const close = /`+/g;
				close.lastIndex = end;
				let closing = close.exec(text);
				while (closing && closing[0].length !== match[0].length) closing = close.exec(text);
			if (!closing) continue;
			end = closing.index + closing[0].length;
		}
		output += text.slice(cursor, start) + maskText(text.slice(start, end));
		cursor = end;
		tokens.lastIndex = end;
	}
	return output + text.slice(cursor);
}

/** Remove the YAML frontmatter block at the top of a note. */
function stripFrontmatter(text: string): string {
	return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, maskText);
}
