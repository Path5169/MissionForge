from __future__ import annotations
import pickle

from collections.abc import MutableMapping
import math
import threading
import time
import uuid

from backend.simulation import altitude, dynamics, engines, landing, objectives, orbit, separation, soi, staging, telemetry
from backend.simulation.flight_state import FlightState
from backend.vehicle import geometry, part_behaviors, part_state

G0 = 9.80665
MAX_SUBSTEP = 0.05
MAX_STEPS = 2000
MAX_REAL_DT = 2.0
MAX_PHYSICS_WARP = 4      
RAILS_CLEARANCE = 1000.0 
MAX_RAIL_SLICES = 400
COUNTDOWN_SECONDS = 10.0
SETTLE_TIME = 3.0
REST_SPEED = 1.0   
IDLE_LIMIT = 1800.0
HOLD_STATUSES = ("crashed", "landed", "prelaunch")
RUNNING_STATUSES = ("flying", "orbiting", "launched")

LOCK = threading.RLock()
_SESSIONS = {}


class FlightSession(MutableMapping):
    def __init__(self, session_id, data):
        if not isinstance(session_id, str) or not session_id or not isinstance(data, dict):
            raise ValueError("Flight session requires an ID and state data.")
        self.session_id = session_id
        self._data = data
        self.closed = False
        self.touched = time.time()
        self.state = FlightState.from_session(data)

    def __getitem__(self, key): return self._data[key]
    def __setitem__(self, key, value): self._data[key] = value
    def __delitem__(self, key): del self._data[key]
    def __iter__(self): return iter(self._data)
    def __len__(self): return len(self._data)

    def sync_state(self):
        self.state.sync_from(self._data)
        return self.state

    def advance(self):
        if self.closed:
            raise RuntimeError("Flight session is closed.")
        self.touched = time.time()
        advance_session(self)
        return self.sync_state()

    def close(self):
        self.closed = True
        self._data["paused"] = True
        self._data["status"] = "closed"
        self.sync_state()


def create_session(blueprint, body_id, body, start, mission_id, stats, catalog):
    r_body = float(body.get("R", 6371000.0))
    mu = float(body.get("mu", 398600441800000.0))
    start_type = start.get("type", "pad")

    if start_type == "pad":
        y = r_body
        vx = 0.0
        status = "prelaunch"
        hold_down = True
        pad_position = [0.0, r_body]
    elif start_type == "orbit":
        y = r_body + float(start.get("altitude", 100000.0))
        vx = math.sqrt(mu / max(1.0, y))
        status = "orbiting"
        hold_down = False
        pad_position = None
    else:
        altitude_start = float(start.get("altitude", 0.0))
        y = r_body + altitude_start
        vx = 0.0
        on_pad = altitude_start <= 1.0
        status = "prelaunch" if on_pad else "launched"
        hold_down = on_pad
        pad_position = [0.0, r_body] if on_pad else None

    parts = blueprint.get("parts") or []
    height = float(stats.get("height", 10.0) or 10.0)
    session_id = uuid.uuid4().hex
    now = time.time()

    data = {
        "sessionId": session_id,
        "blueprint": blueprint,
        "bodyId": body_id,
        "body": body,
        "start": start,
        "missionId": mission_id,
        "stats": stats,
        "definitions": part_state.definitions_by_uid(blueprint, catalog),
        "status": status,
        "holdDown": hold_down,
        "padPosition": pad_position,
        "x": 0.0,
        "y": y,
        "vx": vx,
        "vy": 0.0,
        "rotation": 0.0,
        "angularVelocity": 0.0,
        "throttle": 0.0,
        "throttleActual": 0.0,
        "sas": "stability",
        "warp": 1,
        "activeStage": 1,
        "missionTime": 0.0,
        "sequence": 0,
        "createdAt": now,
        "lastTime": now,
        "countdownStart": None,
        "countdownDuration": COUNTDOWN_SECONDS,
        "parts": part_state.create_part_states(blueprint, catalog),
        "deadUids": set(),
        "manualShutdown": set(),
        "stageDone": 0,
        "stagesFired": 0,
        "engines": [
            {"uid": p.get("uid"), "stage": int(p.get("stage", 0) or 0), "group": int(p.get("group", 0) or 0),
             "firing": False, "thrust": 0.0, "ignited": False, "spent": False}
            for p in parts if (catalog.get(p.get("c")) or {}).get("engine")
        ],
        "topY": 0.0,
        "bottomY": height,
        "centerOfMass": height,
        "baseOffset": 0.0,
        "maxAltitude": 0.0,
        "events": [],
        "paused": False,
        "stageIdx": 0,
        "mass": float(stats.get("wetMass", 1000.0) or 1000.0),
        "dragArea": float(stats.get("dragArea", 0.0) or 0.0),
        "thrustNow": 0.0,
        "detachedObjects": [],
        "pressureRatio": 1.0,
        "payloadDeployed": False,
    }

    geometry.initialise(data, blueprint, catalog)
    stages = staging.stage_list(data)
    data["fuel"] = (stages[0]["m0"] - stages[0]["m1"]) if stages else 0.0
    data["fuelCap"] = data["fuel"]
    if status != "prelaunch":
        staging.fire_first_stage(data)
    return FlightSession(session_id, data)


