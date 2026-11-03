# hw7 --living-music-box

For this assignment, I built a miniature music box called `hw7-living-music-box`. You can pick up the box from a table, switch into the perspective of its small ballerina, and move around the same stage from inside. I used the course's Clay scene graph and Resonance Audio utilities, adapted the grabbing and haptic feedback from earlier assignments, and added four musical objects and six small decorations that you can move.

## What I built

I wanted the same object to feel different at two scales. From the normal human viewpoint, the music box is a small object on a table, with a girl standing among its ornaments. From the girl's viewpoint, the stage becomes a space you can walk through, and the musical objects surround you.

I made the box with a round pink base, an ivory stage, gold trim, a pearl rim and a small winding key. The ballerina has a head, a simple body and dress, and two controller hands. I used procedural shapes rather than imported character models or a skeletal rig.

Four bells sit around the stage: Melody at the front, Chimes on the right, Harmony behind the avatar and Bells on the left. Each one has its own musical layer and its own positional sound source. I also added a flower pot, crystal, gift, mushroom, crown and star. These decorations give the stage more detail and provide more objects to pick up and arrange.

## How you can use it

In Human Mode, you see the table, music box and miniature ballerina from your normal viewpoint. You can hold a trigger near the box's base to pick up the entire box and move or rotate it. Its avatar, bells, decorations and sound sources move with it. You can also grab individual bells and decorations with either hand.

Pressing A or X switches into Miniature Mode. You can look around naturally, move physically, or use the left joystick to walk in the direction you are facing. The movement stays within the circular stage. Your controller hands follow your tracked movements at the miniature scale, and the avatar's own head is hidden so it does not block the first-person view.

To play a bell, touch its cap with the front of a controller without holding the trigger. It produces a separate bell strike, a brief gold flash and ring, and a short vibration. Move away and touch it again to play another note. Holding the controller against it does not continuously repeat the sound.

Grabbing and playing are separate actions. The trigger holds an object, while B or Y near a bell turns its looping musical layer on or off. A muted bell can still be struck. When you release an object, it automatically stands upright on the stage instead of keeping the controller's tilt or hanging in the air.

You can return to Human Mode at any time with A or X. The box keeps its position, the miniature avatar keeps its location, and the objects and musical layers keep their current state.

## What each button and input does

| Control or input                           | What you can do with it                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| A on the right controller or X on the left | Switch between Human Mode and Miniature Mode.                              |
| Trigger near the box's base                | Grab and move or rotate the whole box in Human Mode; release to let go.    |
| Trigger near a bell or decoration          | Grab that object in either mode; release to place it upright on the stage. |
| Touch a bell cap with the controller tip   | Play a separate bell strike without pressing a button.                     |
| B or Y near a bell                         | Turn that bell's looping musical layer on or off.                          |
| Left joystick                              | Walk relative to the headset's heading in Miniature Mode.                  |
| Physical headset and controller movement   | Look, lean, move and reach at the active scale.                            |
| M on desktop                               | Switch perspectives.                                                       |
| WASD on desktop                            | Move around the miniature stage.                                           |
| 1–4 on desktop                            | Play the four bell strikes in Miniature Mode.                              |
| Arrow keys and Q/E on desktop              | Move the whole box horizontally and rotate it in Human Mode.               |
| Space on desktop                           | Enable or resume audio.                                                    |

The trigger and perspective buttons also attempt to resume audio if the browser has suspended it. The desktop controls provide a way to preview the scene, but grabbing the individual objects uses tracked controllers.

## How I handled the two scales

I kept the scene dimensions in metres and used a scale of 1/12 for the avatar. For example, a measurement of 1.8288 m becomes 0.1524 m. The tracked headset position represents eye height, so the stylized head extends a little above that point. The avatar stands on the music-box stage, which is itself above the tabletop.

The table is 60 inches wide and 24 inches deep, matching the classroom dimensions in the assignment. Its surface is 0.76 m above the floor, and the stage is another 0.065 m above it. The stage has a radius of 0.225 m. After the first version felt too far away, I moved the table and box together 30 cm closer in Human Mode while keeping their physical dimensions the same.

For Miniature Mode, I enlarge the scene's presentation by twelve around an anchor beneath the user. I combine this with the inverse of the saved box transform and the avatar's position on the stage. This puts the user inside the same box without changing the XR camera or stereo projections.

I use the inverse of the rendered box transform to convert the tracked headset and controller poses back into miniature coordinates. A metre of physical movement therefore becomes 1/12 m inside the stored scene. The headset, hands, interactions and sound sources all use this same coordinate relationship.

The joystick moves at 0.65 perceived metres per second. I constrain both joystick movement and physical head movement to a slightly smaller radius than the stage, leaving space around the rim. When the user leaves Miniature Mode, I save the physical movement offset into the avatar's position so entering again does not reset it to the center.

