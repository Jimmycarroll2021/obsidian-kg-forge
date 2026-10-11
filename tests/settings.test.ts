import { describe, expect, it, vi } from 'vitest';
import KGForgePlugin from '../src/main';
import { DEFAULT_SETTINGS, loadForgeSettings } from '../src/settings';
import { createMockApp } from './helpers/vault';

describe('persistent settings', () => {
 it('migrates the legacy hidden output default without discarding other settings', () => {
  expect(loadForgeSettings({ cacheFolder: '.kg-forge', sourceMapPath: 'research/index.md' })).toMatchObject({
   cacheFolder: 'Knowledge Forge', sourceMapPath: 'research/index.md',
  });
 });
 it('clones defaults and keeps persisted questions after a reload', () => {
  const first = loadForgeSettings(null);
  first.competencyQuestions.push({ id: 'q1', question: 'How is Topic related?', status: 'covered' });
  first.fileClassMappings.concepts = 'changed';
  expect(DEFAULT_SETTINGS.competencyQuestions).toEqual([]);
  expect(DEFAULT_SETTINGS.fileClassMappings.concepts).toBe('concept');
  expect(loadForgeSettings(first).competencyQuestions).toEqual(first.competencyQuestions);
 });
 it('migrates old verdicts and bounds the default hop setting', () => {
  expect(loadForgeSettings({ defaultHopCount: 99, competencyQuestions: [{ id: 'q',question: 'Topic?',status: 'passing' }] })).toMatchObject({
   defaultHopCount: 5, competencyQuestions: [{ status: 'unvalidated' }],
  });
 });
 it('serialises snapshots and recovers from a failed write', async () => {
  const { app } = createMockApp({});
  const plugin = new KGForgePlugin(app, {} as never);
  await plugin.loadSettings();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writes: unknown[] = [];
  plugin.saveData = vi.fn(async data => { writes.push(structuredClone(data)); if (writes.length === 1) { await gate; throw new Error('Disk full'); } });
  plugin.settings.competencyQuestions = [{ id: 'q',question: 'First edit',status: 'unvalidated' }];
  const first = plugin.saveSettings();
  const firstFailure = expect(first).rejects.toThrow('Disk full');
  plugin.settings.competencyQuestions[0].question = 'Latest edit';
  const latest = plugin.saveSettings();
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ competencyQuestions: [{question: 'First edit'}] });
  release(); await firstFailure; await latest;
  expect(writes[1]).toMatchObject({ competencyQuestions: [{question: 'Latest edit'}] });
 });
});
