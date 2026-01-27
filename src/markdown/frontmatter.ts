import type { ParsedFrontmatter } from "../types";

/**
 * Parse YAML frontmatter from markdown content.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
	const result: ParsedFrontmatter = { properties: {}, bodyStart: 0 };

	if (!content || !content.startsWith("---")) {
		return result;
	}

	const endMatch = content.indexOf("\n---", 3);
	if (endMatch < 0) {
		return result;
	}

	const yamlBlock = content.substring(4, endMatch);
	result.bodyStart = endMatch + 4; // Skip past closing ---\n

	const lines = yamlBlock.split("\n");
	let currentKey: string | null = null;
	let arrayValues: string[] = [];
	let inArray = false;

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed === "" || trimmed.startsWith("#")) continue;

		// Check for array item
		if (trimmed.startsWith("- ")) {
			if (inArray && currentKey) {
				arrayValues.push(trimmed.substring(2).trim());
			}
			continue;
		}

		// Check for key: value
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx > 0) {
			// Save previous array if we had one
			if (inArray && currentKey && arrayValues.length > 0) {
				result.properties[currentKey] = arrayValues;
			}

			currentKey = trimmed.substring(0, colonIdx).trim();
			let val = trimmed.substring(colonIdx + 1).trim();

			if (val === "" || val === "|" || val === ">") {
				// Could be array or multiline
				inArray = true;
				arrayValues = [];
			} else {
				inArray = false;
				// Remove quotes if present
				if (
					(val.startsWith('"') && val.endsWith('"') && val.length > 1) ||
					(val.startsWith("'") && val.endsWith("'") && val.length > 1)
				) {
					val = val.substring(1, val.length - 1);
				}
				result.properties[currentKey] = val;
			}
		}
	}

	// Save final array if we had one
	if (inArray && currentKey && arrayValues.length > 0) {
		result.properties[currentKey] = arrayValues;
	}

	return result;
}

/**
 * Escape a value for safe use in YAML.
 */
export function yamlEscape(val: string): string {
	if (val === null || val === undefined) return '""';
	const s = String(val);
	// Quote if contains special YAML characters
	if (
		s.includes(":") ||
		s.includes("#") ||
		s.includes("'") ||
		s.includes('"') ||
		s.includes("{") ||
		s.includes("}") ||
		s.includes("[") ||
		s.includes("]") ||
		s.includes("&") ||
		s.includes("*") ||
		s.includes("!") ||
		s.includes("|") ||
		s.includes(">") ||
		s.includes("%") ||
		s.includes("@") ||
		s.includes("`") ||
		s.trim() !== s ||
		s === ""
	) {
		return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}
	return s;
}

/**
 * Format a YAML property with proper indentation for arrays.
 */
export function formatYamlProperty(key: string, value: unknown): string {
	if (Array.isArray(value)) {
		let out = `${key}:\n`;
		for (const item of value) {
			out += `  - ${yamlEscape(String(item))}\n`;
		}
		return out;
	}
	return `${key}: ${yamlEscape(String(value))}\n`;
}

/**
 * Extract user-added sections from markdown body.
 * Preserves sections not managed by FMOD sync.
 */
export function extractUserSections(
	content: string,
	bodyStart: number
): Record<string, string> {
	const body = content.substring(bodyStart);
	const sections: Record<string, string> = {};

	const lines = body.split("\n");
	let currentSection: string | null = null;
	let currentContent: string[] = [];
	const managedSections = ["parameters", "notes", "user properties"];

	for (const line of lines) {
		if (line.startsWith("## ")) {
			// Save previous section if user-added
			if (
				currentSection &&
				!managedSections.includes(currentSection.toLowerCase())
			) {
				sections[currentSection] = currentContent.join("\n").trim();
			}
			currentSection = line.substring(3).trim();
			currentContent = [];
		} else if (currentSection) {
			currentContent.push(line);
		}
	}

	// Save final section if user-added
	if (
		currentSection &&
		!managedSections.includes(currentSection.toLowerCase())
	) {
		sections[currentSection] = currentContent.join("\n").trim();
	}

	return sections;
}