def register(session):
    with LOCK:
        _purge_idle()
        _SESSIONS[session.session_id] = session
    return session


def lookup(session_id):
    with LOCK:
        session = _SESSIONS.get(session_id)
        if session is not None:
            session.touched = time.time()
        return session


def close_session(session_id):
    with LOCK:
        session = _SESSIONS.pop(session_id, None)
    if session is None:
        return False
    session.close()
    return True


def _purge_idle():
    cutoff = time.time() - IDLE_LIMIT
    for session_id in [key for key, item in _SESSIONS.items() if item.touched < cutoff]:
        _SESSIONS.pop(session_id).close()


def plan_steps(sim_dt):
    steps = min(MAX_STEPS, max(1, math.ceil(sim_dt / MAX_SUBSTEP)))
    return steps, sim_dt / steps


def begin_liftoff(session):
    session["countdownStart"] = None
    session["status"] = "flying"
    session["holdDown"] = False
    session["lastTime"] = time.time()
    session["throttle"] = max(session["throttle"], staging.liftoff_throttle(session))
    staging.fire_first_stage(session)


def _settle_on_surface(session, radius):
    norm = math.hypot(session["x"], session["y"]) or 1.0
    session["x"], session["y"] = session["x"] / norm * radius, session["y"] / norm * radius
    session["vx"] = session["vy"] = 0.0


def _ground_contact(session, body, radius, thrust):
    return landing.ground_contact(session, body, radius, thrust)


def _can_rails(session, body, radius):
  
    if session["status"] not in RUNNING_STATUSES:
        return False
    if session.get("thrustNow", 0.0) > 0 or session.get("throttleActual", 0.0) > 0 \
            or (session.get("throttle", 0.0) > 0 and session.get("fuel", 0.0) > 0):
        return False
    clearance = float(body.get("atmosphereTop", 0.0) or 0.0) + RAILS_CLEARANCE
    return orbit.clears_planet(float(body.get("mu", 0.0)), radius, clearance,
                               session["x"], session["y"], session["vx"], session["vy"])


def _resolve_warp(session, body, radius):
   
    warp = max(1, session.get("warp", 1))
    session["rails"] = False
    if warp <= MAX_PHYSICS_WARP:
        return False
    if soi.warp_limited(session):
        session["warp"] = MAX_PHYSICS_WARP
        session["events"].append({"sequence": len(session["events"]), "type": "warp",
                                  "msg": "Time warp limited to %dx near the %s SOI boundary" % (MAX_PHYSICS_WARP, session.get("bodyId", "body"))})
        return False
    if _can_rails(session, body, radius):
        session["rails"] = True
        return True
    session["warp"] = MAX_PHYSICS_WARP
    session["events"].append({"sequence": len(session["events"]), "type": "warp",
                              "msg": "Time warp limited to %dx: engines on, in atmosphere, or the path meets the planet" % MAX_PHYSICS_WARP})
    return False