## How I made the objects interactive

I followed the press, drag and release approach used in the earlier homework scenes. When a controller grabs an object, I store the offset between the controller and that object. As the controller moves, the object follows with that offset, so it does not jump to the controller's center when picked up.

Individual objects take priority over the enclosing box when both are within reach. Each object can belong to only one hand at a time, while the two hands can hold different objects. Labels follow their objects, and each bell's sound source follows its position.

The first version kept the full controller rotation and height after release. This made the bells remain tilted or float above the stage. I changed release behavior to keep only the object's heading, reset its tilt and place its bottom on the floor. I also keep released positions inside the stage boundary. This is a simple placement aid rather than a gravity simulation.

The early “tap” interaction was a short trigger press that only toggled a musical layer. It did not detect a controller touching the bell, so the action did not match the label. I replaced it with controller-tip collision detection and a separate strike sound. I check the tip's path between frames so a quick motion can still hit a bell even when neither sampled endpoint is inside it.

I track whether each hand is already touching a bell, which prevents repeated sounds while it rests there. Grabbing suppresses automatic strikes for that hand. I reused the `window.vibrate` interface from `hw1-cat` for grabbing, releasing and striking, with a fallback for devices without a working haptic actuator.

## How I used spatial audio

I built on `spatial-audio.js` and its existing AudioContext and Resonance Audio framework. Each bell has a positional source, and all four looping phrases start at the same audio-clock time. Switching perspectives moves the sources without restarting the music.

In Human Mode, the original sources span only 0.33 m, so they form a compact musical object. In Miniature Mode, that same spacing becomes 3.96 perceived metres. The sources stay attached to the rendered geometry, while the listener receives the tracked headset's position and orientation every frame. Turning the head changes their perceived directions, and walking toward one changes its distance relative to the others.

The first VR feedback was that the audio sounded too similar between the two modes. The early phrases used mostly low, simple tones and often played together. I revised them with brighter overtones and short attacks, and spaced the phrases out so individual sources are easier to identify.

I also gave this scene its own dry Resonance renderer on the existing AudioContext. This reduces reflections that could obscure direction and lets the scene update its listener independently of the shared classroom audio room. The sources use logarithmic distance attenuation. This still uses the course's audio framework and does not add a new library.

Direct strikes use separate synthesized sound buffers connected to the struck bell's positional source. They bypass the looping layer's mute control, so turning off a phrase does not silence the physical interaction. The revised soundscape and listener calculations are implemented, but their perceived clarity still needs another headset test.

## What I checked and what I found

My recorded regression run passed 17 music-box tests covering scale, movement, grabbing, placement, controller-tip strikes and audio state.

| What I checked                                                           | What happened                                                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Switch perspectives with a translated and rotated room coordinate system | The headset and controller calculations retained the 1/12 relationship.                                           |
| Move physically or use the joystick toward the stage edge                | The avatar stayed within the circular movement boundary.                                                          |
| Grab the whole box and switch perspectives repeatedly                    | The box kept its saved position and rotation.                                                                     |
| Grab each of the four bells in both modes                                | The selected bell moved with the controller, and its sound source followed it.                                    |
| Release a tilted bell above the floor                                    | It stood upright with its base on the stage instead of remaining tilted or floating.                              |
| Grab and release all six decorations                                     | Each could be moved and placed upright in either view.                                                            |
| Touch a bell without pressing a button                                   | The collision triggered a separate strike and feedback; resting there did not repeatedly retrigger it.            |
| Move the controller tip through a bell between frames                    | The swept collision check detected the strike.                                                                    |
| Switch from human to miniature presentation                              | The distance between opposite sound sources increased by twelve, and headset rotation reached the audio listener. |
| Mute a looping layer, then strike its bell                               | The strike still played independently without restarting the looping tracks.                                      |
| Leave the scene                                                          | Its audio players and renderer disconnected, and its input handlers were restored.                                |

These tests run the scene with the repository's real matrix functions and simulated tracking inputs. The audio checks use mocked Web Audio and Resonance nodes, so they verify routing, timing and listener updates rather than the sound reaching a person's ears. The full repository run passed 55 tests, with two unrelated failures caused by tests referencing missing scene files.

The VR feedback confirmed that grabbing worked, but also revealed the weak audio contrast, unclear tap behavior and tilted placement. I revised those parts in response. The latest direct-touch interaction, haptic feedback, decoration layout, automatic placement and spatial listening experience still need device testing. The automated checks do not establish how comfortable or convincing they feel in VR.

The main files are `js/scenes/hw7-living-music-box.js`, `js/util/living-music-box.mjs` and the music-box audio helper in `js/util/spatial-audio.js`. The scene is registered in `js/scenes/scenes.js`. To run the checks, use `node --test tests/living-music-box.test.mjs`.
