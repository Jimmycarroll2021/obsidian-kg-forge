# Publishing KG Forge as an Obsidian Community Plugin

This guide explains how to turn the local plugin source into a real Obsidian Community Plugin that anyone can install from **Settings → Community plugins → Browse**.

## What you need

- A GitHub account.
- A public GitHub repository for `obsidian-kg-forge`.
- A release tag (e.g. `1.0.0`).

## Files required for submission

Obsidian's community plugin registry requires three files attached to each GitHub release:

- `main.js` — bundled plugin code
- `manifest.json` — plugin metadata
- `styles.css` — plugin styles (can be empty, but must exist)

KG Forge already produces all three when you run `npm run build`.

## Step-by-step

### 1. Create a GitHub repository

1. Go to https://github.com/new
2. Name it `obsidian-kg-forge`.
3. Make it **public**.
4. Do **not** initialize it with a README, .gitignore, or license (those files already exist here).

### 2. Push this folder to GitHub

Open a terminal in `C:/Users/Jimmy/Documents/00.VECTORS/obsidian-kg-forge` and run:

```bash
git init
git add .
git commit -m "Initial release: KG Forge v1.0.0"
git branch -M main
git remote add origin https://github.com/Jimmycarroll2021/obsidian-kg-forge.git
git push -u origin main
```

### 3. Create a release

The included GitHub Action (`.github/workflows/release.yml`) will build and draft a release automatically when you push a tag.

```bash
git tag -a 1.0.0 -m "Release 1.0.0"
git push origin 1.0.0
```

After a minute, visit **GitHub → Releases** and publish the draft release.

### 4. Submit to Obsidian

1. Fork https://github.com/obsidianmd/obsidian-releases
2. Edit `community-plugins.json` and add an entry for KG Forge:

```json
{
  "id": "kg-forge",
  "name": "Knowledge Forge",
  "author": "Jimmi (Jimmycarroll2021)",
  "description": "Build a typed knowledge graph from your vault with triples, provenance, GraphRAG prompts, and competency questions.",
  "repo": "Jimmycarroll2021/obsidian-kg-forge"
}
```

3. Open a pull request with the title: `Add KG Forge plugin`.
4. Wait for Obsidian's review. They typically check that:
   - `manifest.json` is valid
   - `main.js` loads without errors
   - The plugin does not use undocumented/private APIs
   - The plugin follows the [developer policies](https://docs.obsidian.md/Developer+policies)

### 5. After acceptance

Once the PR is merged, users can find **Knowledge Forge** in Obsidian's community plugin browser.

## Local release package (optional)

If you want to share the plugin manually before publishing, the current build artifacts are:

- `main.js`
- `manifest.json`
- `styles.css`

These are also copied to your vault at:

```
C:/Users/Jimmy/Documents/00.VECTORS/KnowledgeGraph papers/.obsidian/plugins/kg-forge/
```

## Notes

- Keep `main.js` in `.gitignore`; it is built by CI and attached to releases, not committed to source.
- Update `manifest.json` and `versions.json` before each release. The included `version-bump.mjs` script handles this when run via `npm version`.
- Do not include `node_modules` in the GitHub repository; it is ignored by `.gitignore`.
