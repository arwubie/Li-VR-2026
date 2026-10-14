"use strict";

const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const MODEL = process.env.AI_BUILDER_MODEL || "opencode/mimo-v2.6-flash-free";
const OPENCODE_BIN = process.env.OPENCODE_BIN || "opencode";
const OPENCODE_CONFIG_DIR = path.join(__dirname, "opencode-ai-builder");
const REQUEST_TIMEOUT_MS = 75000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_OPERATIONS = 20;
const MAX_ACTIONS = 128;
const MAX_WORLD_BLOCKS = 512;

const BLOCKS = new Set(["grass", "dirt", "stone", "wood", "brick", "glass"]);
const OPERATIONS = new Set([
   "placeBlock", "removeBlock", "line", "column", "wall", "floor",
   "fillBox", "hollowBox", "doorway", "stairs", "roof", "replaceMaterial"
]);

const WORLD = Object.freeze({
   xMin: -8, xMax: 7,
   yMin: 0, yMax: 11,
   zMin: -8, zMax: 7
});

const fail = message => {
   const error = new Error(message);
   error.isValidationError = true;
   throw error;
};

const isPlainObject = value => value !== null && typeof value === "object" &&
   !Array.isArray(value);

const integer = (value, label, min, max) => {
   if (!Number.isInteger(value) || value < min || value > max)
      fail(`${label} must be an integer from ${min} to ${max}`);
   return value;
};

const vector = (value, label, min = -16, max = 16) => {
   if (!Array.isArray(value) || value.length !== 3)
      fail(`${label} must be a three-number array`);
   return value.map((component, index) => integer(component, `${label}[${index}]`, min, max));
};

const blockName = (value, label = "block") => {
   if (typeof value !== "string" || !BLOCKS.has(value))
      fail(`${label} must be one of: ${Array.from(BLOCKS).join(", ")}`);
   return value;
};

const absolutePosition = (relative, anchor, label) => {
   const result = [
      anchor[0] + relative[0],
      anchor[1] + relative[1],
      anchor[2] + relative[2]
   ];
   if (result[0] < WORLD.xMin || result[0] > WORLD.xMax ||
       result[1] < WORLD.yMin || result[1] > WORLD.yMax ||
       result[2] < WORLD.zMin || result[2] > WORLD.zMax)
      fail(`${label} resolves outside the build area: [${result.join(", ")}]`);
   return result;
};

const orderedBounds = (a, b) => ({
   min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
   max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]
});

const eachBox = (a, b, callback) => {
   const bounds = orderedBounds(a, b);
   for (let x = bounds.min[0]; x <= bounds.max[0]; x++)
      for (let y = bounds.min[1]; y <= bounds.max[1]; y++)
         for (let z = bounds.min[2]; z <= bounds.max[2]; z++)
            callback([x, y, z], bounds);
};

const linePoints = (a, b, label) => {
   const changing = [0, 1, 2].filter(axis => a[axis] !== b[axis]);
   if (changing.length > 1)
      fail(`${label} must be axis-aligned`);
   if (!changing.length) return [a.slice()];
   const axis = changing[0];
   const direction = b[axis] > a[axis] ? 1 : -1;
   const points = [];
   for (let value = a[axis]; ; value += direction) {
      const point = a.slice();
      point[axis] = value;
      points.push(point);
      if (value === b[axis]) break;
   }
   return points;
};

const sanitizeRequest = body => {
   if (!isPlainObject(body)) fail("Request body must be an object");
   if (typeof body.instruction !== "string") fail("instruction is required");
   const instruction = body.instruction.trim();
   if (!instruction || instruction.length > 1200)
      fail("instruction must contain 1 to 1200 characters");

   const requestId = typeof body.requestId === "string" && body.requestId.length <= 100
      ? body.requestId : `builder-${Date.now()}`;
   const anchor = vector(body.anchor, "anchor", -8, 11);
   absolutePosition([0, 0, 0], anchor, "anchor");
   const worldVersion = integer(body.worldVersion, "worldVersion", 0, 1000000000);

   const nearbyBlocks = Array.isArray(body.nearbyBlocks) ? body.nearbyBlocks : [];
   if (nearbyBlocks.length > 256) fail("nearbyBlocks cannot contain more than 256 entries");
   const cleanNearby = nearbyBlocks.map((entry, index) => {
      if (!isPlainObject(entry)) fail(`nearbyBlocks[${index}] must be an object`);
      const position = vector(entry.position, `nearbyBlocks[${index}].position`, -8, 11);
      absolutePosition([0, 0, 0], position, `nearbyBlocks[${index}].position`);
      return { position, block: blockName(entry.block, `nearbyBlocks[${index}].block`) };
   });

   return { requestId, instruction, anchor, worldVersion, nearbyBlocks: cleanNearby };
};

