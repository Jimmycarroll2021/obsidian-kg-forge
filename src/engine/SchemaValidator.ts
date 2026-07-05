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
import { SourceMap } from '../models/SourceId';
import type { ForgeSettings } from '../settings';

export interface SchemaValidatorOptions {
	/** folder → expected fileClass, e.g. { algorithms: 'algorithm' } */
	fileClassTypeMap: Record<string, string>;

	/** If true, warn when entity notes lack source/provenance signals. */
	provenanceRequired?: boolean;

	/** Require source_ids for these fileClasses. */
	sourceIdsRequiredFor?: string[];

	/** Optional source map for validating SRC-XXX references. */
	sourceMap?: SourceMap;
}

export type ValidationIssueType =
	| 'missing_fileClass'
	| 'folder_mismatch'
	| 'missing_source_ids'
	| 'malformed_source_id'
	| 'unknown_source_id'
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
const SOURCE_ID_RE = /^SRC-[A-Za-z0-9_-]+$/;

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
		});
		const issues = await validator.validateAll();
		return {
			scanned: app.vault.getMarkdownFiles().length,
			errors: issues.filter((i) => i.severity === 'error'),
			warnings: issues.filter((i) => i.severity === 'warning'),
		};
	}

	/**
	 * Validate a single file. Non-markdown files are ignored.
	 */
	async validateFile(file: TFile): Promise<ValidationIssue[]> {
		if (file.extension !== 'md') return [];

		const folder = file.path.split('/')[0];
		const expected = this.options.fileClassTypeMap[folder];
		if (!expected) return []; // Folder is not part of the managed schema.

		const cache = this.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter ?? {};
		const fileClass =
			typeof fm.fileClass === 'string' ? fm.fileClass : undefined;

		const issues: ValidationIssue[] = [];

		// Special case: the source-map index is a map, not a paper.
		const isSourceIndex =
			file.basename === 'index' && fileClass === 'map' && folder === 'papers';

		if (!fileClass) {
			issues.push({
				type: 'missing_fileClass',
				severity: 'error',
				file: file.path,
				message: `Missing fileClass frontmatter (expected "${expected}" for folder "${folder}").`,
			});
		} else if (!isSourceIndex && fileClass !== expected) {
			issues.push({
				type: 'folder_mismatch',
				severity: 'warning',
				file: file.path,
				message: `fileClass "${fileClass}" does not match folder "${folder}" (expected "${expected}").`,
			});
		}

		const effectiveClass = isSourceIndex ? 'map' : fileClass;

		// source_ids checks.
		if (effectiveClass && this.sourceIdsRequiredFor.has(effectiveClass)) {
			const ids = Array.isArray(fm.source_ids)
				? fm.source_ids.filter((x): x is string => typeof x === 'string')
				: [];

			if (ids.length === 0) {
				issues.push({
					type: 'missing_source_ids',
					severity: 'error',
					file: file.path,
					message: `Notes of type "${effectiveClass}" must declare source_ids.`,
				});
			} else {
				for (const id of ids) {
					if (!SOURCE_ID_RE.test(id)) {
						issues.push({
							type: 'malformed_source_id',
							severity: 'error',
							file: file.path,
							message: `Source id "${id}" is malformed (expected SRC-XXX).`,
						});
					} else if (
						this.options.sourceMap &&
						!this.options.sourceMap.has(id)
					) {
						issues.push({
							type: 'unknown_source_id',
							severity: 'warning',
							file: file.path,
							message: `Source id "${id}" is not in the source map.`,
						});
					}
				}
			}
		}

		// Provenance sanity check.
		if (
			this.options.provenanceRequired &&
			effectiveClass &&
			this.sourceIdsRequiredFor.has(effectiveClass) &&
			(!Array.isArray(fm.source_ids) || fm.source_ids.length === 0)
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
		for (const file of this.vault.getMarkdownFiles()) {
			all.push(...(await this.validateFile(file)));
		}
		return all;
	}
}
