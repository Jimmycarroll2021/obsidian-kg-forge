import { vi } from 'vitest';
import { parse } from 'yaml';
import { TFile, TFolder } from '../mocks/obsidian';

type Note = string | { content: string; frontmatter?: Record<string, unknown> };
export function createMockApp(notes: Record<string, Note>) {
 const files = new Map<string, TFile>(); const contents = new Map<string, string>(); const folders = new Map<string, TFolder>();
 const frontmatters = new Map<string, Record<string, unknown>>();
 for (const [path, note] of Object.entries(notes)) {
  const content = typeof note === 'string' ? note : note.content;
  files.set(path, new TFile(path)); contents.set(path, content);
  const yaml = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  frontmatters.set(path, typeof note === 'object' && note.frontmatter ? note.frontmatter : yaml ? parse(yaml) ?? {} : {});
  const parts = path.split('/'); for (let i = 1; i < parts.length; i++) { const folder = parts.slice(0, i).join('/'); folders.set(folder, new TFolder(folder)); }
 }
 function events() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  function on(name: string, fn: (...args: any[]) => void) { const set = listeners.get(name) ?? new Set(); set.add(fn); listeners.set(name, set); return { off: () => set.delete(fn) }; }
  function trigger(name: string, ...args: any[]) { listeners.get(name)?.forEach(fn => fn(...args)); }
  return { on, trigger };
 }
 const vaultEvents = events(), metadataEvents = events(), workspaceEvents = events();
 let active = files.values().next().value ?? null;
 function parentExists(path: string) { const parent = path.slice(0, path.lastIndexOf('/')); if (path.includes('/') && !folders.has(parent)) throw new Error('Parent folder does not exist: ' + parent); }
 const isVisible = (path: string) => !path.split('/').some(part => part.startsWith('.'));
 const vault = {
  ...vaultEvents,
  configDir: '.obsidian',
  getMarkdownFiles: () => [...files.values()].filter(f => f.extension === 'md' && isVisible(f.path)),
  getAbstractFileByPath: (path: string) => isVisible(path) ? files.get(path) ?? folders.get(path) ?? null : null,
  cachedRead: vi.fn(async (file: TFile) => { if (!contents.has(file.path)) throw new Error('Missing note: ' + file.path); return contents.get(file.path)!; }),
  read: vi.fn(async (file: TFile) => contents.get(file.path)!),
  createFolder: vi.fn(async (path: string) => { if (!isVisible(path)) throw new Error('Hidden path requires Adapter API'); if (files.has(path) || folders.has(path)) throw new Error('Path already exists'); parentExists(path); const folder = new TFolder(path); folders.set(path, folder); return folder; }),
  create: vi.fn(async (path: string, content: string) => { if (!isVisible(path)) throw new Error('Hidden path requires Adapter API'); if (files.has(path) || folders.has(path)) throw new Error('Path already exists'); parentExists(path); const file = new TFile(path); files.set(path, file); contents.set(path, content); return file; }),
  process: vi.fn(async (file: TFile, fn: (content: string) => string) => { const value = fn(contents.get(file.path)!); contents.set(file.path, value); return value; }),
 };
 const metadataCache = {
  ...metadataEvents,
  resolvedLinks: {} as Record<string, Record<string, number>>,
  unresolvedLinks: {} as Record<string, Record<string, number>>,
  getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file.path) ?? {} }),
  getFirstLinkpathDest: (link: string, source: string) => {
   const target = link.split('#')[0]; if (!target) return files.get(source) ?? null;
   const base = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : '';
   const normalize = (v: string) => { const out: string[] = []; for (const part of v.split('/')) { if (part === '..') out.pop(); else if (part !== '.' && part) out.push(part); } return out.join('/'); };
   for (const candidate of [normalize(base + target), normalize(target)]) { const file = files.get(candidate) ?? files.get(candidate + '.md'); if (file) return file; }
   return [...files.values()].find(f => f.basename === target || f.name === target) ?? null;
  },
 };
 const leaf = { openFile: vi.fn(async () => {}), setViewState: vi.fn(async () => {}) };
 const workspace = { getActiveFile: () => active, getLeaf: () => leaf, getRightLeaf: () => leaf, getLeavesOfType: () => [], revealLeaf: vi.fn(async () => {}), openLinkText: vi.fn(async () => {}), ...workspaceEvents };
 const app = { vault, metadataCache, workspace } as any; Object.assign(leaf, { app });
 return { app, files, contents, folders, leaf, setActiveFile: (path: string | null) => { active = path ? files.get(path) ?? null : null; workspaceEvents.trigger('file-open', active); } };
}
