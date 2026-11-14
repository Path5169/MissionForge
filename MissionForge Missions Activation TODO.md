# MissionForge: Missions Activation TODO

## Phase 1: Multi-body physics (blocks every mission)

### 1A. Data

- [done] `bodies.json` and `solar.json`: add Sun, Jupiter, Europa
- [done] Add small bodies: Bennu, Dimorphos (and Didymos), Dinkinesh, Donaldjohanson, Eurybates, Polymele, Leucus, Orus, Patroclus-Menoetius
- [done] For each body: radius, mu, SOI radius, orbit elements (`a`, `e`, `meanLongitude`, `periapsisLongitude`), atmosphere data, surface colours, parent body
- [done] Verify Mars atmosphere values (needed for entry and parachutes) and Moon surface gravity

### 1B. Code

- [ done ] New `backend/simulation/soi.py`: SOI radius per body, parent-to-child and child-to-parent frame conversion using `ephemeris.py`, `check_handoff(session)`
- [ done ] Call `soi.check_handoff` from `flight_session.advance()`; update `bodyId`, `x`, `y`, `vx`, `vy`, `pad_position`
- [done ] Telemetry reports parent body, current body, time to SOI exit
- [done ] `orbit.py` and `ephemeris.solve_kepler`: support hyperbolic and escape trajectories (currently elliptic only)
- [done ] On-rails propagation for cruise segments, with warp limits near bodies and in atmosphere
- [ ] Gravity assist: verify an Earth, Mars and Jupiter-moon flyby changes heliocentric velocity correctly (comes free from SOI handoff, but needs a test)
- [ partial] Small-body proximity mode: tiny SOI plus rendezvous distance and relative speed (Bennu, Dimorphos, asteroids)

### 1C. Frontend

- [done] `solar.js` map: show the rocket's trajectory across SOI changes
- [done] `flightView.js`: body switching (Moon and Mars surface and sky, no-atmosphere sky, small body view)
- [done] Trajectory prediction with a simple maneuver preview (needed to make transfers playable)
- [done] HUD: current body, SOI indicator, closest approach to target

## Phase 2: Objectives and commands

Existing types: altitude, speed, orbit, soft\_landing, stages, event, reach\_body.

- [done] New type `flyby`: pass within a distance of a body
- [done] New type `impact`: hit a target body above a minimum speed (DART)
- [done] New type `rendezvous`: within distance and relative speed of a target for N seconds (Bennu)
- [done] New type `return_entry` or `land_on` with body: return to Earth and survive entry
- [done] Ordered objectives or phases: an objective only counts after the previous one is met (Apollo 11, Perseverance)
- [done] Orbit objective with body field and eccentricity or period target (Juno science orbit)
- [done] Counted events (Europa Clipper flybys, Juno perijoves)
- [done] New commands in `flight_command.py`: deploy payload, deploy parachute, jettison heat shield, collect sample, deploy lander or separate lander
- [done] Each command emits an event the `event` objective type can read
- [done] Mission phase progress shown live in the flight panel (`flight.js`)

## Phase 3: Parts, payloads and entry physics

Already present: parachutes, heat shields, landing legs, docking ports, capsules, solar panels, battery, wheels, RCS.

- [done] Verify parachute and heat shield behaviours actually work in the sim (`part_behaviors.py`): deploy conditions, drag, heat limits
- [done] Atmospheric entry heating model with heat shield protection (Mars entry, Earth return)
- [done] New part: rover payload (Perseverance)
- [done] New part: seismic instrument and heat-flow probe (InSight)
- [done] New part: sample collector and sealed return capsule (OSIRIS-REx)
- [done] New part: science instrument suites (Europa Clipper, Juno, Lucy)
- [done] New part: RTG or large outer-system solar array (Lucy, Juno, Europa Clipper)
- [done] Lander and ascent stage setup that separates cleanly (Apollo 11)
- [done] For each new part: `part.json`, `behavior.json`, art in `assets/parts`, entry in `registry.json`, `parts/index.json`, `payloads/catalogue.json`
- [done] `analysis.py`: detect each mission's `requiredCapabilities` from parts so the UI can show what is missing
- [done] One working preset vehicle per mission in `vehicles/presets.json`, set as `suggestedVehicle`

