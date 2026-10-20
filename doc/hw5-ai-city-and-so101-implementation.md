# hw5 --ai-builder-extended --arm-annotated

For these two assignments, I built an AI-assisted city builder and an annotated version of the supplied SO101 robot arm. In the first scene, you can ask an AI to generate and edit geometry using examples I prepared. In the second, you can adjust the robot and use graphical annotations to understand its joint angles, limits, approximate workspace and recent movement.

## 1. AI City Builder: Generating Geometry from Examples

### What I built

I extended my earlier AI Builder into a city-generation scene called `ai-builder`. My goal was to see whether a small set of simple geometric examples could help an AI compose a much larger scene.

I started with five objects made from cubes: a tower, a house, a tree, a lamp and a bench. I displayed them on the left side of the scene so you can see the building vocabulary before generating anything. I also added comparisons between three-, five- and eight-floor buildings, and between a normal tree and a double-size tree.

I used a Minecraft-inspired style with stone, wood, greenery, and small cyan and purple accents. I supplied the ground and roads, while leaving the AI to choose the individual objects, their positions, dimensions, colors and roof styles. You initially see the result as a city overview, and you can enter it at human scale using WALK.

### How I used examples: few-shot-style prompting

I used **few-shot-style prompting** by including a small set of structured object examples and size variations in the AI's prompt. The visible examples and the prompt use the same recipe definitions. This lets me show the user what the AI is being asked to copy and vary.

For example, I describe a tree as a trunk with two stacked cubic crowns, and a tower as a body with repeated windows and a roof. The AI returns new object recipes using this vocabulary. My program then turns those recipes into actual cube geometry.

### How you can use it

You can type a request on your computer or use the in-world keyboard by pointing at its keys and pressing a controller trigger. For example, you can ask for one tree, a group of houses, or a larger city with different building heights. SEND submits your own text, while DEMO runs my prepared city brief.

After the AI responds, you can watch the geometry appear while a small builder avatar moves between construction positions. The construction animation takes at most about two seconds after a valid result arrives; the AI's response time is separate.

You can also click an object, or point at it in VR and press the trigger, to select it. I added an outline and an EDIT indicator so you can see what your next request will affect. You can then ask to change that object, such as making a tree larger or changing a house's window color. The edit replaces the selected object and preserves the others.

### What each button does

| Button or input | What you can do with it |
| --- | --- |
| Letter and number keys | Enter your building request. You can also use a physical keyboard or paste text. |
| SPACE | Add a space to the input. |
| BACK | Delete the last character. |
| CLEAR | Clear the input without deleting the city or cancelling an active generation. |
| SEND / Enter | Send your current request. If an object is selected, the request edits that object. Otherwise, it generates a replacement scene. |
| DEMO | Send the prepared city brief, which asks for 45 objects using all five demonstrated kinds. |
| NEW | Deselect the current object and return to new-scene mode. This button does not immediately erase the city. |
| RESET | Cancel the active request or construction, clear the generated city, and clear the input. The demonstration objects remain. |
| WALK | Enter the generated city at human scale. |
| HOME | Return to the overview without changing the city. |
| FWD / REV | Move forward or backward by one meter per press. |
| LEFT / RIGHT | Move sideways by one meter per press. |
| TURN L / TURN R | Turn left or right by 30 degrees. |
| Left VR thumbstick | Move continuously while in WALK. |
| Right VR thumbstick | Turn in 30-degree steps; release it before the next turn. |
| Desktop arrow keys | Move continuously while in WALK. |

The spatial movement buttons also enter WALK if needed. Movement changes only your own view, so walking around does not move another connected user.

### How I built the interface and generation process

I put the display inside the VR scene using a Canvas texture on a three-dimensional screen, with a physical-looking keyboard below it. You use the same interface on desktop and in VR. I kept the screen focused on your input, selection, generation progress and errors. During WALK, I draw the controls in a foreground pass so buildings cannot hide them.

For generation, I use OpenCode with the configured default model `opencode/deepseek-v4.1-flash-free`. I send the request to `/api/ai-builder`, together with the current world version and the selected object's recipe when editing.

I ask the model for structured data describing objects, rather than executable code. My program checks that data and expands it into cube parts. I allow 1–100 objects for custom requests and up to 3,200 cube parts overall. If the result is invalid, I show an error rather than substitute a preset city.

