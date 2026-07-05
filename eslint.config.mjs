import tsParser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{ ignores: ["node_modules/", "main.js", "esbuild.config.mjs", "version-bump.mjs"] },
	...tseslint.configs.recommendedTypeChecked.map((c) => ({ ...c, files: ["src/**/*.ts"] })),
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
