# hw4-ai-builder

An AI-assisted collaborative VR building scene. The player chooses a location on a block grid, types a natural-language request, and watches an embodied AI builder place, remove, or replace blocks in the shared world. The project includes an OpenCode version and a separate Codex version using GPT-5.6 Luna.

## What the player does

| Part | Play and response | How it is built |
| --- | --- | --- |
| Choose a build location | Point either controller at the platform and press the trigger. A colored cube flashes over the selected cell. | An invisible horizontal selection surface receives `ControllerBeam.hitPoint`. The hit position is rounded to integer grid coordinates and stored as the request anchor. |
| Type an instruction | Point at the large in-world keyboard and press keys, or use a physical keyboard in desktop mode. The terminal immediately shows the current text. | The keyboard contains number and QWERTY rows plus `SPACE`, `BACK`, `CLEAR`, and `SEND`. Every key updates `promptDraft` and redraws the line-font terminal. |
| Send the request | Select `SEND` or press `Enter`. The terminal changes to `AI THINKING` and adds a visible `SENT` log entry. | `askBuilder` sends the instruction, anchor, world version, and nearby blocks to the server. Only one request or build can be active at a time. |
| Watch the AI build | After validation, blocks appear one at a time and the small AI avatar moves toward the current build position. | The server expands the AI plan into primitive actions. `advancePlan` applies one scheduled part every 90 ms and updates the progress text after each action. |
| Continue editing | Ask for another object or refer to nearby blocks, such as “add a roof” or “replace the wood with brick.” | The request includes up to 256 nearest blocks, allowing the model to reason about the local structure without receiving unrestricted access to the codebase. |
| Share the world | Open the same scene on another client. Both participants see the same accepted plan and construction sequence. | The browser broadcasts one validated `applyPlan` operation through the course shared-state server. Every client validates and applies the same actions. |

The terminal is placed on the left and the build platform on the right so the controls do not cover the construction area. A large white surface is positioned far behind both parts of the scene. It isolates the workspace visually without intersecting the terminal or platform.

## AI interaction design

The AI does not generate JavaScript, meshes, or arbitrary scene code. It produces a small declarative building plan. This keeps natural-language input flexible while making the result predictable enough to execute inside a shared VR scene.

The available block materials are:

```text
grass, dirt, stone, wood, brick, glass
```

The model may request high-level operations such as `line`, `column`, `wall`, `floor`, `fillBox`, `hollowBox`, `doorway`, `stairs`, `roof`, and `replaceMaterial`. The server converts them into only three primitive actions:

```text
place, remove, replace
```

For example, a request for a stone arch can be represented by two columns and one line. The server expands those three operations into individual block placements, validates every coordinate, and sends only the safe primitive result to the scene.

## Request and validation path

1. The player selects an integer anchor and submits a prompt of at most 360 characters.
2. The browser sends the prompt, request ID, anchor, current world version, and nearby block data to the server.
3. The server gives the model an exact JSON schema and a whitelist of available materials and operations.
4. The returned JSON is parsed and expanded into no more than 128 primitive actions.
5. The server rejects invalid operations, unknown blocks, non-integer coordinates, out-of-bounds positions, and plans that would make the world exceed 512 blocks.
6. The browser independently validates the primitive actions again.
7. The plan is shared only if its `worldVersion` still matches. If another edit occurred while the model was thinking, the stale plan is rejected instead of overwriting newer work.
8. Every client applies the shared plan in the same order and increments the world version when construction finishes.

The build volume uses X `-8..7`, Y `0..11`, and Z `-8..7`. Model output is data rather than executable code, and player text is passed to the command as one argument through `spawn()` rather than interpolated into a shell command.

## OpenCode and Codex versions

| Scene | Server route | Model access | Purpose |
| --- | --- | --- | --- |
| `ai-builder` | `POST /api/ai-builder` | Authenticated OpenCode CLI; default `opencode/mimo-v2.6-flash-free` | Free-model version of the assignment. |
| `ai-builder-codex` | `POST /api/codex-builder` | Authenticated Codex CLI; default `gpt-5.6-luna` | Independent comparison using the same scene design and validation rules. |

