# MissionForge — NASA Space Apps CH-13 Development Roadmap

**Target challenge:** CH-13 — *Space Mission Design Game* (NASA Space Apps Challenge 2026)  
**Roadmap status:** Proposed, based on the supplied MissionForge project snapshot and the published challenge description.  
**Implementation status:** Planning only. This document does not authorize code changes.

---

## 1. Product direction

MissionForge should evolve from a rocket construction and flight simulator into an **end-to-end space mission design game**.

The player should not merely build a rocket and fly it. The player should define a science goal, translate it into mission requirements, choose a spacecraft and payload, fit the mission within constraints, select a launch and orbit plan, execute the mission, manage operations, and learn from the outcome.

The rocket builder and existing flight simulation remain central differentiators. They become one connected part of the wider mission-design loop rather than the whole game.

### Challenge alignment

The published CH-13 description emphasizes an interactive game in which players design, manage and simulate a complete mission, make engineering decisions, manage limited resources, and evaluate how decisions affect mission success. It specifically identifies mission objectives, spacecraft design, scientific instruments, launch vehicles, budget, power, mass, communications, orbital constraints and mission lifetime as relevant trade-offs.

This roadmap therefore prioritizes **visible, coupled engineering trade-offs** over adding many destinations or decorative features.

### Design principles

1. Every major choice should change at least one measurable mission outcome.
2. Show trade-offs before launch, not only in a post-flight score.
3. Use simple explanations so a new player understands why a decision matters.
4. Prefer a short, complete, replayable mission over a large catalogue of locked missions.
5. Preserve the current Python + HTML/CSS/JavaScript architecture and current 2.5D/planar flight model unless a proven blocker requires a change.
6. Clearly label simplified models; do not present a gameplay approximation as flight-certified engineering.
7. Use real NASA/space-agency facts or datasets only where their provenance and relationship to the gameplay are clear. The challenge description encourages educational explanations; it does not make every possible data integration mandatory.

---

## 2. What the supplied project already gives us

Based on the supplied source snapshot and the accompanying audit documents:

| Existing foundation | Current assessment | Roadmap treatment |
|---|---|---|
| Python backend and browser frontend | Existing architecture | Preserve; do not rewrite without evidence |
| Rocket workshop, parts and vehicle analysis | Substantial foundation; starter blueprint/staging issues identified in audit | Fix and reuse |
| Engine, fuel, staging and flight-session systems | Implemented in part; integration and regression gaps remain | Verify before extending |
| RK4/planar flight and orbital calculations | Existing simulation foundation | Reuse for a clearly scoped first mission |
| Flight telemetry and HUD | Existing foundation; browser usability still needs hands-on testing | Connect to mission decisions and improve clarity |
| Objective evaluator | Backend evaluator exists, but supplied mission records have empty objective arrays | Make it authoritative and feed it real mission objectives |
| Mission catalogue and progress record | UI/data exist; all supplied missions are locked and reward/unlock loop is incomplete | Replace first-play experience with a small playable scenario set |
| Planetary rendering / Three.js presentation | Existing visual foundation | Reuse where it supports the chosen mission |
| Power and communications gameplay | Not established as complete systems in the supplied audit | Add only a minimal, explicit mission-level model if selected for MVP |
| Mission instruments and science-value trade-offs | Not established as a complete connected gameplay loop | Add a small data-driven instrument model |
| Cooperative multiplayer | Not established | Optional; do not make a hackathon blocker |

**Important:** A component, UI panel or part definition is not proof that the full gameplay system works. Re-test each integration in the running application before changing its status.

---

## 3. Recommended first demonstrable mission

### Mission: Earth Observation CubeSat

Use one original, compact Earth-observation mission as the first complete scenario. It naturally demonstrates mission objectives, instrument selection, spacecraft mass, power demand, data generation, communications, launch capacity, orbit choice, budget and mission operations without requiring Mars transfers or lunar landing physics.

