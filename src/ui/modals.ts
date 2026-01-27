import { App, FuzzySuggestModal, TFolder } from "obsidian";
import type { FMODProjectConfig, ProjectPickerItem } from "../types";

/**
 * Modal for selecting which project(s) to sync.
 */
export class ProjectPickerModal extends FuzzySuggestModal<ProjectPickerItem> {
	private projects: FMODProjectConfig[];
	private onChoose: (item: ProjectPickerItem) => void;

	constructor(
		app: App,
		projects: FMODProjectConfig[],
		onChoose: (item: ProjectPickerItem) => void
	) {
		super(app);
		this.projects = projects;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a project to sync...");
	}

	getItems(): ProjectPickerItem[] {
		const items: ProjectPickerItem[] = [{ type: "all" }];
		for (const project of this.projects) {
			items.push({ type: "single", project });
		}
		return items;
	}

	getItemText(item: ProjectPickerItem): string {
		if (item.type === "all") {
			return `Sync All (${this.projects.length} projects)`;
		}
		return item.project?.fmodProjectName || item.project?.jsonFilePath.split("/").pop() || "Unknown";
	}

	onChooseItem(item: ProjectPickerItem): void {
		this.onChoose(item);
	}
}

/**
 * Modal for selecting a folder in the vault.
 */
export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;
	private folders: TFolder[];

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
		this.folders = this.getAllFolders();
		this.setPlaceholder("Select a folder...");
	}

	private getAllFolders(): TFolder[] {
		const folders: TFolder[] = [];
		const rootFolder = this.app.vault.getRoot();

		const collectFolders = (folder: TFolder): void => {
			folders.push(folder);
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					collectFolders(child);
				}
			}
		};

		collectFolders(rootFolder);
		return folders.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItems(): TFolder[] {
		return this.folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path || "/";
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
