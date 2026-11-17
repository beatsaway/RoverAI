# Drive the Moon

A self-contained, offline lesson about driving a rover on the Moon. It runs in three acts:

1. **Challenges** — a seven-question multiple-choice starter on the real hazards of lunar mobility.
2. **Drive** — a turn-based driving game with a live 3D camera, four status bars and a hidden hazard map. Reach Station Echo, about 800 m away.
3. **Plan** — pick a satellite survey site, inspect the terrain in 3D, then draw a traverse from the landing point to the checkpoint and have it assessed.

A **Debrief** page collects the results and asks students to connect the three activities.

Everything is local. There is no build step, no server requirement and no network access at runtime.

---

## Run it

**Simplest:** open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari). Double-clicking the file works.

**With a local server** (recommended if your browser restricts `file://` for some features):

```powershell
cd C:\Users\Owner\Documents\roverlesson
python -m http.server 8123
# then open http://127.0.0.1:8123/
```

You can deep-link to any section: `#brief`, `#starter`, `#drive`, `#recon`, `#debrief`.

**Requirements:** a browser with WebGL for the 3D terrain view. Everything else works without it; the 3D panel is the only part that needs WebGL.

---

## Lesson at a glance

| Section | Time | Purpose |
|---|---|---|
| 01 Start | 2–3 min | Ask the five key questions; set up the lesson |
| 02 Challenges | 5–8 min | Surface prior knowledge; introduce seven real hazards |
| 03 Drive | 8–12 min | Experience the information problem: one camera, delayed commands, limited power |
| 04 Plan | 8–12 min | Plan from orbit with slope, shadow and height layers; justify a route |
| 05 Debrief | 3–5 min | Connect the three activities and consolidate |

Total: roughly 25–40 minutes, depending on discussion.

### Suggested teaching sequence

1. **Predict before revealing.** On each starter question, ask for a show of hands before anyone clicks. The distractors are deliberately plausible; the useful discussion is *why* they sound plausible.
2. **Let them fail the drive once.** Failure reveals the hazard overlay and the graded corridor. That reveal is the point: the rover could not see the map, but the planner can.
3. **Make them commit to a route before checking it.** In Plan, ask pairs to agree on a line, then press **Check this route**. Compare their verdict with **Show surveyor's route**.
4. **Use the debrief questions below** rather than summarising the content yourself.

---

## Starter answer key

The correct option is given as a letter (the on-screen buttons are 1–4).

| # | Challenge | Answer | The point |
|---|---|---|---|
| 1 | No map · dead reckoning | **B / 2** — wheel turns and direction, worked out on board | There was no GPS. Drift was never corrected, so a slipped wheel made the plotted position progressively wrong. |
| 2 | Steep slopes | **B / 2** — the wheels slip and the rover can slide or tip | A 25° slope is not tarmac. Climbing costs energy and traction; crater rims can be undercut. |
| 3 | Sharp rock · abrasive dust | **B / 2** — rubber cracks in vacuum and cuts on rock | The LRV wheels were woven steel with titanium tread plates. Fenders were the fragile part. |
| 4 | 290 °C temperature swing | **C / 3** — keep electronics warm and cool at the same time | With no atmosphere, heat transfer is radiation and conduction only. Dust on radiators caused real problems. |
| 5 | One battery, no recharge | **B / 2** — keep a reserve and turn back before the limit | Two 36 V silver-zinc batteries, about 92 km total range, never recharged. Traverses were planned with a walkback limit. |
| 6 | 1.3 s signal delay | **A / 1** — the picture on screen is already out of date | Lunokhod 1 was teleoperated this way. Modern rovers are given goals and choose their own next metres. |
| 7 | Hidden drop-offs | **B / 2** — the ground drops away beyond the edge | A rim is a convex crest. A cliff edge and a flat horizon look similar from a low camera. |

**Teacher view** (button in the header) marks the correct option while the quiz is on screen and turns on the hidden hazard overlay in Drive. It is intended for projection, not for students working alone.

---

## Drive: how the game works

- The rover starts at the landing site with **100% power**, **30 °C** heat, **100% wheels** and high sensor confidence.
- Each turn offers three headings — **Bear left**, **Straight on** and **Bear right** — with the bearing and 36 m move shown. Tags describe the ground: slope band, rock risk, dust, shadow and power cost.
- The command is sent after a **1.3 s** delay. The rover then drives 36 m. The camera is the only view you get; the minimap is fogged until you drive or scan.
- Three bars can end the run:
  - **Power** — no recharge. Driving, scans (−3%) and reversing (−2%) all spend it.
  - **Heat** — sunlight warms the electronics; 120 °C shuts them down. Driving through shadow cools the rover.
  - **Wheels** — boulders do heavy damage; small rocks and deep dust do light damage.