**Player brief:** Design and fly a small satellite that must collect a defined amount of useful Earth-observation data and transmit it to a ground station within a limited mission budget and lifetime.

**Suggested player decisions:**

- Select one science objective and a target observation goal.
- Choose between a small set of instruments with different mass, cost, power draw, data generation and science value.
- Choose a spacecraft bus / power option with a finite power budget.
- Select a launch vehicle and orbit option compatible with spacecraft mass and mission needs.
- Build or configure the launch vehicle using the existing workshop.
- Launch and achieve the selected orbit using the existing flight model.
- Run a simplified operations segment: instrument on/off, energy budget, data accumulation, contact window and data downlink.
- Review science return, budget use, mission lifetime and failure causes.

**Scope warning:** The current audit does not establish that power generation/storage, communications windows, data buffering or instrument operations are implemented. These should be represented as a small deterministic mission-operations model for the first release, not as a full electrical or radio-frequency simulator.

**Why this is the recommended first mission:** it exposes the challenge's integrated trade-offs while avoiding the large physics scope of interplanetary transfers, atmospheric entry, lunar landing and rover control. If the team has a stronger existing mission scenario that can be completed sooner, retain it only if it demonstrates the same cross-system trade-offs.

---

## 4. Six-phase roadmap

## Phase 1 — Stabilize the existing playable foundation

**Goal:** establish a reliable rocket-to-orbit path that can support a mission game.

**Priority:** Critical.  
**Dependencies:** None.

### Required work

1. Add automated tests for vehicle analysis, attachment rules, engine operation, connected fuel draw, staging, flight commands, RK4 dynamics, snapshots and objective evaluation.
2. Fix one curated starter rocket so engines, tanks and stage assignments form a valid operational vehicle.
3. Separate structural validity from operational launch readiness; explain blocking issues in player-facing language.
4. Prove fuel consumption and engine cutoff in a real flight session.
5. Verify throttle, attitude/SAS, staging, pause and time-warp behavior in a real browser playthrough.
6. Connect backend orbital elements/path data to the live flight map; avoid relying on a placeholder orbit implementation.
7. Define a stable mission/flight API contract and meaningful error responses.

### Exit criteria

A new player can select the known-good vehicle, understand its readiness checks, launch it, control a burn, consume fuel, stage correctly and receive trustworthy telemetry. A repeatable automated test covers the critical path.

---

## Phase 2 — Build the mission-design layer

**Goal:** make the player design a mission before building or launching the rocket.

**Priority:** Critical for CH-13 alignment.  
**Dependencies:** Phase 1's validated vehicle and simulation baseline.

### Required work

1. Add a mission brief that defines the science objective, success conditions, constraints and mission lifetime.
2. Add a small, data-driven instrument catalogue. Each instrument should define at minimum mass, cost, power draw, data generation and science contribution.
3. Add a spacecraft/payload configuration summary that aggregates mass, cost, power demand and expected data volume.
4. Add a mission budget with clear spending categories and a visible remaining balance.
5. Add a pre-flight compatibility validator for payload mass, launch vehicle capacity, selected orbit and mission requirements.
6. Show consequences immediately when the player changes an instrument, bus, orbit or launch vehicle.
7. Explain the trade-off in plain language (for example: more capable instrument → more science value, but greater mass, cost, power demand and data volume).
8. Use a single mission definition as the source of truth for briefing, editor constraints, flight objectives and results.

### Exit criteria

Two or more different configurations can pursue the same objective, and the game visibly explains why their cost, capability, risk or feasibility differs. An invalid configuration is blocked with a useful explanation before launch.

---

## Phase 3 — Add mission resources and spacecraft operations

**Goal:** turn mass, budget, power, data, communications and time into meaningful connected constraints.

**Priority:** Critical for the full challenge concept; keep the model deliberately small.  
**Dependencies:** Phase 2's mission and spacecraft configuration data.

