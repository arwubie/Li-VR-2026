# AI Builder

AI Builder is a collaborative VR block-building demo. A player selects an
anchor on the build grid and asks an OpenCode-hosted model to build or edit a
small structure. The model produces data, never executable scene code.

## Run

Use Node.js `18.20.8`, which is the runtime version for this project. AI
Builder does not require any upgrades to the project's existing dependencies.

OpenCode v2 must be installed and authenticated for the same macOS user that
runs the course server:

```sh
opencode auth login opencode
opencode models
```

Restart the course server after pulling or editing the server files:

```sh
./startserver
```

Select the `ai-builder` scene. Its visible in-world keyboard includes numbers,
QWERTY letters, `SPACE`, `BACK`, `CLEAR`, and `SEND`. Point a VR controller at
a key and press the trigger; the same keys can be clicked with a mouse during
desktop testing. A physical keyboard also works: `Enter` sends, `Backspace`
edits, and `Escape` clears. Request, planning, build progress, completion, and
error messages remain visible in the large terminal log.

The browser console helpers remain available for debugging:

```js
setBuilderAnchor(0, 0);
await askBuilder("Build a tiny stone arch here");
await askBuilder("Add a brick wall behind it");
clearBuilderWorld();
```

In VR, point either controller beam at a cell on the build pad and press its
trigger to change the anchor.

## API contract

The scene sends `POST /api/ai-builder` with a request ID, instruction, integer
anchor, shared-world version, and up to 256 nearby blocks. The server runs a
fixed OpenCode model with `spawn()` and an argument array; player text is never
interpolated into a shell command.

The model can only return the documented high-level operations. The server
expands them into at most 128 primitive actions and checks block names, integer
coordinates, build boundaries, and response shape. The browser validates all
primitive actions again before broadcasting them. A stale `worldVersion` is
rejected rather than overwriting another participant's work.

The default model is `opencode/mimo-v2.6-flash-free`. Override it when starting
the server if necessary:

```sh
AI_BUILDER_MODEL=opencode/nemotron-3.5-lightning-free npm start
```

## Current demo limits

- World bounds: X -8..7, Y 0..11, Z -8..7.
- Six color-coded blocks: grass, dirt, stone, wood, brick, and glass.
- Maximum 128 expanded actions per request and 512 blocks in the world.
- One model request at a time per course server.
- One automatic correction request when model output is invalid.
- Model process timeout: 75 seconds; stdout limit: 1 MiB.
- A dedicated OpenCode runtime policy denies every file, shell, web, skill, and
  subagent tool. The live model can only produce the response text.

Textures, voice input, inventory, mining, infinite terrain, and complex avatar
pathfinding are intentionally outside this first demo.
