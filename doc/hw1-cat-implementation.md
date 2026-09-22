# hw1-cat

An interactive VR cat playroom. The player uses either controller to play with a feather wand, toss a yarn ball, aim a laser at the rug, or pet the cat.

## What the player does

| Part         | Play and response                                                                                                                                                   | How it is built                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feather wand | Aim at or touch the grip, press, and move it. The feather swings on a fixed-length string. The cat follows, pounces at a high feather, and may tug it.              | `onPress/onDrag/onRelease` hold the wand. `updateFeather` moves its root, computes one pendulum angle, and redraws the string with `placeLine`. The rigid rod and its tip are children of the wand root; the white oval feather and thin shaft are a separate moving node. |
| Yarn ball    | Grab with one hand and release to throw. It bounces and rolls; after a short pause the cat runs after it, pounces, and bats it back. The ball can be grabbed again. | A sphere, three crossed`torus` loops, and a short tube form one `ball.root`. `updateBall` handles flight and rolling; `updateCat` gives the cat a speed limit and reaction delay; `updateToyContact` bats the ball during the pounce.                                  |
| Laser        | Point a free controller at empty rug and hold the trigger. A red dot appears where its beam lands; the cat chases and swats at it. Release to hide the dot.         | An invisible horizontal`square` is the target plane. `ControllerBeam.hitPoint` supplies the point; `updateLaser` moves the dot there. No separate pen model is needed.                                                                                                     |
| Cat head     | Bring a free hand near the head. The eyes close into a squint and the controller gives soft repeated pulses.                                                        | The head is a child joint of the cat, with two eye shapes.`updatePetting` compares the hand with `head.getGlobalPos()` and rescales the eyes.                                                                                                                                |
| Cat back     | Touch the back with a free hand. The cat stretches when its cooldown allows: both front paws step forward, hind legs extend back, and the body rises.               | `updatePetting` detects a new back contact. `updateCat` animates the body, head, four leg joints, tail, and tail-tip hierarchy over time.                                                                                                                                    |

The cat hierarchy is `cat -> body/chest, head -> face, front legs, hind legs, tail -> tail tip`. The wand's tip is a child of its root so the string stays attached when the wand moves. The ball's yarn loops are children of its root so they roll together. The room, cat, and toys inherit a matte material from `scene = model.add().dull()`.

## Functions and feedback

`init(model)` builds the nodes and registers the input handlers. `onPress` uses hand distance or `ControllerBeam.hitRect` to select a toy first, then uses an empty rug hit for the laser. `onDrag` updates a held toy's position; `onRelease` lets the wand return, launches the ball, or turns off the laser. Each frame, `updateFrame` calls `updateFeather`, `updateBall`, `updateLaser`, `updateCat`, `updateToyContact`, then `updatePetting` in that order. `deinit()` restores the prior input handlers when the scene closes.

Controller vibration comes from `vibrate(hand, strength, duration)`, not from moving the cat mesh:

| Event                | Controller feedback                                |
| -------------------- | -------------------------------------------------- |
| Grab / release a toy | Short pulse:`.35` for 55 ms / `.18` for 40 ms. |
| Cat tugs the feather | Stronger`.52` pulse, at most every 150 ms.       |
| Pet the head         | Gentle`.17` pulse, repeated while touching.      |
| Pet the back         | Lighter`.11` pulse, at most every 180 ms.        |

The laser uses its visible dot for feedback and does not vibrate continuously.

The scene uses the course examples for scene setup (`simple.js`), primitive shapes (`shapes.js`), parent-child joints (`jointed.js`), press/drag/release (`interact.js`), and controller beams/haptics (`beam.js`). The pendulum, throw, cat behavior, and cooldowns are this project's own logic.
