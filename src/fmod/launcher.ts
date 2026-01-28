import { Platform } from "obsidian";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require("child_process");

/**
 * Launch FMOD Studio with a specific project file.
 */
export function launchFmod(installationPath: string, projectPath: string): void {
	if (Platform.isMacOS) {
		spawn("open", ["-a", installationPath, projectPath], {
			detached: true,
			stdio: "ignore",
		});
	} else {
		spawn(installationPath, [projectPath], {
			detached: true,
			stdio: "ignore",
		});
	}
}
