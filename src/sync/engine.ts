import { Notice, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type {
	FMODProjectConfig,
	FMODExportData,
	SyncStats,
	SyncProgress,
	SkipReason,
} from "../types";
import { validateExportData } from "../utils/validation";
import { parseFrontmatter } from "../markdown/frontmatter";
import { readJsonFile } from "./json-reader";
import { ensureFolderExists, scanExistingNotes, processEvent } from "./processor";

export interface SyncEngineCallbacks {
	onProgress?: (progress: SyncProgress) => void;
	onSaveSettings: () => Promise<void>;
	refreshSettingsTab: () => void;
}

/**
 * Sync a single FMOD project.
 * Returns stats if successful, null if failed.
 */
export async function syncSingleProject(
	app: App,
	project: FMODProjectConfig,
	callbacks: SyncEngineCallbacks,
	silent = false
): Promise<SyncStats | null> {
	const { onProgress, onSaveSettings, refreshSettingsTab } = callbacks;

	// Helper to get display name for messages
	const displayName = project.fmodProjectName || project.jsonFilePath.split("/").pop() || "Unknown";

	// Validate settings
	if (!project.jsonFilePath) {
		if (!silent) {
			new Notice(`FMOD Sync: No JSON file path configured. Check settings.`);
		}
		return null;
	}

	if (!project.outputFolder) {
		if (!silent) {
			new Notice(`FMOD Sync: No vault folder configured for "${displayName}". Check settings.`);
		}
		return null;
	}

	// Read and parse JSON
	let exportData: FMODExportData;
	try {
		const rawData = await readJsonFile(app, project.jsonFilePath);

		// Validate JSON structure
		const validation = validateExportData(rawData);
		if (!validation.valid) {
			const errorMsg = validation.errors.slice(0, 3).join("\n");
			new Notice(`FMOD Sync: Invalid JSON structure:\n${errorMsg}`);
			console.error("FMOD Sync: JSON validation errors:", validation.errors);
			return null;
		}
		exportData = validation.data!;
	} catch (error) {
		new Notice(
			`FMOD Sync: Failed to read JSON.\nPath: ${project.jsonFilePath}\n${error}`
		);
		return null;
	}

	// Save all FMOD metadata from the JSON
	project.fmodProjectName = exportData.project_name;
	project.fmodProjectPath = exportData.project_path;
	project.fmodVersion = exportData.fmod_version;
	project.lastExportedAt = exportData.exported_at;
	await onSaveSettings();

	const projectName = project.fmodProjectName || displayName;

	if (!silent) {
		new Notice(
			`FMOD Sync: Processing ${exportData.events.length} events for "${projectName}"...`
		);
	}

	// Use project's output folder
	const outputPath = normalizePath(project.outputFolder);
	await ensureFolderExists(app, outputPath);

	// Report scanning phase
	onProgress?.({ phase: "scanning", current: 0, total: 0, eventName: "" });

	// Build index of existing notes by GUID and filename
	const existingNotes = await scanExistingNotes(app, outputPath);
	const notesByGuid = new Map<string, { path: string; content: string }>();
	const notesByName = new Map<string, { path: string; content: string }>();

	for (const [notePath, content] of existingNotes) {
		const frontmatter = parseFrontmatter(content);
		const guid = frontmatter.properties["fmod_guid"] as string | undefined;
		const filename = notePath.split("/").pop()?.replace(".md", "") || "";

		if (guid) {
			notesByGuid.set(guid, { path: notePath, content });
		}
		notesByName.set(filename, { path: notePath, content });
	}

	// Process events
	const stats: SyncStats = {
		created: 0,
		updated: 0,
		moved: 0,
		skipped: 0,
		errors: 0,
	};

	const skippedEvents: SkipReason[] = [];
	const total = exportData.events.length;

	for (let i = 0; i < total; i++) {
		const event = exportData.events[i];

		// Report progress
		onProgress?.({
			phase: "processing",
			current: i + 1,
			total,
			eventName: event.name,
		});

		try {
			await processEvent(
				app,
				event,
				outputPath,
				notesByGuid,
				notesByName,
				exportData.exported_at,
				projectName,
				stats,
				skippedEvents
			);
		} catch (error) {
			console.error(`FMOD Sync: Error processing event ${event.name}:`, error);
			stats.errors++;
		}
	}

	// Report completion
	onProgress?.({ phase: "complete", current: total, total, eventName: "" });

	// Log skipped events
	if (skippedEvents.length > 0) {
		console.warn("FMOD Sync: Skipped events:", skippedEvents);
		new Notice(
			`FMOD Sync: Skipped ${skippedEvents.length} event(s) due to conflicts. Check console for details.`
		);
	}

	// Show summary (only if not silent)
	if (!silent) {
		const summary = [
			`FMOD Sync Complete for "${projectName}"!`,
			`Created: ${stats.created}`,
			`Updated: ${stats.updated}`,
			`Moved: ${stats.moved}`,
			`Skipped: ${stats.skipped}`,
			stats.errors > 0 ? `Errors: ${stats.errors}` : "",
		]
			.filter(Boolean)
			.join("\n");

		new Notice(summary, 5000);

		// Refresh settings tab to show updated project metadata
		refreshSettingsTab();
	}

	return stats;
}

/**
 * Sync multiple FMOD projects.
 */
export async function syncProjects(
	app: App,
	projects: FMODProjectConfig[],
	callbacks: SyncEngineCallbacks
): Promise<void> {
	const totalStats: SyncStats = {
		created: 0,
		updated: 0,
		moved: 0,
		skipped: 0,
		errors: 0,
	};

	let successCount = 0;
	let failCount = 0;

	for (const project of projects) {
		const stats = await syncSingleProject(app, project, callbacks, true);
		if (stats) {
			successCount++;
			totalStats.created += stats.created;
			totalStats.updated += stats.updated;
			totalStats.moved += stats.moved;
			totalStats.skipped += stats.skipped;
			totalStats.errors += stats.errors;
		} else {
			failCount++;
		}
	}

	const summary = [
		`FMOD Sync Complete!`,
		`Projects: ${successCount} synced${failCount > 0 ? `, ${failCount} failed` : ""}`,
		`Created: ${totalStats.created}`,
		`Updated: ${totalStats.updated}`,
		`Moved: ${totalStats.moved}`,
		`Skipped: ${totalStats.skipped}`,
		totalStats.errors > 0 ? `Errors: ${totalStats.errors}` : "",
	]
		.filter(Boolean)
		.join("\n");

	new Notice(summary, 5000);

	// Refresh settings tab to show updated project metadata
	callbacks.refreshSettingsTab();
}
