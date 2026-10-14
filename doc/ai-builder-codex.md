# Codex Builder (GPT-5.6 Luna)

`ai-builder-codex` is an independent copy of the `ai-builder` VR scene. The
original scene still uses OpenCode; this copy sends the same bounded building
language to the locally authenticated Codex CLI and selects `gpt-5.6-luna`.

## Authentication

Run `codex login` once on the machine that runs the server, then verify with
`codex login status`. The browser never receives or stores an API key. Each VR
request starts an ephemeral Codex execution that uses the existing ChatGPT
login.

## Run

Start this repository's server normally, select `ai-builder-codex` from the
scene menu, type a building instruction on the VR keyboard, and press `SEND`.
The terminal reports when the request is sent and shows the response or error.

The default model is exactly `gpt-5.6-luna`. It can be overridden for testing
with `CODEX_BUILDER_MODEL`, but no override is required.

## Safety boundary

Codex runs in an empty temporary directory with a read-only sandbox and ignored
user/project configuration. Its output is data, never executable JavaScript.
The server validates the JSON plan, accepts only the predefined block-building
operations, bounds all coordinates, and limits each response to 128 primitive
actions before the browser receives it.
