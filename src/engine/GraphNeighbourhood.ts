import { App, TFile } from 'obsidian';
import type { ForgeSettings } from '../settings';
import { Triple, mergeDuplicates } from '../models/Triple';
import type { SourceMap } from '../models/SourceId';
import { TripleExtractor } from './TripleExtractor';
import { SourceMapLoader } from './SourceMapLoader';
import { getSourceFiles } from './VaultFiles';

export interface GraphNeighbourhoodOptions {
	incomingLimit?: number;
	isCurrent?: () => boolean;
}

export interface GraphNeighbourhoodResult {
	triples: Triple[];
	knownNotePaths: string[];
	/** All eligible indexed candidates, including those outside the current cap. */
	incomingPaths: string[];
	incomingCandidates: number;
	/** Successfully loaded selected notes, including extraction-cache hits. */
	incomingRead: number;
	failedPaths: string[];
	cancelled: boolean;
}

interface NoteCacheEntry { stamp: string; context: string; triples: Triple[] }
interface SourceCacheEntry { path: string; stamp: string; sourceMap: SourceMap }

/** Indexed one-hop incoming evidence. Metadata is candidate discovery, not facts. */
export class GraphNeighbourhood {
	private readonly noteCache = new Map<string, NoteCacheEntry>();
	private sourceCache: SourceCacheEntry | undefined;
	private revision = 0;

	constructor(private app: App, private settings: ForgeSettings) {}

	/** In-flight loads are invalidated even when only one cached path is removed. */
	invalidate(path?: string): void {
		this.revision++;
		if (path === undefined || path === this.settings.sourceMapPath || path === this.sourceCache?.path) {
			this.noteCache.clear();
			this.sourceCache = undefined;
		} else {
			this.noteCache.delete(path);
		}
	}

	async load(anchor: TFile, options: GraphNeighbourhoodOptions = {}): Promise<GraphNeighbourhoodResult> {
		const settings = { ...this.settings, fileClassMappings: { ...this.settings.fileClassMappings } };
		const settingsKey = settingsContext(settings);
		const revision = this.revision;
		const anchorPath = anchor.path;
		const sourceStamp = this.sourceStamp(settings.sourceMapPath);
		const result: GraphNeighbourhoodResult = {
			triples: [], knownNotePaths: [], incomingPaths: [], incomingCandidates: 0,
			incomingRead: 0, failedPaths: [], cancelled: false,
		};
		const current = () => !result.cancelled && revision === this.revision
			&& anchor.path === anchorPath && settingsContext(this.settings) === settingsKey
			&& this.sourceStamp(settings.sourceMapPath) === sourceStamp && (options.isCurrent?.() ?? true);
		const cancel = () => { result.cancelled = true; result.triples = []; return result; };
		if (!current()) return cancel();

		const files = getSourceFiles(this.app.vault, settings.cacheFolder);
		const eligible = new Map(files.map(file => [file.path, file]));
		result.knownNotePaths = files.map(file => file.path);
		if (!eligible.has(anchorPath)) throw new Error('Choose a source Markdown note to inspect its relationships.');
		result.incomingPaths = Object.entries(this.app.metadataCache.resolvedLinks ?? {})
			.filter(([path, links]) => path !== anchorPath && eligible.has(path)
				&& this.app.vault.getAbstractFileByPath(path) instanceof TFile
				&& Number.isFinite(links[anchorPath]) && links[anchorPath] > 0)
			.map(([path]) => path).sort();
		result.incomingCandidates = result.incomingPaths.length;
		const limit = Number.isFinite(options.incomingLimit)
			? Math.max(0, Math.floor(options.incomingLimit!)) : 100;
		const selected = result.incomingPaths.slice(0, limit);

		let sourceMap: SourceMap;
		try {
			sourceMap = await this.loadSourceMap(settings.sourceMapPath, sourceStamp, current);
		} catch (error) {
			if (!current()) return cancel();
			throw error;
		}
		if (!current()) return cancel();
		const context = JSON.stringify([settingsKey, sourceStamp]);
		const extractor = new TripleExtractor(this.app.vault, this.app.metadataCache, {
			fileClassTypeMap: settings.fileClassMappings, sourceMap,
		});
		let outgoing: Triple[] | null;
		try {
			outgoing = await this.extract(anchor, extractor, context, current);
		} catch (error) {
			if (!current()) return cancel();
			throw error;
		}
		if (!current() || outgoing === null) return cancel();
		result.triples = outgoing;

		const incoming: Triple[][] = new Array<Triple[]>(selected.length);
		let next = 0;
		const worker = async () => {
			while (current() && next < selected.length) {
				const index = next++;
				const path = selected[index];
				try {
					const triples = await this.extract(eligible.get(path)!, extractor, context, current);
					if (!current() || triples === null) { cancel(); return; }
					result.incomingRead++;
					incoming[index] = triples.filter(triple => triple.object === anchorPath && triple.predicate !== 'rdf:type');
				} catch {
					if (!current()) { cancel(); return; }
					result.failedPaths.push(path);
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(4, selected.length) }, () => worker()));
		if (!current()) return cancel();
		result.failedPaths.sort();
		result.triples = mergeDuplicates([...outgoing, ...incoming.flat()]);
		return result;
	}

	private sourceStamp(path: string): string {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? fileStamp(file) : file ? 'not-a-note' : 'absent';
	}

	private async loadSourceMap(path: string, stamp: string, current: () => boolean): Promise<SourceMap> {
		if (this.sourceCache?.path === path && this.sourceCache.stamp === stamp) return this.sourceCache.sourceMap;
		const sourceMap = await SourceMapLoader.loadFromPath(this.app.vault, path);
		if (current()) this.sourceCache = { path, stamp, sourceMap };
		return sourceMap;
	}

	private async extract(file: TFile, extractor: TripleExtractor, context: string, current: () => boolean): Promise<Triple[] | null> {
		const path = file.path;
		const stamp = fileStamp(file);
		const cached = this.noteCache.get(path);
		if (cached?.stamp === stamp && cached.context === context) {
			this.noteCache.delete(path);
			this.noteCache.set(path, cached);
			return cloneTriples(cached.triples);
		}
		const triples = await extractor.extract(file);
		if (!current() || file.path !== path || fileStamp(file) !== stamp) return null;
		this.noteCache.delete(path);
		this.noteCache.set(path, { stamp, context, triples: cloneTriples(triples) });
		// At most 256 cached paths: 255 note results plus the configured source index.
		if (this.noteCache.size > 255) {
			for (const oldest of this.noteCache.keys()) { this.noteCache.delete(oldest); break; }
		}
		return triples;
	}
}

function fileStamp(file: TFile): string { return JSON.stringify([file.stat.mtime, file.stat.size]); }
function cloneTriples(triples: Triple[]): Triple[] { return triples.map(triple => Triple.fromJSON(triple.toJSON())); }
function settingsContext(settings: ForgeSettings): string {
	return JSON.stringify([settings.cacheFolder, settings.sourceMapPath,
		Object.entries(settings.fileClassMappings).sort(([a], [b]) => a.localeCompare(b))]);
}
