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

    count = int(session.get("separationCount", 0))
    session["separationCount"] = count + 1
    kick = speed * (-1.0 if count % 2 else 1.0)
    angle = session["rotation"]

    body = {
        "id": f"separation-{count}",
        "uids": released,
        "type": type,
        "label": label or ("Fairing shroud" if type == "fairing" else "Detached stage"),
        "x": session["x"],
        "y": session["y"],
        "vx": session["vx"] + math.cos(angle) * kick,
        "vy": session["vy"] - math.sin(angle) * kick,
        "th": angle,
        "com": session["centerOfMass"],
        "mass": max(MIN_MASS, sum(part_mass(definitions, u) for u in released) + max(0.0, extra_mass)),
        "dead": False,
    }
    bodies = session.setdefault("detachedObjects", [])
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
