import { Notice, Plugin, TFile } from 'obsidian';
import { TripleExtractor } from '../engine/TripleExtractor';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import { writeGeneratedFile } from '../engine/VaultFiles';
import type { ForgeSettings } from '../settings';

type PluginWithSettings = Plugin & { settings: ForgeSettings };

const COMMAND_ID = 'extract-triples';
const COMMAND_NAME = 'Extract triples from current note';

/**
 * Register the "Extract triples from current note" command.
 *
 * The command is only available when a markdown note is active. It runs the
 * triple extractor over that note, persists the result as JSON next to the
 * vault cache, and reports the count via a Notice.
 */
export function registerExtractTriplesCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: COMMAND_ID,
		name: COMMAND_NAME,
		checkCallback: (checking: boolean) => {
			const file = plugin.app.workspace.getActiveFile();
			const canRun = file instanceof TFile && file.extension === 'md'
				&& file.path !== (plugin as PluginWithSettings).settings.cacheFolder
				&& !file.path.startsWith(`${(plugin as PluginWithSettings).settings.cacheFolder}/`);
			if (!checking && canRun) {
				extractTriplesFromActiveFile(plugin as PluginWithSettings).catch((err: Error) => {
					console.error(`[KG Forge] ${COMMAND_NAME} failed`, err);
					new Notice(`KG Forge: extraction failed — ${err.message}`);
				});
			}
			return canRun;
		},
	});
}

async function extractTriplesFromActiveFile(plugin: PluginWithSettings): Promise<void> {
	const file = plugin.app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension !== 'md') {
		new Notice('No active Markdown note');
		return;
	}

	const { settings } = plugin;
	const vault = plugin.app.vault;

	// Load the SRC-XXX → paper path map so source_ids resolve to real notes.
	const sourceMap = await SourceMapLoader.load(vault, settings.sourceMapPath);

	// Extract typed triples from YAML, Breadcrumbs fields, and wikilinks.
	const triples = await TripleExtractor.extractFromFile(file, plugin.app, sourceMap, settings);

	// Persist to a per-note cache file for downstream commands and debugging.
	const payload = JSON.stringify(
		{
			generator: 'kg-forge',
			file: file.path,
			extractedAt: Date.now(),
			count: triples.length,
			triples: triples.map((t) => t.toJSON()),
		},
		null,
		2,
	);

	await writeGeneratedFile(vault, settings.cacheFolder, `${file.path}.triples.json`, payload);

	new Notice(`KG Forge: extracted ${triples.length} triples from "${file.basename}"`);
}