- **Sensor confidence** is the fourth bar. It falls with distance but never ends a run: far from the start the tags become guesses, so believe the camera image more than the labels.
- **Checkpoints** (3) award upgrades: a better camera (larger scan radius), a thermal blanket (38% less heat gain) and AUTO-NAV (the rover picks the lowest-risk line, with a small chance of a bad choice).
- The **Hazards** toggle (and Teacher view) reveals boulders, permanent shadow and the graded corridor. Students can toggle it themselves after a run.
- **New run** generates a new hazard field with the same corridor, so a second attempt is a genuine second attempt.
- Success is reaching **Station Echo** with power left. A straight, goal-following strategy can do it in about 22 turns with roughly 20% power remaining; greedy detours usually run flat first. That contrast is worth discussing.

**Keyboard:** `1`–`3` choose an instruction, `S` scans, `R` reverses.

### Discussion prompts after a run

- Which cost you more: the extra metres, or the uncertainty about which line was safe?
- At what point did you stop trusting the tags and start trusting the camera?
- If the rover could choose its own next 36 m, what rule would you give it?
- Why is a scan worth 3% of the battery? What did it buy you?

---

## Plan: satellite planning

Three synthetic but physically shaped sites, each with a different problem:

| Site | Challenge | What to notice |
|---|---|---|
| **SITE 04 · Crater field** | Slope + boulders | Crater rims exceed 30°; ejecta boulders cluster around them. The safe line threads between the bowls. |
| **SITE 07 · Sinuous rille** | Cliff + detour | A collapsed lava channel cuts the site. Only the southern saddle is crossable. |
| **SITE 11 · Fault ridge** | Obstacle + long shadow | The direct line climbs a 40 m wall. The low pass is at the southern end. |

Workflow:

1. Pick a site card.
2. Inspect it in **3D ground**. Drag to orbit, scroll or pinch to zoom. Use the layer buttons (**Slope**, **Photo**, **No-Sun**) and the view presets.
3. Switch to **Plan map**. Click to add waypoints; right-click or **Undo** removes the last one; **Clear** starts again. The teal ring is the landing point, the amber ring is the checkpoint.
4. Read the live metrics: route length, maximum slope, percentage of risky cells, estimated energy.
5. Press **Check this route** for a 0–100 score, stars and specific reasons.
6. **Show surveyor's route** draws the A* line for comparison. **Demo route** loads it as waypoints so students can inspect it.

**Scoring:** starts at 100. It loses points for cells over 15°, boulders crossed, permanent shadow, excessive detour ratio and finishing more than 60 m from the checkpoint. A route that crosses ground over 30° is capped at 26/100 and called “Blocked by terrain”. Three stars means 85+.

**The shadow inset** is a top-down map where bright means “never sees the Sun” (permanently shadowed region, or PSR). It is the same idea as the shadow layer used by mission planners to find cold traps and to estimate solar power.

### Using real GeoTIFF data

The **Use your own survey data** panel accepts three GeoTIFF layers:

1. **Height** (required) — any single-band GeoTIFF; it is resampled to a workable grid and hillshaded.
2. **Slope** (optional) — degrees; if omitted, slope is recomputed from height.
3. **Shadow** (optional) — any non-zero value is treated as “no Sun”; if omitted, shadow is computed from the height field and an assumed Sun angle.

Load height first, then add slope and shadow, then press **Build from files**. Large files are subsampled to about 190 cells on the long edge. The same viewer, route planner and scoring then operate on the imported terrain.

This is the bridge to the reference **Lunar Site Viewer** approach: the viewer renders a custom `BufferGeometry` from a height raster and paints it with slope, photo/hillshade or shadow layers, with an orbit camera and a shadow inset.

---

## Debrief and classroom tools

- **Result cards** summarise the starter score, the best (latest) traverse and the latest route score. Results are saved in this browser.
- **Print / save summary** uses the print stylesheet; choose “Save as PDF” to hand in a record.
- **Teacher view** — quiz answers + hazard overlay.
- **Reset** — clears saved progress after a confirmation. Use it between classes on a shared machine.
- Progress is stored under `dtm.*` keys in `localStorage`. Nothing leaves the device.

### Debrief discussion prompts

- The Moon has no roads, no map and no rescue. Which of those is the hardest to design around, and why?
- The LRV used dead reckoning; Perseverance uses visual odometry and local maps. What has actually improved — the sensors, the computing, or the way humans and robots share the driving?
- A slope layer is a prediction, not a promise. What would you send to check it before committing a rover?
- If you had to remove one of the four bars in the game, which would you remove, and what would you be pretending does not exist?

---

## Files

