import * as fs from "fs";
import * as path from "path";
import { FMOD_SCRIPT_FILENAME, FMOD_SCRIPT_URL } from "./constants";
import { getFmodScriptsFolder } from "./utils/platform";

/**
 * Check if the companion script exists in the FMOD Studio scripts folder.
 */
export function checkCompanionScriptExists(installationPath: string): boolean {
	const scriptsFolder = getFmodScriptsFolder(installationPath);
	if (!scriptsFolder) return false;
	const scriptPath = path.join(scriptsFolder, FMOD_SCRIPT_FILENAME);
	return fs.existsSync(scriptPath);
}

/**
 * Install the companion script to the FMOD Studio scripts folder.
 * Fetches the latest version from GitHub.
 */
export async function installCompanionScript(installationPath: string): Promise<{ success: boolean; error?: string }> {
	const scriptsFolder = getFmodScriptsFolder(installationPath);
	if (!scriptsFolder) {
		return { success: false, error: "Could not determine scripts folder path" };
	}

	// Ensure scripts folder exists
	try {
		if (!fs.existsSync(scriptsFolder)) {
			fs.mkdirSync(scriptsFolder, { recursive: true });
		}
	} catch (err) {
		return { success: false, error: `Could not create scripts folder: ${err}` };
	}

	// Fetch script from GitHub
	try {
		const response = await fetch(FMOD_SCRIPT_URL);
		if (!response.ok) {
			return { success: false, error: `Failed to fetch script: ${response.status} ${response.statusText}` };
		}
		const scriptContent = await response.text();

		// Write script to file
		const scriptPath = path.join(scriptsFolder, FMOD_SCRIPT_FILENAME);
		fs.writeFileSync(scriptPath, scriptContent, "utf8");

		return { success: true };
	} catch (err) {
		return { success: false, error: `Failed to install script: ${err}` };
	}
}
