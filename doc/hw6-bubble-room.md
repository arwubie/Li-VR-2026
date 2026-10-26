# hw6 --bubble-room

For this assignment, I built a shared bubble room called `hw6-bubble-room`. You can grab colorful bubbles, move them through the room, and combine two held bubbles to make a new color. I adapted the controls from `widgets.js` and the bouncing behavior from `bouncing.js`, then added shared state so two or more people can play with the same bubbles.

## What I built

I wanted to make a space where people could experiment with color together. The room starts with 24 bubbles moving at different heights and depths. You can watch them bounce, catch one, or bring it toward a bubble held by someone else. There are no scores, levels or penalties; the interaction itself is the activity.

I placed three bubble generators on the left, in the center and on the right. They produce Rose, Sunshine and Sky bubbles, representing red, yellow and blue. Each generator has its own button and size slider, so you adjust a device where the bubbles come out.

I used a white background and a light floor to make the colors easier to see. Each bubble has a transparent colored surface, thin circular edges and small highlights. A bubble becomes more opaque when someone holds it, and a brief expanding ring appears when two bubbles merge.

## How you can use it

With hand tracking, you can bring your hand close to a bubble, pinch to grab it, move it, and release the pinch to let it float again. With controllers, you can grab a nearby bubble or point at one and hold the trigger. On desktop, you can drag a bubble with the left mouse button and use the scroll wheel while holding it to adjust its depth.

To mix colors, both bubbles need to be held. One person can hold a bubble in each hand, or two people can each hold one and bring them together. When they merge, the combined bubble stays with the hand moving it, and the other hand is released. Letting go sends the bubble back into the room with movement based on the recent drag.

Freely moving bubbles bounce off each other without merging. This keeps the room full of separate bubbles until someone deliberately brings two held bubbles together.

## What each button and input does

| Control or input | What you can do with it |
| --- | --- |
| BLOW BUBBLE | Create one bubble in that generator's base color. There is no cooldown between clicks. |
| SIZE | Set the size of future bubbles from that generator. Existing bubbles keep their size. |
| Pinch near a bubble | Grab it with hand tracking; release the pinch to let go. |
| Controller trigger | Grab a nearby bubble or one selected with the controller ray; release to let go. |
| Left mouse button | Grab and drag a bubble on desktop. You can also click buttons and click or drag the size sliders. |
| Mouse scroll wheel while holding a bubble | Move the bubble forward or backward in depth. |
| Bring two held bubbles together | Merge their colors and sizes. |
| Generator size and count display | Read the selected diameter and the current number of bubbles. |

The size sliders produce bubbles approximately 17–38 cm in diameter. I limit the room to 42 bubbles to keep the scene manageable. At that limit, the generators display `ROOM FULL - merge to make space`. Merging bubbles reduces the count and lets you generate more.

## How I used widgets in the immersive space

I used the same G2 button and slider components demonstrated in `widgets.js`. G2 draws the interface on a Canvas, which I use as a texture on a small plane attached to each generator. The controls are part of the three-dimensional scene, so you can use them in VR as well as on a computer.

I distributed the controls across the three generators instead of putting all of them on one central panel. For example, the slider beside the Sky generator changes the size of the blue bubbles it produces. The button above that slider creates a bubble at the same device. Each generator has a separate size setting, and everyone shares those settings.

For desktop input, I added a way to pass mouse events directly to G2. This preserves quick clicks that could otherwise happen between animation frames. The slider updates its local size preview while you drag, then sends the final value when you release it.

## How I mixed the colors

I defined seven color states using combinations of three base colors:

| Base colors included | Bubble color |
| --- | --- |
| Red | Rose |
| Yellow | Sunshine |
| Blue | Sky |
| Red + yellow | Peach |
| Yellow + blue | Mint |
| Red + blue | Lavender |
| Red + yellow + blue | Pearl |