### Required work

1. Implement a transparent mission resource model for the chosen scenario: budget, mass, available power/energy, data generated/stored, downlink capacity and mission time.
2. Define a minimal power model: generation or available energy, storage, load draw and low-power consequences. Do not build a detailed electrical network.
3. Define a minimal communications model: contact windows or simplified scheduled contacts, link capacity/data rate and a consequence for missed or insufficient downlink.
4. Connect instrument operation to power consumption and data generation.
5. Connect data downlink to communications availability and mission science return.
6. Add operational decisions such as instrument duty cycle, observation priority and downlink scheduling.
7. Add clear warnings before resource exhaustion and explain the resulting mission impact.
8. Test resource conservation and deterministic mission progression.

### Exit criteria

At least two mission configurations have different operational trade-offs. The player can make an operational decision that changes collected science, available energy, data backlog, communications success or mission lifetime. Resource use is visible and testable.

---

## Phase 4 — Connect launch, orbit and mission execution

**Goal:** make the rocket flight a meaningful part of the complete mission, not a separate sandbox activity.

**Priority:** Critical.  
**Dependencies:** Phases 1–3.

### Required work

1. Connect the mission design configuration to the actual vehicle selected in the workshop.
2. Validate payload mass and target-orbit requirements against the launch vehicle's capabilities.
3. Use the existing flight simulation for launch and orbit insertion; keep the first mission within the orbital mechanics that are actually implemented and verified.
4. On successful orbit insertion, transition into the simplified spacecraft-operations phase.
5. On launch or orbit failure, preserve the cause and show how the design or flight decisions contributed.
6. Evaluate mission objectives on the authoritative backend, not from client-only UI state.
7. Implement a complete end-to-end success/failure state and save the mission result.
8. Ensure replay returns the player to a meaningful design decision, not just a reset button.

### Exit criteria

A player can go from mission brief → spacecraft/instrument design → budget and feasibility checks → rocket configuration → launch → orbit → operations → objective evaluation → results, with the same mission data carried through every stage.

---

## Phase 5 — Add scoring, learning and replayable progression

**Goal:** make the game educational, motivating and replayable.

**Priority:** High.  
**Dependencies:** Phase 4's end-to-end mission completion.

### Required work

1. Create a transparent scorecard for objective achievement, science return, budget efficiency, resource management, communications success and mission lifetime.
2. Explain each score component and show the causal chain behind failures or underperformance.
3. Provide a post-mission report with planned-versus-actual values and engineering lessons.
4. Add a small progression path with one follow-up mission or a meaningful new design capability.
5. Define replay rules and prevent duplicate rewards from repeated submissions.
6. Add short contextual explanations for orbit, mass, power, data rate, communications and instrument trade-offs.
7. Allow saving and comparing mission configurations if this is low-risk within the existing persistence model.
8. Add a second mission scenario only if it reuses the same validated systems and introduces a distinct decision challenge.

### Exit criteria

Players can understand not only whether they succeeded, but why. Replaying with a changed design can produce a measurably different result. Progress is persistent and server-validated.

---

## Phase 6 — Competition readiness, polish and optional collaboration

**Goal:** deliver a stable, understandable and compelling demonstration of the CH-13 concept.

**Priority:** High for delivery; optional features remain optional.  
**Dependencies:** Phases 1–5 for the complete version; a narrower vertical slice can be presented if time is constrained.

### Required work

