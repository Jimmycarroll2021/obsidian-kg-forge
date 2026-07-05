/**
 * Common type aliases used across the Knowledge Forge plugin.
 */

import type { Plugin } from 'obsidian';
import type { ForgeSettings } from './settings';

/** Plugin reference with typed settings and helpers. */
export type PluginWithSettings = Plugin & {
	settings: ForgeSettings;
	saveSettings(): Promise<void>;
};