const buildPrompt = (request, correction) => {
   const correctionText = correction
      ? `\nYour previous response was rejected: ${correction.error}. Return a corrected plan.\n`
      : "";
   return `You are the planning brain for AI Builder, a small collaborative VR block world.
Do not use tools. Do not inspect, create, or modify files. Return exactly one JSON object with no markdown or explanation.
All operation coordinates are integer offsets relative to anchor [0,0,0]. +Y is up. +X is right. +Z is toward the viewer.
Allowed blocks: grass, dirt, stone, wood, brick, glass.
The response schema is {"message":"short player-facing sentence","operations":[...]}.
Use at most ${MAX_OPERATIONS} operations. The expanded result must create/change at most ${MAX_ACTIONS} blocks.
Allowed operations and fields:
- {"op":"placeBlock","position":[x,y,z],"block":"wood"}
- {"op":"removeBlock","position":[x,y,z]}
- {"op":"line","from":[x,y,z],"to":[x,y,z],"block":"stone"}; line must be axis-aligned
- {"op":"column","position":[x,y,z],"height":4,"block":"stone"}
- {"op":"wall","from":[x,y,z],"to":[x,y,z],"height":3,"block":"brick"}; base line must be horizontal and axis-aligned
- {"op":"floor","from":[x,y,z],"to":[x,y,z],"block":"wood"}; from/to must share Y
- {"op":"fillBox","from":[x,y,z],"to":[x,y,z],"block":"stone"}
- {"op":"hollowBox","from":[x,y,z],"to":[x,y,z],"block":"brick"}
- {"op":"doorway","position":[x,y,z],"width":1,"height":2,"axis":"x"}; removes blocks along x or z
- {"op":"stairs","position":[x,y,z],"direction":"x+","width":2,"height":4,"block":"wood"}; direction is x+, x-, z+, or z-
- {"op":"roof","from":[x,y,z],"to":[x,y,z],"style":"flat","block":"brick"}; style is flat or gable, and from/to share Y
- {"op":"replaceMaterial","from":[x,y,z],"to":[x,y,z],"fromBlock":"wood","toBlock":"brick"}
Prefer high-level operations instead of many placeBlock operations. Keep buildings small, coherent, and inside the available bounds.
Do not include physics, textures, JavaScript, comments, trailing commas, or additional keys.
Current request: ${JSON.stringify(request.instruction)}
Absolute anchor: ${JSON.stringify(request.anchor)}
Current world version: ${request.worldVersion}
Nearby absolute blocks: ${JSON.stringify(request.nearbyBlocks)}
Example response: {"message":"I will build a small stone arch.","operations":[{"op":"column","position":[-1,0,0],"height":3,"block":"stone"},{"op":"column","position":[1,0,0],"height":3,"block":"stone"},{"op":"line","from":[-1,2,0],"to":[1,2,0],"block":"stone"}]}
${correctionText}`;
};

const extractJsonObject = text => {
   if (typeof text !== "string" || !text.trim()) fail("Model returned no text");
   let candidate = text.trim();
   if (candidate.startsWith("```")) {
      candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
   }
   try {
      return JSON.parse(candidate);
   } catch (_) {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
         try { return JSON.parse(candidate.slice(start, end + 1)); }
         catch (_) { /* handled below */ }
      }
   }
   fail("Model response was not valid JSON");
};

const parseOpenCodeEvents = output => {
   let text = "";
   for (const line of String(output || "").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); }
      catch (_) { continue; }
      if (event && event.type === "text" && event.part && typeof event.part.text === "string")
         text += event.part.text;
   }
   return extractJsonObject(text);
};

