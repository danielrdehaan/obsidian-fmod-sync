import { addIcon, App, Notice, Plugin } from "obsidian";

// Import from modules
import type { FMODSyncSettings, FMODProjectConfig, NewerExportInfo } from "./src/types";
import { FMOD_ICON_SVG, DEFAULT_SETTINGS } from "./src/constants";
import { findNewerExport } from "./src/sync/json-reader";
import { syncSingleProject, syncProjects, SyncEngineCallbacks } from "./src/sync/engine";
import { ProjectPickerModal } from "./src/ui/modals";
import { FMODSyncSettingTab } from "./src/ui/settings";

// ============================================================================
// Main Plugin
// ============================================================================

export default class FMODSyncPlugin extends Plugin {
	settings: FMODSyncSettings = DEFAULT_SETTINGS;
	private settingsTab: FMODSyncSettingTab | null = null;
	newerExports: Map<string, NewerExportInfo> = new Map();
	private isSyncing = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Check for newer exports on load (non-blocking)
		this.checkForNewerExports();

		// Register custom FMOD icon
		addIcon("fmod-logo", FMOD_ICON_SVG);

		// Add ribbon icon
		this.addRibbonIcon("fmod-logo", "FMOD Sync", () => {
			this.runSync();
		});

		// Add command
		this.addCommand({
			id: "import-from-json",
			name: "Import from JSON",
			callback: () => {
				this.runSync();
			},
		});

		// Add settings tab
		this.settingsTab = new FMODSyncSettingTab(this.app, this);
		this.addSettingTab(this.settingsTab);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Refresh the settings tab display if it's currently visible.
	 * Called after sync to update project metadata shown in the UI.
	 */
	refreshSettingsTab(): void {
		if (this.settingsTab) {
			this.settingsTab.display();
		}
	}

	/**
	 * Check all projects for newer JSON exports in their directories.
	 * Updates the newerExports Map with any found.
	 */
	async checkForNewerExports(): Promise<void> {
		for (const project of this.settings.projects) {
			const newer = await findNewerExport(project.jsonFilePath);
			if (newer) {
				this.newerExports.set(project.id, newer);
			} else {
				this.newerExports.delete(project.id);
			}
		}
	}

	/**
	 * Get callbacks for sync engine.
	 */
	private getSyncCallbacks(): SyncEngineCallbacks {
		return {
			onSaveSettings: () => this.saveSettings(),
			refreshSettingsTab: () => this.refreshSettingsTab(),
		};
	}

	// ========================================================================
	// Main Sync Logic
	// ========================================================================

	async runSync(): Promise<void> {
		// Prevent concurrent syncs
		if (this.isSyncing) {
			new Notice("FMOD Sync: Sync already in progress");
			return;
		}

		const projects = this.settings.projects;

		if (projects.length === 0) {
			new Notice(
				"FMOD Sync: No projects configured. Add projects in settings."
			);
			return;
		}

		if (projects.length === 1) {
			// Single project - sync directly
			this.isSyncing = true;
			try {
				await this.syncSingleProject(projects[0]);
			} finally {
				this.isSyncing = false;
			}
		} else {
			// Multiple projects - show picker
			new ProjectPickerModal(this.app, projects, async (item) => {
				if (this.isSyncing) {
					new Notice("FMOD Sync: Sync already in progress");
					return;
				}
				this.isSyncing = true;
				try {
					if (item.type === "all") {
						await syncProjects(this.app, projects, this.getSyncCallbacks());
					} else if (item.project) {
						await this.syncSingleProject(item.project);
					}
				} finally {
					this.isSyncing = false;
				}
			}).open();
		}
	}

	/**
	 * Sync a single project. Exposed for use by settings tab.
	 */
	async syncSingleProject(project: FMODProjectConfig): Promise<unknown> {
		return syncSingleProject(this.app, project, this.getSyncCallbacks());
	}
}
