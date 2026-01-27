import { App, Notice, PluginSettingTab, Setting, TFile, TFolder } from "obsidian";
import type { FMODInstallation, FMODProjectConfig, NewerExportInfo } from "../types";
import { detectFmodVersion } from "../utils/platform";
import { parseExportFilename } from "../utils/filename";
import { checkCompanionScriptExists, installCompanionScript } from "../companion";
import { FolderPickerModal } from "./modals";

// Electron remote for native file dialogs and shell
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { remote, shell } = require("electron");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require("child_process");

// Interface for the plugin (to avoid circular dependency)
interface FMODSyncPluginInterface {
	settings: {
		projects: FMODProjectConfig[];
		fmodInstallations: FMODInstallation[];
	};
	newerExports: Map<string, NewerExportInfo>;
	saveSettings(): Promise<void>;
	checkForNewerExports(): Promise<void>;
	syncSingleProject(project: FMODProjectConfig): Promise<unknown>;
}

/**
 * Settings tab for FMOD Sync plugin.
 */
export class FMODSyncSettingTab extends PluginSettingTab {
	plugin: FMODSyncPluginInterface;
	private pollingIntervalId: ReturnType<typeof setInterval> | null = null;

	constructor(app: App, plugin: FMODSyncPluginInterface) {
		super(app, plugin as unknown as import("obsidian").Plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("fmod-sync-settings");

		containerEl.createEl("h2", { text: "FMOD Sync Settings" });

		// FMOD Installations section
		containerEl.createEl("h3", { text: "FMOD Studio Installations" });

		const installationsContainer = containerEl.createDiv({
			cls: "fmod-installations-container",
		});

		this.renderInstallations(installationsContainer);

		// Add installation button
		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText("Add Installation")
				.onClick(async () => {
					const platform = process.platform;
					const filters = platform === "darwin"
						? [{ name: "Applications", extensions: ["app"] }]
						: [{ name: "Executables", extensions: ["exe"] }];

					const result = await remote.dialog.showOpenDialog({
						title: "Select FMOD Studio Application",
						properties: platform === "darwin" ? ["openDirectory", "treatPackageAsDirectory"] : ["openFile"],
						filters: platform === "win32" ? filters : undefined,
					});

					if (!result.canceled && result.filePaths.length > 0) {
						let selectedPath = result.filePaths[0];

						// On macOS, ensure we have the .app bundle path
						if (platform === "darwin" && !selectedPath.endsWith(".app")) {
							// User might have selected something inside the bundle, try to find .app
							const appMatch = selectedPath.match(/(.+\.app)/);
							if (appMatch) {
								selectedPath = appMatch[1];
							}
						}

						// Detect version
						const version = await detectFmodVersion(selectedPath);

						const newInstallation: FMODInstallation = {
							id: this.generateId(),
							path: selectedPath,
							version: version,
						};

						this.plugin.settings.fmodInstallations.push(newInstallation);
						await this.plugin.saveSettings();
						this.display();

						if (version === "Unknown") {
							new Notice("Added FMOD installation, but version could not be detected.");
						} else {
							new Notice(`Added FMOD Studio ${version}`);
						}
					}
				})
		);

		// Projects section
		containerEl.createEl("h3", { text: "Projects" });

		const projectsContainer = containerEl.createDiv({
			cls: "fmod-projects-container",
		});

		this.renderProjects(projectsContainer);

		// Add project button
		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText("Add Project")
				.setCta()
				.onClick(async () => {
					const newProject: FMODProjectConfig = {
						id: this.generateId(),
						jsonFilePath: "",
						outputFolder: "",
					};
					this.plugin.settings.projects.push(newProject);
					await this.plugin.saveSettings();
					this.display();
				})
		);

