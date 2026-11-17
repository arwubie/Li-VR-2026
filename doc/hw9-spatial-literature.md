# hw9 --spatial-literature

For this assignment, I built a spatial literature explorer called `hw9-spatial-literature`. I turned a local collection of 25 research papers and 58 citation relationships into a three-dimensional network. You can use the computer keyboard to filter the papers, enter the network in VR, and move individual papers aside to see their connections more clearly. I used the course's Clay renderer, keyboard events, controller beams and shared-state functions rather than adding another rendering or networking framework.

## What I built

I wanted the computer and headset to support different parts of researching a topic. The physical keyboard makes it easy to change precise filtering values, while VR lets you approach a paper, look around its relationships and follow connections through space. Both devices show the same active papers and share selection and layout changes.

I represented each paper with a sphere. More highly cited papers have larger spheres, and publication time determines depth: newer papers are near the entrance, while older papers are farther inside. Papers from the same year spread horizontally and vertically. I gave the six research categories different colors: foundations are blue, self-improvement is violet, frameworks are mint, tool use is coral, harnesses are pink, and benchmarks are lime.

I used larger, light-colored short titles such as ReAct and MetaGPT beside the spheres. Selecting a paper turns it gold, highlights its relationships and dims unrelated connections. Gold arrows show papers it cites, while cyan arrows show papers that cite it. Every arrow points toward the cited paper, following the dataset's `source -> target` convention.

I kept the surrounding text minimal so it does not cover the network. The filter summary and year markers remain visible. In VR, selecting a paper reveals its full title, year, citation count and supplied arXiv URL. On the computer, clicking a sphere opens a separate reading dialog.

## How you can use it

Start the course server from the repository root with `npm start`. Open `http://localhost:2026` on the computer and `http://<computer-LAN-IP>:2026` on the headset, following the WebXR setup in the repository README. Choose `hw9-spatial-literature` on both devices and enter VR on the headset. Both devices need to use the same server.

On the computer, focus the scene, hold Space, tap K, and release Space to enable the scene's keyboard input. This follows `kbdEvents.js` and `kbdEvents2.js`. You can then adjust the minimum citation count and minimum publication year. Both filters apply together: a paper must meet both thresholds to remain active. Excluded spheres shrink away, and newly included ones grow back in the same positions. A connection is visible only when both papers pass the filters.

You can click a sphere to open its paper reader. I show the full title, year, citation count and category above an embedded preview. When the dataset supplies an arXiv abstract link, I derive the PDF endpoint from that same identifier. The dialog also has a link to the original supplied URL, since a remote site or browser may prevent the preview from loading. Close it with the close button, Escape, or a click outside the dialog. Papers without a supplied URL still show their metadata.

You can also hold the left mouse button on a sphere and drag it aside. Its label, connections and arrowheads move with it. A drag stays within the paper's current year plane, so moving a paper does not change the time it represents. I separate a short click from a drag so rearranging the network does not open the reader or rotate the desktop camera.

In VR, point either controller beam at a sphere and briefly press and release the trigger to show its paper information and an OPEN PAPER button. Point at that button and click the trigger to open the original supplied link in the headset browser. Keep the trigger held and move or aim the controller instead to drag the sphere within its year plane, then release to leave it there. A drag does not open the information card or launch a link. Both hands support these interactions. Pressing a trigger while pointing at empty space clears the selection.

You can walk physically or use the left joystick to explore the network relative to the direction you are facing. Pushing forward takes you farther inside toward older papers. I bound virtual travel to this small research space, with up to 3.2 metres of forward travel. Movement is personal, so exploring in VR does not move the computer user's viewpoint.

## What each button and input does

| Control or input | What you can do with it |
| --- | --- |
| Space + K on the computer | Toggle the course framework's scene keyboard mode. |
| `[` / `]` | Decrease or increase the minimum citation count by 100. |
| `,` / `.` | Decrease or increase the minimum publication year by one. |
| R | Reset both filters to show all 25 papers. |
| L | Restore the original sphere layout on all connected clients. |
| Click a sphere with the mouse | Select it and open the desktop paper reader. |
| Hold the left mouse button and drag a sphere | Move it horizontally and vertically within its year plane. |
| Point either controller beam and briefly press and release its trigger | Select the nearest paper and show its information and original-link button. |
| Hold a controller trigger and move or aim | Drag the selected paper within its year plane; release to leave it there. |
| Point at OPEN PAPER and click a trigger | Open the supplied original URL in the headset browser and leave immersive mode. |
| Point at CLOSE and press a trigger | Dismiss the information card and return to the network. |
| Left joystick in VR | Walk through the network relative to the headset's heading. |
| Physical headset movement | Look around, lean and move through the tracked space. |
| Page Up / Page Down on the computer | Move toward older or newer papers in steps of 0.4 metres. |
| Home on the computer | Return that client's viewpoint to the network entrance. |
| O on the computer | Open the selected paper's supplied URL in a new tab. |

R resets filtering without undoing manual layout changes. L restores the layout without changing the filters. A headset user can select a paper and their computer partner can press O to open it. I do not automatically open external pages in VR or open a computer dialog in response to someone else's selection.

## How I arranged the papers and handled dragging

I placed the newest year at z = -1.5 metres and moved each earlier year another 0.85 metres back. Within a year, I sort papers by ID and place them on a grid with 0.62 metres of horizontal spacing and 0.48 metres of vertical spacing. This gives every client the same starting layout. Filtering does not run a new layout calculation or randomly move the remaining papers.

I map citation counts through a logarithmic scale, keeping sphere radii between 0.055 and 0.13 metres. This makes the difference in citation counts visible while keeping the largest papers from taking over the scene.

