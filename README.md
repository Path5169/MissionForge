# 🚀 MissionForge

> **An End-to-End Space Mission Design & Aerospace Flight Simulation Game**  
> *Developed for the NASA Space Apps Challenge (CH-13: Space Mission Design Game)*

---

## 🌌 Overview

**MissionForge** is a realistic, browser-based space mission design game and aerospace flight simulator. Rather than simply building a rocket and launching it into a skybox, MissionForge challenges you to lead a complete spaceflight campaign from the drawing board to deep space:

1. **Define the Science Goal:** Select real NASA-inspired mission programs with sequential phases, strict operational constraints, and finite budgets.
2. **Engineer the Spacecraft:** Design satellites, rovers, planetary landers, and scientific instrument suites in the **Payload Workshop**.
3. **Construct the Launch Vehicle:** Assemble multi-stage boosters in the **Vehicle Assembly Building (VAB)**, balancing structural mass, engine efficiency ($I_{\text{sp}}$), thrust-to-weight ratios ($\text{TWR}$), and stage $\Delta v$.
4. **Fly the Trajectory:** Take the helm on the launchpad with a real-time **Runge-Kutta 4th-Order (RK4)** numerical flight physics engine featuring patched-conic **Spheres of Influence (SOI)** across 17 celestial bodies, atmospheric aerodynamic drag, re-entry aerothermal heating, and SAS autopilot guidance.
5. **Conduct Surface & Science Operations:** Deploy rovers on Mars, drill delta core samples, deploy seismometers, gather asteroid regolith, impact hazardous near-Earth asteroids, and slingshot through the outer solar system.

---

## 🎮 Core Game Systems

### 🛠️ 1. Vehicle Assembly Building (Workshop)
* **Modular Snap-Together Construction:** 97+ parts categorized across 14 component families: Command Capsules, Probe Cores, Propellant Tanks, Booster & Sustainer Engines, Stack & Radial Decouplers, Payload Fairings, Aerodynamic Fins & Fairing Nosecones, Landing Gear, Solar Arrays, RCS Thrusters, and Rovers.
* **Live Aerodynamic & Mass Analysis:** Immediate calculations for Dry Mass, Wet Mass, Center of Mass ($\text{CoM}$), Sea-Level & Vacuum $\text{TWR}$, and Stage-by-Stage Delta-V ($\Delta v$) based on the Tsiolkovsky Rocket Equation:
  $$\Delta v = I_{\text{sp}} \cdot g_0 \cdot \ln\left(\frac{m_0}{m_f}\right)$$
* **Staging Sequencer:** Configure automated and manual staging sequences, engine ignitions, booster releases, and payload shrouds.
* **Budget Tracking:** Live cost validation comparing vehicle production costs against mission construction allocations.

### 🛰️ 2. Payload Workshop
* Configure specialized exploration payloads: Earth Observation Satellites, Lunar Excursion Modules, Mars Sample Rovers, Planetary Seismometers, Asteroid Harvesters, and Magnetometer/Radar Booms.
* Manage spacecraft bus dry mass, solar generation vs. RTG power budgets, and instrument telemetry data yields.

### 🪐 3. High-Fidelity Astrodynamics & Physics Engine
* **RK4 Planar Dynamics:** Sub-millisecond numerical integration of gravitational acceleration, rocket thrust, and dynamic aerodynamic pressure ($q = \frac{1}{2}\rho v^2$).
* **17 Celestial Bodies:** Complete solar system database with accurate radii, standard gravitational parameters ($\mu$), rotation periods, atmospheric scale heights, and surface pressures:
  * **Stars & Gas Giants:** Sun, Jupiter.
  * **Terrestrial Worlds:** Earth, Moon, Mars, Europa.
  * **Asteroids & Trojans:** Bennu, Didymos & Dimorphos, Dinkinesh, Donaldjohanson, Eurybates, Polymele, Leucus, Orus, Patroclus & Menoetius.
* **Patched-Conics Multi-Body Transitions:** Seamless Sphere of Influence ($\text{SOI}$) handoffs between planetary and heliocentric reference frames.
* **Atmospheric Entry & Thermodynamics:** Shock layer heating, ablative heat shield thermal degradation, supersonic drag, parachute deployment dynamics, and terminal descent.
* **Staging Separation & Debris Physics:** Ejection impulse, spring separation forces, booster recoil, and detached debris trajectory propagation.