		// Start polling for newer exports AFTER initial render is complete
		this.startPolling();
	}

	renderInstallations(container: HTMLElement): void {
		container.empty();

		if (this.plugin.settings.fmodInstallations.length === 0) {
			container.createEl("p", {
				text: "No FMOD Studio installations configured. Click 'Add Installation' to add one.",
				cls: "fmod-no-installations",
			});
			return;
		}

		for (const installation of this.plugin.settings.fmodInstallations) {
			this.renderInstallationItem(container, installation);
		}
	}

	renderInstallationItem(container: HTMLElement, installation: FMODInstallation): void {
		const item = container.createDiv({ cls: "fmod-installation-item" });

		// Version badge
		item.createEl("span", {
			cls: "fmod-installation-version",
			text: installation.version,
		});

		// Check if companion script is installed
		const hasScript = checkCompanionScriptExists(installation.path);

		// Script status indicator
		if (hasScript) {
			const statusEl = item.createEl("span", {
				cls: "fmod-script-status fmod-script-installed",
				attr: { "aria-label": "Export script installed" },
			});
			// Checkmark icon
			statusEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
		} else {
			// Install script button
			const installBtn = item.createEl("button", {
				cls: "fmod-install-script-btn",
				text: "Install Export Script",
				attr: { "aria-label": "Install the FMOD export script for this version" },
			});
			installBtn.addEventListener("click", async () => {
				installBtn.disabled = true;
				installBtn.textContent = "Installing...";

				const result = await installCompanionScript(installation.path);

				if (result.success) {
					new Notice("Export script installed. Restart FMOD Studio to use it.");
					this.display(); // Refresh to show installed status
				} else {
					new Notice(`Failed to install script: ${result.error}`);
					installBtn.disabled = false;
					installBtn.textContent = "Install Export Script";
				}
			});
		}

		// Path
		item.createEl("span", {
			cls: "fmod-installation-path",
			text: installation.path,
		});

		// Delete button
		const deleteBtn = item.createEl("button", {
			cls: "fmod-action-btn fmod-action-btn-danger fmod-installation-delete",
			attr: { "aria-label": "Remove installation" },
		});
		deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
		deleteBtn.addEventListener("click", async () => {
			const index = this.plugin.settings.fmodInstallations.findIndex(
				(i) => i.id === installation.id
			);
			if (index >= 0) {
				this.plugin.settings.fmodInstallations.splice(index, 1);
				await this.plugin.saveSettings();
				this.display();
			}
		});
	}

	renderProjects(container: HTMLElement): void {
		container.empty();

		if (this.plugin.settings.projects.length === 0) {
			container.createEl("p", {
				text: "No projects configured. Click 'Add Project' to get started.",
				cls: "fmod-no-projects",
			});
			return;
		}

		for (const project of this.plugin.settings.projects) {
			this.renderProjectCard(container, project);
		}
	}

	renderProjectCard(container: HTMLElement, project: FMODProjectConfig): void {
		const card = container.createDiv({ cls: "fmod-project-card" });

		// Compact header row
		const header = card.createDiv({ cls: "fmod-project-header" });

		// Left side: project info
		const info = header.createDiv({ cls: "fmod-project-info" });

		// Get display name - prefer FMOD project name, fallback to parsed filename
		let displayName = "New Project";
		let fileDate: Date | null = null;

		if (project.fmodProjectName) {
			displayName = project.fmodProjectName;
		} else if (project.jsonFilePath) {
			const parsed = parseExportFilename(project.jsonFilePath.split("/").pop() || "");
			displayName = parsed?.projectName || "New Project";
			fileDate = parsed?.date || null;
		}

		const nameRow = info.createDiv({ cls: "fmod-project-name-row" });
		nameRow.createEl("span", { cls: "fmod-project-name", text: displayName });

		// Check for newer export and show badge
		const newerExport = this.plugin.newerExports.get(project.id);
		if (newerExport) {
			const badge = nameRow.createEl("span", {
				cls: "fmod-new-export-badge",
				text: "New export available",
			});
			// Format the newer export date for tooltip
			const formatted = newerExport.exportDate.toLocaleString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
			badge.setAttribute("aria-label", `Newer export from ${formatted}`);
		}

		// Metadata row
		if (project.fmodProjectName) {
			// Synced project - show export date and FMOD version
			const metaInfo = [];
			if (project.lastExportedAt) {
				const date = new Date(project.lastExportedAt);
				const formatted = date.toLocaleString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit"
				});
				metaInfo.push(`Exported: ${formatted}`);
			}
			if (project.fmodVersion) {
				metaInfo.push(`FMOD ${project.fmodVersion}`);
			}
			if (metaInfo.length > 0) {
				info.createEl("div", { cls: "fmod-project-meta", text: metaInfo.join(" | ") });
			}

			// FMOD project path
			if (project.fmodProjectPath) {
				info.createEl("div", { cls: "fmod-project-path", text: project.fmodProjectPath });
			}
		} else if (project.jsonFilePath) {
			// Not synced yet but has JSON file - show date from filename
			if (fileDate) {
				const formatted = fileDate.toLocaleString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit"
				});
				info.createEl("div", { cls: "fmod-project-meta", text: `Exported: ${formatted}` });
			}
		} else {
			// Not configured at all
			info.createEl("div", { cls: "fmod-project-path fmod-not-configured", text: "Not configured - select JSON file and vault folder" });
		}

		// Right side: action buttons
		const actions = header.createDiv({ cls: "fmod-project-actions" });

		// Version dropdown (only show if project has been synced and has a version)
		if (project.fmodProjectPath) {
			const versionContainer = actions.createDiv({ cls: "fmod-version-container" });

			// Find matching installation for this project's version
			const installations = this.plugin.settings.fmodInstallations;
			const projectVersion = project.fmodVersion?.trim();
			const matchingInstallation = projectVersion
				? installations.find(i => i.version?.trim() === projectVersion)
				: null;

			// Get selected installation
			// Priority: matching version > user selection > first available
			let selectedInstallation: FMODInstallation | undefined;

			if (matchingInstallation) {
				// Always prefer the matching version
				selectedInstallation = matchingInstallation;
				// Update saved selection if it doesn't match
				if (project.selectedFmodInstallationId !== matchingInstallation.id) {
					project.selectedFmodInstallationId = matchingInstallation.id;
					void this.plugin.saveSettings().catch(e =>
						console.error("Failed to save settings:", e)
					);
				}
			} else if (project.selectedFmodInstallationId) {
				// Use user's previous selection if no match
				selectedInstallation = installations.find(i => i.id === project.selectedFmodInstallationId);
			}

			// Show warning if:
			// 1. Project version doesn't match any installation, OR
			// 2. User selected a different version than the project's version
			const versionMissing = projectVersion && !matchingInstallation && installations.length > 0;
			const versionOverridden = projectVersion && selectedInstallation && selectedInstallation.version !== projectVersion;
			const hasVersionMismatch = versionMissing || versionOverridden;

			if (hasVersionMismatch) {
				const warningMessage = versionMissing
					? `Project requires FMOD ${projectVersion} (not installed)`
					: `Project created with FMOD ${projectVersion}, using ${selectedInstallation?.version}`;
				const warningIcon = versionContainer.createEl("span", {
					cls: "fmod-version-warning",
					attr: { "aria-label": warningMessage },
				});
				warningIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
			}

			// Version dropdown
			if (installations.length > 0) {
				const select = versionContainer.createEl("select", { cls: "fmod-version-select" });

				// Show "(missing)" placeholder only if project version doesn't match any installation
				if (projectVersion && !matchingInstallation) {
					const placeholderOpt = select.createEl("option", {
						text: `${projectVersion} (missing)`,
						value: "",
					});
					placeholderOpt.disabled = true;
					placeholderOpt.selected = !selectedInstallation;
				}

				// Add all installations
				for (const inst of installations) {
					const opt = select.createEl("option", {
						text: inst.version,
						value: inst.id,
					});
					if (selectedInstallation && inst.id === selectedInstallation.id) {
						opt.selected = true;
					}
				}

				select.addEventListener("change", async () => {
					project.selectedFmodInstallationId = select.value || undefined;
					await this.plugin.saveSettings();
					// Refresh to update warning icon
					this.display();
				});
			}
		}

		// Open FMOD button (only show if project path is known)
		if (project.fmodProjectPath) {
			const openFmodBtn = actions.createEl("button", {
				cls: "fmod-action-btn",
				attr: { "aria-label": "Open FMOD Studio project" },
			});
			// FMOD logo icon - cyan color
			openFmodBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 512 512"><path fill="#6ECEF4" d="M 235.00 455.60 C178.64,446.91 128.15,416.19 103.89,375.82 C97.48,365.16 92.68,352.51 93.38,348.13 C94.34,342.09 99.87,338.00 107.08,338.00 C110.58,338.00 111.81,338.58 114.63,341.57 C116.48,343.54 118.00,345.77 118.00,346.54 C118.00,349.07 127.45,366.43 132.16,372.56 C155.41,402.78 200.08,426.38 242.88,431.05 C307.51,438.10 375.01,393.86 391.73,333.50 C394.25,324.42 394.50,321.99 394.48,307.00 C394.46,288.57 393.03,281.43 386.57,267.44 C375.72,243.96 353.61,222.46 327.49,209.99 C312.26,202.73 291.93,196.95 276.25,195.44 L 269.00 194.74 L 269.00 343.28 L 250.75 342.70 C236.81,342.26 229.66,341.53 220.47,339.60 C196.80,334.63 172.26,324.52 153.00,311.79 C140.06,303.24 121.23,284.50 113.23,272.22 C84.37,227.89 86.47,173.31 118.83,126.50 C127.20,114.40 147.34,94.85 160.41,86.13 C208.46,54.09 260.10,47.04 314.50,65.09 C349.20,76.60 381.76,98.56 400.87,123.33 C411.56,137.19 421.77,159.06 420.57,165.50 C419.31,172.21 411.05,177.16 404.65,175.05 C399.96,173.50 397.70,170.68 394.05,161.84 C379.77,127.24 342.20,98.03 296.50,86.00 C279.94,81.64 271.14,80.70 252.25,81.29 C228.58,82.02 215.31,85.28 194.50,95.47 C178.20,103.46 168.87,110.14 155.38,123.50 C129.65,148.98 118.59,173.71 118.71,205.50 C118.79,225.14 122.38,237.97 132.68,255.35 C138.64,265.43 157.14,284.39 167.92,291.47 C187.79,304.54 215.57,314.70 236.64,316.61 L 244.00 317.28 L 244.00 169.00 L 254.75 169.03 C334.67,169.22 401.89,214.64 417.11,278.73 C435.33,355.45 376.41,435.13 287.50,454.01 C274.77,456.72 247.57,457.54 235.00,455.60 Z"/></svg>`;
			openFmodBtn.addEventListener("click", async () => {
				const projectPath = project.fmodProjectPath!;

				// Get the selected installation
				const installations = this.plugin.settings.fmodInstallations;
				const selectedId = project.selectedFmodInstallationId;
				const projectVersion = project.fmodVersion;

				// Find installation: first try selected, then try matching version
				let installation: FMODInstallation | undefined;
				if (selectedId) {
					installation = installations.find(i => i.id === selectedId);
				}
				if (!installation && projectVersion) {
					installation = installations.find(i => i.version === projectVersion);
				}
				if (!installation && installations.length > 0) {
					installation = installations[0]; // Fallback to first available
				}

				if (installation) {
					// Launch with specific FMOD version
					const platform = process.platform;
					try {
						if (platform === "darwin") {
							// macOS: use open -a
							spawn("open", ["-a", installation.path, projectPath], { detached: true, stdio: "ignore" });
						} else if (platform === "win32") {
							// Windows: launch exe directly with project as argument
							spawn(installation.path, [projectPath], { detached: true, stdio: "ignore" });
						}
					} catch (error) {
						new Notice(`Failed to open FMOD project: ${error}`);
					}
				} else {
					// No installations configured, fall back to default shell open
					const result = await shell.openPath(projectPath);
					if (result) {
						new Notice(`Failed to open FMOD project: ${result}`);
					}
				}
			});
		}

		// Sync button - highlight if newer export is available
		const hasNewerExport = this.plugin.newerExports.has(project.id);
		const syncBtn = actions.createEl("button", {
			cls: hasNewerExport ? "fmod-action-btn fmod-action-btn-update" : "fmod-action-btn",
			attr: { "aria-label": hasNewerExport ? "Sync with newer export" : "Sync this project" },
		});
		syncBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
		syncBtn.addEventListener("click", async () => {
			// If newer export available, update the path first
			const newerExportForSync = this.plugin.newerExports.get(project.id);
			if (newerExportForSync) {
				project.jsonFilePath = newerExportForSync.filePath;
				await this.plugin.saveSettings();
				// Clear the newer export indicator
				this.plugin.newerExports.delete(project.id);
			}
			await this.plugin.syncSingleProject(project);
		});

		// Edit button
		const editBtn = actions.createEl("button", {
			cls: "fmod-action-btn",
			attr: { "aria-label": "Edit project settings" },
		});
		editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;

		// Delete button
		const deleteBtn = actions.createEl("button", {
			cls: "fmod-action-btn fmod-action-btn-danger",
			attr: { "aria-label": "Delete project" },
		});
		deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
		deleteBtn.addEventListener("click", async () => {
			const index = this.plugin.settings.projects.findIndex(
				(p) => p.id === project.id
			);
			if (index >= 0) {
				this.plugin.settings.projects.splice(index, 1);
				await this.plugin.saveSettings();
				this.display();
			}
		});

		// Expandable settings section
		const settingsSection = card.createDiv({ cls: "fmod-project-settings" });
		settingsSection.style.display = "none";

		// Toggle settings visibility
		editBtn.addEventListener("click", () => {
			const isVisible = settingsSection.style.display !== "none";
			settingsSection.style.display = isVisible ? "none" : "block";
			editBtn.classList.toggle("fmod-action-btn-active", !isVisible);
		});

		// Vault folder
		const outputSetting = new Setting(settingsSection)
			.setName("Vault folder")
			.setDesc("Folder in your vault where event notes will be created.")
			.addText((text) =>
				text
					.setPlaceholder("FMOD Events/MyProject")
					.setValue(project.outputFolder)
					.onChange(async (value) => {
						project.outputFolder = value;
						await this.plugin.saveSettings();
						this.updateFolderStatus(statusEl, value);
						// Update header path info
						this.updateProjectPathInfo(card, project);
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Browse")
					.onClick(() => {
						new FolderPickerModal(this.app, async (folder) => {
							project.outputFolder = folder.path || "";
							await this.plugin.saveSettings();
							this.display();
						}).open();
					})
			);

		// Add status indicator below the input field
		const statusEl = outputSetting.controlEl.createDiv({ cls: "fmod-folder-status" });
		this.updateFolderStatus(statusEl, project.outputFolder);

		// JSON file path
		const jsonSetting = new Setting(settingsSection)
			.setName("JSON file path")
			.setDesc(
				"Path to the obsidian-sync.json file exported from FMOD Studio."
			);

		jsonSetting.addText((text) =>
			text
				.setPlaceholder("/path/to/obsidian-sync.json")
				.setValue(project.jsonFilePath)
				.onChange(async (value) => {
					project.jsonFilePath = value;
					await this.plugin.saveSettings();
					// Update header path info
					this.updateProjectPathInfo(card, project);
				})
		);

		jsonSetting.addButton((button) =>
			button
				.setButtonText("Browse")
				.onClick(async () => {
					const result = await remote.dialog.showOpenDialog({
						title: "Select FMOD Export JSON File",
						properties: ["openFile"],
						filters: [
							{ name: "JSON Files", extensions: ["json"] },
							{ name: "All Files", extensions: ["*"] },
						],
					});

					if (!result.canceled && result.filePaths.length > 0) {
						project.jsonFilePath = result.filePaths[0];
						await this.plugin.saveSettings();
						this.display();
					}
				})
		);
	}

	updateProjectPathInfo(card: HTMLElement, project: FMODProjectConfig): void {
		const pathEl = card.querySelector(".fmod-project-path");
		if (!pathEl) return;

		const pathInfo = [];
		if (project.outputFolder) {
			pathInfo.push(`Vault: ${project.outputFolder}`);
		}
		if (project.jsonFilePath) {
			const jsonName = project.jsonFilePath.split("/").pop() || project.jsonFilePath;
			pathInfo.push(`JSON: ${jsonName}`);
		}
		pathEl.textContent = pathInfo.length > 0 ? pathInfo.join(" | ") : "Not configured";
	}

	updateFolderStatus(statusEl: HTMLElement, folderPath: string): void {
		statusEl.empty();

		if (!folderPath) {
			statusEl.removeClass("fmod-status-ok", "fmod-status-error");
			statusEl.addClass("fmod-status-warning");
			statusEl.setText("No folder specified");
			return;
		}

		const existing = this.app.vault.getAbstractFileByPath(folderPath);

		if (existing instanceof TFolder) {
			statusEl.removeClass("fmod-status-warning", "fmod-status-error");
			statusEl.addClass("fmod-status-ok");
			statusEl.setText("Folder exists");
		} else if (existing instanceof TFile) {
			statusEl.removeClass("fmod-status-ok", "fmod-status-warning");
			statusEl.addClass("fmod-status-error");
			statusEl.setText("Path is a file, not a folder");
		} else {
			statusEl.removeClass("fmod-status-ok", "fmod-status-error");
			statusEl.addClass("fmod-status-warning");
			statusEl.setText("Folder will be created on sync");
		}
	}

	hide(): void {
		this.stopPolling();
	}

	private startPolling(): void {
		// Stop any existing polling
		this.stopPolling();

		// Check immediately
		this.checkAndRefresh();

		// Poll every 30 seconds
		this.pollingIntervalId = setInterval(() => {
			this.checkAndRefresh();
		}, 30000);
	}

	private stopPolling(): void {
		if (this.pollingIntervalId) {
			clearInterval(this.pollingIntervalId);
			this.pollingIntervalId = null;
		}
	}

	private async checkAndRefresh(): Promise<void> {
		const previousCount = this.plugin.newerExports.size;
		await this.plugin.checkForNewerExports();
		const newCount = this.plugin.newerExports.size;

		// Only refresh if the count changed (avoids unnecessary re-renders)
		if (previousCount !== newCount) {
			// Re-render just the projects section
			const projectsContainer = this.containerEl.querySelector(".fmod-projects-container");
			if (projectsContainer instanceof HTMLElement) {
				this.renderProjects(projectsContainer);
			}
		}
	}

	generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}
}
