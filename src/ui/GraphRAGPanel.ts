import { App, Modal, Setting, FuzzySuggestModal, TFile, Notice, type ButtonComponent } from 'obsidian';
import { GraphRAGBuilder, type GraphRAGPrompt } from '../engine/GraphRAGBuilder';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import { getSourceFiles } from '../engine/VaultFiles';
import { TripleList } from './components/TripleList';
import type { PluginWithSettings } from './types';

/** Build, inspect and copy one exact prompt from a bounded note neighbourhood. */
export class GraphRAGPanel extends Modal {
	private anchor: TFile | null = null;
	private question = '';
	private hops: number;
	private preview: GraphRAGPrompt | null = null;
	private revision = 0;
	private opened = false;
	private generating = false;
	private generateButton: ButtonComponent | null = null;
	private copyButton: ButtonComponent | null = null;
	private previewEl: HTMLTextAreaElement | null = null;
	private statusEl: HTMLElement | null = null;
	private evidenceList: TripleList | null = null;

	constructor(app: App, private plugin: PluginWithSettings) {
		super(app);
		this.hops = Math.max(0, Math.min(5, Math.round(plugin.settings.defaultHopCount)));
	}

	onOpen(): void {
		this.opened = true;
		const eligible = getSourceFiles(this.app.vault, this.plugin.settings.cacheFolder);
		const active = this.app.workspace.getActiveFile();
		this.anchor = active && eligible.some(file => file.path === active.path) ? active : null;
		this.contentEl.empty();
		this.contentEl.addClass('kg-graphrag-panel');
		this.contentEl.createEl('h2', { text: 'Build graphrag prompt' });
		this.contentEl.createEl('p', {
			text: 'Preview the facts and their sources before copying a prompt. No model or external service is contacted.',
			cls: 'setting-item-description',
		});

		let anchorLabel: HTMLElement;
		new Setting(this.contentEl)
			.setName('Anchor note')
			.setDesc('Use the active note or choose a note to centre the neighbourhood.')
			.addButton(button => button.setButtonText('Choose note').onClick(() => {
				new AnchorSuggestModal(this.app, this.plugin.settings.cacheFolder, file => {
					if (!this.opened) return;
					this.anchor = file;
					anchorLabel.setText(file.path);
					this.invalidatePreview();
				}).open();
			}));
		anchorLabel = this.contentEl.createDiv({
			text: this.anchor?.path ?? 'Choose a Markdown note to begin.', cls: 'kg-anchor-path',
		});
		new Setting(this.contentEl)
			.setName('Question')
			.setDesc('The question to include with the retrieved facts.')
			.addTextArea(text => {
				text.setPlaceholder('What would you like to ask about this note?').setValue(this.question)
					.onChange(value => {
						this.question = value;
						this.invalidatePreview();
					});
				text.inputEl.setAttribute('aria-label', 'Question for grounded prompt');
				text.inputEl.addClass('kg-question-input');
			});
		new Setting(this.contentEl)
			.setName('Relationship hops')
			.setDesc('Use 0 for the anchor’s own facts. Higher values include neighbouring notes (maximum 5).')
			.addSlider(slider => {
				slider.setLimits(0, 5, 1).setValue(this.hops).onChange(value => {
					this.hops = value;
					this.invalidatePreview();
				});
				slider.sliderEl.setAttribute('aria-label', 'Relationship hops');
			});
		new Setting(this.contentEl).setName('Prompt preview')
			.addButton(button => {
				this.generateButton = button;
				button.setButtonText('Generate preview').setCta().onClick(() => this.generatePreview());
			})
			.addButton(button => {
				this.copyButton = button;
				button.setButtonText('Copy prompt').setDisabled(true).onClick(() => this.copyPreview());
			});
		this.statusEl = this.contentEl.createDiv({ cls: 'kg-workflow-status' });
		this.statusEl.setAttribute('role', 'status');
		this.statusEl.setAttribute('aria-live', 'polite');
		this.previewEl = this.contentEl.createEl('textarea', { cls: 'kg-prompt-preview' });
		this.previewEl.readOnly = true;
		this.previewEl.setAttribute('aria-label', 'Generated grounded prompt');
		this.previewEl.placeholder = 'Generate a preview to inspect the exact prompt that will be copied.';
		this.contentEl.createEl('h3', { text: 'Evidence' });
		this.evidenceList = new TripleList(this.contentEl.createDiv({ cls: 'kg-evidence-list' }), {
			emptyMessage: 'No evidence in the current preview.',
		});
		this.evidenceList.setTriples([]);
		this.invalidatePreview();
	}