1. Run a clean-start browser test from the perspective of a first-time player.
2. Test the full demonstration path at the target screen size and on at least one alternate viewport.
3. Add concise onboarding and contextual help; make controls discoverable.
4. Improve launch and mission-result feedback, HUD hierarchy, camera transitions and restrained audio/visual effects.
5. Profile startup time, rendering, asset loading and repeated simulation updates.
6. Handle invalid designs, interrupted sessions, corrupt saves and backend errors gracefully.
7. Prepare a short demonstration script that shows a design trade-off, a live simulation decision and a post-mission explanation.
8. Document assumptions, simplified physics, formulas, data provenance and known limitations.
9. Add collaboration for up to four players only if the core single-player loop is already stable and the team has time. Potential roles include mission planning, spacecraft engineering, science and operations; shared state and conflict handling would need their own tests.
10. Add leaderboard, random events, sandbox expansion or competitive modes only after the required experience is reliable.

### Exit criteria

A first-time viewer can understand the goal, make a consequential design choice, see it affect the simulation and understand the final result in a short demonstration. No critical errors occur during repeated clean runs.

---

## 5. Challenge requirement-to-feature traceability

| CH-13 theme | MissionForge feature | Current state from supplied audit | Required roadmap phase |
|---|---|---|---|
| Define mission objectives | Mission brief and objective definitions | Objective evaluator exists; supplied mission arrays are empty | 2, 4 |
| Spacecraft design | Bus, payload and instrument configuration | Rocket/vehicle workshop exists; full spacecraft mission configuration not established | 2 |
| Scientific instruments | Instrument catalogue with mass, cost, power, data and science value | Not established as a connected gameplay system | 2, 3 |
| Launch vehicle | Existing rocket editor and vehicle analysis | Substantial foundation; starter/staging defects identified | 1, 4 |
| Budget | Mission budget and cost trade-offs | Cost data/presentation exists in part; mission-wide budget loop not established | 2, 5 |
| Mass | Payload + spacecraft + launch capability checks | Vehicle mass analysis exists; full mission compatibility needs connection | 1, 2, 4 |
| Power | Simplified generation/storage/load model | Not established as a complete system | 3 |
| Communications | Contact/downlink capacity and data delivery | Not established as a complete system | 3 |
| Orbital constraints | Orbit selection, feasibility and insertion | Planar orbital/flight foundation exists; end-to-end mission connection incomplete | 1, 2, 4 |
| Mission lifetime/time | Operations timeline and resource consequences | Not established as a connected mission resource | 3 |
| Evaluate mission success | Authoritative objective evaluation and report | Backend evaluator exists; supplied mission definitions are not playable | 4, 5 |
| Learn from decisions | Contextual explanations and post-mission report | Not established as a complete learning loop | 5 |
| Replay / alternate designs | Save, compare and rerun configurations | Partial progress persistence; full compare/replay loop not established | 5 |
| Team collaboration up to four | Shared mission state and roles | Not implemented in supplied audit; challenge presents it as a possible approach | 6 optional |

---

## 6. Hackathon MVP: what to build first

If time is limited, do **not** attempt all six phases. Deliver this vertical slice:

1. One Earth-observation mission with a clear science goal.
2. Three or four instruments with distinct mass, cost, power, data and science-value trade-offs.
3. A spacecraft/payload summary and mission budget.
4. A launch vehicle compatibility check using the existing rocket analysis.
5. One target orbit supported by the current verified simulation.
6. A working launch and orbit-insertion sequence.
7. A short operations segment with simplified power, data and downlink constraints.
8. A mission scorecard and plain-language post-mission report.
9. A clean, repeatable three-minute demonstration.

**MVP rule:** every feature shown in the demo must be functional. It is better to have one instrument's power and data consequences genuinely connected than to show a large but decorative subsystem dashboard.

### Must-have vs. optional

**Must-have for the strongest focused submission:**
- Complete mission design-to-result loop.
- At least several coupled engineering trade-offs.
- Budget and mass constraints.
- Real rocket/flight simulation contribution.
- Mission objective evaluation and explainable results.
- Clear onboarding and educational explanations.
- Honest assumptions and repeatable tests.

