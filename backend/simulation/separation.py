from __future__ import annotations

import math

from backend.vehicle import geometry
from . import dynamics, orbit

SEPARATION_SPEED = 1.5
MAX_FREE_BODIES = 48
MIN_MASS = 1.0


def part_mass(definitions, uid):
    try:
        return max(0.0, float((definitions.get(uid) or {}).get("mass", 0) or 0))
    except (TypeError, ValueError):
        return 0.0


def detach_parts(session, uids, definitions, *, extra_mass=0.0, speed=SEPARATION_SPEED, type="stage", label=None):
    attached = {p.get("uid") for p in session["parts"] if p.get("alive", True)}
    released = []
    for uid in uids:
        if uid and uid in attached and uid not in released:
            released.append(uid)
    if not released:
        return None

    angle = session["rotation"]
    bodies = session.setdefault("detachedObjects", [])

    if type == "fairing":
        count = int(session.get("separationCount", 0))
        session["separationCount"] = count + 2
        # Normal vectors perpendicular and longitudinal to rocket axis
        norm_x = math.cos(angle)
        norm_y = -math.sin(angle)
        fwd_x = math.sin(angle)
        fwd_y = math.cos(angle)

        total_mass = max(MIN_MASS, sum(part_mass(definitions, u) for u in released) + max(0.0, extra_mass))
        half_mass = max(1.0, total_mass * 0.5)

        port_half = {
            "id": f"fairing-port-{count}",
            "uids": list(released),
            "type": "fairing",
            "side": "left",
            "label": "Fairing Port Half",
            "x": session["x"] - norm_x * 0.6,
            "y": session["y"] - norm_y * 0.6,
            "vx": session["vx"] - norm_x * speed + fwd_x * 0.4,
            "vy": session["vy"] - norm_y * speed + fwd_y * 0.4,
            "th": angle,
            "omega": -0.85,
            "com": session["centerOfMass"],
            "mass": half_mass,
            "dead": False,
        }
        stbd_half = {
            "id": f"fairing-stbd-{count+1}",
            "uids": list(released),
            "type": "fairing",
            "side": "right",
            "label": "Fairing Starboard Half",
            "x": session["x"] + norm_x * 0.6,
            "y": session["y"] + norm_y * 0.6,
            "vx": session["vx"] + norm_x * speed + fwd_x * 0.4,
            "vy": session["vy"] + norm_y * speed + fwd_y * 0.4,
            "th": angle,
            "omega": 0.85,
            "com": session["centerOfMass"],
            "mass": half_mass,
            "dead": False,
        }
        bodies.extend([port_half, stbd_half])

        session["deadUids"].update(released)
        for part in session["parts"]:
            if part.get("uid") in released:
                part["alive"] = False

        geometry.refresh(session)
        _prune(bodies)
        return port_half

    count = int(session.get("separationCount", 0))
    session["separationCount"] = count + 1

    # Direction vectors for rocket longitudinal and normal axes
    fwd_x = math.sin(angle)
    fwd_y = math.cos(angle)
    norm_x = math.cos(angle)
    norm_y = -math.sin(angle)

    # Compute physical bounds and center of detached stage parts
    items = session.get("layout") or {}
    uids_in_layout = [u for u in released if u in items]
    if uids_in_layout:
        y_min = min(items[u]["y0"] for u in uids_in_layout)
        y_max = max(items[u]["y1"] + float(items[u].get("drop", 0.0)) for u in uids_in_layout)
        y_center = (y_min + y_max) / 2.0
        is_radial = any(items[u].get("side") for u in uids_in_layout)
    else:
        y_center = float(session.get("centerOfMass", 0.0))
        y_min = y_center - 2.0
        y_max = y_center + 2.0
        is_radial = False

    # Detached stage mass and remaining launcher mass
    detached_mass = max(MIN_MASS, sum(part_mass(definitions, u) for u in released) + max(0.0, extra_mass))
    rem_mass = max(10.0, float(session.get("mass", 500.0)) - detached_mass)

    # Physical longitudinal offset from vehicle center of mass/reference
    com = float(session.get("centerOfMass", 0.0))
    # In vehicle stack layout, larger Y is towards bottom/engines (behind rocket nose in world)
    delta_L = y_center - com

    # True spawn position offset along rocket longitudinal axis
    spawn_x = session["x"] - fwd_x * delta_L
    spawn_y = session["y"] - fwd_y * delta_L

    if is_radial:
        # Radial / strap-on side booster separation (e.g. Korolev cross / Falcon Heavy side boosters)
        # Determine side direction (+1 right, -1 left)
        side_dir = 1.0 if count % 2 == 0 else -1.0
        lateral_push = 1.8
        drag_back = 0.9
        body_vx = session["vx"] + norm_x * side_dir * lateral_push - fwd_x * drag_back
        body_vy = session["vy"] + norm_y * side_dir * lateral_push - fwd_y * drag_back
        body_omega = side_dir * 0.42
    else:
        # Longitudinal stack stage separation (spent lower stage separates backwards)
        push_speed = max(1.6, float(speed or 2.0))
        body_vx = session["vx"] - fwd_x * push_speed
        body_vy = session["vy"] - fwd_y * push_speed
        # Upper stage receives forward spring recoil
        recoil = push_speed * (detached_mass / rem_mass)
        session["vx"] += fwd_x * recoil
        session["vy"] += fwd_y * recoil
        # Gentle natural tip-off tumble
        body_omega = 0.035 * (-1.0 if count % 2 else 1.0)

    body = {
        "id": f"separation-{count}",
        "uids": released,
        "type": type,
        "label": label or ("Fairing shroud" if type == "fairing" else "Detached stage"),
        "x": spawn_x,
        "y": spawn_y,
        "vx": body_vx,
        "vy": body_vy,
        "th": angle,
        "omega": body_omega,
        "com": y_center,
        "yCenter": y_center,
        "yMin": y_min,
        "yMax": y_max,
        "mass": detached_mass,
        "dead": False,
    }
    bodies.append(body)

    session["deadUids"].update(released)
    for part in session["parts"]:
        if part.get("uid") in released:
            part["alive"] = False

    geometry.refresh(session)
    _prune(bodies)
    return body


