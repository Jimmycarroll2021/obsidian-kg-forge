/**
 * SchemaValidator.ts
 *
 * Validate vault notes against the folder → fileClass schema contracts.
 *
 * Checks:
 *   - Notes in managed folders have the expected fileClass.
 *   - Concept/algorithm/paper/book notes carry source_ids.
 *   - source_ids are well-formed and known in the source map.
 *   - Basic provenance signals exist when provenance enforcement is on.
 */

import { App, MetadataCache, TFile, Vault } from 'obsidian';
import { SourceMap, isValidSourceId } from '../models/SourceId';
import type { ForgeSettings } from '../settings';
import { mappedFileClass } from './FolderMapping';
import { getSourceFiles } from './VaultFiles';

export interface SchemaValidatorOptions {
	/** folder → expected fileClass, e.g. { algorithms: 'algorithm' } */
	fileClassTypeMap: Record<string, string>;

	/** If true, warn when entity notes lack source/provenance signals. */
	provenanceRequired?: boolean;

	/** Require source_ids for these fileClasses. */
	sourceIdsRequiredFor?: string[];

	/** Optional source map for validating SRC-XXX references. */
	sourceMap?: SourceMap;

	/** The configured lookup index is not a managed entity note. */
	sourceMapPath?: string;

	/** Generated Markdown must not become validation input. */
	cacheFolder?: string;
}

export type ValidationIssueType =
	| 'missing_fileClass'
	| 'folder_mismatch'
	| 'missing_source_ids'
	| 'malformed_source_id'
	| 'unknown_source_id'
	| 'broken_source_target'
	| 'missing_provenance';

export interface ValidationIssue {
	type: ValidationIssueType;
	severity: 'error' | 'warning';
	file: string;
	message: string;
}

export interface ValidationReport {
	scanned: number;
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
}

const DEFAULT_SOURCE_REQUIRED = ['concept', 'algorithm', 'paper', 'book'];

export class SchemaValidator {
	private readonly sourceIdsRequiredFor: Set<string>;

	constructor(
		private vault: Vault,
		private metadataCache: MetadataCache,
		private options: SchemaValidatorOptions
	) {
		this.sourceIdsRequiredFor = new Set(
			options.sourceIdsRequiredFor ?? DEFAULT_SOURCE_REQUIRED
		);
	}

	/**
	 * Convenience used by commands: run a full-vault validation and return a
	 * structured report.
	 */
	static async validateVault(
		app: App,
		sourceMap: SourceMap,
		settings: ForgeSettings
	): Promise<ValidationReport> {
		const validator = new SchemaValidator(app.vault, app.metadataCache, {
			fileClassTypeMap: settings.fileClassMappings,
			provenanceRequired: settings.provenanceEnforced,
			sourceMap,
			sourceMapPath: settings.sourceMapPath,
			cacheFolder: settings.cacheFolder,
		});
		const issues = await validator.validateAll();
		return {
			scanned: getSourceFiles(app.vault, settings.cacheFolder).length,
			errors: issues.filter((i) => i.severity === 'error'),
			warnings: issues.filter((i) => i.severity === 'warning'),
		};
	}

	/**
	 * Validate a single file. Non-markdown files are ignored.
	 */
	async validateFile(file: TFile): Promise<ValidationIssue[]> {
		if (file.extension !== 'md') return [];
		if (file.path === (this.options.sourceMapPath ?? 'papers/index.md')) return [];

		const folder = file.parent?.path ?? file.path.slice(0, file.path.lastIndexOf('/'));
		const expected = mappedFileClass(file.path, this.options.fileClassTypeMap);
		if (!expected) return []; // Folder is not part of the managed schema.

		const cache = this.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter ?? {};
		const fileClass =
			typeof fm.fileClass === 'string' ? fm.fileClass.trim() || undefined : undefined;

		const issues: ValidationIssue[] = [];

		if (!fileClass) {
			issues.push({
				type: 'missing_fileClass',
				severity: 'error',
				file: file.path,
				message: `Missing fileClass frontmatter (expected "${expected}" for folder "${folder}").`,
			});
		} else if (fileClass !== expected) {
			issues.push({
				type: 'folder_mismatch',
				severity: 'warning',
				file: file.path,
				message: `fileClass "${fileClass}" does not match folder "${folder}" (expected "${expected}").`,
			});
		}

		const effectiveClass = fileClass ?? expected;

		// source_ids checks.
		const rawIds: unknown[] = Array.isArray(fm.source_ids) ? fm.source_ids : [];
		const validIds = rawIds.filter(isValidSourceId);
		if (this.sourceIdsRequiredFor.has(effectiveClass) && rawIds.length === 0) {
			issues.push({
				type: 'missing_source_ids',
				severity: 'error',
				file: file.path,
				message: `Notes of type "${effectiveClass}" must declare source_ids.`,
			});
		}
		if (fm.source_ids !== undefined && !Array.isArray(fm.source_ids)) {
			issues.push({
				type: 'malformed_source_id', severity: 'error', file: file.path,
				message: 'source_ids must be an array of SRC-XXX identifiers.',
			});
		}
		for (const id of rawIds) {
			if (!isValidSourceId(id)) {
				issues.push({
					type: 'malformed_source_id', severity: 'error', file: file.path,
					message: `Source id ${JSON.stringify(id)} is malformed (expected SRC-XXX).`,
				});
			} else if (this.options.sourceMap && !this.options.sourceMap.has(id)) {
				issues.push({
					type: 'unknown_source_id', severity: 'warning', file: file.path,
					message: `Source id "${id}" is not in the source map.`,
				});
			} else if (this.options.sourceMap?.has(id)) {
				const target = this.options.sourceMap.get(id)!;
				const link = target.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
				const linkpath = link.split('#')[0];
				const context = this.options.sourceMap.sourcePath
					?? this.options.sourceMapPath ?? file.path;
				const resolved = linkpath
					? this.metadataCache.getFirstLinkpathDest(linkpath, context)
					: link.startsWith('#') ? this.vault.getAbstractFileByPath(context) : null;
				if (!(resolved instanceof TFile)) issues.push({
					type: 'broken_source_target', severity: 'warning', file: file.path,
					message: `Source id "${id}" maps to "${target}", which does not resolve to a note.`,
				});
			}
		}

		// Provenance sanity check.
		if (
			this.options.provenanceRequired &&
			effectiveClass &&
			this.sourceIdsRequiredFor.has(effectiveClass) &&
			validIds.length === 0
		) {
			issues.push({
				type: 'missing_provenance',
				severity: 'warning',
				file: file.path,
				message: 'Provenance enforcement is on, but no source_ids were found.',
			});
		}

		return issues;
	}

	/**
	 * Validate every markdown file in the vault.
	 */
	async validateAll(): Promise<ValidationIssue[]> {
		const all: ValidationIssue[] = [];
		for (const file of getSourceFiles(this.vault, this.options.cacheFolder ?? 'Knowledge Forge')) {
			all.push(...(await this.validateFile(file)));
		}
		return all;
	}
}