const validateAndExpandPlan = (plan, request) => {
   if (!isPlainObject(plan)) fail("Plan must be an object");
   if (typeof plan.message !== "string" || !plan.message.trim() || plan.message.length > 240)
      fail("message must contain 1 to 240 characters");
   if (!Array.isArray(plan.operations) || plan.operations.length > MAX_OPERATIONS)
      fail(`operations must be an array with at most ${MAX_OPERATIONS} entries`);

   const actions = [];
   const add = (op, relative, block, fromBlock) => {
      if (actions.length >= MAX_ACTIONS)
         fail(`Plan expands beyond the ${MAX_ACTIONS}-action limit`);
      const position = absolutePosition(relative, request.anchor, "operation position");
      const action = { op, position };
      if (block !== undefined) action.block = blockName(block);
      if (fromBlock !== undefined) action.fromBlock = blockName(fromBlock, "fromBlock");
      actions.push(action);
   };

   const pointsForBox = (operation, callback) => {
      const from = vector(operation.from, "from");
      const to = vector(operation.to, "to");
      eachBox(from, to, callback);
      return { from, to };
   };

   plan.operations.forEach((operation, index) => {
      if (!isPlainObject(operation) || !OPERATIONS.has(operation.op))
         fail(`operations[${index}].op is unsupported`);
      const label = `operations[${index}]`;
      switch (operation.op) {
      case "placeBlock":
         add("place", vector(operation.position, `${label}.position`), operation.block);
         break;
      case "removeBlock":
         add("remove", vector(operation.position, `${label}.position`));
         break;
      case "line": {
         const from = vector(operation.from, `${label}.from`);
         const to = vector(operation.to, `${label}.to`);
         const block = blockName(operation.block);
         linePoints(from, to, label).forEach(point => add("place", point, block));
         break;
      }
      case "column": {
         const position = vector(operation.position, `${label}.position`);
         const height = integer(operation.height, `${label}.height`, 1, 12);
         const block = blockName(operation.block);
         for (let y = 0; y < height; y++) add("place", [position[0], position[1] + y, position[2]], block);
         break;
      }
      case "wall": {
         const from = vector(operation.from, `${label}.from`);
         const to = vector(operation.to, `${label}.to`);
         if (from[1] !== to[1]) fail(`${label} base endpoints must share Y`);
         const height = integer(operation.height, `${label}.height`, 1, 12);
         const block = blockName(operation.block);
         const base = linePoints(from, to, label);
         for (let y = 0; y < height; y++)
            base.forEach(point => add("place", [point[0], point[1] + y, point[2]], block));
         break;
      }
      case "floor": {
         const from = vector(operation.from, `${label}.from`);
         const to = vector(operation.to, `${label}.to`);
         if (from[1] !== to[1]) fail(`${label} endpoints must share Y`);
         const block = blockName(operation.block);
         const bounds = orderedBounds(from, to);
         for (let x = bounds.min[0]; x <= bounds.max[0]; x++)
            for (let z = bounds.min[2]; z <= bounds.max[2]; z++)
               add("place", [x, from[1], z], block);
         break;
      }
      case "fillBox": {
         const block = blockName(operation.block);
         pointsForBox(operation, point => add("place", point, block));
         break;
      }
      case "hollowBox": {
         const block = blockName(operation.block);
         pointsForBox(operation, (point, bounds) => {
            const boundary = [0, 1, 2].some(axis => point[axis] === bounds.min[axis] || point[axis] === bounds.max[axis]);
            if (boundary) add("place", point, block);
         });
         break;
      }
      case "doorway": {
         const position = vector(operation.position, `${label}.position`);
         const width = integer(operation.width, `${label}.width`, 1, 4);
         const height = integer(operation.height, `${label}.height`, 1, 5);
         if (operation.axis !== "x" && operation.axis !== "z") fail(`${label}.axis must be x or z`);
         for (let w = 0; w < width; w++)
            for (let y = 0; y < height; y++) {
               const offset = operation.axis === "x" ? [w, y, 0] : [0, y, w];
               add("remove", [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]);
            }
         break;
      }
      case "stairs": {
         const position = vector(operation.position, `${label}.position`);
         const width = integer(operation.width, `${label}.width`, 1, 4);
         const height = integer(operation.height, `${label}.height`, 1, 8);
         const directions = { "x+": [1, 0], "x-": [-1, 0], "z+": [0, 1], "z-": [0, -1] };
         const direction = directions[operation.direction];
         if (!direction) fail(`${label}.direction must be x+, x-, z+, or z-`);
         const block = blockName(operation.block);
         for (let step = 0; step < height; step++)
            for (let w = 0; w < width; w++) {
               const across = direction[0] ? [0, w] : [w, 0];
               add("place", [
                  position[0] + direction[0] * step + across[0],
                  position[1] + step,
                  position[2] + direction[1] * step + across[1]
               ], block);
            }
         break;
      }
      case "roof": {
         const from = vector(operation.from, `${label}.from`);
         const to = vector(operation.to, `${label}.to`);
         if (from[1] !== to[1]) fail(`${label} endpoints must share Y`);
         if (operation.style !== "flat" && operation.style !== "gable")
            fail(`${label}.style must be flat or gable`);
         const block = blockName(operation.block);
         const bounds = orderedBounds(from, to);
         if (operation.style === "flat") {
            for (let x = bounds.min[0]; x <= bounds.max[0]; x++)
               for (let z = bounds.min[2]; z <= bounds.max[2]; z++)
                  add("place", [x, from[1], z], block);
         } else {
            const spanX = bounds.max[0] - bounds.min[0];
            const spanZ = bounds.max[2] - bounds.min[2];
            const shrinkX = spanX <= spanZ;
            const layers = Math.floor((shrinkX ? spanX : spanZ) / 2) + 1;
            for (let layer = 0; layer < layers; layer++) {
               if (shrinkX) {
                  const left = bounds.min[0] + layer, right = bounds.max[0] - layer;
                  for (let z = bounds.min[2]; z <= bounds.max[2]; z++) {
                     add("place", [left, from[1] + layer, z], block);
                     if (right !== left) add("place", [right, from[1] + layer, z], block);
                  }
               } else {
                  const front = bounds.min[2] + layer, back = bounds.max[2] - layer;
                  for (let x = bounds.min[0]; x <= bounds.max[0]; x++) {
                     add("place", [x, from[1] + layer, front], block);
                     if (back !== front) add("place", [x, from[1] + layer, back], block);
                  }
               }
            }
         }
         break;
      }
      case "replaceMaterial": {
         const fromBlock = blockName(operation.fromBlock, `${label}.fromBlock`);
         const toBlock = blockName(operation.toBlock, `${label}.toBlock`);
         pointsForBox(operation, point => add("replace", point, toBlock, fromBlock));
         break;
      }
      }
   });

   return { message: plan.message.trim(), actions };
};

