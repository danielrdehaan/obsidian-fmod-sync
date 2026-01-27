import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { FMODEvent, SyncStats, SkipReason } from "../types";
import { sanitizeFilename } from "../utils/filename";
import { parseFrontmatter } from "../markdown/frontmatter";
import { generateMarkdown } from "../markdown/generator";

/**
 * Ensure a folder exists in the vault, creating it and parent folders if needed.
 */
export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const folder = app.vault.getAbstractFileByPath(folderPath);
	if (folder instanceof TFolder) {
		return;
	}

	// Create folder and all parent folders
	const parts = folderPath.split("/");
	let currentPath = "";

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(currentPath);
		if (!existing) {
			await app.vault.createFolder(currentPath);
		}
	}
}

/**
 * Scan existing notes in a folder tree, returning a map of path -> content.
 */
export async function scanExistingNotes(app: App, basePath: string): Promise<Map<string, string>> {
	const notes = new Map<string, string>();
	const folder = app.vault.getAbstractFileByPath(basePath);

	if (!(folder instanceof TFolder)) {
		return notes;
	}

	const scanFolder = async (f: TFolder): Promise<void> => {
		for (const child of f.children) {
			if (child instanceof TFile && child.extension === "md") {
				const content = await app.vault.read(child);
				notes.set(child.path, content);
			} else if (child instanceof TFolder) {
				await scanFolder(child);
			}
		}
	};

	await scanFolder(folder);
	return notes;
}

/**
 * Process a single FMOD event - create, update, or move the corresponding note.
 */
export async function processEvent(
	app: App,
	event: FMODEvent,
	outputPath: string,
	notesByGuid: Map<string, { path: string; content: string }>,
	notesByName: Map<string, { path: string; content: string }>,
	exportedAt: string,
	projectName: string,
	stats: SyncStats,
	skipped: SkipReason[]
): Promise<void> {
	const sanitizedName = sanitizeFilename(event.name);

	// Calculate target path (always mirrors FMOD folder structure)
	let targetPath: string;
	if (event.folder_path) {
		const sanitizedFolder = event.folder_path
			.split("/")
			.map((s) => sanitizeFilename(s))
			.join("/");
		targetPath = normalizePath(`${outputPath}/${sanitizedFolder}/${sanitizedName}.md`);
	} else {
		targetPath = normalizePath(`${outputPath}/${sanitizedName}.md`);
	}

	// Check for existing note by GUID
	const existingByGuid = notesByGuid.get(event.guid);
	// Check for existing note by filename
	const existingByName = notesByName.get(sanitizedName);

	let existingContent: string | null = null;
	let existingPath: string | null = null;
	let needsMove = false;

	if (existingByGuid) {
		// GUID match - this is a known event
		existingContent = existingByGuid.content;
		existingPath = existingByGuid.path;
		needsMove = existingPath !== targetPath;
	} else if (existingByName) {
		// Name match - might be a planned event or coincidence
		const frontmatter = parseFrontmatter(existingByName.content);
		const existingGuid = frontmatter.properties["guid"];

		if (!existingGuid) {
			// No GUID = planned event, link it
			existingContent = existingByName.content;
			existingPath = existingByName.path;
			needsMove = existingPath !== targetPath;
		} else if (existingGuid !== event.guid) {
			// Different GUID = different event with same name, skip
			stats.skipped++;
			skipped.push({
				event: event.name,
				reason: `Name collision: existing note has different GUID (${existingGuid})`,
			});
			return;
		}
	}

	// Ensure target folder exists
	const targetFolder = targetPath.substring(0, targetPath.lastIndexOf("/"));
	if (targetFolder) {
		await ensureFolderExists(app, targetFolder);
	}

	// Generate markdown content
	const markdown = generateMarkdown(
		event,
		existingContent,
		exportedAt,
		projectName
	);

	// Write or update file
	if (needsMove && existingPath) {
		// Delete old file
		const oldFile = app.vault.getAbstractFileByPath(existingPath);
		if (oldFile instanceof TFile) {
			await app.vault.delete(oldFile);
		}
		// Create at new location
		await app.vault.create(targetPath, markdown);
		stats.moved++;
	} else {
		const existingFile = app.vault.getAbstractFileByPath(targetPath);
		if (existingFile instanceof TFile) {
			await app.vault.modify(existingFile, markdown);
			stats.updated++;
		} else {
			await app.vault.create(targetPath, markdown);
			stats.created++;
		}
	}
}