OBJECT_STEP = 1.0         
MAX_OBJECT_STEPS = 3000
SAFE_CLEARANCE = 1000.0  


def advance(session, dt):
    """Move detached bodies forward by ``dt`` seconds (may be large when time-warping)."""
    body = session["body"]
    radius = float(body.get("R", 0.0))
    mu = float(body.get("mu", 0.0))
    clearance = float(body.get("atmosphereTop", 0.0) or 0.0) + SAFE_CLEARANCE
    for obj in session.get("detachedObjects", []):
        if obj.get("dead"):
            continue
        if obj.get("omega"):
            obj["th"] = float(obj.get("th", 0.0)) + float(obj["omega"]) * dt
        if dt > OBJECT_STEP and mu > 0 and orbit.clears_planet(mu, radius, clearance, obj["x"], obj["y"], obj["vx"], obj["vy"]):
            obj.update(orbit.propagate(mu, obj["x"], obj["y"], obj["vx"], obj["vy"], dt))
            continue
        count = min(MAX_OBJECT_STEPS, max(1, math.ceil(dt / OBJECT_STEP)))
        step = dt / count
        for _ in range(count):
            obj.update(dynamics.rk4_step(body, obj, step, mass=obj["mass"],
                                         drag_area=float(obj.get("dragArea", 0.0))))
            r = math.hypot(obj["x"], obj["y"])
            if r <= radius:
                obj["impactSpeed"] = math.hypot(obj["vx"], obj["vy"])
                obj["dead"] = True
                if r > 0:
                    obj["x"], obj["y"] = obj["x"] / r * radius, obj["y"] / r * radius
                obj["vx"] = obj["vy"] = 0.0
                break


def render_objects(session):
    body = session["body"]
    mu, radius = float(body.get("mu", 0.0)), float(body.get("R", 0.0))
    caches = session.setdefault("_objectOrbitCaches", {})
    out = []
    for obj in session.get("detachedObjects", []):
        item = dict(
            obj,
            uids=list(obj.get("uids") or []),
            label=obj.get("label") or obj.get("name") or "Detached stage",
            type=obj.get("type", "stage"),
            payload=obj.get("payload"),
        )
        if not obj.get("dead") and mu > 0:
            item["orbit"] = orbit.orbit_payload(caches.setdefault(obj["id"], {}), mu, radius,
                                                obj["x"], obj["y"], obj["vx"], obj["vy"], count=120)
        out.append(item)
    return out


def _prune(bodies):
    excess = len(bodies) - MAX_FREE_BODIES
    if excess <= 0:
        return
    for obj in [o for o in bodies if o.get("dead")][:excess]:
        bodies.remove(obj)
