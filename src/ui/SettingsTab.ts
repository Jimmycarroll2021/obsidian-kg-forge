import { App, Notice, PluginSettingTab, type Setting, type SettingDefinitionItem } from 'obsidian';
import { vaultRelativePath } from '../engine/VaultFiles';
import type { PluginWithSettings } from './types';

/**
 * Settings tab for Knowledge Forge.
 *
 * Surfaces all user-configurable behaviour: provenance enforcement,
 * default GraphRAG hop count, prompt template, folder→FileClass mappings,
 * and the path to the paper source-id index.
 */
export class KGForgeSettingsTab extends PluginSettingTab {
	plugin: PluginWithSettings;

	constructor(app: App, plugin: PluginWithSettings) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ name: 'Enforce provenance', desc: 'Warn about notes missing source metadata during schema validation.', render: setting => this.addProvenanceToggle(setting) },
			{ name: 'Default hop count', desc: 'Relationship radius for GraphRAG prompts (0–5).', render: setting => this.addHopSlider(setting) },
			{ name: 'GraphRAG prompt template', desc: 'Use {{facts}} and {{question}} placeholders.', render: setting => this.addGraphRAGTemplate(setting) },
			{ name: 'Source map path', desc: 'Optional source-ID index. A missing index does not prevent extraction.', render: setting => this.addSourceMapPath(setting) },
			{ name: 'Output folder', desc: 'Generated files only; existing ordinary notes are protected.', render: setting => this.addOutputFolder(setting) },
			{ name: 'Folder → fileclass mappings', desc: 'One folder=fileclass per line. Nested folders use the most specific mapping.', render: setting => this.addFileClassMappings(setting) },
		];
	}

	private addProvenanceToggle(setting: Setting): void {
		setting
			.setName('Enforce provenance')
			.setDesc('Warn about missing source metadata; extraction records the originating note and capture time.')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.provenanceEnforced)
					.onChange(async value => {
						this.plugin.settings.provenanceEnforced = value;
						await this.persist();
					})
			);
	}

	private addHopSlider(setting: Setting): void {
		setting
			.setName('Default hop count')
			.setDesc('Default relationship radius used by graphrag prompts.')
			.addSlider(slider =>
				slider
					.setLimits(0, 5, 1)
					.setValue(this.plugin.settings.defaultHopCount)
					.onChange(async value => {
						this.plugin.settings.defaultHopCount = value;
						await this.persist();
					})
			);
	}

	private addGraphRAGTemplate(setting: Setting): void {
		setting
			.setName('Graphrag prompt template')
			.setDesc('Template wrapping serialized triple facts. Use {{facts}} and {{question}} placeholders.')
			.addTextArea(text =>
				text
					.setValue(this.plugin.settings.graphRAGPromptTemplate)
					.onChange(async value => {
						this.plugin.settings.graphRAGPromptTemplate = value;
						await this.persist();
					})
			);
	}

	private addSourceMapPath(setting: Setting): void {
		setting
			.setName('Source map path')
			.setDesc('Path to the paper index note that maps src-xxx ids to file paths (e.g. Papers/index.md).')
			.addText(text =>
				text
					.setPlaceholder('papers/index.md')
					.setValue(this.plugin.settings.sourceMapPath)
					.onChange(async value => {
						this.plugin.settings.sourceMapPath = value;
						await this.persist();
					})
			);
	}

	private addFileClassMappings(setting: Setting): void {
		setting
			.setName('Fileclass mappings')
			.addTextArea(text =>
				text
					.setValue(this.mappingsToString(this.plugin.settings.fileClassMappings))
					.onChange(async value => {
						try {
							this.plugin.settings.fileClassMappings = this.parseMappings(value);
							await this.persist();
						} catch (error) { new Notice(String(error)); }
					})
			);
	}

	private addOutputFolder(setting: Setting): void {
		setting.addText(text => text.setValue(this.plugin.settings.cacheFolder).onChange(async value => {
			try {
				const path = vaultRelativePath(value);
				if (path.split('/').some(part => part.startsWith('.'))) throw new Error('Choose a visible output folder.');
				if (path === this.app.vault.configDir || path.startsWith(`${this.app.vault.configDir}/`)) throw new Error('Output must be outside the Obsidian configuration directory.');
				this.plugin.settings.cacheFolder = path;
				await this.persist();
			} catch (error) { new Notice(String(error)); }
		}));
	}

	private async persist(): Promise<void> {
		try { await this.plugin.saveSettings(); }
		catch (error) { new Notice(`KG Forge: settings were not saved — ${String(error)}`); }
	}

	private mappingsToString(mappings: Record<string, string>): string {
		return Object.entries(mappings)
			.map(([folder, fileClass]) => `${folder}=${fileClass}`)
			.join('\n');
	}

	private parseMappings(input: string): Record<string, string> {
		const result: Record<string, string> = {};
		for (const line of input.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const separatorIndex = trimmed.indexOf('=');
			if (separatorIndex === -1) throw new Error('Use folder=fileclass on each mapping line.');
			const folder = trimmed.slice(0, separatorIndex).trim();
			const fileClass = trimmed.slice(separatorIndex + 1).trim();
			if (folder && fileClass) {
				result[vaultRelativePath(folder)] = fileClass;
			} else { throw new Error('Each mapping needs a folder and fileclass.'); }
		}
		return result;
	}
}