## Phase 4: Per-mission checklist

For every mission, "done" means: objectives written, preset vehicle built, `status` unlocked, flown start to finish at least once, rewards and best time saved.

### Apollo 11 (start: Earth pad)

- [done] Objectives: stages, Earth parking orbit (about 185 km), translunar transfer (reach Moon SOI), lunar orbit about 100 km, soft landing under 8 m/s, surface event, lunar ascent to orbit, return to Earth and survive entry
- [done] Needs: Phase 1, Phase 2 (ordered objectives), lander separation, Earth entry

### Perseverance (start: Mars, 25 km, 300 m/s)

- [done] Objectives: survive entry, deploy parachute, jettison heat shield, powered descent, soft landing, rover deploy event, survey event
- [done] Needs: entry heating, parachute behaviour, rover part

### InSight (start: Mars, 25 km, 300 m/s)

- [done] Objectives: entry, parachute, powered landing, deploy seismometer, deploy heat probe
- [done] Needs: same as Perseverance plus seismic payload part

### DART (start: Earth orbit 200 km)

- [done] Objectives: escape Earth, intercept Dimorphos, impact above a speed threshold
- [done] Needs: SOI, hyperbolic orbits, `impact` objective, trajectory preview

### OSIRIS-REx (start: Earth orbit 200 km)

- [done] Objectives: escape Earth, rendezvous Bennu, enter Bennu orbit, sample collection event, depart, return to Earth, capsule lands
- [done] Needs: small-body proximity, sample collector, return capsule, Earth entry

### Lucy (start: Earth orbit 200 km)

- [done] Objectives: heliocentric orbit, Earth gravity assist, flybys of Dinkinesh, Donaldjohanson, L4 targets, second Earth assist, L5 binary flyby
- [done] Needs: gravity assist, `flyby` objective, sequential objectives, outer-system power

### Juno (start: Earth orbit 200 km)

- [done] Objectives: Jupiter transfer, Earth flyby, Jupiter orbit insertion, science orbit, repeated perijove passes (2D version)
- [done] Needs: Jupiter body, gravity assist, counted events, Jupiter capture

### Europa Clipper (start: Earth orbit 200 km)

- [done] Objectives: Mars and Earth assists, Jupiter orbit insertion, tour using moon assists, Europa flybys (reduced count for playability), data return
- [done] Needs: everything Juno needs plus Europa as a body and instrument payloads

## Phase 5: Mission UI and progression    

- [done] Remove `status: "locked"`, `lockReason`, `capabilityGaps` as each mission goes live
- [ ] Unlock rule (all open, or a progression order) and how it is stored
- [ ] Verify `economy.js` budgets and rewards against real costs of the preset vehicles
- [ ] Mission briefing screen reads from `missionPhases` and shows live phase progress
- [ ] Completion screen: time, mass, cost, rewards, scientific data awarded
- [ ] Best-result saving and replay
- [ ] Failure handling and retry (crash, out of fuel, missed window)

## Phase 6: QA and polish

- [ ] One scripted or recorded successful run per mission, kept as a regression test
- [ ] Performance check with many separated bodies and long warps
- [ ] Visual check of every body: sky, ground, horizon, pad art on Earth only

- [ ] Error messages when a mission file or objective is invalid

## Suggested order

1. Phase 0 (all of it)
2. Phase 1A and 1B (`soi.py` first)
3. Phase 2 objective types and commands
4. Phase 3 verification of existing parts, then new parts
5. Missions in this order: Apollo 11, Perseverance, InSight, DART, OSIRIS-REx, Lucy, Juno, Europa Clipper
6. Phase 5 and 6 alongside each mission, not at the end
