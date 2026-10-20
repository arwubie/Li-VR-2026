/*
   Codex Builder (GPT-5.6 Luna)

   Point either VR controller at the build pad and press the trigger to choose
   an anchor. Type into the in-world terminal, then press Enter or select SEND
   to ask GPT-5.6 Luna through the authenticated Codex CLI for a bounded JSON build plan.

   The model never sends JavaScript to this scene. The server validates and
   expands a small planning language into place/remove/replace actions, and all
   clients validate the actions again before applying them to shared state.
*/

import * as cg from "../render/core/cg.js";
import { ControllerBeam } from "../render/core/controllerInput.js";

const SHARED_STATE = "codexBuilderWorld";
const BLOCK_SIZE = 0.10;
const GROUND_Y = 0.70;
const WORLD_X_OFFSET = 1.15;
const WORLD_Z = -2.10;
const BUILD_INTERVAL_MS = 90;
const MAX_ACTIONS = 128;
const MAX_WORLD_BLOCKS = 512;
const MAX_PROMPT_LENGTH = 360;
const MAX_LOG_LINES = 4;
const WORLD = { xMin: -8, xMax: 7, yMin: 0, yMax: 11, zMin: -8, zMax: 7 };

const BLOCK_COLORS = {
   grass: [0.24, 0.68, 0.25],
   dirt:  [0.42, 0.24, 0.11],
   stone: [0.48, 0.52, 0.57],
   wood:  [0.58, 0.34, 0.14],
   brick: [0.72, 0.20, 0.12],
   glass: [0.38, 0.78, 0.92],
};
const BLOCK_NAMES = new Set(Object.keys(BLOCK_COLORS));

let cleanup = null;

const defaultWorld = () => ({ version: 0, blocks: {}, lastMessage: "" });
const keyFor = position => position.join(",");
const validPosition = position => Array.isArray(position) && position.length === 3 &&
   position.every(Number.isInteger) &&
   position[0] >= WORLD.xMin && position[0] <= WORLD.xMax &&
   position[1] >= WORLD.yMin && position[1] <= WORLD.yMax &&
   position[2] >= WORLD.zMin && position[2] <= WORLD.zMax;

const cleanWorld = value => {
   const clean = defaultWorld();
   if (!value || typeof value !== "object") return clean;
   clean.version = Number.isInteger(value.version) && value.version >= 0 ? value.version : 0;
   clean.lastMessage = typeof value.lastMessage === "string" ? value.lastMessage.slice(0, 240) : "";
   if (value.blocks && typeof value.blocks === "object") {
      for (const key of Object.keys(value.blocks).slice(0, MAX_WORLD_BLOCKS)) {
         const block = value.blocks[key];
         if (!block || !validPosition(block.position) || !BLOCK_NAMES.has(block.block)) continue;
         clean.blocks[keyFor(block.position)] = {
            position: block.position.slice(),
            block: block.block,
            owner: block.owner === "ai" ? "ai" : "player"
         };
      }
   }
   return clean;
};

const applyAction = (blocks, action) => {
   const key = keyFor(action.position);
   if (action.op === "remove") {
      delete blocks[key];
      return;
   }
   if (action.op === "replace") {
      if (blocks[key] && blocks[key].block === action.fromBlock) {
         blocks[key] = { position: action.position.slice(), block: action.block, owner: "ai" };
      }
      return;
   }
   if (action.op === "place") {
      blocks[key] = { position: action.position.slice(), block: action.block, owner: "ai" };
   }
};