	private invalidatePreview(): void {
		this.revision++;
		this.preview = null;
		if (this.previewEl) this.previewEl.value = '';
		this.evidenceList?.setTriples([]);
		this.copyButton?.setDisabled(true);
		this.generateButton?.setDisabled(this.generating || !this.anchor);
		this.statusEl?.setText(this.generating
			? 'Inputs changed. The current generation will be discarded; generate again when it finishes.'
			: 'Generate a preview for the current inputs.');
	}

	private async generatePreview(): Promise<void> {
		if (!this.anchor || this.generating || !this.opened) return;
		this.invalidatePreview();
		const revision = this.revision;
		const anchor = this.anchor;
		const question = this.question;
		const hops = this.hops;
		const settings = { ...this.plugin.settings, fileClassMappings: { ...this.plugin.settings.fileClassMappings } };
		this.generating = true;
		this.generateButton?.setDisabled(true);
		this.statusEl?.setText('Reading note relationships and generating the preview…');
		try {
			const sourceMap = await SourceMapLoader.loadFromPath(this.app.vault, settings.sourceMapPath);
			const result = await GraphRAGBuilder.buildFromRequest({
				anchor, app: this.app, settings, sourceMap, hops, question,
			});
			if (!this.opened || revision !== this.revision) return;
			this.preview = result;
			if (this.previewEl) this.previewEl.value = result.prompt;
			this.evidenceList?.setTriples(result.evidence);
			this.copyButton?.setDisabled(false);
			const sources = new Set(result.evidence.map(triple => triple.provenance.source)).size;
			this.statusEl?.setText(result.evidence.length > 0
				? `${result.evidence.length} facts from ${sources} source notes · ${hops} hops · ${anchor.path}`
				: 'No facts found for this anchor. The prompt explicitly reports missing evidence.');
		} catch (error) {
			if (!this.opened || revision !== this.revision) return;
			const message = error instanceof Error ? error.message : String(error);
			this.statusEl?.setText(`Could not generate the preview: ${message}`);
			new Notice(`KG Forge: could not generate GraphRAG preview — ${message}`);
		} finally {
			this.generating = false;
			if (this.opened) {
				this.generateButton?.setDisabled(!this.anchor);
				if (revision !== this.revision) this.statusEl?.setText('Inputs changed. Generate a new preview.');
			}
		}
	}

	private async copyPreview(): Promise<void> {
		if (!this.opened || !this.preview || this.generating) return;
		const revision = this.revision;
		const prompt = this.preview.prompt;
		try {
			await navigator.clipboard.writeText(prompt);
			if (this.opened && revision === this.revision) {
				this.statusEl?.setText('The displayed prompt was copied to the clipboard.');
				new Notice('Prompt copied to clipboard.');
			}
		} catch (error) {
			if (!this.opened || revision !== this.revision) return;
			const message = error instanceof Error ? error.message : String(error);
			this.statusEl?.setText(`Clipboard unavailable: ${message}. Select and copy the preview manually.`);
			new Notice('Clipboard unavailable. Copy the preview manually.');
		}
	}

	onClose(): void {
		this.opened = false;
		this.revision++;
		this.preview = null;
		this.evidenceList?.unload();
		this.contentEl.empty();
	}
}

/** Eligible notes only, with full paths to distinguish duplicate basenames. */
class AnchorSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, private cacheFolder: string, private onChoose: (file: TFile) => void) {
		super(app);
		this.setPlaceholder('Choose an anchor note…');
	}

	getItems(): TFile[] {
		return getSourceFiles(this.app.vault, this.cacheFolder).sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(item: TFile): string { return item.path; }
	onChooseItem(item: TFile): void { this.onChoose(item); }
}
