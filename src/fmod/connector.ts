import * as net from "net";
import { FMOD_TCP_PORT, FMOD_TCP_HOST, FMOD_CONNECTION_TIMEOUT } from "../constants";
import type { FMODConnectionResult } from "../types";

/**
 * Check if FMOD Studio is running and accepting TCP connections.
 */
export async function isFmodRunning(): Promise<boolean> {
	return new Promise((resolve) => {
		const client = new net.Socket();
		const timeout = setTimeout(() => {
			client.destroy();
			resolve(false);
		}, 1000);

		client.connect(FMOD_TCP_PORT, FMOD_TCP_HOST, () => {
			clearTimeout(timeout);
			client.destroy();
			resolve(true);
		});

		client.on("error", () => {
			clearTimeout(timeout);
			resolve(false);
		});
	});
}

/**
 * Send a JavaScript command to FMOD Studio via TCP.
 */
export async function sendCommand(command: string): Promise<FMODConnectionResult> {
	return new Promise((resolve) => {
		const client = new net.Socket();
		let response = "";

		const timeout = setTimeout(() => {
			client.destroy();
			resolve({ success: false, error: "Timeout" });
		}, FMOD_CONNECTION_TIMEOUT);

		client.connect(FMOD_TCP_PORT, FMOD_TCP_HOST, () => {
			client.write(command + "\n");
		});

		client.on("data", (data) => {
			response += data.toString();
		});

		client.on("close", () => {
			clearTimeout(timeout);
			resolve({ success: true, response: response.trim() });
		});

		client.on("error", (err) => {
			clearTimeout(timeout);
			resolve({ success: false, error: err.message });
		});
	});
}

/**
 * Navigate to an event in FMOD Studio by its GUID.
 */
export async function navigateToEvent(guid: string): Promise<FMODConnectionResult> {
	// Validate GUID format
	if (!/^\{[0-9a-f-]{36}\}$/i.test(guid)) {
		return { success: false, error: "Invalid GUID format" };
	}

	const command = `(function() {
		var event = studio.project.lookup("${guid}");
		if (event) {
			studio.window.navigateTo(event);
			return "ok";
		}
		return "not_found";
	})()`;

	const result = await sendCommand(command);

	if (result.success && result.response === "not_found") {
		return { success: false, error: "Event not found in FMOD project" };
	}

	return result;
}

/**
 * Wait for FMOD Studio to accept TCP connections.
 */
export async function waitForConnection(timeoutMs: number, pollMs = 500): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await isFmodRunning()) return true;
		await new Promise((r) => setTimeout(r, pollMs));
	}
	return false;
}
