import { App, Modal, Setting, FuzzySuggestModal, TFile, Notice, TextComponent } from 'obsidian';
import { GraphRAGBuilder } from '../engine/GraphRAGBuilder';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import { TripleExtractor } from '../engine/TripleExtractor';
import type { Triple } from '../models/Triple';
import type { PluginWithSettings } from './types';

/**
 * Modal for building a GraphRAG prompt from a k-hop subgraph.
 *
 * The user picks an anchor note and a hop count; the prompt is built from
 * typed triples and copied to the clipboard with the "say so if facts don't
 * support" guard included in the template.
 */
export class GraphRAGPanel extends Modal {
	private plugin: PluginWithSettings;
	private anchor: TFile | null = null;
	private hops: number;

	constructor(app: App, plugin: PluginWithSettings) {
		super(app);
		this.plugin = plugin;
		this.hops = plugin.settings.defaultHopCount;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('kg-graphrag-panel');

		contentEl.createEl('h2', { text: 'Build graphrag prompt' });

		const anchorTextRef: { component: TextComponent | null } = { component: null };

		new Setting(contentEl)
			.setName('Anchor note')
			.setDesc('The note that centres the k-hop neighbourhood.')
			.addButton(button =>
				button.setButtonText('Pick note').onClick(() => {
					new AnchorSuggestModal(this.app, file => {
						this.anchor = file;
						anchorTextRef.component?.setValue(file.path);
					}).open();
				})
			)
			.addText(text => {
				anchorTextRef.component = text;
				text.setValue(this.anchor?.path ?? '');
				text.setDisabled(true);
				return text;
			});

		new Setting(contentEl)
			.setName('Hops')
			.setDesc('Number of relationship hops to include around the anchor.')
			.addSlider(slider =>
				slider
					.setLimits(1, 5, 1)
					.setValue(this.hops)
					.onChange(value => {
						this.hops = value;
					})
			);

		new Setting(contentEl)
			.setName('Generate prompt')
			.addButton(button =>
				button
					.setButtonText('Copy to clipboard')
					.setCta()
					.onClick(async () => {
						if (!this.anchor) {
							new Notice('Please select an anchor note.');
							return;
						}
						try {
							const prompt = await this.buildPrompt(this.anchor, this.hops);
							await navigator.clipboard.writeText(prompt);
							new Notice('Graphrag prompt copied to clipboard.');
							this.close();
						} catch (error) {
							new Notice('Failed to build GraphRAG prompt: ' + (error as Error).message);
						}
					})
			);
	}

	private async buildPrompt(anchor: TFile, hops: number): Promise<string> {
		const vault = this.app.vault;
		const settings = this.plugin.settings;

		const sourceMap = await SourceMapLoader.loadFromPath(vault, settings.sourceMapPath);
		const extractor = new TripleExtractor(vault, this.app.metadataCache, {
			fileClassTypeMap: settings.fileClassMappings,
			sourceMap,
		});

		const allTriples: Triple[] = [];
		for (const file of vault.getMarkdownFiles()) {
			const triples = await extractor.extract(file);
			allTriples.push(...triples);
		}

		const builder = new GraphRAGBuilder(allTriples);
		const result = builder.build(anchor.basename, hops, {
			systemPrompt: settings.graphRAGPromptTemplate,
		});
		return result.prompt;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Fuzzy finder for picking a markdown note as the GraphRAG anchor.
 */
class AnchorSuggestModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}
