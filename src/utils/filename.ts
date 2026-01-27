import { MAX_FILENAME_LENGTH } from "../constants";

/**
 * Sanitize a string to be safe for use as a filename.
 * Removes/replaces invalid characters and limits length.
 */
export function sanitizeFilename(name: string): string {
	let result = name;
	const badChars = ["<", ">", ":", "/", "|", "?", "*", '"', "\\"];
	for (const c of badChars) {
		result = result.split(c).join("-");
	}
	result = result.replace(/\s+/g, "_");
	result = result.replace(/-+/g, "-");
	result = result.replace(/^-|-$/g, "");

	// Truncate if too long
	if (result.length > MAX_FILENAME_LENGTH) {
		result = result.substring(0, MAX_FILENAME_LENGTH - 3) + "...";
	}

	return result;
}

/**
 * Parse a timestamped export filename to extract project name and date.
 * Expected format: ProjectName_YYYY-MM-DD_HHMMSS.json
 */
export function parseExportFilename(filename: string): { projectName: string; date: Date } | null {
	const baseName = filename.replace(/\.json$/i, "");
	const match = baseName.match(/^(.+)_(\d{4}-\d{2}-\d{2})_(\d{6})$/);
	if (!match) return null;

	const [, projectName, dateStr, timeStr] = match;
	const year = parseInt(dateStr.substring(0, 4));
	const month = parseInt(dateStr.substring(5, 7)) - 1; // 0-indexed
	const day = parseInt(dateStr.substring(8, 10));
	const hour = parseInt(timeStr.substring(0, 2));
	const minute = parseInt(timeStr.substring(2, 4));
	const second = parseInt(timeStr.substring(4, 6));

	return { projectName, date: new Date(year, month, day, hour, minute, second) };
}