For selection, I convert the mouse or controller ray into the graph's coordinates and choose the nearest forward sphere intersection. I include the scene transform, room calibration and personal navigation offset in this conversion, so selection follows the rendered network after it has moved.

When a drag begins, I intersect the ray with the paper's year plane and save the offset from that point to the sphere center. Later ray intersections move the sphere with the same offset, so it does not jump onto the ray when grabbed. I use a six-pixel threshold for mouse dragging and a small movement threshold for controllers to avoid treating minor input motion as a drag.

I keep the edited X and Y coordinates separate from the original layout and leave Z unchanged. Labels, picking and edge endpoints all use the edited position. If two spheres overlap, I hide their connecting edge rather than drawing a reversed arrow or calculating an invalid direction. Manual positions survive filtering and filter reset, and L returns them to the original grid.

## How I opened papers in the headset browser

I use a small Clay information card in VR with the paper's full title, year, citation count and an OPEN PAPER button. I place it about 1.15 metres in front of the headset when it opens. It stays at that location rather than following every head turn. Selecting a sphere only shows this card; opening an external page requires a separate deliberate click on its button.

I open the URL from the native XRSession select event rather than from the animation loop's polled controller input. This preserves the browser's user-activation context. I attempt to open a new browser tab immediately, detach its opener, send it to the supplied URL, and end the immersive session. If the browser blocks the new tab, I end the session and navigate the current tab to that same URL instead. The browser then handles the original page or PDF normally. You can return to the explorer through its browser tab or Back button and enter XR again.

I pause left-stick travel and block graph clicks while the information card is open, so its buttons do not also grab a sphere behind it. CLOSE dismisses the card without leaving VR. A paper without a supplied URL shows NO URL and keeps its metadata available.

I use only the URLs already supplied in the dataset. I do not pre-download or cache paper PDFs on the course server, and there is no PDF preparation command or bundled PDF-rendering library. Network exploration still uses only the local dataset; the external site is contacted only when a person explicitly opens or previews a paper.

## How I synchronized the explorer

I followed the pattern in `kbdEvents2.js`, using `server.synchronize('hw9LiteratureState')` in the animation loop and `server.broadcastGlobal('hw9LiteratureState')` when shared state changes. Every client loads the same local `papers_vr.json` and calculates its own visible set. I do not broadcast the dataset or call an external academic API.

The shared state contains the minimum citation count, minimum year, selected paper ID and a sparse map of manually edited positions. Each moved paper only needs its ID and two coordinates. I keep viewpoint movement and mouse hover local to each participant.

During a drag, I update the local position immediately and send shared position updates at intervals of at least 50 milliseconds. On release, I send the final position even if the next interval has not arrived. This lets the person dragging see continuous movement while limiting network updates.

I use the framework's existing relay, late-join synchronization and persistence. Each client supports one active grab at a time. I did not add shared grab ownership or conflict resolution: simultaneous edits from different clients use the framework's last received state behavior. When leaving the scene, I remove its mouse listeners and reader dialog and restore the previous keyboard and controller handlers.

## What I checked and what I found

I ran `node tests/spatial-literature.test.mjs` and the JavaScript syntax checks. The automated checks passed for the dataset, layout, filtering, synchronization, selection, dragging and reader behavior.

| What I checked | What happened |
| --- | --- |
| Load the local dataset | All 25 papers and 58 directed citation edges were available. |
| Reorder the input papers and filter the graph | The starting layout stayed deterministic, and filtering preserved positions. |
| Apply citation and year thresholds together | Only papers meeting both thresholds remained active; an empty result could be reset. |
| Join after another client changed the filters | The new client received the current shared state. |
| Select after navigation and room calibration | Mouse and controller rays selected the rendered spheres. |
| Drag with the mouse or either controller | The sphere moved within its year plane, kept its grab offset and updated its connections. |
| Release before the next position-send interval | The final position still reached the other client. |
| Aim a held controller parallel to the year plane | The sphere retained its last valid position instead of jumping. |
| Reset filters, then reset the layout | R preserved manual positions; L restored the original grid. |
| Click a paper or drag it | A click opened the reader; a drag moved the sphere without opening it. |
| Click with either VR controller, then use the information-card buttons | The card opened and closed correctly with calibrated scene coordinates; OPEN PAPER used the original URL from a native XR select gesture. |
| A browser blocks the new tab | The link-opening helper ended immersive mode before navigating the current tab to the same original URL. |
| Open a paper without a supplied URL | The reader showed metadata and a missing-link message. |
| Leave the scene or leave while the dataset was loading | Input handlers were restored, and a pending load did not install stale handlers. |

These checks execute the scene with the repository's matrix functions and server synchronization code, using simulated rendering, tracking, DOM, XR sessions, sockets and storage. I also check that selection and dragging do not automatically launch links, that the native select listeners are removed when leaving, and that a new tab has no opener. They verify the calculations and navigation requests, but do not establish how comfortable dragging and walking feel in a physical headset. The final GPU appearance, headset performance, controller tracking, actual headset-browser tab behavior and desktop remote-PDF embedding still need live device testing.

I kept the supplied dataset values unchanged. Its citation counts are historical snapshots, and its curated citation links are incomplete. I handle missing titles, counts, URLs and outgoing references without inventing paper metadata. The built-in Clay font uses ASCII, so I transliterate the tau character and dashes for scene labels while retaining the original title in the dataset and desktop reader.

The main files are `js/scenes/hw9-spatial-literature.js`, `js/util/spatial-literature.mjs`, `js/util/spatial-literature-panel.mjs` and `js/util/spatial-literature-vr-link.mjs`. I registered the scene in `js/scenes/scenes.js`. To run the automated checks, use `node tests/spatial-literature.test.mjs`.
