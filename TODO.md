# TODO

- [done] Create `backend/simulation/flight_state.py`. It should hold the authoritative state for one active flight: vehicle parts, position, velocity, rotation, throttle, SAS, active stage, mission time, events and flight status.
- [done] Create `backend/simulation/flight_session.py`. It should create, look up, advance and close flight sessions. It should own the fixed simulation step and time-warp decisions. The browser must not advance the authoritative simulation itself.
- [done] Create `backend/simulation/flight_commands.py`. It should validate and apply player commands that already exist in the game: throttle, rotation, SAS, pause/time warp, stage activation and part activation. Do not add new controls unless the game design asks for them.
- [done] Extend `backend/simulation/dynamics.py` so the existing RK4 maths is used by the full flight simulation, not left as a standalone endpoint. Preserve the current game's gravity, thrust and drag behaviour.
- [done] Create `backend/simulation/engines.py`. Move across the existing engine rules: ignition, shutdown, restart limits, throttle response, thrust/pressure behaviour and propellant consumption.
- [ done ] Create `backend/simulation/resources.py`. Move across the existing connected-tank lookup, fuel draw and fuel-transfer rules. Keep the rules that exist today; do not invent a more advanced resource system in this migration.
- [done] Create `backend/simulation/altitude.py`. Move across the existing rotation, angular response and SAS modes.
- [done] Create `backend/simulation/staging.py`. Move across the current stage order, stage activation, jettison and payload-release behaviour.
- [done] Create `backend/simulation/separation.py`. Move across the separation behaviour that the current game already supports, including the current loose-part/free-body handling. A full general-purpose joint solver is a separate feature and is not present today.
- [done  ] Create `backend/simulation/landing.py`. Move across the current landing, impact and crash checks. Do not claim wheel-ground or detailed contact physics until those are actually implemented.
- [done] Create `backend/simulation/telemetry.py`. Return the flight values the existing cockpit and map need, calculated from the authoritative backend state.
- [ done ] Send `detachedObjects` and `pressureRatio` in `telemetry.render_state` so jettisoned stages show up in the flight view.
- [done] Create `backend/simulation/objectives.py`. Move the existing mission objective checks here so0 mission completion/failure is decided by the server.
- [ ] Add endpoints to the existing API for starting a flight, sending commands, advancing/reading a flight snapshot and ending a flight. Keep the exact API contract documented and tested. (endpoints exist, docs and tests are missing)

### Orbital and planet calculations

- [ done ] Connect the existing `backend/simulation/orbit.py` implementation to the live map and menu scene. The browser should draw the returned/cached orbit data; it should not calculate orbital elements or propagate the orbit. (menu scene done, live map still has no orbit data in the snapshot)
- [done] Connect the existing `backend/simulation/ephemeris.py` implementation to the live solar-system screen. Return or cache body positions and orbit paths at sensible update intervals; do not make a network request for every rendered frame.

# iske niche wala mai kar lunga 

- [ done ] Remove the old JavaScript callers/imports only after their Python replacements are connected and verified.

### Vehicle construction and part behaviour

- [ done ] Create `backend/vehicle/attachments.py`. Move the existing part compatibility and connection-validation rules out of `frontend/js/vehicle/vehicle.js`. Keep mouse picking, snap previews and drawing geometry in JavaScript because those are interaction/display tasks. (written and endpoints exist, but the workshop still uses the JS rules)
- [done] Create `backend/vehicle/part_state.py`. Move the existing part state defaults and supported commands from the removed `behaviors.js` into Python.
- [done] Create `backend/vehicle/part_behaviors.py`. Move the existing per-tick behaviour rules for deployables, parachutes, solar panels and landing parts into Python. Only implement behaviours that are represented in the current part definitions/code.
- [done] Keep `frontend/js/vehicle/stats.js` as a small API adapter if it only sends the blueprint to Python and displays the returned stats. Do not put the actual calculations back into that file.
- [ done ] Keep `frontend/js/vehicle/vehicle.js` and `frontend/js/vehicle/attach.js` for now: they also contain workshop editing, layout and pointer/snap geometry. Move their authoritative compatibility and topology decisions to Python before removing or splitting those mixed-purpose files.


## extra stuff which i kinda want to implement 

- [ ] Persistent backend flight sessions across server restarts, if that is required by the final game design.
- [ ] Full multi-part rigid-body simulation with each assembly's inertia and angular momentum.
- [ ] A general-purpose joint/constraint solver.
- [ ] A fully general momentum-conserving separation solver for arbitrary assembly graphs.
- [ ] Electrical generation, batteries, power distribution and electrical loads as a complete simulation.
- [ ] A generalized action-group system for every part type.
- [ ] Full RCS force/torque allocation, detailed wheel-ground contact and robust parachute physics.
- [ ] General 3D physics. The current game is presented in 2.5D and its current orbital model is planar; do not describe it as a full 3D simulation.