# hw2-airbeat

A playable VR rhythm game. The player stands in one place and uses the left and right controllers to strike notes on a four-lane neon highway. The 30-second chart includes tap, upward-flick, straight hold, and curved hold notes, with score, combo, health, timing judgments, clear/fail states, controller vibration, and in-world instructions.

## What the player does

| Part | Play and response | How it is built |
| --- | --- | --- |
| Start | Read the controls and press either controller trigger. A `3-2-1` countdown appears, then the song and chart start together. | `beginCountdown` resets every note and statistic, prepares Web Audio inside the user interaction, and changes the state from `MENU` to `COUNTDOWN`. `startPlaying` starts both the authoritative song clock and gameplay. |
| Tap note | Swing the correct hand through a glowing tile when it reaches the near hit line. A stationary hand cannot automatically hit every note. | `attemptSpatialHits` checks the correct hand, timing window, distance, collider entry, and hand speed. Lanes 0–1 use the left hand and lanes 2–3 use the right hand. |
| Up-flick note | Touch the arrow note, then move the same hand upward. The first contact displays `FLICK UP!`; sufficient upward motion completes the note. | `contactNote` arms the note and records controller Y and time. `updateFlicks` accepts either 6 cm of upward displacement or 0.72 m/s upward velocity within 220 ms. |
| Hold note | Hit the head and keep the correct hand near the glowing rail until it ends. One hold bends gently sideways to make the interaction more three-dimensional. | `updateHolds` compares the hand with `holdTarget`. A hand may leave the rail for 180 ms before the hold breaks, preventing small tracking glitches from causing an immediate miss. |
| Finish | Survive until 30 seconds to see `SONG CLEAR!`; lose all HP to see `FAILED`. Press either trigger or `R` to restart. | `finishGame` stops the audio and notes, calculates accuracy, and selects `CLEAR` or `FAILED`. The result panel shows final score, max combo, accuracy, and judgment counts. |

The highway is a real flat rectangle in the XZ plane rather than a trapezoidal 2D graphic. Its lane lines remain parallel in world space. The headset camera creates the perspective, so the far spawn area looks narrow and notes naturally appear larger as they travel toward the player. Notes keep a constant world-space size and move only along Z.

The compact hit line is designed for standing play without walking. It is 0.80 m wide, 0.40 m in front of the calibrated origin, and has lane centers at `[-0.30, -0.10, 0.10, 0.30]` meters. The collision volume is slightly larger than each visible note so the interaction remains forgiving.

## Song timing and chart

`AirBeatSynth` provides one authoritative Web Audio clock. Every frame, `songTime` comes from `AudioContext.currentTime`; note movement is never driven by a chain of `setTimeout` calls. `getNotePosition` derives position directly from the difference between the note time and song time:

```text
progress = 1 - (note.time - songTime) / spawnLeadTime
z = mix(spawnZ, hitZ, progress)
```

This means a slow frame may skip a visual position, but the next frame places the note at the correct song-relative position instead of accumulating drift.

The manual chart in `js/scenes/airbeat/chart.js` uses a 113 BPM beat grid with a one-second lead-in. It contains 55 notes: 44 taps, 7 upward flicks, and 4 holds. The last section uses eighth-note spacing to increase difficulty. One hold has `curve: "sweep"`; its target follows a simple sideways sine curve.

The configured audio is the user-supplied `media/sound/airbeat/nevergonnagiveyouup-30s.mp3`, a frame-aligned excerpt beginning around 42.501 seconds in the original recording. The game plays 30 seconds. If the local audio cannot be loaded, `AirBeatSynth` generates a 113 BPM practice rhythm so the scene remains demonstrable.

## Judgment, scoring, and state

| Result | Condition | Score and state change |
| --- | --- | --- |
| `PERFECT` | Absolute timing error is at most 80 ms. | 1000 points and combo +1. |
| `GOOD` | Absolute timing error is over 80 ms and at most 160 ms. | 500 points and combo +1. |
| `MISS` | The note passes 160 ms late, a flick is not completed, or a hold is broken. | No points, combo resets to 0, and HP loses 10. |
| Hold completion | The hand remains on the rail until its end. | The head judgment is recorded and a 500-point hold bonus is added. |

The player starts with 100 HP, so one miss does not end the game; HP must reach zero. `registerResult` is the only scoring entry point and ignores notes already marked `hit`, `completed`, or `missed`, preventing duplicate scoring. Perfect and Good increase `maxCombo`; Miss resets only the current combo.

Accuracy is calculated without division-by-zero errors:

```text
accuracy = 100 * (perfect + 0.5 * good) / total judgments
```

