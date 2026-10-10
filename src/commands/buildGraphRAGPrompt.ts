import type { Plugin } from 'obsidian';
import { GraphRAGPanel } from '../ui/GraphRAGPanel';
import type { PluginWithSettings } from '../ui/types';

/** Open the same preview workflow from the command palette and ribbon. */
export function registerBuildGraphRAGPromptCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: 'build-graphrag-prompt',
		name: 'Build graphrag prompt',
		callback: () => new GraphRAGPanel(plugin.app, plugin as PluginWithSettings).open(),
	});
}