def _advance_on_rails(session, body, radius, sim_dt):
  
    start = session["missionTime"] - sim_dt       
    done = 0.0
    for _ in range(MAX_RAIL_SLICES):
        if done >= sim_dt:
            break
        body = session["body"]
        step = min(sim_dt - done, soi.rails_step_limit(session, start + done))
        result = orbit.propagate(float(body["mu"]), session["x"], session["y"], session["vx"], session["vy"], step)
        session["x"], session["y"], session["vx"], session["vy"] = result["x"], result["y"], result["vx"], result["vy"]
        done += step
        separation.advance(session, step)
        soi.check_handoff(session, start + done)
    else:
        session["warp"] = MAX_PHYSICS_WARP            # ran out of slices: slow down instead of skipping time
    session["missionTime"] = start + done
    radius = float(session["body"].get("R", radius))
    session["maxAltitude"] = max(session["maxAltitude"], math.hypot(session["x"], session["y"]) - radius)


def step_surface_drive(session, sim_dt):
    body = session["body"]
    radius = float(body.get("R", 6371000.0))
    current_angle = math.atan2(session["x"], session["y"])
    
    throttle = float(session.get("throttle", 0.0) or 0.0)
    steer = float(session.get("rotInput", 0.0) or 0.0)
    
    drive_speed = 0.0
    if throttle > 0:
        drive_speed += throttle * 10.0
    if steer != 0:
        drive_speed += steer * 6.0
        
    if abs(drive_speed) > 0.01:
        ds = drive_speed * sim_dt
        d_theta = ds / radius
        new_angle = current_angle + d_theta
        session["x"] = radius * math.sin(new_angle)
        session["y"] = radius * math.cos(new_angle)
        session["vx"] = drive_speed * math.cos(new_angle)
        session["vy"] = -drive_speed * math.sin(new_angle)
        session["surfaceDistance"] = session.get("surfaceDistance", 0.0) + abs(ds)
        session["surfaceSpeed"] = abs(drive_speed)
    else:
        session["vx"] = 0.0
        session["vy"] = 0.0
        session["surfaceSpeed"] = 0.0


def step_autopilot(session, sim_dt):
    if not session.get("autopilot"):
        return
    from backend.simulation import flight_command
    body = session.get("body", {})
    radius = float(body.get("R", 6371000.0))
    mu = float(body.get("mu", 3.986004418e14))
    r = math.hypot(session["x"], session["y"])
    alt = r - radius

    if session.get("status") == "prelaunch":
        session["throttle"] = 1.0
        begin_liftoff(session)
        return

    if session.get("status") not in RUNNING_STATUSES:
        return

    # Jettison fairing above 70 km
    if alt > 70000.0 and not session.get("fairingJettisoned"):
        flight_command._jettison_fairing(session)

    # Staging when current stage fuel is exhausted
    if session.get("fuel", 0.0) <= 0.05 and staging.has_next_stage(session):
        staging.activate_next_stage(session, session.get("definitions"))
        session["throttle"] = 1.0

    # Smooth gravity turn pitch
    if alt < 1500.0:
        session["rotation"] = 0.0
    elif alt < 75000.0:
        prog = min(1.0, (alt - 1500.0) / 70000.0)
        session["rotation"] = prog * (math.pi / 2.0)
    else:
        session["rotation"] = math.pi / 2.0

    # Orbital insertion assistance once in upper atmosphere/space
    if alt >= 120000.0:
        v_circ = math.sqrt(mu / max(1.0, r))
        tx = -session["y"] / max(1.0, r)
        ty = session["x"] / max(1.0, r)
        rx = session["x"] / max(1.0, r)
        ry = session["y"] / max(1.0, r)

        if alt < 185000.0:
            cur_tangential = session["vx"] * tx + session["vy"] * ty
            if cur_tangential < v_circ:
                boost = min(v_circ - cur_tangential, 500.0 * max(0.01, sim_dt))
                session["vx"] += tx * boost
                session["vy"] += ty * boost
            target_vr = min(250.0, (200000.0 - alt) * 0.08)
            cur_vr = session["vx"] * rx + session["vy"] * ry
            dvr = (target_vr - cur_vr) * min(1.0, 2.0 * max(0.01, sim_dt))
            session["vx"] += rx * dvr
            session["vy"] += ry * dvr
        else:
            # Settle into perfect circular 200 km parking orbit
            session["vx"] = tx * v_circ
            session["vy"] = ty * v_circ
            session["throttle"] = 0.0

    orb = orbit.orbit_payload(
        session.setdefault("_orbitCache", {}),
        mu, radius,
        session["x"], session["y"], session["vx"], session["vy"],
    )
    bound = orb.get("bound", False)
    apo = (orb.get("ra", 0) - radius) if bound else alt
    peri = (orb.get("rp", 0) - radius) if bound else -1.0

    if bound and peri >= 160000.0 and apo <= 350000.0:
        session["throttle"] = 0.0
        session["status"] = "orbiting"
        objectives.evaluate(session)
        if not session.get("payloadDeployed"):
            flight_command._deploy_payload(session, None)
            objectives.evaluate(session)
            session["autopilot"] = False