### 🎛️ 4. Cockpit Flight HUD & Navigation
* **Live Telemetry:** Altitude, Surface & Orbital Speed, Vertical Velocity ($v_r$), Predicted Apoapsis ($r_a$), Predicted Periapsis ($r_p$), Time-to-Apsis, Skin Temperature, Dynamic Pressure, Propellant Reserves, and Stage $\Delta v$.
* **Attitude Control & SAS Autopilot:** Multi-mode automated stability system:
  * `HOLD`: Stabilizes current attitude angle.
  * `PROGRADE`: Tracks velocity vector for orbital acceleration.
  * `RETROGRADE`: Points directly against velocity vector for de-orbit and landing burns.
  * `RADIAL`: Points perpendicular to orbit for eccentricity shaping.
* **Physical & Rails Time Warp:** Accelerate long interplanetary cruises up to $100\times$, with automatic safety interlocks preventing high warp during engine burns or inside dense atmospheres.

---

## 🗺️ Playable Space Program Missions

MissionForge features 9 fully realized NASA-inspired mission programs with sequential phases, custom payloads, pre-engineered vehicles, and performance-based reward budgets:

| Mission | Target Destination | Suggested Vehicle | Key Mission Phases & Objectives |
| :--- | :--- | :--- | :--- |
| **01. TerraWatch-1** | Low Earth Orbit ($250\text{ km}$) | `TerraWatch-1 (EOS Light Launcher)` | Liftoff $\to$ Booster Staging $\to$ Low Earth Orbit Insertion ($160\text{–}350\text{ km}$) $\to$ Payload Deployment |
| **02. Apollo 11** | Sea of Tranquility, Moon | `Apollo 11 (Saturn V)` | Earth Parking Orbit $\to$ TLI Burn $\to$ Lunar Capture $\to$ LM Separation $\to$ Lunar Landing ($<8\text{ m/s}$) $\to$ EASEP Experiments $\to$ Earth Return Entry |
| **03. Mars 2020 (Perseverance)** | Jezero Crater, Mars | `Perseverance (Atlas V 541)` | Atmospheric Entry $\to$ Supersonic Chute $\to$ Heat Shield Jettison $\to$ Skycrane Powered Touchdown ($<6\text{ m/s}$) $\to$ Rover Deployment $\to$ Delta Core Sampling |
| **04. OSIRIS-REx** | 101955 Bennu (Near-Earth Asteroid) | `OSIRIS-REx Explorer` | Earth Escape $\to$ Bennu Rendezvous $\to$ Nightingale TAGSAM Sample Collection $\to$ Sample Return Capsule Earth Touchdown |
| **05. DART** | Dimorphos (Didymos System) | `DART Kinetic Impactor` | Earth Escape Departure $\to$ Asteroid Intercept $\to$ High-Speed Kinetic Impact ($>1,000\text{ m/s}$) |
| **06. Europa Clipper** | Europa (Jovian Moon) | `Europa Clipper Heavy` | Mars/Earth Gravity Assists $\to$ Jupiter Orbit Insertion (JOI) $\to$ Sub-200 km Europa Flyby $\to$ REASON Ice-Penetrating Radar Survey |
| **07. Lucy** | Trojan Asteroids ($L_4 / L_5$ Swarms) | `Lucy Trojan Probe` | Trans-Asteroid Injection $\to$ Dinkinesh Flyby $\to$ Donaldjohanson Flyby $\to$ Eurybates Flyby $\to$ Science Survey Data Return |
| **08. Juno** | Jupiter (Polar Orbit) | `Juno Jupiter Orbiter` | Earth Departure $\to$ Jupiter SOI Arrival $\to$ Jupiter Orbit Insertion $\to$ Close Perijove Radiation Pass $\to$ Magnetosphere Survey |
| **09. InSight** | Elysium Planitia, Mars | `InSight Lander Stack` | Mars Atmospheric Entry $\to$ Terminal Parachute $\to$ Heat Shield Jettison $\to$ Terminal Thruster Soft Landing ($<5\text{ m/s}$) $\to$ SEIS Seismometer $\to$ $\text{HP}^3$ Heat Probe |

---

## 🕹️ Flight Controls & Keybindings

