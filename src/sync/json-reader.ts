import * as fs from "fs";
import * as path from "path";
import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { FMODExportData, NewerExportInfo } from "../types";
import { parseExportFilename } from "../utils/filename";

/**
 * Read and parse a JSON export file.
 * Supports both vault-relative and absolute paths.
 */
export async function readJsonFile(app: App, filePath: string): Promise<FMODExportData> {
	// If it looks like a relative path, try vault first
	if (!path.isAbsolute(filePath)) {
		const vaultFile = app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (vaultFile instanceof TFile) {
			const content = await app.vault.read(vaultFile);
			return JSON.parse(content);
		}
	}

	// Read using Node.js fs (works for absolute paths outside vault)
	return new Promise((resolve, reject) => {
		fs.readFile(filePath, "utf8", (err, data) => {
			if (err) {
				reject(new Error(`Failed to read file: ${err.message}`));
				return;
			}
			try {
				resolve(JSON.parse(data));
			} catch (parseErr) {
				reject(new Error(`Failed to parse JSON: ${parseErr}`));
			}
		});
	});
}

/**
 * Scan a directory for newer exports matching the same project name.
 * Returns info about the newest file if it's newer than the current file.
 */
export async function findNewerExport(currentPath: string): Promise<NewerExportInfo | null> {
	if (!currentPath) return null;

	const directory = path.dirname(currentPath);
	const currentFilename = path.basename(currentPath);
	const currentParsed = parseExportFilename(currentFilename);

	if (!currentParsed) return null; // Current file doesn't match expected format

	const currentProjectName = currentParsed.projectName;
	const currentDate = currentParsed.date;

	return new Promise((resolve) => {
		fs.readdir(directory, (err, files) => {
			if (err) {
				resolve(null);
				return;
			}

			let newestExport: NewerExportInfo | null = null;

			for (const file of files) {
				if (!file.endsWith(".json")) continue;

				const parsed = parseExportFilename(file);
				if (!parsed) continue;

				// Only consider files from the same project
				if (parsed.projectName !== currentProjectName) continue;

				// Check if this file is newer than current
				if (parsed.date > currentDate) {
					if (!newestExport || parsed.date > newestExport.exportDate) {
						newestExport = {
							filePath: path.join(directory, file),
							projectName: parsed.projectName,
							exportDate: parsed.date,
						};
					}
				}
			}

			resolve(newestExport);
		});
	});
}
