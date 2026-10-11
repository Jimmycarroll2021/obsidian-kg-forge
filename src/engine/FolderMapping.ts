/** Choose the most specific configured folder, including nested folders. */
export function mappedFileClass(
	filePath: string,
	mappings: Record<string, string>
): string | undefined {
	const path = filePath.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
	let match: string | undefined;
	let longest = -1;
	for (const [rawFolder, rawType] of Object.entries(mappings)) {
		const folder = rawFolder.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/')
			.replace(/^\/+|\/+$/g, '');
		const type = rawType.trim();
		if (folder && type && path.startsWith(`${folder}/`) && folder.length > longest) {
			match = type;
			longest = folder.length;
		}
	}
	return match;
}
