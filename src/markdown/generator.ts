import type { FMODEvent } from "../types";
import { parseFrontmatter, formatYamlProperty, extractUserSections } from "./frontmatter";

/**
 * Generate markdown content for an FMOD event.
 * Preserves user properties and user-added sections from existing content.
 */
export function generateMarkdown(
	event: FMODEvent,
	existingContent: string | null,
	exportedAt: string,
	projectName: string
): string {
	// Parse existing frontmatter to preserve user properties
	const existing = existingContent
		? parseFrontmatter(existingContent)
		: { properties: {}, bodyStart: 0 };

	// Extract user-added sections
	const userSections = existingContent
		? extractUserSections(existingContent, existing.bodyStart)
		: {};

	// FMOD-managed properties that will be overwritten
	const fmodProperties = [
		"fmod_status",
		"fmod_guid",
		"fmod_project",
		"fmod_banks",
		"fmod_folder_path",
		"fmod_full_path",
		"fmod_loop_type",
		"fmod_space",
		"fmod_max_voices",
		"fmod_parameters",
		"fmod_last_synced",
	];

	// Build merged properties
	const mergedProps: Record<string, unknown> = {};

	// First, copy existing user properties
	for (const [key, value] of Object.entries(existing.properties)) {
		if (!fmodProperties.includes(key)) {
			mergedProps[key] = value;
		}
	}

	// Then add FMOD properties
	mergedProps["fmod_status"] = "exists";
	mergedProps["fmod_guid"] = event.guid;
	mergedProps["fmod_project"] = projectName;
	if (event.banks.length > 0) {
		mergedProps["fmod_banks"] = event.banks;
	}
	mergedProps["fmod_folder_path"] = event.folder_path;
	mergedProps["fmod_full_path"] = event.full_path;
	mergedProps["fmod_loop_type"] = event.loop_type;
	mergedProps["fmod_space"] = event.space;
	if (event.max_voices !== "" && event.max_voices !== undefined) {
		mergedProps["fmod_max_voices"] = event.max_voices;
	}
	if (event.parameters.length > 0) {
		mergedProps["fmod_parameters"] = event.parameters.map((p) => p.name);
	}
	mergedProps["fmod_last_synced"] = exportedAt;

	// Build YAML frontmatter
	let yaml = "---\n";

	// Output FMOD properties in order
	const orderedKeys = [
		"fmod_status",
		"fmod_guid",
		"fmod_project",
		"fmod_banks",
		"fmod_folder_path",
		"fmod_full_path",
		"fmod_loop_type",
		"fmod_space",
		"fmod_max_voices",
		"fmod_parameters",
		"fmod_last_synced",
	];

	const usedKeys = new Set<string>();

	for (const key of orderedKeys) {
		if (mergedProps[key] !== undefined && mergedProps[key] !== "") {
			yaml += formatYamlProperty(key, mergedProps[key]);
			usedKeys.add(key);
		}
	}

	// Output remaining user properties
	const remainingKeys = Object.keys(mergedProps)
		.filter((k) => !usedKeys.has(k))
		.sort();

	for (const key of remainingKeys) {
		yaml += formatYamlProperty(key, mergedProps[key]);
	}

	yaml += "---\n\n";

	// Build markdown body
	let md = "";

	// Parameters section
	if (event.parameters.length > 0) {
		md += "## Parameters\n";
		md += "| Name | Type | Min | Max | Initial |\n";
		md += "|------|------|-----|-----|--------|\n";
		for (const param of event.parameters) {
			md += `| ${param.name} | ${param.type} | ${param.min} | ${param.max} | ${param.initial} |\n`;
		}
		md += "\n";
	}

	// Notes section
	md += "## Notes\n";
	md += (event.notes || "") + "\n\n";

	// User Properties section
	if (event.user_properties.length > 0) {
		md += "## User Properties\n";
		for (const prop of event.user_properties) {
			md += `- ${prop.name}`;
			if (prop.type) md += ` (${prop.type})`;
			if (prop.value !== "" && prop.value !== undefined) md += ` = ${prop.value}`;
			md += "\n";
		}
		md += "\n";
	}

	// Preserved user sections
	for (const [sectionName, content] of Object.entries(userSections)) {
		md += `## ${sectionName}\n`;
		md += content + "\n\n";
	}

	return yaml + md;
}