def advance_session(session):
    now = time.time()
    real_dt = max(0.0, min(now - session["lastTime"], MAX_REAL_DT))
    session["lastTime"] = now
    if session.get("autopilot") and session.get("status") == "prelaunch":
        step_autopilot(session, real_dt)
    if session.get("paused") or session["status"] == "crashed" or session["status"] == "prelaunch":
        return
    if session["status"] == "landed":
        stage = staging.current_stage(session)
        body = session["body"]
        radius = float(body.get("R", 6371000.0))
        mu = float(body.get("mu", 398600441800000.0))
        local_g = mu / (radius * radius)
        max_thrust = float(stage.get("thrustVac", 0.0)) if stage else 0.0
        throttle = session.get("throttle", 0.0)
        fuel = session.get("fuel", 0.0)
        mass = max(1.0, session.get("mass", 1.0))
        if throttle > 0.05 and fuel > 0 and (max_thrust * throttle / mass) > (local_g * 0.9):
            session["status"] = "flying"
            session.setdefault("events", []).append({
                "sequence": len(session["events"]),
                "type": "liftoff",
                "msg": f"Liftoff from {body.get('name', 'surface')}",
                "body": session.get("bodyId"),
            })
        else:
            sim_dt = real_dt * max(1, session.get("warp", 1))
            session["missionTime"] += sim_dt
            step_surface_drive(session, sim_dt)
            return
    if session["status"] in RUNNING_STATUSES:
        altitude.step_attitude(session, real_dt)
        if session.get("autopilot"):
            step_autopilot(session, real_dt)
    body = session["body"]
    radius = float(body.get("R", 6371000.0))
    rails = _resolve_warp(session, body, radius)
    sim_dt = real_dt * max(1, session.get("warp", 1))
    session["missionTime"] += sim_dt
    if sim_dt <= 0:
        return
    if rails:
        _advance_on_rails(session, body, radius, sim_dt)
        return
    stage = staging.current_stage(session)
    definitions = session["definitions"]
    steps, h = plan_steps(sim_dt)
    t_start = session["missionTime"] - sim_dt

    for i in range(steps):
        body = session["body"]
        radius = float(body.get("R", 6371000.0))
        height = math.hypot(session["x"], session["y"]) - radius
        _, session["pressureRatio"] = dynamics.atmosphere(body, height)
        part_behaviors.step_part_behaviors(session, definitions, height, math.hypot(session["vx"], session["vy"]))
        if session.get("controlledVessel") == "satellite":
            thr = session.get("throttle", 0.0)
            fuel = session.get("fuel", 0.0)
            if thr > 0 and fuel > 0:
                thrust = thr * 140.0
                session["thrustNow"] = thrust
                session["fuel"] = max(0.0, fuel - thr * 0.02 * h)
            else:
                thrust = 0.0
                session["thrustNow"] = 0.0
        else:
            thrust = engines.step(session, h, session["pressureRatio"], stage)
        result = dynamics.rk4_step(
            body,
            {"x": session["x"], "y": session["y"], "vx": session["vx"], "vy": session["vy"]},
            h,
            mass=max(1.0, session["mass"]),
            drag_area=session.get("dragArea", 0.0) + session.get("extraDragArea", 0.0),
            thrust=thrust,
            angle=session["rotation"],
        )
        session["x"], session["y"], session["vx"], session["vy"] = result["x"], result["y"], result["vx"], result["vy"]
        separation.advance(session, h)
        contact = _ground_contact(session, body, radius, thrust)
        if contact == "hold":
            continue
        if contact == "stop":
            break
        soi.check_handoff(session, t_start + (i + 1) * h)
        session["maxAltitude"] = max(session["maxAltitude"], math.hypot(session["x"], session["y"]) - radius)


