# AI City Builder

Minecraft-inspired geometry with subtle cyan/purple lights. Five **individual** examples are shown in front: tower, house, tree, lamp, bench. The AI sees these same recipes and selects individual object positions, sizes, materials and roofs to compose a larger city in one call. The default view is an overview; WALK enters the city at human scale.

## Run

Use the project's Node 18.20.8 runtime and restart the server:

```sh
./startserver
```

Choose `ai-builder`. The input starts empty. **DEMO** explicitly runs the default city brief. **SEND** / Enter submits only your typed request; for example, “Build exactly one tree” can return one tree. **CLEAR** only clears the input. **RESET** aborts the in-flight request, stops construction, clears the world and input, and invalidates late responses. The server also stops its OpenCode process when the client disconnects. The five example objects remain visible on the far-left shelf in both desktop and VR. The terminal stays near its original foreground distance and readable size. The city is enlarged on the right, with horizontal clearance from the text panel; the examples use a narrow foreground shelf at the far left. The default view is an overview; WALK enters the city at human scale. Mouse, physical keyboard and VR controller keyboard are supported.

The default model is `opencode/deepseek-v4.1-flash-free`. Authenticate OpenCode as the user running the server. `opencode models` lists the installed CLI's models. `AI_BUILDER_MODEL` can override the default.

## Spatial panel, physical keyboard and local edits

Desktop and VR now use the same in-world interface. The display is a canvas texture on a 3D screen with a frame, with a controller-operated 3D keyboard immediately below it. It is not a fixed HTML sidebar or a DOM overlay. The course menu is collapsed while this scene is open and restored when it closes.

The screen displays only the current input, NEW/EDIT mode and selected object, generation time or construction progress, character count and necessary errors. Explanations, model responses, object statistics and history are not displayed. The canvas uses normal system fonts, including Chinese glyphs for pasted input.

- Point either controller at a physical key and press the trigger. Mouse clicks and a desktop keyboard also work.
- **SEND** submits the typed request. **DEMO** starts the city preset. **CLEAR/BACK/SPACE** edit the input.
- Click or point at an object and trigger to select it. Its outline appears and the screen switches to EDIT mode. The next SEND modifies only that object.
- **NEW** clears the selection. **RESET** cancels generation/construction and clears the input and world.
- Clicking the display itself does not select geometry behind it.

Objects generated before individual recipe records were added need one reset/regeneration to support picking. Local editing, stable object IDs and cancellation behavior remain unchanged.

Live local-edit check: changing house `o7` windows to purple succeeded in 19 seconds while preserving its other parameters. Tests cover the shared spatial screen, always-present keyboard, absence of model replies and history, local edits and reset races. Browser screenshots and headset visual/interaction verification remain pending because the browser-control connection is unavailable.

## What the AI controls

- Custom requests: 1–100 individual objects, using only the requested kinds.
- DEMO: a full city using all five kinds.
- Object positions, dimensions, color palette and building roof variants.
- Composition: skyline, density, distribution and repetitions.

The runtime expands each recipe into cubes. Roads and the base are supplied by the scene. This is parameterized imitation and composition; the AI does not synthesize arbitrary new meshes or executable code. It also does not yet learn from a user's controller gestures. A stepped roof approximates the house's triangular profile using cubes.

## Request and limits

The scene sends `mode: "city"` to `/api/ai-builder`; `preset: true` is set only by DEMO. The server runs the built-in OpenCode build agent in a standalone session in a fresh empty temporary directory. It prefers the curl-installed `~/.opencode/bin/opencode`, unless `OPENCODE_BIN` is set. Every tool requires approval via `server/opencode-ai-builder/opencode.jsonc`; the headless process has no approval input and never uses `--auto`. A tool/permission event aborts the city request. One request means one model attempt: invalid plans are reported rather than silently retried or replaced with a preset city.

The shared vocabulary in `js/util/ai-city.mjs` defines both visible examples and model instructions. Object coordinates are bounded to -36..36, tower heights to 32 units, and expanded geometry to 3,200 cubes. The client independently validates geometry before broadcasting it. Stable part IDs preserve components that share a center. The generated world uses its own shared state, separate from the existing Codex block scene. New-scene requests replace the world. Local-edit requests replace only the selected object.

The server validates data and geometry bounds. Spatial quality (overlaps, object distribution and aesthetic choices) remains an experiment to inspect in the resulting scene. City requests allow up to 180 seconds (the legacy block mode keeps 75 seconds). The terminal shows elapsed planning time. A complete validated JSON response is returned immediately, without waiting for the OpenCode process to exit. Long design descriptions are truncated rather than rejecting valid geometry. The model returns compact eight-value object arrays (plus an optional ninth window-accent color) to reduce output length; the server also accepts the earlier named-field objects. The model may also return incomplete or invalid JSON. Initial requests with all tool declarations disabled returned HTTP 403 (`FreeTierError`). Keeping standard tool declarations while requiring approval resolved the tested request. Live verification on 2026-10-17 succeeded in one call: **45 individual objects, 788 cube parts**, using `opencode/deepseek-v4.1-flash-free`. Errors are shown in the terminal. No automatic fallback city is presented as AI output.

## Request lifecycle and latency

AI Builder opts out of the framework's focus-triggered scene reload. Returning from a terminal/window or entering XR therefore keeps the active request and keyboard state. Manual reload disposes the old scene, and a cross-module cleanup registry cancels requests and event handlers even across dynamic imports.

