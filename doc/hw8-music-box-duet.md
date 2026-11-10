# hw8 --music-box-duet

For this assignment, I extended my HW7 Living Music Box into a cooperative activity called `hw8-music-box-duet`. One person uses a computer to conduct, while another enters the music box in VR as its miniature ballerina. The conductor sees a short melody and explains it aloud, and the ballerina walks to the bells and plays it. I kept the original music box, miniature movement and spatial audio, then added shared gameplay and a complete cartoon avatar for the conductor.

## What I built

I wanted the difference in scale to give the two people different things to do. From the computer, the conductor can see the whole music box and read the melody. From inside the box, the ballerina can move among the bells and reach their caps, but cannot see the correct order. They need to communicate to complete the same activity.

I reused the four bells from HW7: Melody, Chimes, Harmony and Bells. Each round puts these four bells in a random order, using each one once. Correct notes advance the shared progress from zero to four. An incorrect note resets the progress without changing the melody, so the conductor can help the performer try again. I left out the optional timer so the activity focuses on listening and playing together.

The pink-and-gold box, pearl rim, winding key and six decorations remain from HW7. I also gave the conductor a cartoon head, face, hat, coat, bow tie, arms, gloves, legs and shoes. The ballerina can see this human-sized character outside the box, while the conductor sees the small ballerina moving on the stage.

I kept HW7 as a separate scene. The new activity reuses its geometry and interaction code through optional hooks, so choosing `hw7-living-music-box` still gives you the original assignment.

## How you can use it

The main setup uses one computer and one VR headset connected to the same course server. Open `hw8-music-box-duet` on both devices, keep the computer in its normal browser view, and enter XR on the headset. The computer becomes the Conductor, and the VR participant becomes the Performer, regardless of which joins first.

To begin, the conductor turns the gold winding key on the side of the box. On the computer, you can click the key and drag left or right, or hold K for about one second. Both inputs visibly turn the key. When it has turned far enough, a new round begins and four numbered bell names appear on the conductor's screen in their corresponding colors.

The conductor reads these names aloud. The performer uses the left joystick or physical movement to approach each bell, releases the trigger, and touches the cap with a controller tip. After playing a note, move the hand away before touching again. Holding a controller against a bell does not keep playing it.

Both people see the progress and receive feedback when a note is played. A correct note produces a green flash. A mistake produces a red flash and resets progress to the first note of the same melody. Completing all four notes displays `DUET COMPLETE!` on both clients. The conductor can then wind the key again to start a new melody.

Only the conductor can start a round and read the sequence. Only the performer can submit bell strikes. During a performance, I lock the box and decorations in place and disable music-layer toggles so these interactions do not interrupt the activity. Between rounds, the conductor can arrange the box again. The decorations remain part of the scene, but do not block movement or bell contact.

The activity uses spoken communication in the room or an existing call; I did not add voice chat. I also kept an optional two-headset setup. Without a computer participant, one headset becomes the conductor and the other becomes the miniature performer. The XR conductor holds a trigger near the winding key and twists the controller, regripping if needed to turn it far enough.

## What each button and input does

| Control or input | What you can do with it |
| --- | --- |
| Hold K on the computer | Turn the winding key and start or restart a round as the conductor. |
| Click and drag the gold key | Turn the key directly with the mouse. |
| Left joystick in VR | Walk relative to the headset's heading as the performer. |
| Physical headset and controller movement | Look around, move and reach at the active scale. |
| Touch a bell cap without holding the trigger | Submit a note as the performer during a round. |
| Trigger, A / X, or Space | Enable or resume audio if the browser has suspended it. A / X does not change scale or start a round in HW8. |
| Arrow keys and Q/E on the computer | Move or rotate the box between rounds. |
| Trigger near the winding key, then twist | Turn the key when using an XR conductor. This interaction takes priority over grabbing the box. |

The perspective follows your assigned role rather than a scale-switch button. Enter and the keyboard's 1-4 shortcuts do not start rounds or submit notes. This keeps winding with the conductor and playing with the performer.

## How I handled the two scales and avatars

I reused the 1/12 transformation from HW7. The stored music box stays at its original size, while the miniature player's presentation enlarges the scene by twelve around their tracked position. I include the saved box transform and the performer's walking offset, so physical movement and joystick movement both change where the conductor sees the ballerina.

I use the inverse of the rendered box transform to bring tracking data back into the shared stage coordinates. The same calculation includes box translation, rotation and room calibration. The performer's head and hands therefore appear at the miniature position they are using, rather than returning to the center whenever they move.

For the conductor, I built the geometry in human metres. Its main head uses the same dimensions as the ballerina's head before the ballerina's 1/12 scaling. In the performer's view, the conductor consequently appears twelve times larger than the miniature character. The head and hands keep their pose rotations as well as their positions.

The full cartoon body follows the conductor's location on the human floor. I infer the torso, legs and simple elbow bends from the head and hands. These body parts are an approximation; I did not add full-body tracking or a full IK rig. In the conductor's own view, I hide the body and head to keep them out of the camera and show the hands instead.

XR head and hand poses come from `clientState.head` and `clientState.hand`, following the course's `minime.js` example and the API documentation. I account for the Clay root transform when converting these poses, since `clientState` has already removed it. A desktop participant has no tracked headset or controllers, so I share the desktop camera pose and the animated winding-hand poses separately.

## How I synchronized the activity

I used the repository's existing `server.synchronize`, `server.broadcastGlobal` and `server.broadcastGlobalElement` functions. The shared data includes player roles, the round, melody, progress, results, box placement and interaction events. Each participant also shares the information needed to place their avatar, including the miniature walking offset. I reuse the framework's existing XR pose updates rather than sending a second copy of the headset and controller data.

I choose one active participant's client to generate the melody and decide whether each note is correct. Other clients send their actions to that client and display the committed result. This gives both people one shared progress value instead of letting each device decide separately whether the round is complete.

Each action has a session identity and a sequence number. I keep an action pending until it has been acknowledged, and ignore actions that have already been processed. This prevents a repeated network update from playing the same note twice. The bell's existing contact latch and cooldown also prevent a resting hand or two simultaneous hands from producing repeated notes.

For a submitted strike, I check the current role, round and session, then validate the controller-tip contact using the same swept collision approach as HW7. I also require the performer's head to be near the bell, so they need to approach it rather than reach across the whole stage from the center.

Roles stay assigned when the client list changes order. If the client managing the round changes, another client can continue from the shared state without replaying accepted notes. If a participant disconnects, stops updating for two seconds or begins a new session, I interrupt the active performance. The remaining person can wait for a partner and wind a fresh round.

The melody exists in shared state, but I only render its numbered labels for the conductor. The performer sees instructions, progress and results, without seeing the correct sequence.

## How I used spatial audio and feedback

I kept the four independent music layers and the existing Resonance Audio system from HW7. The sources remain attached to the bells, and the listener follows the active viewpoint. From outside, the sound comes from a compact tabletop object. From inside, the bells are spread around the performer at the enlarged scale.

A submitted note plays its bell sound on both clients after the shared result is accepted. I added short, different cues for a correct note, a mistake and a completed duet. These use the existing AudioContext and the bell's positional source, so I did not add another audio framework. The looping music continues without restarting whenever the shared state changes.

The accepted result also controls the bell flash, a colored ring on the stage and haptic feedback. I send these through the same numbered feedback history as the progress update, so repeated snapshots do not replay an old success or mistake.