I also added explicit rules for measurable changes. For example, a five-floor building gets five windows per vertical column, and making a selected tree “bigger” increases its height and both crown dimensions by at least 50%, within the supported bounds. These checks make the result more predictable, but part of that reliability comes from my program's rules rather than the AI alone.

### What I tried and what I found

I recorded these development results:

| What I tried | What happened |
| --- | --- |
| Generate a city from the five examples | One model call produced 45 objects and 788 cube parts. |
| Use a more compact output format | Another city request produced 45 objects and 655 cube parts in 52 seconds. |
| Ask for “exactly one tree at the center” | The result contained one object and three cube parts, returned in six seconds. |
| Change a selected house's windows to purple | The edit completed in 19 seconds while preserving the house's other parameters. |

These results showed me that the AI can reuse a small vocabulary to compose a much larger scene, and that selecting one object makes follow-up edits more specific. They are individual results, so they do not guarantee the same speed or quality on every request.

The main limitation is that I still define the available construction recipes. The AI can vary and arrange them, but it cannot create an arbitrary new mesh or learn a new building procedure from controller gestures. Objects can also overlap, and a valid result does not necessarily have a good street layout. I have not added building collisions, so you can currently walk through buildings.

### How I synchronized it

I followed the message-sending approach in `construct.js`, using `server.init`, `server.send` and `server.sync`. You can connect a desktop browser and a headset to the same server and work with the shared city.

I commit the complete city data before showing the local building animation, so someone joining during construction can receive the whole result. I also handle duplicate messages, late AI replies, older snapshots and competing plans. Concurrent plans resolve to one result rather than being merged. Your draft, selected object and walking position remain local to your own view.

To run it, start the course server with `node server/main.js 2026 2026 http`, authenticate OpenCode as the user running the server, and choose `ai-builder`. The main files are `js/scenes/ai-builder.js`, `js/util/ai-city.mjs`, `js/util/ai-builder-screen.mjs`, `js/util/ai-builder-sync.mjs` and `server/ai-builder.js`.

## 2. SO101 Robot Arm: Understanding Movement through Annotations

### What I added

I copied the supplied SO101 into a new scene called `SO101-annotations`, keeping the original scene available. I wanted the annotations to answer questions I would have before positioning something for the robot: Which joint am I changing? How much farther can it turn? Where might the tool reach? Where has it moved, and how fast?

I added six live angle labels, joint-limit warnings and a slider control panel. I then added a sampled reachability heatmap and a speed-colored motion trail. I kept the source code's existing sinusoidal motion so you can watch the annotations change automatically, or pause it and explore different poses yourself.

### How you can control the arm

You can drag a slider with your mouse. In VR, you can point at it with a controller, hold the trigger, and move the pointer along the slider. Starting a joint adjustment pauses the entire arm and preserves the current angles of the other joints.

I connected each slider to a numbered label and a marker at its joint. When you adjust a slider, its label and marker are highlighted so you can identify the corresponding part of the arm.

| Slider | What it changes | Angle range from the source model |
| --- | --- | --- |
| J1 — Base pan | Turns the arm around its base. | −110.0° to 110.0° |
| J2 — Shoulder lift | Changes the shoulder angle. | −100.0° to 100.0° |
| J3 — Elbow flex | Bends the elbow. | −96.8° to 96.8° |
| J4 — Wrist flex | Bends the wrist. | −95.0° to 95.0° |
| J5 — Wrist roll | Rotates the wrist. | −157.2° to 162.8° |
| J6 — Gripper | Changes the angle of the moving jaw. | −10.0° to 100.0° |

I display angles in degrees to one decimal place. Each value is relative to the source model's joint zero. The labels also show how many degrees remain before the nearest limit. A yellow warning appears within 5° of a limit, and a red status appears at the endpoint. I added text identifying the limit as well as color, and I prevent the sliders from moving beyond the model's bounds.

### What each button and display does