| Control Action | Keybinding | Description |
| :--- | :--- | :--- |
| **Throttle Up** | <kbd>Shift</kbd> or <kbd>W</kbd> | Increase engine throttle incrementally |
| **Throttle Down** | <kbd>Ctrl</kbd> or <kbd>S</kbd> | Decrease engine throttle incrementally |
| **Full Throttle (100%)** | <kbd>Z</kbd> | Instantly set throttle to maximum thrust |
| **Cut Engine (0%)** | <kbd>X</kbd> | Instantly cut engine thrust to zero |
| **Steer Left (Pitch West)** | <kbd>A</kbd> / <kbd>←</kbd> | Rotate vehicle counter-clockwise |
| **Steer Right (Pitch East)** | <kbd>D</kbd> / <kbd>→</kbd> | Rotate vehicle clockwise (gravity turn downrange) |
| **Cycle Stage** | <kbd>Space</kbd> | Ignite next stage / trigger decouplers |
| **SAS Prograde** | <kbd>T</kbd> | Lock guidance to velocity direction ($\mathbf{v}$) |
| **SAS Retrograde** | <kbd>G</kbd> | Lock guidance against velocity direction ($-\mathbf{v}$) |
| **SAS Radial Out** | <kbd>R</kbd> | Lock guidance perpendicular to trajectory |
| **SAS Hold** | <kbd>H</kbd> | Freeze current orientation |
| **Deploy Payload** | <kbd>P</kbd> | Separate and activate deployed satellite/rover |
| **Map / Solar View** | <kbd>M</kbd> | Toggle orbital map and trajectory predictor |
| **Time Warp Faster** | <kbd>.</kbd> | Increase time acceleration ($1\times \to 2\times \to 5\times \to 10\times \to 50\times \to 100\times$) |
| **Time Warp Slower** | <kbd>,</kbd> | Decrease time acceleration down to $1\times$ real-time |
| **Pause Flight** | <kbd>Esc</kbd> | Pause/Resume flight simulation |
| **Autonomous Guidance (Demo)** | <kbd>Shift</kbd> + <kbd>A</kbd> or <kbd>U</kbd> | Engages autonomous flight sequencer for hands-free video recording |
| **Instant Complete (Demo)** | <kbd>Shift</kbd> + <kbd>C</kbd> | Instantly completes Mission 01 with certified pass criteria & rewards |

---

## 🎬 Screen Recording & Demonstration Mode (Scripted Mission 01)

To assist creators, reviewers, and video producers in capturing smooth, cinematic gameplay recordings and trailers for MissionForge without flight aborts or manual piloting mistakes, **Mission 01 (`TerraWatch-1 · Earth Observation Satellite`)** features a **Scripted Demonstration Mode** that can be operated in real-time or triggered instantly.

> [!NOTE]  
> The in-game User Interface remains completely clean, authentic, and free of any "scripted", "cheat", or debug watermarks during recordings. The cockpit HUD displays standard avionics telemetry and the `SAS AUTO` flight computer indicator.

### 🎥 Option A: Autonomous Flight Demonstration (Live Ascent for Video)
In this mode, the on-board flight computer autonomously flies the rocket through all 4 mission phases live on camera:
1. **Pad Ignition & Liftoff:** Performs terminal countdown, ignites the Stage 1 main booster at $T - 1.8\text{ s}$, releases hold-down clamps at $T = 0$, and climbs vertically out of the pad.
2. **Gravity Turn:** Smoothly pitches the nose over downrange ($0^\circ \to 90^\circ$ east) as altitude rises past $1,500\text{ m}$.
3. **Fairing Jettison:** Automatically ejects payload fairing halves at $70\text{ km}$ above the dense atmosphere.
4. **Booster Staging:** Senses Stage 1 fuel depletion, decouples the booster stack, and ignites the vacuum sustainer engine.
5. **Orbital Circularization:** Enters stable Low Earth Orbit ($200\text{ km}$ circular, $e < 0.005$) and cuts engine throttle.
6. **Payload Deployment:** Safely separates the TerraWatch-1 Earth Observation satellite, passes all 5 criteria, awards maximum financial bonuses ($+\$11,500,000$), registers scientific data, and unlocks the Rover program qualifications!

#### How to Run:
* **One-Click Batch Launcher:** Double-click `record_mission1.bat` in the project root.
* **Direct Python Launcher:** Run `python scripts/record_first_mission.py` from your terminal.
* **Direct Web Browser URL:** Open `http://127.0.0.1:8000/?autoplay=1` in your browser.
* **In-Flight Keybinding:** In any Mission 01 flight, press <kbd>Shift</kbd> + <kbd>A</kbd> (or <kbd>U</kbd>) to toggle autonomous guidance.
* **Time Acceleration:** Press <kbd>.</kbd> to warp time ($2\times \to 4\times$) during the recording to complete the flight in seconds.

---