**Optional if time permits:**
- Cooperative multiplayer for up to four players.
- Multiple difficulty levels.
- Random events.
- Leaderboards.
- Multiple mission scenarios.
- Shareable mission designs.
- Expanded sandbox.
- Detailed power-electronics or RF communications simulation.
- Interplanetary transfers, lunar landing, Mars entry, rover exploration.

---

## 7. Development order and dependency map

```text
Phase 1: Reliable rocket + verified orbit path
                  |
                  v
Phase 2: Mission brief + spacecraft/instrument design + budget
                  |
                  v
Phase 3: Power + data + communications + mission time model
                  |
                  v
Phase 4: Connect design -> launch -> orbit -> operations -> result
                  |
                  v
Phase 5: Scoring + explanations + report + replay/progression
                  |
                  v
Phase 6: Demo readiness + polish + optional collaboration
```

Phases 2 and 3 can be prototyped in parallel only after the mission data contract is agreed. Phase 4 integrates them. Do not expand content before Phase 4 is complete.

---

## 8. What to postpone

- Full Apollo/Mars/asteroid/Jupiter historical mission recreation.
- Interplanetary transfer and sphere-of-influence mechanics unless they are essential to a selected MVP scenario.
- Full 3D rigid-body vehicle physics or a new game engine.
- Rover and surface exploration systems.
- Thermal simulation and detailed electrical circuit simulation.
- Detailed RF link budgets and real-time ground-station network simulation; use an explainable simplified communications model first.
- Multiplayer infrastructure, accounts, matchmaking and live collaboration until single-player is stable.
- Large component catalogues, elaborate cutscenes and cosmetic progression.
- Persistent active-flight recovery across server restarts unless the chosen mission duration requires it.

---

## 9. Acceptance checklist for the CH-13 demonstration

- [ ] The player starts with a mission objective, not an unexplained sandbox.
- [ ] The player can choose instruments or payload options with visible trade-offs.
- [ ] Mass and budget totals update correctly.
- [ ] Power and data consequences are visible and connected to instrument operation.
- [ ] Communications/downlink affects the amount of science successfully returned.
- [ ] The selected launch vehicle can carry the configured payload to the chosen supported orbit.
- [ ] The rocket can be launched and controlled in the browser.
- [ ] The mission evaluator checks the actual objective and operational outcome.
- [ ] Success and failure reports explain why the result occurred.
- [ ] A changed design can be replayed and produce a meaningfully different outcome.
- [ ] A first-time player can complete the demonstration with minimal coaching.
- [ ] All displayed capabilities are implemented; approximations are labelled.
- [ ] Tests cover the critical mission path and a clean demo run has been repeated.

---

## 10. Decisions to confirm before implementation

1. **First scenario:** Is Earth-observation CubeSat the preferred MVP, or is there an existing mission that can demonstrate more of the challenge with less new work?
2. **Power model:** Is a simple energy budget sufficient for the first release (recommended), or is more detail genuinely needed?
3. **Communications model:** Are scheduled ground-station contacts and a data-rate cap sufficient (recommended)?
4. **Science scoring:** Should science return be a fixed objective threshold, a weighted score, or both?
5. **Multiplayer:** Is single-player acceptable for the first submission? The challenge allows individual play and describes collaboration as a possible feature, not a mandatory dependency.
6. **Data sources:** Which NASA/space-agency references or datasets will be used, and how will the game show source/provenance in context?
7. **Physics disclosure:** Which parts of the simulation are physically modelled and which are simplified gameplay abstractions?

---

## 11. Sources and scope note

- NASA Space Apps Challenge 2026, CH-13 *Space Mission Design Game*: https://www.spaceappschallenge.org/ (select the 2026 challenge catalogue and CH-13).
- Challenge description and detailed considerations mirrored by HackAthlone 2026: https://hackathlone.com/challenges/space-mission-design-game

The challenge page is the source of truth for competition requirements. This roadmap is a product and engineering interpretation of that brief, tailored to the supplied MissionForge source snapshot and prior audit findings. It is not an official NASA specification.
