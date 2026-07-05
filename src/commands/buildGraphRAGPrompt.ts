import { App, FuzzySuggestModal, Notice, Plugin, TFile } from 'obsidian';
import { GraphRAGBuilder } from '../engine/GraphRAGBuilder';
import { SourceMapLoader } from '../engine/SourceMapLoader';
import type { ForgeSettings } from '../settings';

type PluginWithSettings = Plugin & { settings: ForgeSettings };

const COMMAND_ID = 'build-graphrag-prompt';
const COMMAND_NAME = 'Build GraphRAG prompt';

/**
 * Register the "Build GraphRAG prompt" command.
 *
 * Prompts the user to pick an anchor note with a fuzzy finder, builds a k-hop
 * subgraph prompt from typed triples, and copies the result to the clipboard.
 */
export function registerBuildGraphRAGPromptCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: COMMAND_ID,
		name: COMMAND_NAME,
		callback: async () => {
			try {
				await buildGraphRAGPrompt(plugin as PluginWithSettings);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(`[KG Forge] ${COMMAND_NAME} failed`, err);
				new Notice(`KG Forge: GraphRAG prompt failed — ${message}`);
			}
		},
	});
}

async function buildGraphRAGPrompt(plugin: PluginWithSettings): Promise<void> {
	const { settings } = plugin;
	const vault = plugin.app.vault;

	const modal = new AnchorNoteModal(plugin.app);
	const anchor = await modal.promise;
	if (!anchor) {
		new Notice('No anchor note selected');
		return;
	}

	const sourceMap = await SourceMapLoader.load(vault, settings.sourceMapPath);
	const hops = Math.max(1, Math.min(settings.defaultHopCount, 4));

	const prompt = await GraphRAGBuilder.buildPrompt({
		anchor,
		app: plugin.app,
		settings,
		sourceMap,
		hops,
	});

	await navigator.clipboard.writeText(prompt);
	new Notice(`KG Forge: GraphRAG prompt (${prompt.length} chars) copied to clipboard`);
}

/**
 * Fuzzy finder modal for selecting the GraphRAG anchor note.
 *
 * Resolves with the chosen TFile, or `null` if the user cancels.
 */
class AnchorNoteModal extends FuzzySuggestModal<TFile> {
	resolve: (value: TFile | null) => void;
	reject: (reason?: unknown) => void;
	promise: Promise<TFile | null>;

	constructor(app: App) {
		super(app);
		this.setPlaceholder('Pick an anchor note for graphrag...');
		this.promise = new Promise<TFile | null>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.resolve(file);
	}

	onClose(): void {
		// If onChooseItem already resolved this will be a no-op; otherwise it
		// cancels the selection.
		this.resolve(null);
	}
}
