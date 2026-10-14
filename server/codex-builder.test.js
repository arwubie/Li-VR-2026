"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MODEL, parseCodexEvents } = require("./codex-builder.js");

test("uses GPT-5.6 Luna by default", () => {
   assert.equal(MODEL, process.env.CODEX_BUILDER_MODEL || "gpt-5.6-luna");
});

test("parses the completed Codex agent message from JSONL", () => {
   const output = [
      JSON.stringify({ type: "thread.started", thread_id: "test" }),
      "a harmless non-JSON diagnostic line",
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
         type: "item.completed",
         item: { type: "agent_message", text: '{"message":"ok","operations":[]}' }
      }),
      JSON.stringify({ type: "turn.completed", usage: {} })
   ].join("\n");
   assert.deepEqual(parseCodexEvents(output), { message: "ok", operations: [] });
});
