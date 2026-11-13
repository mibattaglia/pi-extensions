import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import net from "node:net";
import { test } from "node:test";
import statusbar from "../extensions/statusbar/index.ts";

test("reports prompt waits and distinguishes aborted runs", async (t) => {
	const platform = Object.getOwnPropertyDescriptor(process, "platform");
	const createConnection = net.createConnection;
	const writes = [];
	const socket = new EventEmitter();
	socket.destroyed = false;
	socket.write = (line) => writes.push(JSON.parse(line));
	socket.end = () => {
		socket.destroyed = true;
	};

	Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
	net.createConnection = () => socket;
	t.after(() => {
		net.createConnection = createConnection;
		Object.defineProperty(process, "platform", platform);
	});

	const handlers = new Map();
	statusbar({ on: (name, handler) => handlers.set(name, handler) });
	const ctx = { cwd: "/tmp/project", isIdle: () => false };
	await handlers.get("session_start")({}, ctx);
	socket.emit("connect");
	await handlers.get("agent_start")({}, ctx);
	await handlers.get("ui_prompt_start")({ kind: "input" }, ctx);
	await handlers.get("ui_prompt_end")({}, ctx);
	await handlers.get("agent_settled")({ aborted: true }, ctx);
	await handlers.get("agent_settled")({ aborted: false }, ctx);
	await handlers.get("ui_prompt_start")({ kind: "confirm" }, ctx);
	await handlers.get("ui_prompt_end")({}, { ...ctx, isIdle: () => true });

	assert.deepEqual(writes.map(({ state }) => state), [
		"idle",
		"working",
		"waiting",
		"working",
		"idle",
		"attention",
		"waiting",
		"idle",
	]);

	await handlers.get("session_shutdown")({}, ctx);
});