const validateActions = (actions, blocks) => {
   if (!Array.isArray(actions) || actions.length > MAX_ACTIONS)
      throw new Error(`A plan may contain at most ${MAX_ACTIONS} actions.`);
   const clean = [];
   for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      if (!action || !["place", "remove", "replace"].includes(action.op))
         throw new Error(`Action ${index} has an unsupported operation.`);
      if (!validPosition(action.position))
         throw new Error(`Action ${index} is outside the build area.`);
      const item = { op: action.op, position: action.position.slice() };
      if (action.op !== "remove") {
         if (!BLOCK_NAMES.has(action.block)) throw new Error(`Action ${index} has an invalid block.`);
         item.block = action.block;
      }
      if (action.op === "replace") {
         if (!BLOCK_NAMES.has(action.fromBlock)) throw new Error(`Action ${index} has an invalid source block.`);
         item.fromBlock = action.fromBlock;
      }
      clean.push(item);
   }

   const preview = {};
   for (const key of Object.keys(blocks)) preview[key] = blocks[key];
   clean.forEach(action => applyAction(preview, action));
   if (Object.keys(preview).length > MAX_WORLD_BLOCKS)
      throw new Error(`The world may contain at most ${MAX_WORLD_BLOCKS} blocks.`);
   return clean;
};

const worldToScene = position => [
   WORLD_X_OFFSET + position[0] * BLOCK_SIZE,
   GROUND_Y + BLOCK_SIZE / 2 + position[1] * BLOCK_SIZE,
   WORLD_Z + position[2] * BLOCK_SIZE
];

