/**
 * SourceMapLoader.ts
 *
 * Loads the vault's source-id mapping from papers/index.md (or a configured path)
 * and exposes it as a SourceMap.
 */

import { TFile, Vault } from 'obsidian';
import { SourceMap, parseSourceMap } from '../models/SourceId';

export interface SourceMapLoaderOptions {
	/** Vault-relative path to the source map note. */
	path?: string;
}

export class SourceMapLoader {
	private readonly path: string;

	constructor(
		private vault: Vault,
		options: SourceMapLoaderOptions = {}
	) {
		this.path = options.path ?? 'papers/index.md';
	}

	/**
	 * Read the configured source-map note and parse its table.
	 *
	 * An absent optional index produces an empty map. Genuine read errors surface.
	 */
	async load(): Promise<SourceMap> {
		const abstract = this.vault.getAbstractFileByPath(this.path);
		if (!abstract) return parseSourceMap('', this.path);
		if (!(abstract instanceof TFile)) throw new Error(`Source map path "${this.path}" is not a note.`);
		const content = await this.vault.cachedRead(abstract);
		return parseSourceMap(content, abstract.path);
	}

	/**
	 * Convenience: load from an arbitrary vault path.
	 */
	static async loadFromPath(vault: Vault, path: string): Promise<SourceMap> {
		const loader = new SourceMapLoader(vault, { path });
		return loader.load();
	}

	/**
	 * Convenience used by commands: shorthand for `loadFromPath`.
	 */
	static async load(vault: Vault, path: string): Promise<SourceMap> {
		return SourceMapLoader.loadFromPath(vault, path);
	}
}
