/* AI City: five individual cube recipes demonstrated to a one-shot planner.
   Overview and room-tracked walking share the same geometry; AI output is validated data, never executable code. */

import * as cg from "../render/core/cg.js";
import { ControllerBeam, joyStickState } from "../render/core/controllerInput.js";

import { CITY_LIMIT, CITY_PROMPT, EXAMPLES, VARIATIONS, PALETTES, validPart, buildElement, validateObjectRecords, rayPartDistance } from "../util/ai-city.mjs?v=walk-6";

import { createBuilderScreen } from "../util/ai-builder-screen.mjs?v=5";

import { homeView, setView, moveView } from "../util/ai-builder-view.mjs";

import {commitCity,compareWorld} from "../util/ai-builder-sync.mjs";

const SHARED_STATE = "aiBuilderCityWorld";
const BLOCK_SIZE = 0.085;
const GROUND_Y = 0.70;
const WORLD_X_OFFSET = 3.65;
const WORLD_Z = -7.10;
const BUILD_INTERVAL_MS = 8;
const MAX_PROMPT_LENGTH = 360;

// Switching browser focus must not restart an in-flight AI request.
export const reloadOnFocus = false;
let cleanup = null;

const defaultWorld = () => ({ version: 0, blocks: {}, objects: [], lastMessage: "" });
const keyFor = part => part.id;
const cleanWorld = value => {
   const clean = defaultWorld();
   if (!value || typeof value !== "object") return clean;
   clean.version = Number.isInteger(value.version) && value.version >= 0 ? value.version : 0;
   clean.commitId = typeof value.commitId === "string" ? value.commitId : "";
   clean.lastMessage = typeof value.lastMessage === "string" ? value.lastMessage.slice(0,240) : "";
   for (const part of Object.values(value.blocks || {}).slice(0, CITY_LIMIT))
      if (validPart(part)) clean.blocks[keyFor(part)] = part;
   try { clean.objects = validateObjectRecords(value.objects || []); } catch (_) {}
   return clean;
};
const applyAction = (blocks, action) => { blocks[keyFor(action)] = action; };
const validateActions = actions => {
   if (!Array.isArray(actions) || !actions.length || actions.length > CITY_LIMIT || !actions.every(validPart))
      throw new Error("City geometry is invalid or exceeds its budget.");
   if (new Set(actions.map(a => a.id)).size !== actions.length)
      throw new Error("Duplicate city part IDs.");
   return actions;
};

const worldToScene = (position, offset = WORLD_X_OFFSET) => [
   offset + position[0] * BLOCK_SIZE,
   GROUND_Y + BLOCK_SIZE / 2 + position[1] * BLOCK_SIZE,
   WORLD_Z + position[2] * BLOCK_SIZE
];