| Control or display | What you can do or read |
| --- | --- |
| PAUSE | Stop the automatic motion at its current pose. |
| PLAY | Resume the source animation with a 0.5-second transition. |
| ZERO ALL | Pause the arm and return all six joint angles to zero. This starts a new trail segment rather than clearing the previous history. |
| HEATMAP ON / OFF | Show or hide the approximate sampled workspace. On first use, you can see the sampling progress. |
| Heatmap opacity slider | Adjust the point cloud's opacity from 5% to 60%; the default is 25%. This slider does not pause the arm. |
| TRAIL ON / OFF | Show or hide the recent movement path. Recording continues while the trail is hidden. |
| CLEAR TRAIL | Delete the current path history without changing the arm's pose. New movement continues to be recorded. |
| Tool speed | Read the tool reference point's speed in cm/s. |
| Blue–yellow–red legend | Compare the trail's colors with the fixed 0–30 cm/s speed scale. |
| Tool XYZ | Read the reference point's position in centimeters relative to the robot base. |
| Blue tool marker | Locate the fixed `gripper_frame` reference point used for the heatmap, trail and measurements. |

I used Canvas textures on scene planes for both the panel and the labels, so you can see them inside VR rather than in a separate HTML sidebar. Leader lines connect the labels to the joints, and the labels turn toward your own viewpoint.

### How I made the reachability heatmap

I calculated where the tool reference point goes for 30,000 sampled joint configurations. I used the source model's joint limits and the same transformations that render the arm. I grouped the resulting positions into 1 cm cells and displayed up to 1,800 representative points. I process the sampling in small batches so it does not all happen in one frame.

I based the colors on the best joint margin I found in each cell:

| Color | What it tells you |
| --- | --- |
| Green | I found a sampled pose where every participating joint stays at least 10% of its full angle range away from either limit. |
| Orange | The best sampled pose for that cell has at least one joint closer to a limit. |
| Blank | No point is displayed there. You cannot conclude that it is unreachable, because the sampling and displayed point count are limited. |

You can use this as a rough guide when considering where to place a target. I describe it as an **approximate position-reachability map**, because I have not checked a required gripper orientation, collisions or a path to that position. Green means a larger sampled joint margin, not a guaranteed easy or successful grasp.

I use the fixed `gripper_frame` origin as the reference point. It is not a calibrated contact center between the jaws. Since J6 opens the moving jaw without moving that fixed frame, I sample the first five joints for the map.

### How I made the motion trail

I record the same tool reference point about every 50 ms and retain the most recent 15 seconds, with a maximum of 301 points. I calculate speed from the distance between positions divided by elapsed time, then apply light smoothing to nonzero speeds.

You can read the path shape to see where the tool moved, and use its color to compare faster and slower sections. Blue indicates slow movement, yellow indicates medium speed, and red indicates 30 cm/s or above. I keep the scale fixed so the same color has the same meaning throughout the session.

I calculate positions relative to the robot base, so moving your head or changing the camera does not draw a false path. I also break the line when you zero the arm, when the recording client changes, or when there is a sampling gap longer than 250 ms. This avoids connecting two positions across a reset or interruption.

The speed describes this virtual arm, including changes you make with the sliders. I have not added physical force, torque, acceleration-limit or hardware-velocity measurements.

### How I synchronized and checked it

I again used the `construct.js` message pattern. I share the arm's angles and playback state separately from the visualization settings and trail history. You can adjust the arm or clear the trail from either client, and the changes are sent to the other participants.

I choose one active participant to record the path and send its points to the others. Periodic history snapshots help someone joining later catch up. I give each clear operation a new generation so an old message cannot restore a path you already deleted. Each client generates the same heatmap from a fixed random seed, so I only need to synchronize its settings rather than send thousands of points.

I checked the numerical tool positions against the scene's matrix calculations at zero, at the limits and at 100 random poses. Across both assignments, my recorded regression run passed 26 tests covering geometry, controls, cancellation and synchronization cases. I also checked desktop screenshots of the completed green/orange point cloud and adjusted its brightness and drawing order so it would remain visible without obscuring the robot.

I still need to verify controller dragging, sustained frame rate and actual desktop-to-headset synchronization on the devices. Playback also assumes their clocks are approximately aligned, so I do not claim frame-perfect synchronization.

To try this scene, use the same course server and choose `SO101-annotations`; it does not need an AI service. The main files are `js/scenes/SO101-annotations.js` and the `so101-state`, `so101-panel`, `so101-kinematics`, `so101-analysis` and `so101-meshes` modules in `js/util/`. Refresh both clients after updating the code so they use the same version.
