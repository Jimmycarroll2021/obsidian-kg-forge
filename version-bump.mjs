import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
	console.error("npm_package_version not set; run via npm version.");
	process.exit(1);
}

// Update manifest.json
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

// Update versions.json
const versions = JSON.parse(readFileSync("versions.json", "utf8") || "{}");
versions[targetVersion] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");

console.log(`Version bumped to ${targetVersion}`);
