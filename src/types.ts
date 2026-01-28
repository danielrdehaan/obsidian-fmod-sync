// ============================================================================
// Types
// ============================================================================

export interface FMODInstallation {
	id: string;
	path: string;           // Path to .app (macOS) or .exe (Windows)
	version: string;        // Auto-detected version number
}

export interface FMODParameter {
	name: string;
	type: string;
	min: number | string;
	max: number | string;
	initial: number | string;
	labels?: string;
}

export interface FMODUserProperty {
	name: string;
	type: string;
	value: string | number | boolean;
}

export interface FMODAudioFile {
	path: string;        // Absolute filesystem path
	asset_path: string;  // Relative path in FMOD assets folder
}

export interface FMODEvent {
	name: string;
	guid: string;
	full_path: string;
	folder_path: string;
	banks: string[];
	loop_type: string;
	space: string;
	max_voices: number | string;
	notes: string;
	parameters: FMODParameter[];
	user_properties: FMODUserProperty[];
	audio_files?: FMODAudioFile[];
}

export interface FMODExportData {
	exported_at: string;
	fmod_version?: string;
	project_name: string;
	project_path: string;
	event_count: number;
	events: FMODEvent[];
}

export interface FMODProjectConfig {
	id: string;
	jsonFilePath: string;
	outputFolder: string;
	// Metadata extracted from JSON on sync
	fmodProjectName?: string;  // Project name from JSON
	fmodProjectPath?: string;  // Path to .fspro file
	fmodVersion?: string;      // FMOD Studio version
	lastExportedAt?: string;   // When JSON was exported
	// Version override for opening project
	selectedFmodInstallationId?: string;  // Override version for this project
}

export interface FMODSyncSettings {
	projects: FMODProjectConfig[];
	fmodInstallations: FMODInstallation[];
}

export interface ParsedFrontmatter {
	properties: Record<string, string | string[] | number | boolean>;
	bodyStart: number;
}

export interface SyncStats {
	created: number;
	updated: number;
	moved: number;
	skipped: number;
	errors: number;
}

export interface NewerExportInfo {
	filePath: string;
	projectName: string;
	exportDate: Date;
}

export interface ProjectPickerItem {
	type: "all" | "single";
	project?: FMODProjectConfig;
}

export interface SyncProgress {
	phase: "scanning" | "processing" | "complete";
	current: number;
	total: number;
	eventName: string;
}

export interface SkipReason {
	event: string;
	reason: string;
}

export interface FMODAudioFileNote {
	filename: string;        // e.g., "hit.wav"
	absolutePath: string;    // Filesystem path for ext:/// link
	assetPath: string;       // Relative path in FMOD assets (for folder mirroring)
	eventNames: string[];    // Events that use this file (for wiki links)
}

export interface ValidationResult {
	valid: boolean;
	data?: FMODExportData;
	errors: string[];
}

export interface FMODConnectionResult {
	success: boolean;
	response?: string;
	error?: string;
}
