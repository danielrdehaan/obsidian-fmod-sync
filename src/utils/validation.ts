import type { FMODExportData, ValidationResult, FMODEvent } from "../types";

/**
 * Validate FMOD export JSON data structure.
 * Returns validation result with detailed error messages.
 */
export function validateExportData(data: unknown): ValidationResult {
	const errors: string[] = [];

	if (!data || typeof data !== "object") {
		return { valid: false, errors: ["Not a valid JSON object"] };
	}

	const obj = data as Record<string, unknown>;

	// Check required top-level fields
	if (!Array.isArray(obj.events)) {
		errors.push("Missing 'events' array");
	} else {
		// Validate each event
		(obj.events as unknown[]).forEach((event: unknown, i: number) => {
			if (!event || typeof event !== "object") {
				errors.push(`Event ${i}: not a valid object`);
				return;
			}
			const ev = event as Record<string, unknown>;

			if (!ev.guid || typeof ev.guid !== "string") {
				errors.push(`Event ${i}: missing or invalid 'guid'`);
			}
			if (!ev.name || typeof ev.name !== "string") {
				errors.push(`Event ${i}: missing or invalid 'name'`);
			}
		});
	}

	if (typeof obj.project_name !== "string") {
		errors.push("Missing 'project_name'");
	}

	if (typeof obj.exported_at !== "string") {
		errors.push("Missing 'exported_at'");
	}

	if (errors.length === 0) {
		return {
			valid: true,
			data: data as FMODExportData,
			errors: [],
		};
	}

	return { valid: false, errors };
}

/**
 * Check if an event has required fields for processing.
 */
export function isValidEvent(event: FMODEvent): boolean {
	return Boolean(event.guid && event.name);
}