```
index.html               page structure and all five sections
css/app.css              theme, layout, responsive, print and reduced-motion styles
js/core.js               seeded noise, terrain synthesis, A*, smoothing, storage
js/sites.js              the three survey sites and their terrain specs
js/quiz.js               starter questions, images, generated temperature chart
js/game.js               Drive: 3D lunar scene, map, turns, telemetry, endings
js/terrainview.js        three.js terrain viewer (orbit, layers, markers, route)
js/recon.js              site cards, 3D/plan modes, route scoring, GeoTIFF import
js/app.js                view router, progress, debrief cards, teacher view, reset
vendor/three.min.js      three.js r128 (MIT)
vendor/geotiff.js        geotiff.js 2.0.4 (MIT)
assets/img/*.jpg         lesson photography (NASA / Wikimedia Commons)
```

There are no fonts, scripts or images fetched from the network at runtime.

---

## Technical notes

- **Terrain is synthesised, not surveyed.** Each site is generated from a seeded fractal height field with craters, rims, ejecta boulders, a rille and a fault ridge, then a corridor is carved for the driving game. The models are plausible teaching reconstructions, not real topography.
- **The mission map is hand-authored and graded.** The driving game's corridor is carved to a maximum slope of a few degrees, so a sensible line exists; the hazards around it are real terrain features, not decoration.
- **The camera feed is a real three.js scene.** Terrain is a vertex-coloured mesh lit by a low Sun, with instanced boulders, a rover model, track decals, dust sprites, a star field and a distant ridge. It is a visual explanation of the hazard map, not a physics simulation.
- **Determinism.** Terrain uses a seeded PRNG, so the same site looks the same on every load. Each new game run uses a new seed for the hazard field.
- **A* corner rule.** Diagonal moves are rejected when either orthogonal neighbour is steeper than the limit. Without this, a path can cut a crater rim between two steep cells and appear safe while crossing the rim.
- **Route analysis samples every 4 m.** The Demo route is decimated adaptively: the sparsest set of waypoints whose straight chords stay under 20° is chosen, so the demonstration never “cuts the corner” of a rille.
- **Storage keys:** `dtm.quiz`, `dtm.ops`, `dtm.recon`, `dtm.visited`, `dtm.best`, `dtm.runs`.
- **Accessibility:** keyboard answering (1–4, Enter), focusable controls, reduced-motion support, visible focus, skip link, print styles. The canvases have text alternatives; the surrounding panels carry the same information in text.
- **No analytics, no external requests.**

---

## Credits

All photographs are NASA imagery, public domain, via Wikimedia Commons. LRO/LROC images are credited NASA/GSFC/Arizona State University.

- *Apollo 17 Moon Panorama* — NASA / Apollo 17 crew (`hero.jpg`)
- *Lunar Roving Vehicle parked on the slope of Stone Mountain* (AS16-107-17473) — NASA / Apollo 16 crew (`rover-slope.jpg`)
- *Makeshift repair of the Lunar Roving Vehicle fender* — NASA / Apollo 17 crew (`rover-wheel.jpg`)
- *Apollo 15 Lunar Rover final resting place* — NASA / Apollo 15 crew (`rover-parked.jpg`)
- *An Astronaut's Snapshot of the Moon* (Taurus–Littrow) — NASA / Apollo 17 crew (`no-map.jpg`)
- *Apollo 15: Hadley Rille edge from Station 9a* — NASA / Apollo 15 crew (`crater-wall.jpg`)
- *Apollo 17: Schmitt beside a boulder at Station 6* — NASA / Apollo 17 crew (`boulder.jpg`)
- *Earthrise as seen from the lunar surface* — NASA / Apollo 8 crew (`earth.jpg`)
- *Earthrise over Compton crater* — NASA / LRO (LROC) (`shadow-crater.jpg`)
- *Ridge and crater on a fractured lunar floor* — NASA / LRO (LROC) (`site-ridge.jpg`)
- *Sinuous rille in the south of Mons Rümker* — NASA / LRO (LROC) (`site-rille.jpg`)
- *Tycho central peak* — NASA / LRO (LROC) (`site-tycho.jpg`)

Libraries: [three.js](https://threejs.org/) r128 (MIT), [geotiff.js](https://geotiffjs.github.io/) 2.0.4 (MIT).

The temperature chart in the starter is generated in the page as an SVG data URI; it is not a photograph.

---

## Known limitations

- The 3D view needs WebGL. On a machine without it, use **Plan map**; the route task still works.
- The game's camera feed is a real-time three.js scene, not a photograph. It is designed to make slope, boulders, shadow and scale readable, not to simulate optics.
- Route scoring is a teaching model. It rewards gentle ground, fewer boulders and a sane detour ratio; it is not a flight-qualified trafficability analysis.
- localStorage progress is per browser and per device. Use **Reset** before handing the machine to another class.