const runOpenCode = prompt => new Promise((resolve, reject) => {
   const args = ["run", "--format", "json", "-m", MODEL, prompt];
   const child = spawn(OPENCODE_BIN, args, {
      cwd: os.tmpdir(),
      env: {
         ...process.env,
         NO_COLOR: "1",
         OPENCODE_CONFIG_DIR
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
   });
   let stdout = "", stderr = "", finished = false;

   let forceKill;
   const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      error ? reject(error) : resolve(value);
   };

   const terminate = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      child.kill("SIGTERM");
      forceKill = setTimeout(() => child.kill("SIGKILL"), 2000);
      reject(error);
   };

   const timeout = setTimeout(() => {
      terminate(new Error(`OpenCode timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`));
   }, REQUEST_TIMEOUT_MS);

   child.stdout.on("data", chunk => {
      stdout += chunk.toString();
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
         terminate(new Error("OpenCode output exceeded the safety limit"));
      }
   });
   child.stderr.on("data", chunk => {
      if (Buffer.byteLength(stderr) < 100000) stderr += chunk.toString();
   });
   child.on("error", error => finish(new Error(
      error.code === "ENOENT"
         ? "OpenCode CLI was not found. Install it and ensure `opencode` is on the server PATH."
         : `Unable to start OpenCode: ${error.message}`
   )));
   child.on("close", code => {
      if (finished) return;
      if (code !== 0) return finish(new Error(`OpenCode exited with code ${code}: ${stderr.trim().slice(-500)}`));
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
         const output = await runOpenCode(buildPrompt(request, correction));
         const plan = parseOpenCodeEvents(output);
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

module.exports = {
   BLOCKS,
   MAX_ACTIONS,
   MAX_WORLD_BLOCKS,
   MODEL,
   WORLD,
   buildPrompt,
   extractJsonObject,
   generatePlan,
   parseOpenCodeEvents,
   sanitizeRequest,
   validateAndExpandPlan
};