### ⚡ Option B: Instant Mission Completion
If your recording needs to demonstrate the mission victory screen, financial reward breakdown, science cataloging, and technology unlocks immediately:
* In flight view, press <kbd>Shift</kbd> + <kbd>C</kbd>.
* The rocket is instantaneously inserted into a verified $200\text{ km}$ circular orbit, stages are decoupled, and the payload is deployed cleanly forward.
* A 6-second cinematic celebration window opens with the **★ MISSION ACCOMPLISHED ★** banner while the satellite unrolls its golden solar arrays and high-gain Cassegrain antenna.
* Press <kbd>Space</kbd> or click the banner at any point to jump straight into the debrief modal with full sound effects and certified pass criteria.

---

## 🧑‍🚀 Pilot's Guide: How to Achieve Orbit (The Gravity Turn)

A common rookie mistake is launching straight up. In orbital mechanics, **height alone does not keep you in space**. Orbit is about achieving enough **horizontal velocity** ($\approx 7,800\text{ m/s}$ at Earth LEO) that as gravity pulls your rocket down, the planet curves away beneath you at the exact same rate.

```
       Altitude (km)
          ▲
          │                          * * * * *  (Apoapsis ~200 km)
   200 km ┼ - - - - - - - - - - - - *          *  <--- Coast to Apoapsis &
          │                        *              Burn Prograde to Circularize
   100 km ┼ - - - - - - - - - - - *
          │                      *
    60 km ┼                     *   <--- Pitch 60°-70° (Atmosphere exit)
          │                   *
    25 km ┼                 *       <--- Pitch 45°
          │               *
     3 km ┼              *          <--- Pitch Kick (Nudge D ~10°-15° East)
      PAD ┼─────────────*────────────────────────────────────────► Horizontal Speed
```

1. **Liftoff ($0 \to 3\text{ km}$):** Launch vertically at 100% throttle (<kbd>Z</kbd>).
2. **Pitch Kick ($3\text{–}5\text{ km}$):** When speed reaches $\approx 100\text{ m/s}$, tap <kbd>D</kbd> to nudge the nose $10^\circ\text{–}15^\circ$ toward the east horizon.
3. **Gravity Turn ($10\text{–}60\text{ km}$):** Tap <kbd>T</kbd> to lock onto **Prograde SAS**. Let the rocket follow its velocity arc. By 60 km, you should be pitched $60^\circ\text{–}70^\circ$ toward the horizon.
4. **Staging:** When Stage 1 runs out of fuel, press <kbd>Space</kbd> to separate the booster and ignite the Stage 2 sustainer.
5. **Main Engine Cutoff (MECO):** Watch the **`Apoapsis`** reading on the right HUD. The moment Apoapsis hits **$200\text{–}220\text{ km}$**, immediately press <kbd>X</kbd> to cut the throttle to 0%!
6. **Coast to Apoapsis:** Warp (<kbd>.</kbd>) until you are $\approx 20$ seconds before reaching Apoapsis.
7. **Circularization Burn:** Orient Prograde (<kbd>T</kbd>) and throttle up (<kbd>Z</kbd>). Watch your **`Periapsis`** rise from negative/suborbital numbers up into positive space. As soon as Periapsis crosses **$160\text{ km}$** (with Apoapsis under $350\text{ km}$), press <kbd>X</kbd> to cut engines.
8. **Deploy Payload:** Press <kbd>P</kbd> to deploy your satellite and complete the mission!

---

## 🏗️ Project Architecture

