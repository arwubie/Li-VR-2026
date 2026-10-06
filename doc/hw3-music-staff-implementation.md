# hw3-collaborative-music-staff

A multi-participant VR music editor. Two users can place notes on the same staff, move or delete them, and play the synchronized score together. The scene also supports desktop mouse controls so the VR headset and computer browser can edit the same music.

## What the player does

| Part | Play and response | How it is built |
| --- | --- | --- |
| Add a note | Grab a note from the quarter, half, or eighth-note basket and drag it onto the staff. | `beginInteraction` creates a note, `continueInteraction` moves it, and `endInteraction` snaps it to the nearest valid staff cell. |
| Choose time and pitch | Move left or right to choose one of eight beats. Move up or down to choose a pitch. | The X axis is divided into eight fixed beat positions. The Y axis is divided into nine fixed pitch positions, so released notes automatically snap to the grid. |
| Move a note | Grab a note already on the staff and release it at a new position. | The note keeps its original location while it is being moved. If it is released outside the staff, it returns to that location instead of disappearing. |
| Delete notes | Drag one note into the trash, or press either red `CLEAR` button to remove the whole score. | The trash sends a `delete` operation. The clear buttons send one shared `clear` operation and also stop current playback. |
| Play the score | Press either green `PLAY` button. The notes play from beat 1 to beat 8 at 100 BPM. Press the button again to stop. | Playback uses a shared future start time. Each client follows the same beat clock, highlights the current column, and plays every note stored at that beat. |
| Collaborate | Edit from the headset and desktop browser at the same time. Changes made on either client appear on the other. | Small create, grab, move, release, delete, clear, play, and stop messages are passed through the course server and applied by every client. |

## Staff and notes

The bottom line begins at middle C. Pitch rises by one natural scale step at every line or space:

```text
C4 do, D4 re, E4 mi, F4 fa, G4 sol, A4 la, B4 si, C5 do, D5 re
```

The supplied `a4` and `b4` recordings sound one octave too low, so the scene uses the supplied `a5` and `b5` recordings for the displayed A4 and B4 positions. This keeps the audible scale rising correctly from bottom to top.

The three note baskets are visually and musically different:

| Note type | Appearance | Playback length |
| --- | --- | --- |
| Quarter note | Blue, filled head | 1 beat |
| Half note | Orange, hollow head | 2 beats |
| Eighth note | Purple, filled head with flag | 0.5 beat |

Only one note is kept in each beat/pitch cell. If another note is released onto an occupied cell, the older note is removed. This prevents hidden overlapping notes from producing duplicate sounds.

## VR and desktop controls

The VR interaction follows `beamSphere.js`: `lcb` and `rcb` provide the left and right controller beam hit points on an invisible interaction plane. The existing `onPress`, `onDrag`, and `onRelease` event pattern is used to grab and move notes or activate buttons.

Desktop control uses the same interaction functions. The mouse position is converted into a world-space ray, intersected with the staff plane, and then passed to the same create, move, release, and button logic used by the controllers. This keeps headset and computer behavior consistent.

| Input | Action |
| --- | --- |
| Left or right VR trigger and beam | Grab, drag, release, play, clear, or use the trash. |
| Left mouse button | Perform the same actions in the desktop browser. |
| `Space` | Play or stop the score in desktop mode. |
| `Backspace` / `Delete` | Clear the score in desktop mode. |

## Multi-participant synchronization

The shared-state process follows `construct.js`:

1. `server.init('scoreNotes', {})` creates the shared score state.
2. An interaction sends a small operation with `server.send`, rather than replacing the entire score.
3. Every animation frame calls `server.sync('scoreNotes', callback)`.
4. The callback validates and applies all operations to the shared note collection.
5. The visible notes are rebuilt from that synchronized collection, so every client renders the same score.

Each note has a unique ID and a `grabbedBy` owner. While one participant is dragging a note, another participant cannot take control of it. Incoming positions, note types, beats, and pitches are checked before being accepted. The status label shows whether the scene is waiting for a second client or is connected, including the number of clients.

`play` is also a shared message. It includes a start time slightly in the future so both clients can prepare before playback begins. `stop` and `clear` stop active piano sources on every client.

## Sound and feedback

The scene loads one piano recording for each pitch and uses the repository's positional-audio system. Before playing a sound, the note's shared scene position is converted into the local headset coordinate system in the same way as `construct.js`.

Quarter, half, and eighth notes use different sound durations. A short fade ends the sample cleanly; the sample is not looped, which avoids a repeated attack that could sound like an extra note. Creating and deleting notes also use short spatial sound effects. During playback, the active beat column is highlighted in cyan and its notes become larger and green.

## File organization

| File | Responsibility |
| --- | --- |
| `js/scenes/hw3-collaborativeMusic.js` | Builds the staff and controls, handles VR/mouse interaction, snapping, synchronization, rendering, and score playback. |
| `js/scenes/scenes.js` | Registers the public scene as `hw3-musicStaff`. |
| `js/util/positional-audio.js` | Plays spatial audio and supports playback rate and a requested note duration. |
| `server/main.js` | Relays messages between browser clients and safely skips sockets that are already closing. |
| `package.json` | Starts the course server through `server/main.js` on port 2026. |

`init(model)` creates the static staff, baskets, buttons, trash, labels, controller handlers, mouse handlers, and animation loop. Each frame receives shared operations, advances shared playback, and redraws the dynamic notes. `deinit()` removes desktop listeners, restores the previous input handlers, and stops active audio when the scene closes or reloads.

## Running

Start the existing server with `./startserver`, open the course page on both the computer and headset, and select `hw3-musicStaff`. Both devices must connect to the same running server. Once both clients are present, the status changes from `SYNC: WAITING FOR SECOND CLIENT` to `SYNC: CONNECTED`, and edits, clear/play commands, and playback state are shared between them.
