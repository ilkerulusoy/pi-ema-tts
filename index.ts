import { type ChildProcess, spawn } from "node:child_process";
import { unlink } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PYTHON = process.env.EMA_PYTHON ?? "python3";
const WORKER = join(dirname(fileURLToPath(import.meta.url)), "worker.py");
const MAX_CHARS = Number(process.env.EMA_MAX_CHARS ?? 1500);

type Worker = { proc: ChildProcess; waiters: ((line: string) => void)[] };

function speakableText(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^[#>\-*+|\s]+/gm, "")
		.replace(/[*_~|]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_CHARS);
}

function lastAssistantText(messages: any[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role !== "assistant") continue;
		const content = message.content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return content.filter((part) => part?.type === "text").map((part) => part.text).join("\n");
		}
	}
	return "";
}

const TTS_RULE =
	"At the end of every reply, add a short spoken summary inside <tts>...</tts>. Use one or two plain sentences in the language of the reply. Do not put code, paths, or markdown in it.";

function ttsSection(reply: string): string {
	return [...reply.matchAll(/<tts>([\s\S]*?)<\/tts>/gi)].map((match) => match[1]).join(" ");
}

function stripTtsTags(reply: string): string {
	return reply.replace(/<\/?tts>/gi, "");
}

export default function (pi: ExtensionAPI) {
	let enabled = false;
	let minimal = false;
	let worker: Worker | undefined;
	let player: ChildProcess | undefined;
	let jobId = 0;

	function startWorker(): Worker {
		const proc = spawn(PYTHON, [WORKER], { stdio: ["pipe", "pipe", "ignore"] });
		const created: Worker = { proc, waiters: [() => {}] };
		createInterface({ input: proc.stdout! }).on("line", (line) => created.waiters.shift()?.(line));
		proc.on("exit", () => {
			for (const waiter of created.waiters.splice(0)) waiter("err worker exited");
			if (worker === created) worker = undefined;
		});
		return created;
	}

	function synthesize(target: Worker, text: string, path: string): Promise<string> {
		return new Promise((resolve) => {
			target.waiters.push(resolve);
			target.proc.stdin!.write(`${JSON.stringify({ text, path })}\n`);
		});
	}

	function stopPlayback() {
		player?.kill();
		player = undefined;
	}

	function stopAll() {
		stopPlayback();
		worker?.proc.kill();
		worker = undefined;
	}

	pi.registerCommand("tts", {
		description: "Read assistant replies aloud: /tts [on|off|minimal|full|stop]",
		handler: async (args, ctx) => {
			const arg = String(args ?? "").trim();
			if (arg === "stop") return stopPlayback();
			if (arg === "minimal" || arg === "full") {
				minimal = arg === "minimal";
				enabled = true;
			} else {
				enabled = arg === "on" ? true : arg === "off" ? false : !enabled;
			}
			if (enabled) worker ??= startWorker();
			else stopAll();
			ctx.ui.notify(enabled ? `TTS on (${minimal ? "minimal" : "full"})` : "TTS off", "info");
		},
	});

	pi.on("before_agent_start", (event) => {
		if (enabled && minimal) event.systemPromptOptions.sections.tts = TTS_RULE;
		else delete event.systemPromptOptions.sections.tts;
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!enabled) return;
		const reply = lastAssistantText(event.messages as any[]);
		const text = speakableText(minimal ? ttsSection(reply) : stripTtsTags(reply));
		if (!text) return;
		worker ??= startWorker();
		const id = ++jobId;
		const path = join(tmpdir(), `pi-ema-${process.pid}-${id}.wav`);
		const result = await synthesize(worker, text, path);
		if (result !== "ok") {
			ctx.ui.notify(`TTS failed: ${result}`, "error");
			return;
		}
		if (id !== jobId || !enabled) return unlink(path, () => {});
		stopPlayback();
		player = spawn("afplay", [path], { stdio: "ignore" });
		player.on("exit", () => unlink(path, () => {}));
	});

	pi.on("session_shutdown", async () => stopAll());
}