export const init = async model => {
   (window.__aiBuilderCleanup || cleanup)?.();
   let disposed = false;

   if (!window[SHARED_STATE] || typeof window[SHARED_STATE] !== "object")
      window[SHARED_STATE] = defaultWorld();
   else
      window[SHARED_STATE] = cleanWorld(window[SHARED_STATE]);
   server.init(SHARED_STATE, defaultWorld());

   const headerDetails = typeof document !== "undefined" ? document.getElementById("header-details") : null;
   const headerWasOpen = headerDetails?.open;
   if(headerDetails) headerDetails.open=false;
   const sceneRoot = model.add();
   let view=homeView(), lastFrameTime=null, snapArmed=true;
   const heldArrows=new Set();
   const scenePosition = position => {
      if(!view.walking) return worldToScene(position);
      const x=position[0]-view.x,z=position[2]-view.z,c=Math.cos(view.yaw),s=Math.sin(view.yaw);
      return [c*x-s*z,1.6-view.y+position[1],s*x+c*z];
   };
   const updateView = () => {
      panelRoot.foreground(view.walking);
      beamRoot.foreground(view.walking);
      cityRoot.identity();
      if(view.walking) cityRoot.move(0,1.6-view.y,0).turnY(-view.yaw).move(-view.x,0,-view.z);
      else cityRoot.move(WORLD_X_OFFSET,GROUND_Y,WORLD_Z).scale(BLOCK_SIZE);
      return {...view};
   };
   const setBuilderView = (x=8,y=1.6,z=36,yaw=0) => {view=setView(view,x,y,z,yaw);return updateView();};
   const homeBuilderView = () => {view=homeView();heldArrows.clear();return updateView();};

   const effectsRoot = sceneRoot.add();
   const beamRoot = sceneRoot.add();
   // Keep the readable foreground terminal. Separation is horizontal, not a camera change.
   const panelRoot = sceneRoot.add().move(-1.30, 0, -.15).scale(.92);

   // Transform the city for locomotion without changing XR tracking matrices.
   const cityRoot = sceneRoot.add().move(WORLD_X_OFFSET, GROUND_Y, WORLD_Z).scale(BLOCK_SIZE);

   const cityGeometry = cityRoot.add();
   cityRoot.add("cube").move(0,-.5,0).scale(41,.5,41).color(PALETTES.road);
   for (let n = -40; n <= 40; n += 16) {
      for (let dash = -38; dash <= 38; dash += 4) {
         cityRoot.add("cube").move(n,.02,dash).scale(.08,.02,.65).color(PALETTES.gold);
         cityRoot.add("cube").move(dash,.02,n).scale(.65,.02,.08).color(PALETTES.gold);
      }
   }
   const backdrop=sceneRoot.add("cube").move(0,4,-25).scale(42,28,.04).color(.89,.94,.96).dull(1);
   // Individual demonstrations live on the far-left shelf, outside the city footprint.
   const sampleRoot = sceneRoot.add().move(-3.72,.50,-1.50);
   sampleRoot.add("cube").move(0,1.2,-.12).scale(.23,1.65,.05).color(.055,.075,.095).dull(1);
   clay.defineTextMesh("aiCitySamples", "EXAMPLES");
   sampleRoot.add("aiCitySamples").move(-.20,2.72,0).scale(1.10).color(.35,.90,.93);
   EXAMPLES.forEach((b,index) => {
      // The tower uses a smaller display scale so all five examples have their own row.
      const scale = b.kind === "tower" ? .018 : .038;
      const rowY = 2.15 - index * .58;
      const example = sampleRoot.add().move(0,rowY,0).scale(scale);
      for (const a of buildElement(b,[0,0,0]))
         example.add(a.shape).move(a.position).scale(a.size).color(PALETTES[a.block]);
      const name = `aiCityExample${index}`;
      clay.defineTextMesh(name,b.kind.toUpperCase());
      sampleRoot.add(name).move(-.18,rowY-.08,.02).scale(1.0).color(.84,.91,.95);
   });

   const variationRoot=sceneRoot.add().move(-4.50,.50,-1.50);
   variationRoot.add("cube").move(0,1.2,-.12).scale(.33,1.65,.05).color(.055,.075,.095).dull(1);
   VARIATIONS.forEach((b,index)=>{
      const rowY=2.15-index*.58, scale=.027;
      const example=variationRoot.add().move(0,rowY,0).scale(scale);
      for(const a of buildElement(b,[0,0,0])) example.add(a.shape).move(a.position).scale(a.size).color(PALETTES[a.block]);
      const name=`aiCityVariation${index}`;clay.defineTextMesh(name,b.label);
      variationRoot.add(name).move(-.29,rowY-.08,.02).scale(.85).color(.84,.91,.95);
   });

   let anchor = [0, 0, 0];
   let selectedObjectId = null;
   let editSelection = false;
   let screenUI = null;
   const selectedObject = () => (window[SHARED_STATE].objects || []).find(b=>b.id===selectedObjectId) || null;
   let status = "READY";
   let detail = "Type your request + SEND. DEMO runs the city example.";
   let promptDraft = "";
   let lastPanelText = "";
   let lastRenderedVersion = -1;
   let renderRevision = 0;
   let lastRenderedRevision = -1;
   let lastWorldReference = null;
   let lastBlocksReference = null;
   let lastSanitizedReference = window[SHARED_STATE];
   let pendingPlan = null;
   const commitHistory = new Map();
   let lastSyncHello=0;
   let acceptedWorld=window[SHARED_STATE];
   let requestInFlight = false;
   let requestStartedAt = 0;
   let sentPrompt = "";
   const receivedPlanIds = window.__aiBuilderReceivedIds || (window.__aiBuilderReceivedIds = new Set());
   let submittedRequestId = null;
   let requestEpoch = 0;
   let activeRequest = null;
   let activeRequestId = null;
   const cancelledIds = window.__aiBuilderCancelledIds || (window.__aiBuilderCancelledIds = new Set());
   const cancelBuild = () => {
      for (const id of [activeRequestId, submittedRequestId, pendingPlan?.requestId])
         if (id) cancelledIds.add(id);
      requestEpoch++;
      activeRequest?.abort();
      activeRequest = null;
      activeRequestId = null;
      requestInFlight = false;
      submittedRequestId = null;
      pendingPlan = null;
   };

   // Use the same line-font technique as wordle.js. clay.text() has a very
   // different intrinsic scale and made the previous terminal unreadably tiny.
   panelRoot.add("cube,rounded").move(-0.25, 2.00, -1.02)
      .scale(1.34, 0.80, 0.025).color(0.025, 0.035, 0.055).dull(1);

   const panelTarget = panelRoot.add("square").move(-.25,2,-.955).scale(1.32,.78,1).opacity(0);
   const DISPLAY = {
      title:  { name: "aiBuilderTitle",  node: null },
      input:  { name: "aiBuilderInput",  node: null },
      status: { name: "aiBuilderStatus", node: null },
      info:   { name: "aiBuilderInfo",   node: null },
      detail: { name: "aiBuilderDetail", node: null },
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
      item.node.identity().move(x, y, -0.985).scale(screenUI ? 0 : scale).color(color);
   };

   // A visible controller keyboard, modeled after wordle.js.
   const keyboardRoot = panelRoot.add().move(-0.25, 0.78, -1.00);
   keyboardRoot.add("cube,rounded").move(0, 0, -0.035)
      .scale(1.24, 0.46, 0.018).color(0.045, 0.060, 0.085).dull(1);
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
      const meshName = `aiBuilderKey${terminalKeys.length}`;
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
   addTerminalKey("DEMO", -0.91, -0.365, 0.205, 0.90, "action");
   addTerminalKey("NEW", 0.27, -0.365, 0.245, 0.95, "utility");
   addTerminalKey("RESET", -0.37, -0.365, 0.285, 0.95, "utility");
   addTerminalKey("CLEAR", -0.91, -0.235, 0.205, 0.90, "utility");
   addTerminalKey("SPACE", -0.37, -0.235, 0.285, 0.95, "normal");
   addTerminalKey("BACK",   0.27, -0.235, 0.245, 1.00, "utility");
   addTerminalKey("SEND",   0.88, -0.235, 0.245, 1.05, "action");

   // Navigation keys are spatial targets like every letter: available in VR too.
   for(const [value,x] of [["WALK",-.91],["HOME",-.37],["FWD",.27],["REV",.88]])
      addTerminalKey(value,x,-.49,value==='WALK'?.205:.245,.9,'utility');
   for(const [value,x] of [["LEFT",-.91],["RIGHT",-.37],["TURN L",.27],["TURN R",.88]])
      addTerminalKey(value,x,-.60,value==='LEFT'?.205:.245,.85,'utility');
   keyboardRoot.add("cube,rounded").move(0,-.55,-.035).scale(1.24,.105,.018).color(.045,.060,.085).dull(1);

   const renderPanel = () => {
      const world = window[SHARED_STATE];
      const displayDraft = promptDraft || ((requestInFlight || submittedRequestId || pendingPlan) ? sentPrompt : "");
      const visibleDraft = displayDraft.length > 46 ? "..."+displayDraft.slice(-43) : displayDraft;
      const displayStatus = requestInFlight ? "AI THINKING" : pendingPlan ? "BUILDING" : submittedRequestId ? "PLAN READY" : status;
      const panelText = [displayDraft, displayStatus, anchor.join(","), world.version,
                         Object.keys(world.blocks).length, detail, selectedObjectId, editSelection,
                         window.isXR?.(), requestInFlight, submittedRequestId, !!pendingPlan, view.walking, view.x.toFixed(1), view.y.toFixed(1), view.z.toFixed(1), JSON.stringify(world.objects)].join("|");
      if (panelText === lastPanelText) return;
      lastPanelText = panelText;
      const failed = displayStatus === "ERROR" || displayStatus.includes("REJECTED") || displayStatus === "STALE PLAN";
      screenUI?.update({draft:displayDraft,status:displayStatus,selected:selectedObject(),edit:editSelection,
         elapsed:requestInFlight?Math.floor((Date.now()-requestStartedAt)/1000):0,
         progress:pendingPlan?`${pendingPlan.index}/${pendingPlan.actions.length}`:"",
         error:failed?detail:"",view:view.walking?view:null});
      if(screenUI) return;

      setDisplay("title", "AI BUILDER", -1.43, 2.64, 2.65, [0.35, 0.78, 1.0]);
      setDisplay("input", `> ${visibleDraft || " "}_`,
                 -1.43, 2.38, 1.55, [1.0, 0.92, 0.46]);
      setDisplay("status", `STATUS: ${displayStatus}`, -1.43, 2.13, 1.35,
                 status === "ERROR" || status.includes("REJECTED")
                    ? [1.0, 0.32, 0.25] : [0.52, 1.0, 0.66]);
      setDisplay("info", selectedObject() ? `EDIT ${selectedObject().kind} / ${selectedObjectId}` : "NEW SCENE",
                 -1.43, 1.91, 1.05, [0.70, 0.82, 0.94]);
      setDisplay("detail", failed ? safeDisplay(detail).slice(0, 58) : " ",
                 -1.43, 1.70, 0.98, [0.92, 0.94, 0.98]);


   };

   const selectionRoot = cityRoot.add();
   let selectionBars = [];
   const renderSelection = () => {
      selectionBars.forEach(node=>selectionRoot.remove(node));selectionBars=[];
      if(!selectedObjectId) return;
      const parts=Object.values(window[SHARED_STATE].blocks).filter(p=>p.objectId===selectedObjectId);
      if(!parts.length) return;
      const min=[0,1,2].map(i=>Math.min(...parts.map(p=>p.position[i]-p.size[i]))-.3);
      const max=[0,1,2].map(i=>Math.max(...parts.map(p=>p.position[i]+p.size[i]))+.3);
      for(let axis=0;axis<3;axis++){
         const other=[0,1,2].filter(i=>i!==axis);
         for(const a of [0,1])for(const b of [0,1]){
            const center=min.map((v,i)=>(v+max[i])/2),size=[.12,.12,.12];
            center[other[0]]=a?max[other[0]]:min[other[0]];center[other[1]]=b?max[other[1]]:min[other[1]];
            size[axis]=(max[axis]-min[axis])/2;
            selectionBars.push(selectionRoot.add("cube").move(center).scale(size).color(.2,1,.8).dull(1));
         }
      }
   };
   const selectObject = id => {
      selectedObjectId=id || null;
      if(!selectedObject()) selectedObjectId=null;
      editSelection=!!selectedObjectId;
      detail=selectedObjectId?`Selected ${selectedObject().kind}. SEND edits only this object.`:"New scene mode. Type a building request.";
      renderSelection();renderPanel();
   };
   const renderedParts = new Map();
   const renderWorld = () => {
      const blocks = pendingPlan?.visualBlocks || window[SHARED_STATE].blocks;
      for (const [key, entry] of renderedParts) {
         if (blocks[key] !== entry.part) {
            cityGeometry.remove(entry.node);
            renderedParts.delete(key);
         }
      }
      for (const [key, part] of Object.entries(blocks)) {
         if (renderedParts.has(key) || !validPart(part)) continue;
         const node = cityGeometry.add(part.shape).move(part.position).scale(part.size).color(PALETTES[part.block]);
         renderedParts.set(key, {node, part});
      }
      lastRenderedVersion = window[SHARED_STATE].version;
      lastRenderedRevision = renderRevision;
      lastWorldReference = window[SHARED_STATE];
      lastBlocksReference = blocks;
      renderSelection();
   };

   // A deliberately simple AI avatar: enough to make the planner feel embodied.
   const aiAvatar = effectsRoot.add();
   aiAvatar.add("cube,rounded").scale(0.07, 0.10, 0.05).color(0.30, 0.50, 1);
   aiAvatar.add("sphere").move(0, 0.145, 0).scale(0.065).color(0.70, 0.84, 1);
   aiAvatar.add("sphere").move(-0.024, 0.16, 0.056).scale(0.010).color(0.02, 0.08, 0.15);
   aiAvatar.add("sphere").move( 0.024, 0.16, 0.056).scale(0.010).color(0.02, 0.08, 0.15);
   let avatarPosition = cg.add(scenePosition(anchor), [0, 0.22, 0.14]);
   let avatarTarget = avatarPosition.slice();

   const beams = {
      left: new ControllerBeam(beamRoot, "left"),
      right: new ControllerBeam(beamRoot, "right")
   };

   const requestId = () => window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `builder-${Date.now()}-${Math.random().toString(36).slice(2)}`;

   const askBuilder = async (instruction, {preset = false} = {}) => {
      if(disposed) return null;
      const prompt = (instruction || "").toString().trim();
      if (!prompt) {
         status = "INPUT NEEDED";
         detail = "Type a building request before sending.";

         renderPanel();
         return null;
      }
      if (requestInFlight || submittedRequestId || pendingPlan) {
         status = "BUSY";
         detail = "Wait for the current request/build to finish.";

         renderPanel();
         return null;
      }

      const world = window[SHARED_STATE];
      const target = !preset && editSelection ? selectedObject() : null;
      if(!preset && editSelection && !target){status="SELECT OBJECT";detail="Select an object or switch to New scene.";renderPanel();return null;}
      const id = requestId();
      const epoch = ++requestEpoch;
      const baseVersion = world.version;
      const controller = new AbortController();
      activeRequest = controller;
      activeRequestId = id;
      requestInFlight = true;
      requestStartedAt = Date.now();
      sentPrompt = prompt;
      status = "AI THINKING";
      detail = "Request sent. Waiting for a validated build plan...";

      renderPanel();

      try {
         const response = await fetch("/api/ai-builder", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               mode: "city",
               preset,
               target,
               requestId: id,
               instruction: prompt,
               anchor: anchor.slice(),
               worldVersion: baseVersion,
               nearbyBlocks: []
            })
         });
         const data = await response.json().catch(() => ({}));
         if (epoch !== requestEpoch || controller.signal.aborted) return null;
         if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
         if (data.requestId !== id) throw new Error("The AI response ID did not match the request.");
         if (data.worldVersion !== baseVersion || window[SHARED_STATE].version !== baseVersion) throw new Error("The world changed while the AI was planning.");
         const actions = validateActions(data.actions, world.blocks);
         const objects = validateObjectRecords(data.objects || []);
         if(objects.length && actions.some(a=>!objects.some(b=>b.id===a.objectId))) throw new Error("Geometry does not match its objects.");
         if(target && (data.targetId!==target.id || objects.length!==1 || objects[0].id!==target.id || actions.some(a=>a.objectId!==target.id)))
            throw new Error("The edit did not match the selected object.");
         if(!target && data.targetId) throw new Error("Unexpected edit target.");

         submittedRequestId = id;
         const planMessage = {
            op: "applyPlan",
            requestId: id,
            baseVersion,
            startTime: Date.now(),
            message: typeof data.message === "string" ? data.message.slice(0, 240) : "AI build plan",
            actions,
            objects,
            targetId:target?.id || null
         };
         if(!queuePlan(planMessage)) throw new Error(detail || "Plan rejected");
         // Local construction does not depend on client-list initialization or a network echo.
         try { server.send(SHARED_STATE, planMessage); }
         catch (error) { console.warn("[AI Builder] Plan built locally; sharing failed:", error); }

         renderPanel();
         return data;
      } catch (error) {
         if (epoch !== requestEpoch || controller.signal.aborted) return null;
         cancelledIds.add(id);
         submittedRequestId = null;
         if(pendingPlan?.requestId===id) pendingPlan=null;
         status = "ERROR";
         detail = error.message || String(error);

         renderPanel();
         console.error("[AI Builder]", error);
         return null;
      } finally {
         if (epoch === requestEpoch) {
            requestInFlight = false;
            activeRequest = null;
            activeRequestId = null;
         }
      }
   };

   const queuePlan = message => {
      const world = window[SHARED_STATE];
      if (!message || typeof message.requestId !== "string") return false;
      if (receivedPlanIds.has(message.requestId)) return true;
      if (cancelledIds.has(message.requestId)) return false;
      try {
         const actions = validateActions(message.actions, world.blocks);
         const objects = validateObjectRecords(message.objects || []);
         const targetId = message.targetId || null;
         if(objects.length && actions.some(a=>!objects.some(b=>b.id===a.objectId))) throw new Error("Geometry does not match its objects.");
         if(targetId && (!((commitHistory.get(message.baseVersion) || world).objects || []).some(b=>b.id===targetId) || objects.length!==1 || objects[0].id!==targetId || actions.some(a=>a.objectId!==targetId)))
            throw new Error("Invalid selected-object edit.");
         const committed=commitCity(world,message,commitHistory);
         if(!committed)return false;
         const base=commitHistory.get(message.baseVersion);
         window[SHARED_STATE]=committed;
         acceptedWorld=lastSanitizedReference=committed;
         renderRevision++;
         pendingPlan = {
            requestId: message.requestId,
            commitId: committed.commitId,
            visualBlocks: targetId ? Object.fromEntries(Object.entries(base.blocks).filter(([,a])=>a.objectId!==targetId)) : {},
            baseVersion: message.baseVersion,
            startTime: Number.isFinite(message.startTime) ? message.startTime : Date.now(),
            message: typeof message.message === "string" ? message.message.slice(0, 240) : "AI build plan",
            actions,
            objects,
            targetId,
            duration:Math.min(2000,actions.length*BUILD_INTERVAL_MS),
            index: 0
         };
         if (message.requestId === submittedRequestId) submittedRequestId = null;
         receivedPlanIds.add(message.requestId);
         status = "BUILDING";
         detail = `${pendingPlan.message} (0/${actions.length})`;
         return true;
      } catch (error) {
         if (message.requestId === submittedRequestId) submittedRequestId = null;
         cancelledIds.add(message.requestId);
         status = "PLAN REJECTED";
         detail = error.message;

      }
   };

   const advancePlan = () => {
      if (!pendingPlan) return;
      const world = window[SHARED_STATE];
      if (world.version !== pendingPlan.baseVersion+1 || world.commitId!==pendingPlan.commitId) {
         pendingPlan = null;
         status = "BUILD INTERRUPTED";
         detail = "The shared world changed during construction.";

         return;
      }
      const elapsed = Date.now() - pendingPlan.startTime;
      const targetIndex = Math.min(
         pendingPlan.actions.length,
         elapsed < 0 ? 0 : Math.floor(elapsed / Math.max(1,pendingPlan.duration) * pendingPlan.actions.length) + 1
      );
      while (pendingPlan.index < targetIndex) {
         const action = pendingPlan.actions[pendingPlan.index++];
         applyAction(pendingPlan.visualBlocks, action);
         renderRevision++;
         avatarTarget = cg.add(scenePosition(action.position), [0, 0.22, 0.14]);
         status = "BUILDING";
         detail = `${pendingPlan.message} (${pendingPlan.index}/${pendingPlan.actions.length})`;
      }
      if (pendingPlan.index >= pendingPlan.actions.length) {
         renderRevision++;
         status = "DONE";
         detail = pendingPlan.message;

         pendingPlan = null;
      }
   };

   const clearBuilderWorld = () => {
      const baseVersion = window[SHARED_STATE].version;
      cancelBuild();
      promptDraft = "";
      sentPrompt = "";
      const message={op:"clear",baseVersion,requestId:requestId()};
      window[SHARED_STATE]=commitCity(window[SHARED_STATE],message,commitHistory);
      acceptedWorld=lastSanitizedReference=window[SHARED_STATE];
      selectedObjectId=null;editSelection=false;
      renderRevision++;
      server.send(SHARED_STATE,message);
      status = "READY";
      detail = "Reset complete. Type a new request and SEND.";

      renderWorld();
      renderPanel();
      return true;
   };

   const clearTerminal = () => {
      promptDraft = "";
      status = requestInFlight || submittedRequestId || pendingPlan ? status : "READY";
      detail = requestInFlight || submittedRequestId || pendingPlan
         ? detail
         : "SEND uses your text; DEMO runs the city example.";
      renderPanel();
   };

   const submitDraft = () => {
      const prompt = promptDraft.trim();
      if (!prompt) {
         status = "INPUT NEEDED";
         detail = "Type a building request before sending.";

         renderPanel();
         return;
      }
      if (requestInFlight || submittedRequestId || pendingPlan) {
         status = "BUSY";
         detail = "RESET to cancel the old build. Your draft is kept.";
         renderPanel();
         return;
      }
      promptDraft = "";
      renderPanel();
      void askBuilder(prompt);
   };

   const pressTerminalKey = value => {
      if(value==='WALK'){setBuilderView();return;}
      if(value==='HOME'){homeBuilderView();return;}
      if(['FWD','REV','LEFT','RIGHT','TURN L','TURN R'].includes(value)) {
         if(!view.walking) setBuilderView();
         if(value.startsWith('TURN')) view.yaw+=(value==='TURN L'?1:-1)*Math.PI/6;
         else {
            const side=value==='RIGHT'?1:value==='LEFT'?-1:0,forward=value==='FWD'?1:value==='REV'?-1:0;
            // One button press moves one meter. Joystick/arrow motion is continuous.
            for(let i=0;i<4;i++) view=moveView(view,side,forward,.1);
         }
         updateView();return;
      }
      if(value === "NEW"){selectObject(null);return;}
      if (value === "DEMO") {
         void askBuilder(CITY_PROMPT, {preset: true});
         return;
      }
      if (value === "RESET") {
         clearBuilderWorld();
         return;
      }
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
      if (window.currentName && window.currentName !== "ai-builder") return;
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
         return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      if(view.walking && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) {
         event.preventDefault();heldArrows.add(event.key);return;
      }
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
      if (window.currentName && window.currentName !== "ai-builder") return;
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

   const onKeyUp=event=>heldArrows.delete(event.key);
   const onBlur=()=>heldArrows.clear();
   window.addEventListener("keyup",onKeyUp);
   window.addEventListener("blur",onBlur);
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
      if(beams[hand].hitPoint(panelTarget.getGlobalMatrix())) return;
      if(typeof beams[hand].beamMatrix !== "function") return;
      const beam=beams[hand].beamMatrix();
      const inverseWorld=cg.mInverse(typeof worldCoords === "undefined"?cg.mIdentity():worldCoords);
      const origin=cg.mTransform(inverseWorld,beam.slice(12,15));
      const end=cg.mTransform(inverseWorld,[beam[12]-beam[8],beam[13]-beam[9],beam[14]-beam[10]]);
      selectObject(pickObject({origin,direction:cg.subtract(end,origin)}));
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
   const mouseRay = event => {
      if (!window.canvas || !clay.views || !clay.views[0]) return null;
      const rect=window.canvas.getBoundingClientRect();
      const x=2*(event.clientX-rect.left)/rect.width-1,y=1-2*(event.clientY-rect.top)/rect.height;
      const view=clay.views[0],inversePV=cg.mInverse(cg.mMultiply(view.projectionMatrix,view.viewMatrix));
      const unproject=z=>{
         const p=cg.mTransform(inversePV,[x,y,z,1]);if(Math.abs(p[3])<.00001)return null;
         return cg.mTransform(clay.inverseRootMatrix,[p[0]/p[3],p[1]/p[3],p[2]/p[3]]);
      };
      const near=unproject(-1),far=unproject(1);
      return near&&far?{origin:near,direction:cg.subtract(far,near)}:null;
   };
   const pickObject = ray => {
      if(!ray) return null;
      const inverse=cg.mInverse(cityRoot.getGlobalMatrix());
      const origin=cg.mTransform(inverse,ray.origin),end=cg.mTransform(inverse,cg.add(ray.origin,ray.direction));
      const direction=cg.subtract(end,origin);let nearest=Infinity,id=null;
      for(const part of Object.values(window[SHARED_STATE].blocks)){
         if(!part.objectId)continue;
         const distance=rayPartDistance(origin,direction,part);
         if(distance!==null && distance<nearest){nearest=distance;id=part.objectId;}
      }
      return id;
   };
   const mousePoint = event => {
      const ray=mouseRay(event);if(!ray || Math.abs(ray.direction[2])<.00001)return null;
      const amount=(terminalKeys[0].target.getGlobalMatrix()[14]-ray.origin[2])/ray.direction[2];
      return cg.add(ray.origin,cg.scale(ray.direction,amount));
   };
   const onMouseMove = event => mouseHoverKey = keyAtPoint(mousePoint(event));
   const onMouseDown = event => {
      if (event.button !== 0) return;
      const selectedKey = keyAtPoint(mousePoint(event));
      if (selectedKey) pressTerminalKey(selectedKey.value);
      else {
         const ray=mouseRay(event);
         let onPanel=false;
         if(ray && Math.abs(ray.direction[2])>.00001){
            const m=panelTarget.getGlobalMatrix();
            const t=(m[14]-ray.origin[2])/ray.direction[2];
            const p=cg.mTransform(cg.mInverse(m),cg.add(ray.origin,cg.scale(ray.direction,t)));
            onPanel=t>=0 && Math.abs(p[0])<=1 && Math.abs(p[1])<=1;
         }
         if(!onPanel) selectObject(pickObject(ray));
      }
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

   screenUI = createBuilderScreen(panelRoot);
   if(screenUI) Object.values(DISPLAY).forEach(item=>item.node.scale(0));
   window.setBuilderView=setBuilderView;
   window.homeBuilderView=homeBuilderView;
   window.getBuilderView=()=>({...view});
   window.selectBuilderObject = selectObject;
   window.askBuilder = askBuilder;
   window.clearBuilderWorld = clearBuilderWorld;

   cleanup = () => {
      if(disposed) return;
      disposed=true;
      cancelBuild();
      if(window.__aiBuilderCleanup===cleanup) delete window.__aiBuilderCleanup;
      screenUI?.destroy();
      if(headerDetails) headerDetails.open=headerWasOpen;
      if(window.selectBuilderObject===selectObject) delete window.selectBuilderObject;
      for (const name of Object.keys(inputCallbacks))
         if (inputEvents[name] === inputCallbacks[name]) inputEvents[name] = previousInput[name];
      if (window.askBuilder === askBuilder) delete window.askBuilder;
      if (window.clearBuilderWorld === clearBuilderWorld) delete window.clearBuilderWorld;
      if(window.setBuilderView===setBuilderView) {
         delete window.setBuilderView;delete window.homeBuilderView;delete window.getBuilderView;
      }
      window.removeEventListener("keyup",onKeyUp);
      window.removeEventListener("blur",onBlur);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
      window.canvas?.removeEventListener("mousemove", onMouseMove);
      window.canvas?.removeEventListener("mousedown", onMouseDown);
      window.interactMode = previousInteractMode;
   };

   window.__aiBuilderCleanup = cleanup;
   renderWorld();
   renderPanel();

   model.animate(() => {
      if(disposed) return;
      // One spatial panel and physical keyboard in both desktop and headset views.
      panelRoot.identity().move(-1.30,0,-.15).scale(.92);
      sampleRoot.identity().move(-3.72,.50,-1.50).scale(view.walking?0:1);
      variationRoot.identity().move(-4.50,.50,-1.50).scale(view.walking?0:1);
      backdrop.identity().move(0,4,-25).scale(view.walking?0:42,view.walking?0:28,.04);
      const frameNow=Date.now(),dt=lastFrameTime===null?0:Math.min(.1,(frameNow-lastFrameTime)/1000);
      lastFrameTime=frameNow;
      if(view.walking) {
         const xr=window.isXR?.();
         const left=xr?joyStickState.left:null,right=xr?joyStickState.right:null;
         const dead=v=>Number.isFinite(v)&&Math.abs(v)>.18?v:0;
         const side=dead(left?.x)+(heldArrows.has('ArrowRight')?1:0)-(heldArrows.has('ArrowLeft')?1:0);
         const forward=-dead(left?.y)+(heldArrows.has('ArrowUp')?1:0)-(heldArrows.has('ArrowDown')?1:0);
         view=moveView(view,side,forward,dt);
         const turn=dead(right?.x);
         if(Math.abs(turn)<.3) snapArmed=true;
         if(Math.abs(turn)>.65 && snapArmed){view.yaw-=Math.sign(turn)*Math.PI/6;snapArmed=false;}
      }
      updateView();
      // Socket broadcasts and asynchronous storage loads can replace the global between frames.
      if(!window[SHARED_STATE] || !Number.isInteger(window[SHARED_STATE].version) || compareWorld(window[SHARED_STATE],acceptedWorld)<0)
         window[SHARED_STATE]=acceptedWorld;
      // The first client can receive a persisted object asynchronously. Treat it
      // as untrusted input and replace it with a normalized copy before use.
      if (!window[SHARED_STATE] || typeof window[SHARED_STATE] !== "object" ||
          lastSanitizedReference !== window[SHARED_STATE]) {
         window[SHARED_STATE] = cleanWorld(window[SHARED_STATE]);
         lastSanitizedReference = window[SHARED_STATE];
         renderRevision++;
      }

      if(Date.now()-lastSyncHello>1000){
         lastSyncHello=Date.now();
         server.send(SHARED_STATE,{op:"hello",version:window[SHARED_STATE].version,commitId:window[SHARED_STATE].commitId||""});
      }
      const beforeSync = window[SHARED_STATE];
      let reconciledWorld=beforeSync;
      const reconcileSnapshot = () => {
         const incoming=window[SHARED_STATE];
         if(incoming===reconciledWorld) return;
         if(incoming===lastSanitizedReference){reconciledWorld=incoming;return;}
         if(!incoming || !Number.isInteger(incoming.version) || compareWorld(incoming,beforeSync)<0) {
            window[SHARED_STATE]=beforeSync;
         } else {
            window[SHARED_STATE]=cleanWorld(incoming);
            lastSanitizedReference=window[SHARED_STATE];
            renderRevision++;
         }
         reconciledWorld=window[SHARED_STATE];
      };
      server.sync(SHARED_STATE, messages => {
         reconcileSnapshot();
         for (const messageId in messages) {
            const message = messages[messageId];
            if (!message || typeof message !== "object") continue;
            if(message.op==="hello" && Number.isInteger(message.version) && compareWorld(window[SHARED_STATE],message)>0)
               server.send(SHARED_STATE,{op:"snapshot",world:window[SHARED_STATE]});
            if(message.op==="snapshot" && message.world && Number.isInteger(message.world.version) && compareWorld(message.world,window[SHARED_STATE])>0){
               const incoming=cleanWorld(message.world);
               if(Object.keys(incoming.blocks).length!==Object.keys(message.world.blocks||{}).length)continue;
               window[SHARED_STATE]=incoming;acceptedWorld=lastSanitizedReference=incoming;renderRevision++;
            }
            if (message.op === "applyPlan") queuePlan(message);
            if (message.op === "clear") {
               const committed=commitCity(window[SHARED_STATE],message,commitHistory);
               if(!committed)continue;
               cancelBuild();window[SHARED_STATE]=committed;acceptedWorld=lastSanitizedReference=committed;
               selectedObjectId=null;editSelection=false;
               renderRevision++;status="READY";detail="City cleared.";
            }
         }
      });

      reconcileSnapshot();
      if (!window[SHARED_STATE].blocks || typeof window[SHARED_STATE].blocks !== "object") {
         window[SHARED_STATE] = cleanWorld(window[SHARED_STATE]);
         lastSanitizedReference = window[SHARED_STATE];
         renderRevision++;
      }

      if (requestInFlight) {
         const seconds = Math.floor((Date.now() - requestStartedAt) / 1000);
         detail = `AI planning: ${seconds}s elapsed. Free model may take 3 min.`;
      }
      advancePlan();
      acceptedWorld=window[SHARED_STATE];

      if (lastRenderedVersion !== window[SHARED_STATE].version ||
          lastRenderedRevision !== renderRevision ||
          lastWorldReference !== window[SHARED_STATE] ||
          lastBlocksReference !== window[SHARED_STATE].blocks)
         renderWorld();

      avatarPosition = cg.mix(avatarPosition, avatarTarget, 0.08);
      aiAvatar.identity().scale(view.walking?0:1).move(avatarPosition)
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
