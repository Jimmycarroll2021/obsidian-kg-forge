# Publishing KG Forge as an Obsidian Community Plugin

This guide explains how to publish **Knowledge Forge** so anyone can install it from **Settings → Community plugins → Browse**.

> **Update (2026):** Obsidian no longer accepts plugin submissions via GitHub pull requests to `obsidianmd/obsidian-releases`. Submissions now go through the **Obsidian Community Developer Portal** at https://community.obsidian.md.

## What you need

- A GitHub account.
- A public GitHub repository for `obsidian-kg-forge`.
- A GitHub release whose tag matches the `version` in `manifest.json`.
- An Obsidian account (for the portal).

## Files required for each release

Obsidian downloads these three files from your GitHub release:

- `main.js` — bundled plugin code
- `manifest.json` — plugin metadata
- `styles.css` — plugin styles

KG Forge produces all three when you run `npm run build`.

## Step-by-step

### 1. Repository (already done)

Source code lives at:

```
https://github.com/Jimmycarroll2021/obsidian-kg-forge
```

### 2. Create a release

Push a tag matching the version in `manifest.json`:

```bash
git tag -a 1.0.1 -m "Release 1.0.1"
git push origin 1.0.1
```

The included GitHub Action (`.github/workflows/release.yml`) will build and publish the release automatically.

If the workflow ever fails, create the release manually from the built files:

```bash
npm run build
```

Then upload `main.js`, `manifest.json`, and `styles.css` to a new GitHub release.

### 3. Submit through the Obsidian Community Developer Portal

1. Go to https://community.obsidian.md and sign in with your Obsidian account.
2. Link your GitHub account if prompted.
3. Navigate to **Plugins → New plugin**.
4. Enter the repository URL:

```
https://github.com/Jimmycarroll2021/obsidian-kg-forge
```

5. Review and agree to the Developer Policies.
6. Confirm that you will continue supporting the plugin.
7. Click **Submit**.

### 4. Automated review

After submission, an automated scan checks the plugin. If it reports issues, fix them in the repository, bump the version, create a new release, and update the submission in the portal.

### 5. Human review and publish

Once the automated scan passes, the Obsidian team reviews the plugin. After approval, a bot mirrors it into `obsidianmd/obsidian-releases` and it appears in **Settings → Community plugins → Browse** within 1–2 days.

## Current submission details

Use these values in the portal:

| Field | Value |
|---|---|
| Repository URL | `https://github.com/Jimmycarroll2021/obsidian-kg-forge` |
| Plugin ID | `kg-forge` |
| Name | `Knowledge Forge` |
| Author | `Jimmi (Jimmycarroll2021)` |
| Description | `Build a typed knowledge graph from your vault with triples, provenance, GraphRAG prompts, and competency questions.` |

## Notes

- Keep `main.js` and `main.js.map` in `.gitignore`; they are built by CI and attached to releases, not committed to source.
- Update `manifest.json` and `versions.json` before each release.
- Do not include `node_modules` in the GitHub repository; it is ignored by `.gitignore`.
- Remove the `kg-forge-1.0.0.tar.gz` archive from the repo if you want a cleaner source tree; it is not needed for submission.