The Codex process is ephemeral and runs in an empty temporary directory with a read-only sandbox and ignored user/project configuration. It uses the existing local ChatGPT/Codex login, so no API key is stored in the browser. The original OpenCode scene and the Codex copy use different shared-state names and endpoints, preventing their worlds or requests from being mixed.

Both backends allow one automatic correction attempt if the model returns malformed or invalid plan data. Each process has a 75-second timeout and a 1 MiB output limit.

## Terminal, controls, and feedback

The terminal uses the repository's line-font mesh technique rather than `clay.text()`, making its text readable at VR scale. It shows the current prompt, status, anchor, world version, block count, detailed response, and four recent log entries.

| Input | Action |
| --- | --- |
| VR trigger on a platform cell | Select the build anchor. |
| VR trigger on a keyboard key | Type or activate `SPACE`, `BACK`, `CLEAR`, or `SEND`. |
| Mouse click on the in-world keyboard | Use the same keyboard in desktop testing. |
| Physical letter, number, or symbol key | Append text to the request. |
| Paste | Add clipboard text, limited to the maximum prompt length. |
| `Enter` | Send the current request. |
| `Backspace` | Remove the last character. |
| `Escape` | Clear the terminal input and log. |

Visible states include `READY`, `TYPING`, `ANCHOR SELECTED`, `AI THINKING`, `PLAN READY`, `BUILDING`, `DONE`, `BUSY`, `ERROR`, `STALE PLAN`, and `PLAN REJECTED`. This ensures that the player can see when a message was sent, whether the AI is still responding, how many actions were accepted, and why a request failed.

## Multi-participant synchronization

The shared-world process follows the course server pattern:

1. `server.init` creates a world containing a version number, block map, and last AI message.
2. The client that requested a plan sends one `applyPlan` message with its base version and a slightly delayed start time.
3. Every client receives that operation through `server.sync`.
4. Each client validates the action list before queuing it.
5. The shared block map changes as the synchronized build advances.

Blocks are keyed by their integer `x,y,z` position, so placing a new block in an occupied cell replaces that cell instead of creating overlapping geometry. A `clear` message removes the shared structure only when its base version is current.

## File organization

| File | Responsibility |
| --- | --- |
| `js/scenes/ai-builder.js` | Builds the OpenCode scene, platform, distant backdrop, terminal, VR keyboard, AI avatar, input handling, shared state, validation, and animated construction. |
| `js/scenes/ai-builder-codex.js` | Independent Codex/GPT-5.6 Luna copy with its own endpoint, global helpers, text meshes, and shared-state name. |
| `js/scenes/scenes.js` | Registers `ai-builder` and `ai-builder-codex` as public scenes. |
| `server/ai-builder.js` | Defines the building language, validates requests and model plans, expands high-level operations, and invokes OpenCode. |
| `server/codex-builder.js` | Invokes the locally authenticated Codex CLI in an isolated directory and reuses the same validation and expansion rules. |
| `server/main.js` | Exposes both AI Builder routes and prevents concurrent requests to the same backend. |
| `server/opencode-ai-builder/opencode.jsonc` | Disables OpenCode tools so the model can only return response text. |
| `server/ai-builder.test.js` | Tests parsing, operation expansion, bounds, block whitelisting, and the action limit. |
| `server/codex-builder.test.js` | Tests the Luna model selection and Codex JSONL event parsing. |

`init(model)` constructs the environment and installs controller, mouse, keyboard, and shared-state handlers. Each animation frame synchronizes messages, advances a pending build, redraws changed blocks, animates the anchor and AI avatar, updates controller beams, and refreshes the terminal. `deinit()` restores the previous input handlers and removes the desktop event listeners when the scene closes.

## Running

Use Node.js `18.20.8` and restart the course server after server-side changes:

```sh
./startserver
```

For the OpenCode version, authenticate OpenCode and select `ai-builder`:

```sh
opencode auth login opencode
```

For the Codex version, authenticate once, confirm the login, and select `ai-builder-codex`:

```sh
codex login
codex login status
```

No API key needs to be entered into the VR scene. Final controller reach, text readability, keyboard targeting, and multi-headset synchronization should still be checked in the headset because desktop testing cannot reproduce the exact viewing distance or controller tracking.
