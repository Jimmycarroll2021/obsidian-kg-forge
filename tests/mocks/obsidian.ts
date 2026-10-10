import { vi } from 'vitest';

export function normalizePath(path: string): string { return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, ''); }
export class TFile {
 path: string; basename: string; extension: string; name: string; stat = { ctime: 1, mtime: 1, size: 0 };
 constructor(path = '') { this.path = path; this.name = path.split('/').pop()!; const dot = this.name.lastIndexOf('.'); this.basename = dot < 0 ? this.name : this.name.slice(0, dot); this.extension = dot < 0 ? '' : this.name.slice(dot + 1); }
}
export class TFolder { constructor(public path: string) {} }
export class Notice { static messages: string[] = []; constructor(message: string) { Notice.messages.push(message); } }
export class Component {
 private cleanups: Array<() => void> = [];
 addChild<T extends Component>(child: T): T { child.load(); this.cleanups.push(() => child.unload()); return child; }
 register(callback: () => void): void { this.cleanups.push(callback); }
 registerEvent(ref: { off?: () => void }): void { if (ref.off) this.register(ref.off); }
 load(): void { this.onload(); } onload(): void {}
 unload(): void { this.cleanups.splice(0).forEach(fn => fn()); this.onunload(); } onunload(): void {}
}
export class Modal extends Component {
 static instances: Modal[] = []; contentEl = document.createElement('div'); modalEl = document.createElement('div'); opened = false;
 constructor(public app: any) { super(); this.modalEl.append(this.contentEl); Modal.instances.push(this); }
 open(): void { this.opened = true; document.body.append(this.modalEl); this.onOpen(); }
 close(): void { this.opened = false; this.onClose(); this.modalEl.remove(); }
 onOpen(): void {} onClose(): void {}
}
export class FuzzySuggestModal<T> extends Modal {
 setPlaceholder(_text: string): void {} getItems(): T[] { return []; } getItemText(_item: T): string { return ''; }
 onChooseItem(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
}
export class ItemView extends Component {
 app: any; contentEl = document.createElement('div');
 constructor(public leaf: any) { super(); this.app = leaf.app; }
 async onOpen(): Promise<void> {} async onClose(): Promise<void> {}
}
export class TextComponent {
 inputEl: HTMLInputElement;
 constructor(parent: HTMLElement) { this.inputEl = parent.appendChild(document.createElement('input')); this.inputEl.type = 'text'; }
 setValue(v: string): this { this.inputEl.value = v; return this; } getValue(): string { return this.inputEl.value; }
 setPlaceholder(v: string): this { this.inputEl.placeholder = v; return this; }
 setDisabled(v: boolean): this { this.inputEl.disabled = v; return this; }
 onChange(fn: (v: string) => unknown): this { this.inputEl.addEventListener('input', () => { void fn(this.inputEl.value); }); return this; }
}
export class TextAreaComponent {
 inputEl: HTMLTextAreaElement;
 constructor(parent: HTMLElement) { this.inputEl = parent.appendChild(document.createElement('textarea')); }
 setValue(v: string): this { this.inputEl.value = v; return this; }
 setPlaceholder(v: string): this { this.inputEl.placeholder = v; return this; }
 setDisabled(v: boolean): this { this.inputEl.disabled = v; return this; }
 onChange(fn: (v: string) => unknown): this { this.inputEl.addEventListener('input', () => { void fn(this.inputEl.value); }); return this; }
}
export class ButtonComponent {
 buttonEl: HTMLButtonElement;
 constructor(parent: HTMLElement) { this.buttonEl = parent.appendChild(document.createElement('button')); }
 setButtonText(v: string): this { this.buttonEl.textContent = v; return this; }
 setTooltip(v: string): this { this.buttonEl.title = v; return this; }
 setCta(): this { this.buttonEl.classList.add('mod-cta'); return this; }
 setDisabled(v: boolean): this { this.buttonEl.disabled = v; return this; }
 onClick(fn: (evt: MouseEvent) => unknown): this { this.buttonEl.addEventListener('click', e => { void fn(e); }); return this; }
}
export class SliderComponent {
 sliderEl: HTMLInputElement;
 constructor(parent: HTMLElement) { this.sliderEl = parent.appendChild(document.createElement('input')); this.sliderEl.type = 'range'; }
 setLimits(min: number, max: number, step: number): this { Object.assign(this.sliderEl, { min: String(min), max: String(max), step: String(step) }); return this; }
 setValue(v: number): this { this.sliderEl.value = String(v); return this; }
 setDynamicTooltip(): this { return this; }
 onChange(fn: (v: number) => unknown): this { this.sliderEl.addEventListener('input', () => { void fn(Number(this.sliderEl.value)); }); return this; }
}
export class ToggleComponent {
 toggleEl: HTMLInputElement;
 constructor(parent: HTMLElement) { this.toggleEl = parent.appendChild(document.createElement('input')); this.toggleEl.type = 'checkbox'; }
 setValue(v: boolean): this { this.toggleEl.checked = v; return this; }
 onChange(fn: (v: boolean) => unknown): this { this.toggleEl.addEventListener('change', () => { void fn(this.toggleEl.checked); }); return this; }
}
export class Setting {
 settingEl: HTMLDivElement; controlEl: HTMLDivElement; nameEl: HTMLDivElement; descEl: HTMLDivElement;
 constructor(parent: HTMLElement) { this.settingEl = parent.appendChild(document.createElement('div')); this.settingEl.className = 'setting-item'; const info = this.settingEl.appendChild(document.createElement('div')); this.nameEl = info.appendChild(document.createElement('div')); this.descEl = info.appendChild(document.createElement('div')); this.controlEl = this.settingEl.appendChild(document.createElement('div')); }
 setName(v: string): this { this.nameEl.textContent = v; return this; } setDesc(v: string): this { this.descEl.textContent = v; return this; }
 setHeading(): this { return this; }
 addText(fn: (c: TextComponent) => unknown): this { fn(new TextComponent(this.controlEl)); return this; }
 addTextArea(fn: (c: TextAreaComponent) => unknown): this { fn(new TextAreaComponent(this.controlEl)); return this; }
 addButton(fn: (c: ButtonComponent) => unknown): this { fn(new ButtonComponent(this.controlEl)); return this; }
 addSlider(fn: (c: SliderComponent) => unknown): this { fn(new SliderComponent(this.controlEl)); return this; }
 addToggle(fn: (c: ToggleComponent) => unknown): this { fn(new ToggleComponent(this.controlEl)); return this; }
}
export class PluginSettingTab { containerEl = document.createElement('div'); constructor(public app: any, public plugin: any) {} }
export class Plugin extends Component {
 commands: any[] = []; data: unknown = null;
 constructor(public app: any) { super(); }
 addCommand(command: any): void { this.commands.push(command); }
 loadData = vi.fn(async () => this.data);
 saveData = vi.fn(async (data: unknown) => { this.data = structuredClone(data); });
 registerView(): void {} addRibbonIcon(): void {} addSettingTab(): void {}
}
export function installDomHelpers(): void {
 const p = HTMLElement.prototype as any;
 p.empty = function() { this.replaceChildren(); };
 p.addClass = function(...classes: string[]) { this.classList.add(...classes); };
 p.removeClass = function(...classes: string[]) { this.classList.remove(...classes); };
 p.setText = function(text: string) { this.textContent = text; };
 p.createEl = function(tag: string, options: any = {}) {
  const el = document.createElement(tag);
  if (typeof options === 'string') el.className = options;
  else { if (options.cls) el.className = Array.isArray(options.cls) ? options.cls.join(' ') : options.cls; if (options.text) el.textContent = options.text; if (options.value !== undefined) (el as HTMLInputElement).value = options.value; if (options.attr) for (const [key, value] of Object.entries(options.attr)) el.setAttribute(key, String(value)); }
  this.appendChild(el); return el;
 };
 p.createDiv = function(options: any) { return this.createEl('div', options); };
 p.createSpan = function(options: any) { return this.createEl('span', options); };
}