A validated result is queued locally before it is broadcast, so local construction does not wait for a shared-state echo or client-list initialization. Duplicate, cancelled, failed and previously accepted request IDs cannot start a second build. Older snapshots and equal-version snapshots arriving during construction cannot erase the active world. The submitted prompt remains visible while planning/building; active request status takes priority over typing/busy notices.

Construction animation is capped at roughly two seconds. Screen progress redraws are throttled and hidden line-font meshes are no longer regenerated alongside the texture. Provider errors and complete invalid plans fail immediately instead of waiting for the model timeout. Free-model inference itself can still take tens of seconds; these fixes remove client-side resets, queue delays and delayed replay, not provider compute time.

Regression checks simulate missing synchronization echoes, duplicate messages, old storage snapshots, module reloads with pending requests, and failed requests followed by late plans. The framework change requires a full page refresh; the backend validation change requires a server restart.

## Live verification

The successful model description was:

> A cube-built Minecraft city: 20 towers and houses with 25 street objects. Tall stone and purple spires rise at the back, low cream and wood gabled houses sit in front, with cyan accent trees, lamps and benches lining the blocks.

This verifies real model output, JSON parsing and geometry validation. The latest spatial layout has not been visually rechecked because the browser-control connection was unavailable. Headset validation remains pending.

The compact-output request also passed live verification: **52 seconds, 45 individual objects, 655 cube parts**. This is one measured free-model request, not a latency guarantee. The foreground layout was restored after feedback that the previous arrangement was too distant: terminal scale 0.92 near its original depth; city scale restored to 0.085, shifted right; examples on a narrow foreground shelf at far left. No camera transform was changed.

Custom-request live check: “Build exactly one tree at the center. Nothing else.” returned **one object / three cube parts in 6 seconds**. Regression checks cover reset during an in-flight request, late results, preserving a draft while busy, the explicit DEMO button, and model-process cancellation.

## Checks and assignment observations

```sh
node --test server/ai-city.test.js server/ai-builder.test.js server/ai-builder-runner.test.js server/codex-builder.test.js tests/ai-builder-input.test.mjs tests/ai-builder-screen.test.mjs tests/ai-builder-view.test.mjs
```

For the assignment, compare: literal imitation, changed proportions and roofs, skyline composition, objects placed inside one another, and invalid outputs. Record actual results separately from the implementation. Headset readability, controller targeting and multi-headset synchronization still require headset testing.

## Floor/size demonstrations and walking

Five additional examples sit beside the original shelf: 3-, 5-, and 8-floor buildings with purple windows, plus normal and double-size trees. These same parameter demonstrations go into the AI prompt. One floor is three height units. Selected-building edits such as `5 floors`, `5flour`, or `五层` enforce height 15 before expansion, giving exactly five windows in each column. House height now permits up to ten floors. Selected-tree `bigger` / `大一点` increases height and both crown dimensions by at least 50%; `twice as big` requests double size. Tree trunks scale with crown width/depth. Out-of-range requests report an error rather than silently clamping to nearly the same size.

The additional spatial keys remain controller targets in VR:

- **WALK**: enter at city position `(8, 1.6, 36)` on a road, facing toward negative z. Geometry uses one meter per city unit.
- **FWD / REV / LEFT / RIGHT**: move one meter per press.
- **TURN L / TURN R**: turn 30 degrees per press.
- **HOME**: return to the original overview without modifying city contents.
- In VR, the **left thumbstick** moves continuously at up to 2.5 m/s relative to the navigation heading; the **right thumbstick** turns in 30-degree steps. Release the right stick to rearm the next step. Turning your head still uses normal XR tracking.
- On desktop, **arrow keys** move continuously while WALK is active. Letter keys remain available for prompt input.

The screen and physical keyboard stay accessible beside the view. The example shelves and overview backdrop hide while walking. Walking position appears on the screen. Navigation belongs to the local viewer, so it does not move other connected users. Geometry selection uses the transformed city matrix in either mode.

For a precise starting point, use the browser console: `setBuilderView(8, 1.6, 24)`; the optional fourth argument is yaw in radians. `getBuilderView()` reads it and `homeBuilderView()` restores the overview. Coordinates are bounded to the city; height can be adjusted from 0.5 to 35 meters. This is free navigation with no building collision or terrain physics yet. Actual headset comfort, targeting and rendering still require testing in the headset.

Configuration reference: [OpenCode custom config paths](https://opencode.ai/docs/config/#custom-path). The backend applies the dedicated policy with `OPENCODE_CONFIG` and keeps the normal provider profile.


### WALK interface occlusion fix

In WALK, the terminal (screen, frame and keycaps) and controller beams opt into a final foreground pass. The renderer draws the city and implicit geometry first, then clears depth for both eyes and draws the spatial controls with normal depth testing. This preserves depth between keycaps, labels and screen without allowing a nearby building to hide them. The existing world matrices and hit targets stay unchanged. HOME restores ordinary scene depth behavior. Other scenes use the ordinary pass by default. GL depth/scissor state is restored after the pass, including on errors.

Validation: 27 automated checks pass, including two-eye simulated depth occlusion, GL-state restoration, WALK/HOME layer switching and controller key presses during WALK. Headset visual confirmation remains pending. This renderer change requires a full page refresh, rather than only reselecting the scene.
