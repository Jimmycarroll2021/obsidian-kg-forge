import { Plugin } from 'obsidian';
import { registerExtractTriplesCommand } from './extractTriples';
import { registerValidateSchemaCommand } from './validateSchema';
import { registerBuildGraphRAGPromptCommand } from './buildGraphRAGPrompt';
import { registerExportCypherCommand } from './exportCypher';
import { registerExportDataviewCommand } from './exportDataview';

/**
 * Register all KG Forge commands on the plugin.
 *
 * Called from the plugin's `onload()` in `src/main.ts`. Each command file is
 * responsible for one user-facing command and wires its own error handling and
 * Notices so this entry point stays minimal.
 */
export function registerCommands(plugin: Plugin): void {
	registerExtractTriplesCommand(plugin);
	registerValidateSchemaCommand(plugin);
	registerBuildGraphRAGPromptCommand(plugin);
	registerExportCypherCommand(plugin);
	registerExportDataviewCommand(plugin);
}
