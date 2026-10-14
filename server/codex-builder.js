"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const {
   buildPrompt,
   extractJsonObject,
   sanitizeRequest,
   validateAndExpandPlan
} = require("./ai-builder.js");

const MODEL = process.env.CODEX_BUILDER_MODEL || "gpt-5.6-luna";
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const REQUEST_TIMEOUT_MS = 75000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

const parseCodexEvents = output => {
   let text = "";
   for (const line of String(output || "").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); }
      catch (_) { continue; }
      if (event && event.type === "item.completed" && event.item &&
          event.item.type === "agent_message" && typeof event.item.text === "string")
         text += event.item.text;
   }
   return extractJsonObject(text);
};

const runCodex = prompt => new Promise((resolve, reject) => {
   const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-builder-codex-"));
   const args = [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--skip-git-repo-check",
      "-s", "read-only",
      "-C", workingDirectory,
      "-m", MODEL,
      "--json",
      prompt
   ];
   const child = spawn(CODEX_BIN, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" }
   });
   let stdout = "";
   let stderr = "";
   let finished = false;
   let forceKill;

   const cleanup = () => {
      try { fs.rmSync(workingDirectory, { recursive: true, force: true }); }
      catch (_) { /* best-effort cleanup of our isolated temporary directory */ }
   };
   const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      cleanup();
      error ? reject(error) : resolve(value);
   };
   const terminate = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      child.kill("SIGTERM");
      forceKill = setTimeout(() => child.kill("SIGKILL"), 2000);
      cleanup();
      reject(error);
   };
   const timeout = setTimeout(() => {
      terminate(new Error(`Codex timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`));
   }, REQUEST_TIMEOUT_MS);

   child.stdout.on("data", chunk => {
      stdout += chunk.toString();
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES)
         terminate(new Error("Codex output exceeded the safety limit"));
   });
   child.stderr.on("data", chunk => {
      if (Buffer.byteLength(stderr) < 100000) stderr += chunk.toString();
   });
   child.on("error", error => finish(new Error(
      error.code === "ENOENT"
         ? "Codex CLI was not found. Install it, run `codex login`, and ensure `codex` is on the server PATH."
         : `Unable to start Codex: ${error.message}`
   )));
   child.on("close", code => {
      if (finished) return;
      if (code !== 0)
         return finish(new Error(`Codex exited with code ${code}: ${stderr.trim().slice(-500)}`));
      finish(null, stdout);
   });
});

const generatePlan = async body => {
   let request;
   try {
      request = sanitizeRequest(body);
   } catch (error) {
      error.isRequestError = true;
      throw error;
   }

   let correction = null;
   let lastError;
   for (let attempt = 1; attempt <= 2; attempt++) {
      try {
         const output = await runCodex(buildPrompt(request, correction));
         const plan = parseCodexEvents(output);
         const expanded = validateAndExpandPlan(plan, request);
         return {
            requestId: request.requestId,
            worldVersion: request.worldVersion,
            model: MODEL,
            attempts: attempt,
            message: expanded.message,
            actions: expanded.actions
         };
      } catch (error) {
         lastError = error;
         if (!error.isValidationError || attempt === 2) break;
         correction = { error: error.message };
      }
   }
   if (lastError && lastError.isValidationError) {
      const error = new Error(`The model failed plan validation after two attempts: ${lastError.message}`);
      error.isModelError = true;
      throw error;
   }
   throw lastError;
};

module.exports = { MODEL, generatePlan, parseCodexEvents, runCodex };
