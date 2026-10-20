"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
   parseOpenCodeEvents,
   sanitizeRequest,
   validateAndExpandPlan
} = require("./ai-builder.js");

const request = () => sanitizeRequest({
   requestId: "test-request",
   instruction: "Build a small arch",
   anchor: [0, 0, 0],
   worldVersion: 3,
   nearbyBlocks: [{ position: [0, 0, 0], block: "grass" }]
});

test("parses only OpenCode text events", () => {
   const output = [
      JSON.stringify({ type: "step_start", part: { type: "step-start" } }),
      JSON.stringify({
         type: "text",
         part: { type: "text", text: '{"message":"ok","operations":[]}' }
      })
   ].join("\n");
   assert.deepEqual(parseOpenCodeEvents(output), { message: "ok", operations: [] });
});

test("expands a high-level arch plan into bounded primitive actions", () => {
   const result = validateAndExpandPlan({
      message: "Building an arch.",
      operations: [
         { op: "column", position: [-1, 0, 0], height: 3, block: "stone" },
         { op: "column", position: [1, 0, 0], height: 3, block: "stone" },
         { op: "line", from: [-1, 2, 0], to: [1, 2, 0], block: "stone" }
      ]
   }, request());
   assert.equal(result.actions.length, 9);
   assert.deepEqual(result.actions[0], { op: "place", position: [-1, 0, 0], block: "stone" });
   assert.deepEqual(result.actions.at(-1), { op: "place", position: [1, 2, 0], block: "stone" });
});

test("rejects generated positions outside the world", () => {
   assert.throws(() => validateAndExpandPlan({
      message: "Too far.",
      operations: [{ op: "placeBlock", position: [8, 0, 0], block: "stone" }]
   }, request()), /outside the build area/);
});

test("rejects unsupported blocks and operations", () => {
   assert.throws(() => validateAndExpandPlan({
      message: "Bad block.",
      operations: [{ op: "placeBlock", position: [0, 0, 0], block: "diamond" }]
   }, request()), /must be one of/);
   assert.throws(() => validateAndExpandPlan({
      message: "Bad operation.",
      operations: [{ op: "runJavaScript", code: "alert(1)" }]
   }, request()), /unsupported/);
});

test("rejects plans that expand past the action limit", () => {
   assert.throws(() => validateAndExpandPlan({
      message: "Too large.",
      operations: [{
         op: "fillBox",
         from: [-4, 0, -4],
         to: [4, 3, 4],
         block: "brick"
      }]
   }, request()), /128-action limit/);
});


test("surfaces provider errors instead of treating them as malformed city JSON", () => {
   assert.throws(() => parseOpenCodeEvents(JSON.stringify({type:"error",error:{message:"Free tier rejected request"}})), /Free tier rejected/);
});