```
MissionForge-Frontend/
├── backend/
│   ├── api/                     # REST JSON routing and request validation
│   ├── simulation/              # Core physics & numerical flight engine
│   │   ├── altitude.py          # Atmospheric scale heights, air density & temperatures
│   │   ├── dynamics.py          # RK4 motion integration, thrust vectors & aero drag
│   │   ├── engines.py           # Vacuum/sea-level thrust, fuel burn & staging logic
│   │   ├── ephemeris.py         # Keplerian orbit calculations for celestial bodies
│   │   ├── flight_command.py    # Dispatches user throttle, staging, RCS, and maneuvers
│   │   ├── flight_session.py    # Active simulation session runner & telemetry snapshots
│   │   ├── joint_constraints.py # Structural load limits and g-force checks
│   │   ├── landing.py           # Touchdown speed, surface slopes & gear absorption
│   │   ├── objectives.py        # Authoritative multi-phase mission objective evaluator
│   │   ├── orbit.py             # Orbital mechanics elements (a, e, ra, rp, period, true anomaly)
│   │   ├── separation.py        # Decoupler impulse, fairing jettison & debris tracking
│   │   ├── soi.py               # Patched-conics Sphere of Influence handoff engine
│   │   ├── staging.py           # Automated & manual stage sequencer
│   │   └── telemetry.py         # HUD sensor readings, dynamic pressure & temperatures
│   ├── vehicle/                 # Vehicle design, parts analysis & attachment validation
│   │   ├── analysis.py          # Tsiolkovsky delta-V, CoM, TWR, and capability detector
│   │   ├── attachments.py       # Structural attachment rules and stack connectivity
│   │   ├── geometry.py          # Part bounding volumes, dimensions & spatial layout
│   │   └── part_behaviors.py    # Parachutes, heat shields, solar panels & wheels
│   ├── state/                   # Persistent user progress, saved blueprints & settings
│   └── service.py               # Unified backend service bridge
├── frontend/
│   ├── data/
│   │   ├── missions/            # Mission graphs, objectives, budgets, and rewards
│   │   ├── parts/               # Modular rocket parts catalog & behaviors
│   │   ├── payloads/            # Satellite, lander, and rover payload definitions
│   │   ├── planets/             # Solar system bodies, atmospheres, mu, and orbits
│   │   └── vehicles/            # Preset rocket blueprints (Saturn V, Atlas V, etc.)
│   ├── js/
│   │   ├── core/                # State store, REST API client, audio synthesizer, bus
│   │   └── rendering/           # Asset discovery and Three.js material manager
│   ├── ui/
│   │   ├── flight/              # 3D canvas, flight cockpit HUD, staging pills, navball
│   │   ├── menu/                # Main menu and splash screen
│   │   ├── missions/            # Mission briefing screen, requirements, and budget cards
│   │   ├── payload/             # Spacecraft bus and scientific instrument workshop
│   │   ├── settings/            # Sound volume, keybindings, graphics options
│   │   ├── solar/               # Interactive solar system map and orbital preview
│   │   └── workshop/            # 2D/3D rocket vehicle builder and staging editor
│   ├── assets/                  # High-resolution part sprites, textures, and sounds
│   └── index.html               # Main application entry point
├── frontend_server.py           # Multi-threaded Python HTTP/API backend server
├── start.bat                    # One-click Windows launcher
└── sync_part_sizes.py           # Sprite and hitbox geometry synchronization tool
```

---

## ⚡ Getting Started

### Prerequisites
* **Python 3.10+** installed on your system.
* A modern web browser supporting **WebGL** and **Web Audio** (Chrome, Edge, Firefox, Brave, Safari).

### Quick Launch (Windows)
Simply double-click:
```bat
start.bat
```
This automatically synchronizes part dimensions, launches the Python HTTP server on port `8000`, and opens your default browser to `http://127.0.0.1:8000`.

### Manual Launch (Cross-Platform)
From your terminal:
```bash
# Optional: Synchronize part hitboxes with visual asset bounds
python sync_part_sizes.py --apply

# Start the local backend server
python frontend_server.py
```
Then navigate to:
```
http://127.0.0.1:8000
```

*(To run the server without automatically launching the browser, pass `--no-browser`: `python frontend_server.py --no-browser`)*

---

## 📡 RESTful API Reference

The backend provides a lightweight REST API consumed by the frontend:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Service status, engine version, and heartbeat |
| `/api/blueprints` | `GET` / `PUT` | List or save vehicle blueprints |
| `/api/progress` | `GET` / `PUT` | Retrieve or record completed mission progress, records, and stats |
| `/api/settings` | `GET` / `PUT` | Read or update persistent player settings & keybindings |
| `/api/flight/start` | `POST` | Initialize a new flight simulation session with a chosen vehicle and body |
| `/api/flight/<id>/snapshot` | `GET` | Fetch real-time flight telemetry, orbital elements, and objective status |
| `/api/flight/<id>/command` | `POST` | Dispatch flight commands (`throttle`, `setSAS`, `stage`, `deployPayload`, etc.) |
| `/api/flight/<id>/predict` | `POST` | Compute multi-step trajectory preview and maneuver nodes |
| `/api/flight/<id>/close` | `POST` | Terminate active flight session and free simulation memory |

---

## 📜 License & Credits

MissionForge was crafted for the **NASA Space Apps Challenge 2026** under Challenge **CH-13: Space Mission Design Game**.  
Licensed under the [MIT License](LICENSE).
