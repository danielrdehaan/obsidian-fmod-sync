import * as fs from "fs";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { promisify } = require("util");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exec } = require("child_process");
const execAsync = promisify(exec);

/**
 * Sanitize a path for use in PowerShell single-quoted strings.
 * Escapes single quotes by doubling them.
 */
function sanitizePathForPowerShell(pathStr: string): string {
	return pathStr.replace(/'/g, "''");
}

/**
 * Get the FMOD Studio scripts folder path from the installation path.
 * - macOS: <app>/Contents/Scripts/
 * - Windows: <exe directory>/Scripts/
 */
export function getFmodScriptsFolder(installationPath: string): string {
	const platform = process.platform;
	if (platform === "darwin") {
		// macOS: Scripts folder is inside the .app bundle
		if (installationPath.endsWith(".app")) {
			return path.join(installationPath, "Contents", "Scripts");
		}
	} else if (platform === "win32") {
		// Windows: Scripts folder is next to the exe
		const exeDir = path.dirname(installationPath);
		return path.join(exeDir, "Scripts");
	}
	return "";
}

/**
 * Detect FMOD Studio version from installation path.
 * Reads version from revision_studio.txt or Windows file properties.
 */
export async function detectFmodVersion(appPath: string): Promise<string> {
	const platform = process.platform;

	try {
		if (platform === "darwin") {
			// macOS: Read version from revision_studio.txt in the app bundle
			if (!appPath.endsWith(".app")) {
				return "Unknown";
			}

			const revisionPath = path.join(appPath, "Contents", "Resources", "documentation", "revision_studio.txt");

			// Read the revision file and find the first version line
			const content = await new Promise<string>((resolve, reject) => {
				fs.readFile(revisionPath, "utf8", (err: Error | null, data: string) => {
					if (err) reject(err);
					else resolve(data);
				});
			});

			// Version line format: "13/1/26 2.02.33 - Studio Tool minor release (build 160335)"
			const versionMatch = content.match(/^\d+\/\d+\/\d+\s+(\d+\.\d+\.\d+)\s+-/m);
			if (versionMatch) {
				return versionMatch[1];
			}

			return "Unknown";
		} else if (platform === "win32") {
			// Windows: Try revision file first (same location relative to exe)
			const exeDir = path.dirname(appPath);
			const revisionPath = path.join(exeDir, "documentation", "revision_studio.txt");

			try {
				const content = await new Promise<string>((resolve, reject) => {
					fs.readFile(revisionPath, "utf8", (err: Error | null, data: string) => {
						if (err) reject(err);
						else resolve(data);
					});
				});

				const versionMatch = content.match(/^\d+\/\d+\/\d+\s+(\d+\.\d+\.\d+)\s+-/m);
				if (versionMatch) {
					return versionMatch[1];
				}
			} catch {
				// Fall back to PowerShell file version
				const sanitized = sanitizePathForPowerShell(appPath);
				const { stdout } = await execAsync(
					`powershell -NoProfile -Command "(Get-Item '${sanitized}').VersionInfo.ProductVersion"`
				);
				const version = stdout.trim();
				return version || "Unknown";
			}
		}
	} catch (error) {
		console.error("Failed to detect FMOD version:", error);
	}

	return "Unknown";
}