Each bubble remembers which base colors it contains. For example, a Peach bubble already contains red and yellow, so combining it with a Sky bubble produces Pearl. Mixing the colors in a different order produces the same result. Two bubbles of the same color can also merge; their color stays the same while their size increases.

I combine their volumes to calculate the new radius, with a maximum diameter of about 49 cm. These are simple, predefined color rules rather than a simulation of light or pigment mixing. This makes the results easy to understand and keeps the number of color states small.

## How I adapted the bouncing behavior

I borrowed the position, velocity and boundary-reflection approach from `bouncing.js`. I added room boundaries, bubble-to-bubble collisions and light currents so the bubbles keep moving through the space. The motion uses elapsed time, and I limit the maximum speed to keep the bubbles controllable.

The early version drifted too slowly, so I increased the starting speeds, reduced drag and made collisions more elastic. I also keep a minimum floating speed so the room does not gradually become still. When a bubble is held, its position follows the player's input instead of the floating simulation.

For merging, I check the path a held bubble travels between movement updates. This lets a quick drag still detect another held bubble, even if it passes through the other bubble between frames.

## How I synchronized it

I followed the message-sending approach in `construct.js`, using `server.init`, `server.send` and `server.sync`. The shared state includes bubble positions, velocities, colors, sizes, grab ownership and the three generator settings.

I choose one active participant's client to calculate movement, collisions and merges. Other clients send their actions to that client and receive periodic snapshots of the room. They smooth the displayed positions between updates. This gives everyone one shared physical simulation instead of letting each device calculate a different result.

Each participant has a separate session identity, and each grab records both the participant and the hand. A bubble can only belong to one hand at a time, so two people cannot independently move the same bubble. The same system allows one person to hold two different bubbles with two hands.

New participants receive the current room state. I use message sequence numbers to ignore repeated actions and older snapshots. If the client running the simulation leaves, another active participant can take over using its most recent state. Existing grabs are released during that change so they do not remain attached to an absent hand. Viewpoints and mouse hover feedback remain local.

## What I checked and what I found

My recorded regression run passed 15 tests covering the bubble rules, controls and synchronization.

| What I checked | What happened |
| --- | --- |
| Two people, or one person using two hands, merge held bubbles | The colors combined, one bubble remained held, and the other grab was released. |
| Two people try to grab the same bubble | Only one grab was accepted. |
| Bubbles collide and reach the room boundaries | They rebounded and stayed within the movement bounds. |
| Rapidly click the generator button between render frames | Each click generated a bubble until the room reached its limit. |
| Change SIZE, then generate a bubble | The new bubble used the selected size. |
| Drag SIZE with an offset room coordinate system | The test reproduced a missed-click problem caused by applying the room transform twice; removing the extra transform made the test pass. |
| Exchange messages through the course transport code | Two simulated clients shared merges and generator settings; additional checks covered late joining, stale snapshots and host takeover. |

The slider issue showed why testing the widget alone was not enough: its callback worked, but the scene's mouse projection could still miss the visible control. I added tests that run the actual scene listeners, projection calculations and G2 widgets together.

I checked an early desktop view and then adjusted the background, bubble opacity and text. The final appearance, sustained frame rate, hand tracking, controller interaction and synchronization between two physical headsets still need device testing. The automated checks verify the rules and input calculations, but do not establish the quality of the VR interaction.

To try the scene, start the course server with `node server/main.js 2026 2026 http` and select `hw6-bubble-room`. For shared play, connect both devices to the same server and open the same scene. Refresh both clients after updating the code so they use the same version.

The main files are `js/scenes/hw6-bubble-room.js`, `js/util/bubble-room.mjs`, `js/util/bubble-room-sync.mjs` and the updated G2 controls in `js/util/g2.js`. To run the checks, use `node --test tests/bubble-room.test.mjs tests/bubble-widgets.test.mjs tests/bubble-scene-input.test.mjs`.
