import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import KGForgePlugin from '../../src/main';
import { GraphRAGBuilder } from '../../src/engine/GraphRAGBuilder';
import { SourceMapLoader } from '../../src/engine/SourceMapLoader';
import { createMockApp } from '../helpers/vault';
import { Notice } from '../mocks/obsidian';

function sampleNotes(): Record<string, string> {
 const root = resolve('examples/sample-vault');
 return Object.fromEntries(readdirSync(root, { recursive: true }).filter(p => String(p).endsWith('.md'))
  .map(path => [String(path), readFileSync(join(root, String(path)), 'utf8')]));
}
describe('sample-vault command journey', () => {
 it('extracts duplicate names, previews grounded facts, and safely repeats every export', async () => {
  const { app, contents, files, setActiveFile } = createMockApp(sampleNotes());
  const plugin = new KGForgePlugin(app, {} as never);
  await plugin.onload();
  const command = (id: string) => (plugin as any).commands.find((c: any) => c.id === id);
  setActiveFile('concepts/Graph.md');
  expect(command('extract-triples').checkCallback(true)).toBe(true);
  command('extract-triples').checkCallback(false);
  await vi.waitFor(() => expect(contents.has('Knowledge Forge/concepts/Graph.md.triples.json')).toBe(true));
  setActiveFile('papers/Graph.md'); command('extract-triples').checkCallback(false);
  await vi.waitFor(() => expect(contents.has('Knowledge Forge/papers/Graph.md.triples.json')).toBe(true));
  const cache = JSON.parse(contents.get('Knowledge Forge/concepts/Graph.md.triples.json')!);
  expect(cache.triples.every((t: any) => t.subject === 'concepts/Graph.md')).toBe(true);
  const sourceMap = await SourceMapLoader.load(app.vault, plugin.settings.sourceMapPath);
  const preview = await GraphRAGBuilder.buildFromRequest({ anchor: files.get('concepts/Graph.md')! as never, app,settings:plugin.settings,sourceMap,hops:2,question:'What does graph traversal enable?' });
  expect(preview.prompt).toContain('What does graph traversal enable?');
  expect(preview.prompt).toContain('concepts/Traversal.md');
  expect(preview.evidence.some(t => t.subject === 'concepts/Isolated.md')).toBe(false);
  for (let repeat = 0; repeat < 2; repeat++) {
   await command('validate-schema').callback();
   await command('export-cypher').callback();
   await command('export-dataview').callback();
  }
  expect(contents.get('Knowledge Forge/schema-validation-report.md')).toContain('Files scanned: 6');
  expect(contents.get('Knowledge Forge/schema-validation-report.md')).toContain('SRC-UNMAPPED');
  const cypher = contents.get('Knowledge Forge/kg-forge-export.cypher')!;
  expect(cypher).toContain("id: 'concepts/Graph.md'");
  expect(cypher).toContain("id: 'papers/Graph.md'");
  expect(cypher).not.toContain('dataview-queries.md');
  expect(cypher).toContain('SET r.confidence');
  expect(contents.get('Knowledge Forge/dataview-queries.md')).toContain('FROM "concepts"');
  expect(Notice.messages.some(message => message.includes('failed'))).toBe(false);
 });
 it('runs on first use without an index or output directory', async () => {
  const { app, contents } = createMockApp({ 'Topic.md':'[[Dependency]]', 'Dependency.md':'' });
  const plugin = new KGForgePlugin(app, {} as never); await plugin.onload();
  await (plugin as any).commands.find((c: any) => c.id === 'export-cypher').callback();
  expect(contents.get('Knowledge Forge/kg-forge-export.cypher')).toContain("id: 'Topic.md'");
 });
});
