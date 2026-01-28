import { addIcon, App, Notice, Plugin } from "obsidian";

// Import from modules
import type { FMODSyncSettings, FMODProjectConfig, NewerExportInfo } from "./src/types";
import { FMOD_ICON_SVG, DEFAULT_SETTINGS, FMOD_LAUNCH_TIMEOUT } from "./src/constants";
import { findNewerExport } from "./src/sync/json-reader";
import { syncSingleProject, syncProjects, SyncEngineCallbacks } from "./src/sync/engine";
import { ProjectPickerModal } from "./src/ui/modals";
import { FMODSyncSettingTab } from "./src/ui/settings";
import { isFmodRunning, navigateToEvent, waitForConnection } from "./src/fmod/connector";
import { launchFmod } from "./src/fmod/launcher";

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

		// Make event:/ paths clickable in rendered markdown
		this.registerMarkdownPostProcessor((element) => {
			this.processEventLinks(element);
		});

		// Handle clicks anywhere that might contain event:/ text
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;

			// Check if clicked element is our custom fmod-event-link
			if (target.classList.contains("fmod-event-link")) {
				const eventPath = target.getAttribute("data-event-path");
				if (eventPath) {
					evt.preventDefault();
					this.openFmodEvent(eventPath);
				}
				return;
			}

			// Check for anchor links with event:/ href
			const link = target.closest("a");
			if (link) {
				const href = link.getAttribute("href");
				if (href?.startsWith("event:/")) {
					evt.preventDefault();
					evt.stopPropagation();
					this.openFmodEvent(href);
					return;
				}
			}

			// Check if clicked element's text contains event:/
			// This handles Properties panel, Bases, and other UI elements
			const text = target.textContent || "";
			const match = text.match(/^(event:\/[^\s"'<>)}\]]+)/);
			if (match) {
				evt.preventDefault();
				evt.stopPropagation();
				this.openFmodEvent(match[1]);
			}
		});
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

	// ========================================================================
	// FMOD Event Link Handling
	// ========================================================================

	/**
	 * Process an element to find and make event:/ paths clickable.
	 */
	processEventLinks(element: HTMLElement): void {
		// Find all text nodes containing event:/
		const walker = document.createTreeWalker(
			element,
			NodeFilter.SHOW_TEXT,
			{
				acceptNode: (node) => {
					// Skip if already inside our link or an anchor
					if (node.parentElement?.closest(".fmod-event-link, a")) {
						return NodeFilter.FILTER_REJECT;
					}
					return node.textContent?.includes("event:/")
						? NodeFilter.FILTER_ACCEPT
						: NodeFilter.FILTER_REJECT;
				},
			}
		);

		const textNodes: Text[] = [];
		let node;
		while ((node = walker.nextNode())) {
			textNodes.push(node as Text);
		}

		// Process each text node
		for (const textNode of textNodes) {
			const text = textNode.textContent || "";
			// Match event:/path/to/event (stops at whitespace, quotes, or end)
			const regex = /event:\/[^\s"'<>)}\]]+/g;
			let match;
			let lastIndex = 0;
			const fragments: (string | HTMLElement)[] = [];

			while ((match = regex.exec(text)) !== null) {
				// Add text before match
				if (match.index > lastIndex) {
					fragments.push(text.slice(lastIndex, match.index));
				}

				// Create clickable span
				const eventPath = match[0];
				const span = document.createElement("span");
				span.className = "fmod-event-link";
				span.setAttribute("data-event-path", eventPath);
				span.textContent = eventPath;
				fragments.push(span);

				lastIndex = regex.lastIndex;
			}

			// Add remaining text
			if (lastIndex < text.length) {
				fragments.push(text.slice(lastIndex));
			}

			// Replace text node with fragments if we found matches
			if (fragments.length > 1) {
				const container = document.createDocumentFragment();
				for (const frag of fragments) {
					if (typeof frag === "string") {
						container.appendChild(document.createTextNode(frag));
					} else {
						container.appendChild(frag);
					}
				}
				textNode.replaceWith(container);
			}
		}
	}

	/**
	 * Open an FMOD event by its path (e.g., "event:/Music/Hub").
	 * Launches FMOD Studio if needed and navigates to the event.
	 */
	async openFmodEvent(eventPath: string): Promise<void> {
		// 1. Find note with matching fmod_full_path
		const eventInfo = this.findEventByPath(eventPath);
		if (!eventInfo) {
			new Notice("FMOD: Event not found in vault");
			return;
		}

		// 2. Find project config by name
		const projectConfig = this.settings.projects.find(
			(p) => p.fmodProjectName === eventInfo.project
		);
		if (!projectConfig?.fmodProjectPath) {
			new Notice("FMOD: Project not configured");
			return;
		}

		// 3. Find FMOD installation
		const installation =
			this.settings.fmodInstallations.find(
				(i) => i.id === projectConfig.selectedFmodInstallationId
			) || this.settings.fmodInstallations[0];

		if (!installation) {
			new Notice("FMOD: No FMOD Studio installation configured");
			return;
		}

		// 4. Check if FMOD is already connected
		let connected = await isFmodRunning();

		// 5. Launch FMOD if not running
		if (!connected) {
			new Notice("FMOD: Launching FMOD Studio...");
			launchFmod(installation.path, projectConfig.fmodProjectPath);
			connected = await waitForConnection(FMOD_LAUNCH_TIMEOUT);
		}

		if (!connected) {
			new Notice("FMOD: Could not connect to FMOD Studio");
			return;
		}

		// 6. Navigate to the event
		const result = await navigateToEvent(eventInfo.guid);
		if (!result.success) {
			new Notice(`FMOD: ${result.error || "Failed to navigate"}`);
		}
	}

	/**
	 * Find an event in the vault by its full path.
	 * Returns the GUID and project name if found.
	 */
	findEventByPath(eventPath: string): { guid: string; project: string } | null {
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter?.fmod_full_path === eventPath) {
				return {
					guid: cache.frontmatter.fmod_guid as string,
					project: cache.frontmatter.fmod_project as string,
				};
			}
		}
		return null;
	}
}
