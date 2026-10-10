import { TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { createMockApp } from '../helpers/vault';
import { SchemaValidator } from '../../src/engine/SchemaValidator';
import { parseSourceMap } from '../../src/models/SourceId';
import { DEFAULT_SETTINGS } from '../../src/settings';

describe('SchemaValidator', () => {
	it('uses nested mappings with trailing slashes and only exempts the configured source index', async () => {
		const { app } = createMockApp({
			'knowledge/deep/A.md': { content: '', frontmatter: { fileClass: 'algorithm', source_ids: ['SRC-1'] } },
			'knowledge/sources.md': { content: '', frontmatter: { fileClass: 'map' } },
			'papers/index.md': { content: '', frontmatter: { fileClass: 'map' } },
			'papers/Reference.md': { content: '' },
		});
		const validator = new SchemaValidator(app.vault, app.metadataCache, {
			fileClassTypeMap: { 'knowledge/': 'concept', 'knowledge/deep/': 'algorithm', papers: 'paper' },
			sourceMapPath: 'knowledge/sources.md',
			sourceMap: parseSourceMap('| Source ID | Target File |\n| --- | --- |\n| SRC-1 | papers/Reference.md |'),
		});
		expect(await validator.validateFile(app.vault.getAbstractFileByPath('knowledge/deep/A.md') as TFile)).toEqual([]);
		expect(await validator.validateFile(app.vault.getAbstractFileByPath('knowledge/sources.md') as TFile)).toEqual([]);
		expect((await validator.validateFile(app.vault.getAbstractFileByPath('papers/index.md') as TFile))
			.map(issue => issue.type)).toContain('folder_mismatch');
	});

	it('reports mixed malformed source IDs, unknown IDs and broken mapped targets', async () => {
		const { app } = createMockApp({
			'concepts/A.md': { content: '', frontmatter: {
				fileClass: 'concept', source_ids: ['SRC-good', 42, 'wrong', 'SRC-missing', 'SRC-broken'],
			} },
			'papers/Reference.md': { content: '' },
		});
		const validator = new SchemaValidator(app.vault, app.metadataCache, {
			fileClassTypeMap: { concepts: 'concept' },
			sourceMap: parseSourceMap('| Source ID | Wikilink |\n| --- | --- |\n'
				+ '| SRC-good | [[Reference#Part|good]] |\n| SRC-broken | [[Absent]] |', 'papers/index.md'),
		});
		const issues = await validator.validateFile(app.vault.getAbstractFileByPath('concepts/A.md') as TFile);
		expect(issues.map(issue => issue.type)).toEqual([
			'malformed_source_id', 'malformed_source_id', 'unknown_source_id', 'broken_source_target',
		]);
	});

	it('rejects scalar source_ids and excludes generated reports from full-vault checks', async () => {
		const { app } = createMockApp({
			'concepts/A.md': { content: '', frontmatter: { fileClass: 'concept', source_ids: 'SRC-1' } },
			'concepts/output/report.md': { content: '' },
		});
		const report = await SchemaValidator.validateVault(app, parseSourceMap(''), {
			...DEFAULT_SETTINGS, cacheFolder: 'concepts/output',
		});
		expect(report.scanned).toBe(1);
		expect(report.errors.map(issue => issue.type)).toEqual(['missing_source_ids', 'malformed_source_id']);
		expect(report.warnings.map(issue => issue.type)).toEqual(['missing_provenance']);
	});
});