export const init = async model => {
   cleanup?.();

   if (!window[SHARED_STATE] || typeof window[SHARED_STATE] !== "object")
      window[SHARED_STATE] = defaultWorld();
   else
      window[SHARED_STATE] = cleanWorld(window[SHARED_STATE]);
   server.init(SHARED_STATE, defaultWorld());

   const sceneRoot = model.add();
   const worldRoot = sceneRoot.add();
   const effectsRoot = sceneRoot.add();
   const beamRoot = sceneRoot.add();
   // Keep the terminal's size and depth unchanged, and only move the entire UI
   // left so it no longer overlaps the build platform.
   const panelRoot = sceneRoot.add().move(-1.10, 0, 0);

   const gridCenter = WORLD_X_OFFSET + (WORLD.xMin + WORLD.xMax) * BLOCK_SIZE / 2;
   const gridZ = WORLD_Z + (WORLD.zMin + WORLD.zMax) * BLOCK_SIZE / 2;
   const gridSize = (WORLD.xMax - WORLD.xMin + 1) * BLOCK_SIZE;

   // This is a distant backdrop, not part of the foreground layout. Its very
   // large dimensions cover the view while its distance prevents intersections
   // with the terminal, keyboard, platform, or generated blocks.
   sceneRoot.add("cube")
      .move(0, 4.0, -24.0)
      .scale(42.0, 28.0, 0.04)
      .color(0.98, 0.98, 0.97).dull(1);

   // One inexpensive slab represents the base. User and AI blocks begin at Y=0.
   sceneRoot.add("cube")
      .move(gridCenter, GROUND_Y - 0.03, gridZ)
      .scale(gridSize / 2, 0.03, gridSize / 2)
      .color(0.10, 0.18, 0.12);

   // Thin grid lines make controller-selected block cells legible in VR.
   for (let n = 0; n <= 16; n++) {
      const offset = WORLD_X_OFFSET + (WORLD.xMin - 0.5 + n) * BLOCK_SIZE;
      sceneRoot.add("cube").move(offset, GROUND_Y + 0.002, gridZ)
         .scale(0.0015, 0.002, gridSize / 2).color(0.28, 0.42, 0.30);
      sceneRoot.add("cube").move(gridCenter, GROUND_Y + 0.002, WORLD_Z + (WORLD.zMin - 0.5 + n) * BLOCK_SIZE)
         .scale(gridSize / 2, 0.002, 0.0015).color(0.28, 0.42, 0.30);
   }

   // Invisible horizontal rectangle used for controller-ray selection.
   const selectionSurface = effectsRoot.add("square")
      .move(gridCenter, GROUND_Y + 0.006, gridZ)
      .turnX(Math.PI / 2)
      .scale(gridSize / 2, gridSize / 2, 1)
      .opacity(0);

   const anchorMarker = effectsRoot.add("cube,rounded")
      .color(1.0, 0.24, 0.04).dull(1);
   let anchor = [0, 0, 0];
   let status = "READY";
   let detail = "Type a request, then press Enter or select SEND.";
   let promptDraft = "";
   let logLines = ["READY - Type a building instruction."];
   let lastPanelText = "";
   let lastRenderedVersion = -1;
   let renderRevision = 0;
   let lastRenderedRevision = -1;
   let lastWorldReference = null;
   let lastBlocksReference = null;
   let lastSanitizedReference = window[SHARED_STATE];
   let pendingPlan = null;
   let requestInFlight = false;
   let submittedRequestId = null;

   // Use the same line-font technique as wordle.js. clay.text() has a very
   // different intrinsic scale and made the previous terminal unreadably tiny.
   panelRoot.add("cube,rounded").move(-0.25, 2.00, -1.02)
      .scale(1.34, 0.80, 0.025).color(0.025, 0.035, 0.055).dull(1);

   const DISPLAY = {
      title:  { name: "codexBuilderTitle",  node: null },
      input:  { name: "codexBuilderInput",  node: null },
      status: { name: "codexBuilderStatus", node: null },
      info:   { name: "codexBuilderInfo",   node: null },
      detail: { name: "codexBuilderDetail", node: null },
      log0:   { name: "codexBuilderLog0",   node: null },
      log1:   { name: "codexBuilderLog1",   node: null },
      log2:   { name: "codexBuilderLog2",   node: null },
      log3:   { name: "codexBuilderLog3",   node: null },
   };
   for (const key in DISPLAY) {
      clay.defineTextMesh(DISPLAY[key].name, " ");
      DISPLAY[key].node = panelRoot.add(DISPLAY[key].name).color(0.94, 0.97, 1);
   }

   const safeDisplay = value => String(value || " ")
      .replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().toUpperCase() || " ";
   const setDisplay = (slot, value, x, y, scale, color = [0.94, 0.97, 1]) => {
      const item = DISPLAY[slot];
      clay.defineTextMesh(item.name, safeDisplay(value));
      item.node.identity().move(x, y, -0.985).scale(scale).color(color);
   };

   // A visible controller keyboard, modeled after wordle.js.
   const keyboardRoot = panelRoot.add().move(-0.25, 0.78, -1.00);
   keyboardRoot.add("cube,rounded").move(0, 0, -0.035)
      .scale(1.24, 0.40, 0.018).color(0.045, 0.060, 0.085).dull(1);
   const terminalKeys = [];
   const keyColors = {
      normal: [0.14, 0.17, 0.22],
      action: [0.12, 0.55, 0.30],
      utility: [0.34, 0.38, 0.45],
      hover: [0.35, 0.72, 1.00],
   };
   const addTerminalKey = (value, x, y, halfWidth = 0.066, textScale = 2.15, tone = "normal") => {
      const keyRoot = keyboardRoot.add().move(x, y, 0);
      const baseColor = keyColors[tone];
      const background = keyRoot.add("cube,rounded")
         .scale(halfWidth, 0.043, 0.018).color(baseColor).dull(1);
      const meshName = `codexBuilderKey${terminalKeys.length}`;
      clay.defineTextMesh(meshName, value);
      const label = keyRoot.add(meshName).color(0.98, 0.98, 0.95);
      const width = 0.019 * (value.length - 1) + 0.015;
      label.move(-width * textScale / 2, 0.0125 * textScale, 0.024).scale(textScale);
      const target = keyRoot.add("square").move(0, 0, 0.030)
         .scale(halfWidth, 0.043, 1).opacity(0);
      terminalKeys.push({ value, background, target, baseColor });
   };
   const addKeyRow = (characters, y) => {
      const step = 0.148;
      for (let index = 0; index < characters.length; index++)
         addTerminalKey(characters[index], (index - (characters.length - 1) / 2) * step, y);
   };
   addKeyRow("1234567890",  0.255);
   addKeyRow("QWERTYUIOP",  0.150);
   addKeyRow("ASDFGHJKL",   0.045);
   addKeyRow("ZXCVBNM",    -0.060);
   addTerminalKey("CLEAR", -0.91, -0.235, 0.205, 0.90, "utility");
   addTerminalKey("SPACE", -0.37, -0.235, 0.285, 0.95, "normal");
   addTerminalKey("BACK",   0.27, -0.235, 0.245, 1.00, "utility");
   addTerminalKey("SEND",   0.88, -0.235, 0.245, 1.05, "action");

   const appendLog = message => {
      const clean = safeDisplay(message);
      if (!clean) return;
      logLines.push(clean.slice(0, 180));
      if (logLines.length > MAX_LOG_LINES)
         logLines = logLines.slice(-MAX_LOG_LINES);
   };

   const renderPanel = () => {
      const world = window[SHARED_STATE];
      const visibleDraft = promptDraft.length > 46
         ? "..." + promptDraft.slice(-43)
         : promptDraft;
      const panelText = [visibleDraft, status, anchor.join(","), world.version,
                         Object.keys(world.blocks).length, detail, ...logLines].join("|");
      if (panelText === lastPanelText) return;
      lastPanelText = panelText;

      setDisplay("title", "CODEX BUILDER - GPT 5.6 LUNA", -1.43, 2.64, 1.75, [0.35, 0.78, 1.0]);
      setDisplay("input", `> ${visibleDraft || "SELECT KEYS TO TYPE"}_`,
                 -1.43, 2.38, 1.55, [1.0, 0.92, 0.46]);
      setDisplay("status", `STATUS: ${status}`, -1.43, 2.13, 1.35,
                 status === "ERROR" || status.includes("REJECTED")
                    ? [1.0, 0.32, 0.25] : [0.52, 1.0, 0.66]);
      setDisplay("info", `ANCHOR [${anchor.join(", ")}]   WORLD V${world.version}   ${Object.keys(world.blocks).length} BLOCKS`,
                 -1.43, 1.91, 1.05, [0.70, 0.82, 0.94]);
      setDisplay("detail", safeDisplay(detail).slice(0, 58),
                 -1.43, 1.70, 0.98, [0.92, 0.94, 0.98]);

      const visibleLogs = logLines.slice(-MAX_LOG_LINES);
      for (let index = 0; index < MAX_LOG_LINES; index++)
         setDisplay(`log${index}`, (visibleLogs[index] || " ").slice(0, 70),
                    -1.43, 1.49 - index * 0.145, 0.90, [0.64, 0.75, 0.86]);
   };

   const renderWorld = () => {
      while (worldRoot.nChildren()) worldRoot.remove(0);
      const blocks = window[SHARED_STATE].blocks;
      for (const key of Object.keys(blocks)) {
         const block = blocks[key];
         if (!block || !validPosition(block.position) || !BLOCK_NAMES.has(block.block)) continue;
         const node = worldRoot.add("cube")
            .move(worldToScene(block.position))
            .scale(BLOCK_SIZE * 0.485)
            .color(BLOCK_COLORS[block.block])
            .info(block.block);
         if (block.block === "glass") node.opacity(0.48);
      }
      lastRenderedVersion = window[SHARED_STATE].version;
      lastRenderedRevision = renderRevision;
      lastWorldReference = window[SHARED_STATE];
      lastBlocksReference = blocks;
   };

   // A deliberately simple AI avatar: enough to make the planner feel embodied.
   const aiAvatar = effectsRoot.add();
   aiAvatar.add("cube,rounded").scale(0.07, 0.10, 0.05).color(0.30, 0.50, 1);
   aiAvatar.add("sphere").move(0, 0.145, 0).scale(0.065).color(0.70, 0.84, 1);
   aiAvatar.add("sphere").move(-0.024, 0.16, 0.056).scale(0.010).color(0.02, 0.08, 0.15);
   aiAvatar.add("sphere").move( 0.024, 0.16, 0.056).scale(0.010).color(0.02, 0.08, 0.15);
   let avatarPosition = cg.add(worldToScene(anchor), [0, 0.22, 0.14]);
   let avatarTarget = avatarPosition.slice();

   const beams = {
      left: new ControllerBeam(beamRoot, "left"),
      right: new ControllerBeam(beamRoot, "right")
   };

   const setAnchor = (x, z) => {
      x = Math.round(Number(x));
      z = Math.round(Number(z));
      if (!Number.isInteger(x) || !Number.isInteger(z) ||
          x < WORLD.xMin || x > WORLD.xMax || z < WORLD.zMin || z > WORLD.zMax) {
         status = "INVALID ANCHOR";
         detail = `Use X ${WORLD.xMin}..${WORLD.xMax} and Z ${WORLD.zMin}..${WORLD.zMax}.`;
         renderPanel();
         return false;
      }
      anchor = [x, 0, z];
      avatarTarget = cg.add(worldToScene(anchor), [0, 0.22, 0.14]);
      status = "ANCHOR SELECTED";
      detail = `The next request will build relative to [${anchor.join(", ")}].`;
      renderPanel();
      return true;
   };

   const nearbyBlocks = () => Object.values(window[SHARED_STATE].blocks)
      .filter(block => block && validPosition(block.position) && BLOCK_NAMES.has(block.block))
      .map(block => ({
         position: block.position.slice(),
         block: block.block,
         distance: Math.abs(block.position[0] - anchor[0]) +
                   Math.abs(block.position[1] - anchor[1]) +
                   Math.abs(block.position[2] - anchor[2])
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 256)
      .map(({ position, block }) => ({ position, block }));

   const requestId = () => window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `builder-${Date.now()}-${Math.random().toString(36).slice(2)}`;

   const askBuilder = async instruction => {
      const prompt = (instruction || "").toString().trim();
      if (!prompt) {
         status = "INPUT NEEDED";
         detail = "Type a building request before sending.";
         appendLog("INPUT NEEDED - Nothing was sent.");
         renderPanel();
         return null;
      }
      if (requestInFlight || submittedRequestId || pendingPlan) {
         status = "BUSY";
         detail = "Wait for the current request/build to finish.";
         appendLog(`BUSY - ${detail}`);
         renderPanel();
         return null;
      }

      const world = window[SHARED_STATE];
      const id = requestId();
      requestInFlight = true;
      status = "AI THINKING";
      detail = "Request sent. Waiting for a validated build plan...";
      appendLog(`SENT - ${prompt}`);
      renderPanel();

      try {
         const response = await fetch("/api/codex-builder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               requestId: id,
               instruction: prompt,
               anchor: anchor.slice(),
               worldVersion: world.version,
               nearbyBlocks: nearbyBlocks()
            })
         });
         const data = await response.json().catch(() => ({}));
         if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
         if (data.requestId !== id) throw new Error("The AI response ID did not match the request.");
         if (data.worldVersion !== world.version) throw new Error("The world changed while the AI was planning.");
         const actions = validateActions(data.actions, world.blocks);

         submittedRequestId = id;
         server.send(SHARED_STATE, {
            op: "applyPlan",
            requestId: id,
            baseVersion: world.version,
            startTime: Date.now() + 500,
            message: typeof data.message === "string" ? data.message.slice(0, 240) : "AI build plan",
            actions
         });
         status = "PLAN READY";
         detail = `${data.message || "Building"} (${actions.length} actions)`;
         appendLog(`PLAN RECEIVED - ${actions.length} block actions.`);
         renderPanel();
         return data;
      } catch (error) {
         submittedRequestId = null;
         status = "ERROR";
         detail = error.message || String(error);
         appendLog(`ERROR - ${detail}`);
         renderPanel();
         console.error("[Codex Builder]", error);
         return null;
      } finally {
         requestInFlight = false;
      }
   };

   const queuePlan = message => {
      const world = window[SHARED_STATE];
      if (pendingPlan || !message || message.baseVersion !== world.version) {
         if (message && message.requestId === submittedRequestId) submittedRequestId = null;
         status = "STALE PLAN";
         detail = "The world changed before this plan could start. Please ask again.";
         appendLog(`STALE PLAN - ${detail}`);
         return;
      }
      try {
         const actions = validateActions(message.actions, world.blocks);
         pendingPlan = {
            requestId: message.requestId,
            baseVersion: message.baseVersion,
            startTime: Number.isFinite(message.startTime) ? message.startTime : Date.now(),
            message: typeof message.message === "string" ? message.message.slice(0, 240) : "AI build plan",
            actions,
            index: 0
         };
         if (message.requestId === submittedRequestId) submittedRequestId = null;
         status = "BUILDING";
         detail = `${pendingPlan.message} (0/${actions.length})`;
         appendLog(`BUILDING - 0 / ${actions.length}`);
      } catch (error) {
         if (message.requestId === submittedRequestId) submittedRequestId = null;
         status = "PLAN REJECTED";
         detail = error.message;
         appendLog(`PLAN REJECTED - ${detail}`);
      }
   };

   const advancePlan = () => {
      if (!pendingPlan) return;
      const world = window[SHARED_STATE];
      if (world.version !== pendingPlan.baseVersion) {
         pendingPlan = null;
         status = "BUILD INTERRUPTED";
         detail = "The shared world changed during construction.";
         appendLog(`BUILD INTERRUPTED - ${detail}`);
         return;
      }
      const elapsed = Date.now() - pendingPlan.startTime;
      const targetIndex = Math.min(
         pendingPlan.actions.length,
         elapsed < 0 ? 0 : Math.floor(elapsed / BUILD_INTERVAL_MS) + 1
      );
      while (pendingPlan.index < targetIndex) {
         const action = pendingPlan.actions[pendingPlan.index++];
         applyAction(world.blocks, action);
         renderRevision++;
         avatarTarget = cg.add(worldToScene(action.position), [0, 0.22, 0.14]);
         status = "BUILDING";
         detail = `${pendingPlan.message} (${pendingPlan.index}/${pendingPlan.actions.length})`;
      }
      if (pendingPlan.index >= pendingPlan.actions.length) {
         world.version++;
         world.lastMessage = pendingPlan.message;
         status = "DONE";
         detail = pendingPlan.message;
         appendLog(`DONE - ${pendingPlan.message}`);
         pendingPlan = null;
      }
   };

   const clearBuilderWorld = () => {
      if (requestInFlight || submittedRequestId || pendingPlan) {
         status = "BUSY";
         detail = "Wait for the current request/build before clearing.";
         renderPanel();
         return false;
      }
      server.send(SHARED_STATE, {
         op: "clear",
         baseVersion: window[SHARED_STATE].version
      });
      status = "CLEARING";
      detail = "Clearing the shared AI Builder world.";
      renderPanel();
      return true;
   };

   const clearTerminal = () => {
      promptDraft = "";
      logLines = ["READY - Terminal cleared."];
      status = requestInFlight || submittedRequestId || pendingPlan ? status : "READY";
      detail = requestInFlight || submittedRequestId || pendingPlan
         ? detail
         : "Type a request, then press Enter or select SEND.";
      renderPanel();
   };

   const submitDraft = () => {
      const prompt = promptDraft.trim();
      if (!prompt) {
         status = "INPUT NEEDED";
         detail = "Type a building request before sending.";
         appendLog("INPUT NEEDED - Nothing was sent.");
         renderPanel();
         return;
      }
      promptDraft = "";
      renderPanel();
      void askBuilder(prompt);
   };

   const pressTerminalKey = value => {
      if (value === "SEND") {
         submitDraft();
         return;
      }
      if (value === "CLEAR") {
         clearTerminal();
         return;
      }
      if (value === "BACK")
         promptDraft = promptDraft.slice(0, -1);
      else if (value === "SPACE") {
         if (promptDraft.length && !promptDraft.endsWith(" ") && promptDraft.length < MAX_PROMPT_LENGTH)
            promptDraft += " ";
      }
      else if (promptDraft.length < MAX_PROMPT_LENGTH)
         promptDraft += value;
      status = "TYPING";
      detail = `${promptDraft.length} / ${MAX_PROMPT_LENGTH} CHARACTERS`;
      renderPanel();
   };

   const onKeyDown = event => {
      if (window.currentName && window.currentName !== "ai-builder-codex") return;
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
         return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      if (event.key === "Enter") {
         event.preventDefault();
         submitDraft();
         return;
      }
      if (event.key === "Backspace") {
         event.preventDefault();
         pressTerminalKey("BACK");
         return;
      }
      if (event.key === "Escape") {
         event.preventDefault();
         clearTerminal();
         return;
      }
      if (event.key.length === 1 && promptDraft.length < MAX_PROMPT_LENGTH) {
         event.preventDefault();
         pressTerminalKey(event.key.toUpperCase());
      }
   };

   const onPaste = event => {
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
         return;
      const text = event.clipboardData?.getData("text") || "";
      if (!text) return;
      event.preventDefault();
      promptDraft = (promptDraft + text.replace(/[\r\n\t]+/g, " ")).slice(0, MAX_PROMPT_LENGTH);
      status = "TYPING";
      detail = `${promptDraft.length} / ${MAX_PROMPT_LENGTH} characters`;
      renderPanel();
   };

   window.addEventListener("keydown", onKeyDown);
   window.addEventListener("paste", onPaste);

   const previousInput = {
      onPress: inputEvents.onPress,
      onDrag: inputEvents.onDrag,
      onRelease: inputEvents.onRelease,
      onClick: inputEvents.onClick
   };

   const pointedKey = hand => terminalKeys.find(key =>
      beams[hand].hitPoint(key.target.getGlobalMatrix()));

   const selectWithBeam = hand => {
      const selectedKey = pointedKey(hand);
      if (selectedKey) {
         pressTerminalKey(selectedKey.value);
         return;
      }
      const beam = beams[hand];
      const point = beam.hitPoint(selectionSurface.getGlobalMatrix());
      if (!point) return;
      setAnchor(
         Math.round((point[0] - WORLD_X_OFFSET) / BLOCK_SIZE),
         Math.round((point[2] - WORLD_Z) / BLOCK_SIZE)
      );
   };

   // Mouse support makes the exact same in-world keyboard usable while testing
   // on a laptop, without adding any controls to the scene-selection menu.
   let mouseHoverKey = null;
   const keyAtPoint = point => {
      if (!point) return null;
      return terminalKeys.find(key => {
         const local = cg.mTransform(cg.mInverse(key.target.getGlobalMatrix()), point);
         return Math.abs(local[0]) <= 1 && Math.abs(local[1]) <= 1;
      }) || null;
   };
   const mousePoint = event => {
      if (!window.canvas || !clay.views || !clay.views[0]) return null;
      const rect = window.canvas.getBoundingClientRect();
      const x = 2 * (event.clientX - rect.left) / rect.width - 1;
      const y = 1 - 2 * (event.clientY - rect.top) / rect.height;
      const view = clay.views[0];
      const inversePV = cg.mInverse(cg.mMultiply(view.projectionMatrix, view.viewMatrix));
      const unproject = z => {
         let point = cg.mTransform(inversePV, [x, y, z, 1]);
         if (Math.abs(point[3]) < 0.00001) return null;
         point = [point[0] / point[3], point[1] / point[3], point[2] / point[3]];
         return cg.mTransform(clay.inverseRootMatrix, point);
      };
      const near = unproject(-1), far = unproject(1);
      if (!near || !far || Math.abs(far[2] - near[2]) < 0.00001) return null;
      const targetZ = keyboardRoot.getGlobalMatrix()[14] + 0.03;
      const amount = (targetZ - near[2]) / (far[2] - near[2]);
      return cg.mix(near, far, amount);
   };
   const onMouseMove = event => mouseHoverKey = keyAtPoint(mousePoint(event));
   const onMouseDown = event => {
      if (event.button !== 0) return;
      const selectedKey = keyAtPoint(mousePoint(event));
      if (!selectedKey) return;
      pressTerminalKey(selectedKey.value);
      event.preventDefault();
   };
   const previousInteractMode = window.interactMode;
   window.interactMode = 1;
   window.canvas?.addEventListener("mousemove", onMouseMove);
   window.canvas?.addEventListener("mousedown", onMouseDown);

   const inputCallbacks = {
      onPress: hand => selectWithBeam(hand),
      onDrag: () => {},
      onRelease: () => {},
      onClick: () => {}
   };
   inputEvents.onPress = inputCallbacks.onPress;
   inputEvents.onDrag = inputCallbacks.onDrag;
   inputEvents.onRelease = inputCallbacks.onRelease;
   inputEvents.onClick = inputCallbacks.onClick;

   window.askCodexBuilder = askBuilder;
   window.setCodexBuilderAnchor = setAnchor;
   window.clearCodexBuilderWorld = clearBuilderWorld;

   cleanup = () => {
      for (const name of Object.keys(inputCallbacks))
         if (inputEvents[name] === inputCallbacks[name]) inputEvents[name] = previousInput[name];
      if (window.askCodexBuilder === askBuilder) delete window.askCodexBuilder;
      if (window.setCodexBuilderAnchor === setAnchor) delete window.setCodexBuilderAnchor;
      if (window.clearCodexBuilderWorld === clearBuilderWorld) delete window.clearCodexBuilderWorld;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
      window.canvas?.removeEventListener("mousemove", onMouseMove);
      window.canvas?.removeEventListener("mousedown", onMouseDown);
      window.interactMode = previousInteractMode;
   };

   renderWorld();
   renderPanel();

   model.animate(() => {
      // The first client can receive a persisted object asynchronously. Treat it
      // as untrusted input and replace it with a normalized copy before use.
      if (!window[SHARED_STATE] || typeof window[SHARED_STATE] !== "object" ||
          lastSanitizedReference !== window[SHARED_STATE]) {
         window[SHARED_STATE] = cleanWorld(window[SHARED_STATE]);
         lastSanitizedReference = window[SHARED_STATE];
         renderRevision++;
      }

      server.sync(SHARED_STATE, messages => {
         for (const messageId in messages) {
            const message = messages[messageId];
            if (!message || typeof message !== "object") continue;
            if (message.op === "applyPlan") queuePlan(message);
            if (message.op === "clear" && message.baseVersion === window[SHARED_STATE].version) {
               pendingPlan = null;
               submittedRequestId = null;
               window[SHARED_STATE].blocks = {};
               window[SHARED_STATE].version++;
               renderRevision++;
               window[SHARED_STATE].lastMessage = "World cleared";
               status = "READY";
               detail = "The world is clear. Choose an anchor and ask the AI to build.";
            }
         }
      });

      if (!window[SHARED_STATE].blocks || typeof window[SHARED_STATE].blocks !== "object") {
         window[SHARED_STATE] = cleanWorld(window[SHARED_STATE]);
         lastSanitizedReference = window[SHARED_STATE];
         renderRevision++;
      }

      advancePlan();

      if (lastRenderedVersion !== window[SHARED_STATE].version ||
          lastRenderedRevision !== renderRevision ||
          lastWorldReference !== window[SHARED_STATE] ||
          lastBlocksReference !== window[SHARED_STATE].blocks)
         renderWorld();

      const markerPosition = worldToScene(anchor);
      const pulse = 0.88 + 0.12 * Math.sin(model.time * 7.5);
      anchorMarker.identity().move(markerPosition)
         .scale(BLOCK_SIZE * 0.53 * pulse)
         .color(1.0, 0.18 + 0.32 * pulse, 0.02)
         .opacity(0.62 + 0.34 * pulse);
      avatarPosition = cg.mix(avatarPosition, avatarTarget, 0.08);
      aiAvatar.identity().move(avatarPosition)
         .turnY(0.15 * Math.sin(model.time * 2));

      beams.left.update();
      beams.right.update();
      const hoverLeft = pointedKey("left");
      const hoverRight = pointedKey("right");
      for (const key of terminalKeys)
         key.background.color(key === hoverLeft || key === hoverRight || key === mouseHoverKey
            ? keyColors.hover : key.baseColor);
      renderPanel();
   });
};

export const deinit = () => {
   cleanup?.();
   cleanup = null;
};
