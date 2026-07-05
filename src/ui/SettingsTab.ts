import { App, PluginSettingTab, Setting } from 'obsidian';
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

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('p', {
			text: 'Configure how the plugin extracts, validates, and reasons over your vault graph.',
			cls: 'setting-item-description',
		});

		this.addProvenanceToggle();
		this.addHopSlider();
		this.addGraphRAGTemplate();
		this.addSourceMapPath();
		this.addFileClassMappings();
	}

	private addProvenanceToggle(): void {
		new Setting(this.containerEl)
			.setName('Enforce provenance')
			.setDesc('Require source, confidence, and timestamp on every extracted triple.')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.provenanceEnforced)
					.onChange(async value => {
						this.plugin.settings.provenanceEnforced = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addHopSlider(): void {
		new Setting(this.containerEl)
			.setName('Default hop count')
			.setDesc('Default k-hop neighbourhood radius used by graphrag prompts.')
			.addSlider(slider =>
				slider
					.setLimits(1, 5, 1)
					.setValue(this.plugin.settings.defaultHopCount)
					.onChange(async value => {
						this.plugin.settings.defaultHopCount = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addGraphRAGTemplate(): void {
		new Setting(this.containerEl)
			.setName('Graphrag prompt template')
			.setDesc('Template wrapping serialized triple facts. Use {{facts}} and {{question}} placeholders.')
			.addTextArea(text =>
				text
					.setValue(this.plugin.settings.graphRAGPromptTemplate)
					.onChange(async value => {
						this.plugin.settings.graphRAGPromptTemplate = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addSourceMapPath(): void {
		new Setting(this.containerEl)
			.setName('Source map path')
			.setDesc('Path to the paper index note that maps src-xxx ids to file paths (e.g. Papers/index.md).')
			.addText(text =>
				text
					.setPlaceholder('papers/index.md')
					.setValue(this.plugin.settings.sourceMapPath)
					.onChange(async value => {
						this.plugin.settings.sourceMapPath = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addFileClassMappings(): void {
		new Setting(this.containerEl)
			.setName('Folder → fileclass mappings')
			.setHeading();
		this.containerEl.createEl('p', {
			text: 'One mapping per line, formatted as folder=fileclass (e.g. Algorithms/=algorithm).',
			cls: 'setting-item-description',
		});

		new Setting(this.containerEl)
			.setName('Fileclass mappings')
			.addTextArea(text =>
				text
					.setValue(this.mappingsToString(this.plugin.settings.fileClassMappings))
					.onChange(async value => {
						this.plugin.settings.fileClassMappings = this.parseMappings(value);
						await this.plugin.saveSettings();
					})
			);
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
			if (separatorIndex === -1) continue;
			const folder = trimmed.slice(0, separatorIndex).trim();
			const fileClass = trimmed.slice(separatorIndex + 1).trim();
			if (folder && fileClass) {
				result[folder] = fileClass;
			}
		}
		return result;
	}
}
