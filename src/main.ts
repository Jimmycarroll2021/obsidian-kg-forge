/**
 * Knowledge Forge — main plugin entry point.
 *
 * This Obsidian community plugin turns a vault into a knowledge graph by:
 *   - Extracting typed triples (S-P-O) from frontmatter, Breadcrumbs fields, and wikilinks.
 *   - Enforcing provenance (source, confidence, timestamp, lineage) on every fact.
 *   - Validating schema contracts (folder → fileClass).
 *   - Building GraphRAG prompts from k-hop subgraphs.
 *   - Tracking competency questions against the graph.
 */

import { Plugin } from 'obsidian';
import { loadForgeSettings, type ForgeSettings } from './settings';
import { KGForgeSettingsTab } from './ui/SettingsTab';
import { KnowledgeGraphView } from './ui/KnowledgeGraphView';
import { CompetencyQuestionView } from './ui/CompetencyQuestionView';
import { registerCommands } from './commands';
import {
	VIEW_TYPE_KG_GRAPH,
	VIEW_TYPE_COMPETENCY_QUESTIONS,
} from './constants';

export default class KGForgePlugin extends Plugin {
	declare settings: ForgeSettings;
	private settingsWrite: Promise<void> = Promise.resolve();

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register custom leaf views.
		this.registerView(
			VIEW_TYPE_KG_GRAPH,
			(leaf) => new KnowledgeGraphView(leaf, this)
		);
		this.registerView(
			VIEW_TYPE_COMPETENCY_QUESTIONS,
			(leaf) => new CompetencyQuestionView(leaf, this)
		);

		// Ribbon icons for quick access.
		this.addRibbonIcon('git-fork', 'Open knowledge forge graph', async () => {
			await this.activateGraphView();
		});
		this.addRibbonIcon('help-circle', 'Open competency questions', async () => {
			await this.activateCompetencyQuestionView();
		});

		// User-facing commands.
		registerCommands(this);

		// View-opening commands.
		this.addCommand({
			id: 'open-graph-view',
			name: 'Open knowledge graph',
			callback: () => this.activateGraphView(),
		});
		this.addCommand({
			id: 'open-competency-questions',
			name: 'Open competency questions',
			callback: () => this.activateCompetencyQuestionView(),
		});

		// Settings tab.
		this.addSettingTab(new KGForgeSettingsTab(this.app, this));
	}

	onunload(): void {
		// Views are automatically detached by Obsidian.
	}

	async loadSettings(): Promise<void> {
		this.settings = loadForgeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		// Snapshot each edit and preserve save ordering when multiple views edit data.
		const snapshot = structuredClone(this.settings);
		const write = this.settingsWrite.catch(() => {}).then(() => this.saveData(snapshot));
		this.settingsWrite = write;
		await write;
	}

	async activateGraphView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_KG_GRAPH)[0];
		if (existing) {
			await workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (!leaf) {
			console.error('[KG Forge] Could not create a leaf for the graph view.');
			return;
		}
		await leaf.setViewState({ type: VIEW_TYPE_KG_GRAPH, active: true });
		await workspace.revealLeaf(leaf);
	}

	async activateCompetencyQuestionView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_COMPETENCY_QUESTIONS)[0];
		if (existing) {
			await workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (!leaf) {
			console.error('[KG Forge] Could not create a leaf for the competency-question view.');
			return;
		}
		await leaf.setViewState({
			type: VIEW_TYPE_COMPETENCY_QUESTIONS,
			active: true,
		});
		await workspace.revealLeaf(leaf);
	}
}