def _countdown(session, now):
    if session.get("countdownStart") is None:
        return None
    remaining = max(0.0, session["countdownDuration"] - (now - session["countdownStart"]))
    if remaining > 0.0:
        # Ignite stage 1 engine at T - 1.8s for realistic turbopump spin-up before pad hold-down release
        if remaining <= 1.8 and session.get("status") == "prelaunch":
            session["holdDown"] = True
            session["throttle"] = max(session.get("throttle", 0.0), staging.liftoff_throttle(session))
            staging.fire_first_stage(session)
        return {"remaining": remaining, "remainingSeconds": remaining}
    begin_liftoff(session)
    return None


def _orbit(session):
    body = session["body"]
    return orbit.orbit_payload(
        session.setdefault("_orbitCache", {}),
        float(body.get("mu", 398600441800000.0)), float(body.get("R", 6371000.0)),
        session["x"], session["y"], session["vx"], session["vy"],
    )


def snapshot(session):
    now = time.time()
    session.advance()
    session["sequence"] += 1
    countdown = _countdown(session, now)

    values = telemetry.flight_values(session)
    radius = math.hypot(session["x"], session["y"])
    gravity = float(session["body"].get("mu", 3.986004418e14)) / max(1.0, radius * radius)
    values["twr"] = session.get("thrustNow", 0.0) / max(1e-9, session["mass"] * gravity)
    stage = staging.current_stage(session)
    final_mass = max(1e-9, session["mass"] - session["fuel"])
    if stage and session["fuel"] > 0 and session["mass"] > final_mass:
        values["deltaV"] = G0 * float(stage.get("ispVac", 0.0)) * math.log(session["mass"] / final_mass)
    else:
        values["deltaV"] = 0.0

    return {
        "sessionId": session["sessionId"],
        "sequence": session["sequence"],
        "status": session["status"],
        "timestamp": now,
        "missionTime": session["missionTime"],
        "telemetry": values,
        "renderState": telemetry.render_state(session),
        "orbit": _orbit(session),
        "controls": telemetry.controls(session, countdown),
        **objectives.evaluate(session),
        "events": list(session["events"]),
    }

save_file="backend/state/session.pkl"
save_time=2
last_save=0

def save_all():
    data={}
    for session_id,session in _SESSIONS.items():
        data[session_id]=session._data
    with open(save_file,"wb") as f:
        pickle.dump(data,f)

def auto_all():
    global last_save
    if time.time()-last_save < save_time:
        result=last_save = time.time()
        return result
    try:
        save_all()
    except Exception as error:
        print("Save failed",error)


def load_all():
    try:
        with open(save_file,"rb") as f:
            data=pickle.load(f)
        for session_id,flight_data in data.items():
            flight_data["paused"]=True
            flight_data["lastTime"]=time.time()
            _SESSIONS[session_id]=FlightSession(session_id,flight_data)
    except Exception:
        pass
    



    