The explicit states are `MENU`, `COUNTDOWN`, `PLAYING`, `CLEAR`, and `FAILED`. Note interaction runs only during `PLAYING`. `resetRun` stops old audio, resets every note state, clears effects, and restores score, combo, HP, counts, and timers before another countdown.

## Controller motion and feedback

`updateHands` stores each controller's current and previous position and estimates velocity from frame delta time. Invalid tracking is ignored, velocity is smoothed, and both delta time and maximum speed are clamped so returning from a slow or background frame cannot create an artificial hit.

| Event | Controller feedback |
| --- | --- |
| Perfect | Sharp `.58` pulse for 70 ms on the hand that hit the note. |
| Good | Clear `.42` pulse for 55 ms. |
| Hold completion | Adds `.05` strength and lasts 85 ms, making completion distinct from hold contact. |
| Flick contact | Light `.14` pulse for 25 ms before the upward gesture; completing the flick then produces the Perfect/Good pulse. |
| Hold start | Light `.16` pulse for 35 ms; completing the hold produces the stronger success pulse. |
| Miss / broken gesture | Soft, longer `.18` warning for 90 ms so it does not feel like a successful hit. |
| Song clear | `.45` pulse for 130 ms on both controllers. |

The implementation follows HW1's `pulse()` wrapper around `vibrate(hand, strength, duration)`. Every completed non-Miss judgment goes through `pulseSuccessfulHit`, including taps, completed upward flicks, and completed holds. This guarantees that a successful note always has tactile feedback while the weaker Miss pattern remains distinguishable.

During play, score and HP/time use small left and right panels. `COMBO` is centered in the player's forward view, and the latest `PERFECT`, `GOOD`, `MISS`, `HOLD`, or `FLICK UP!` message appears directly below it. The custom text mesh reuses the repository's `linefont` vector paths with AirBeat-specific spacing and stroke widths, so other scenes are not changed.

## Controls

| Input | Action |
| --- | --- |
| Either VR trigger | Start from the menu or restart after clear/fail. |
| Left controller movement | Play lanes 0 and 1. |
| Right controller movement | Play lanes 2 and 3. |
| `Space` | Start from the menu in desktop debug mode. |
| `A` / `L` | Simulate left / right tap or hold-head contact. |
| `Q` / `P` | Simulate left / right upward flick. |
| `R` | Reset and begin a new countdown. |

The keyboard controls are only for development. Normal VR notes are activated by controller motion, not by holding a trigger.

## File organization

| File | Responsibility |
| --- | --- |
| `airbeat.html` | Opens only the AirBeat scene through the existing course client. |
| `js/scenes/scenes.js` | Registers `airbeat` as a public scene. |
| `js/scenes/airbeat.js` | Builds the highway, notes, text, effects, game states, hand tracking, judgments, UI, and cleanup. |
| `js/scenes/airbeat/config.js` | Stores timing windows, gesture thresholds, collision sizes, score values, audio path, colors, and calibrated playfield dimensions. |
| `js/scenes/airbeat/chart.js` | Stores the editable 30-second chart as note data. |
| `js/scenes/airbeat/logic.js` | Provides frame-rate-independent note positioning and weighted accuracy. |
| `js/scenes/airbeat/synth.js` | Loads/plays local audio, exposes the song clock, stops old sources, and supplies the synthesized fallback. |
| `tests/airbeat.test.mjs` | Checks perspective invariants, deterministic positioning, reachable playfield dimensions, chart validity, note-type coverage, and accuracy. |

`init(model)` constructs the scene and installs input handlers. Each animation frame calls hand tracking first, then song-relative note positioning, spatial hits, flicks, holds, late misses, effects, and UI. `deinit()` removes the keyboard listener, restores the previous trigger handler, and disposes the audio context when the scene closes.

## Running and tuning

Start the existing course server normally and open `/airbeat.html`. Enter VR using the repository's normal WebXR button, recalibrate the standing center, keep both hands in a relaxed position, and press either trigger.

The most useful tuning values are all in `js/scenes/airbeat/config.js`:

- `laneX`, `trackHalfWidth`, `hitZ`, and `noteY` control physical reach and placement.
- `hitRadius` and `holdRadius` control spatial forgiveness.
- `perfectWindow` and `goodWindow` control timing difficulty.
- `flickMinVelocity`, `flickMinDistance`, and `flickGestureWindow` control flick difficulty.
- `holdGraceTime` controls tracking tolerance during holds.
- `audioPath` replaces the local song clip.

The chart is manually authored rather than automatically detected from audio. Mid-song pause is not currently implemented. The five automated tests pass, but final controller comfort, height, haptics, and audio/chart alignment should still be checked in the Quest headset because desktop mode cannot reproduce the player's real calibrated reach.
