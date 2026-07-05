import type { Plugin } from 'obsidian';
import type { ForgeSettings } from '../settings';

/**
 * Common types used by the KG Forge UI modules.
 *
 * These aliases keep the UI decoupled from the concrete plugin class in
 * src/main.ts while still allowing access to settings and Obsidian APIs.
 */

/** Plugin reference with typed settings. */
export type PluginWithSettings = Plugin & {
	settings: ForgeSettings;
	saveSettings(): Promise<void>;
};

/** Leaf view identifier for the graph view. */
export const VIEW_TYPE_KG_GRAPH = 'kg-forge-graph-view';

/** Leaf view identifier for the competency-question view. */
export const VIEW_TYPE_COMPETENCY_QUESTIONS = 'kg-forge-competency-questions-view';
