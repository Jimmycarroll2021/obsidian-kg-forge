import { Notice, Plugin, TFile } from 'obsidian';
import { SchemaValidator } from '../engine/SchemaValidator';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import type { ForgeSettings } from '../settings';

type PluginWithSettings = Plugin & { settings: ForgeSettings };

const COMMAND_ID = 'validate-schema';
const COMMAND_NAME = 'Validate vault schema';

/**
 * Register the "Validate vault schema" command.
 *
 * Scans every markdown file in the vault, checks folder→fileClass alignment,
 * provenance presence, and source_id validity, then writes a human-readable
 * report and opens it in a new leaf.
 */
export function registerValidateSchemaCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: COMMAND_ID,
		name: COMMAND_NAME,
		callback: async () => {
			try {
				await validateVaultSchema(plugin as PluginWithSettings);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(`[KG Forge] ${COMMAND_NAME} failed`, err);
				new Notice(`KG Forge: schema validation failed — ${message}`);
			}
		},
	});
}

async function validateVaultSchema(plugin: PluginWithSettings): Promise<void> {
	const { settings } = plugin;
	const vault = plugin.app.vault;

	// Resolve source IDs before validation so malformed SRC-XXX references can
	// be reported accurately.
	const sourceMap = await SourceMapLoader.load(vault, settings.sourceMapPath);
	const report = await SchemaValidator.validateVault(plugin.app, sourceMap, settings);

	// Render the report as markdown.
	const lines: string[] = [
		'# KG Forge Schema Validation Report',
		'',
		`- Generated: ${new Date().toISOString()}`,
		`- Files scanned: ${report.scanned}`,
		`- Errors: ${report.errors.length}`,
		`- Warnings: ${report.warnings.length}`,
		'',
		'## Errors',
		'',
		...(report.errors.length
			? report.errors.map((e) => `- **${e.file}**: ${e.message}`)
			: ['No errors.']),
		'',
		'## Warnings',
		'',
		...(report.warnings.length
			? report.warnings.map((w) => `- **${w.file}**: ${w.message}`)
			: ['No warnings.']),
		'',
	];

	if (settings.provenanceEnforced) {
		lines.push('> Provenance enforcement is **on**. Every fact must carry source/confidence/timestamp.');
	} else {
		lines.push('> Provenance enforcement is **off**. Turn it on in settings to require source metadata.');
	}

	const content = lines.join('\n');
	const reportPath = `${normalizePath(settings.cacheFolder)}/schema-validation-report.md`;

	const existing = vault.getAbstractFileByPath(reportPath);
	if (existing instanceof TFile) {
		await vault.modify(existing, content);
	} else {
		await vault.create(reportPath, content);
	}

	const reportFile = vault.getAbstractFileByPath(reportPath);
	if (reportFile instanceof TFile) {
		// `true` opens the file in a new leaf and is compatible with the
		// minAppVersion of 0.15.0.
		const leaf = plugin.app.workspace.getLeaf(true);
		await leaf.openFile(reportFile);
	}

	const summary = `${report.errors.length} errors, ${report.warnings.length} warnings`;
	new Notice(`KG Forge: schema validation complete — ${summary}`);
}

function normalizePath(path: string): string {
	return path.replace(/\/+/g, '/').replace(/\/$/, '') || '.';
}
