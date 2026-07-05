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
	 * Throws if the file cannot be found or read.
	 */
	async load(): Promise<SourceMap> {
		const abstract = this.vault.getAbstractFileByPath(this.path);
		if (!abstract || !(abstract instanceof TFile)) {
			throw new Error(`Source map not found at "${this.path}".`);
		}
		const content = await this.vault.cachedRead(abstract);
		return parseSourceMap(content);
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
