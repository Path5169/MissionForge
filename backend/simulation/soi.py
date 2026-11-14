
from __future__ import annotations

import json
import math
from pathlib import Path

from backend.simulation import ephemeris, orbit


ENTRY_HYSTERESIS = 0.99
MAX_CHAIN = 4                
EXIT_WARP_WINDOW = 120.0    
MIN_RAILS_STEP = 1.0          
KEYS = ("x", "y", "vx", "vy")

_CATALOG = None

PREDICT_MAX_STEPS = 1500


def _default_horizon(probe):
    current = body(probe, probe["bodyId"])
    mu = float(current.get("mu", 0.0) or 0.0)
    exit_in = time_to_exit(probe)
    if exit_in:
        return exit_in * 3.0
    try:
        el = orbit.state_to_elements(mu, *(float(probe[k]) for k in KEYS))
    except ValueError:
        return 3600.0
    return el["period"] if el["bound"] and math.isfinite(el["period"]) else 30.0 * 86400.0


def _apply_node(craft, node):
    speed = math.hypot(craft["vx"], craft["vy"]) or 1e-9
    r = math.hypot(craft["x"], craft["y"]) or 1e-9
    prograde = float(node.get("prograde", 0.0) or 0.0)
    radial = float(node.get("radial", 0.0) or 0.0)
    return {
        **craft,
        "vx": craft["vx"] + prograde * craft["vx"] / speed + radial * craft["x"] / r,
        "vy": craft["vy"] + prograde * craft["vy"] / speed + radial * craft["y"] / r,
    }


def predict(session, horizon=None, count=360, node=None, target=None):
    probe = dict(session)
    probe.pop("_soiStates", None)
    t0 = _now(probe, None)
    horizon = max(1.0, float(horizon)) if horizon else max(1.0, _default_horizon(probe))
    base = horizon / max(30, int(count))
    node_at = max(0.0, float(node.get("at", 0.0) or 0.0)) if node else None
    node_info = None
    current_id = probe["bodyId"]
    craft = _craft(probe)
    watch = target if target in catalog(probe) else None

    def helio(frame_id, state, t):
        s = convert(probe, state, frame_id, "sun", t)
        return [round(s["x"], 1), round(s["y"], 1)]

    segment = {"bodyId": current_id, "points": [helio(current_id, craft, t0)]}
    segments, changes, best, impact = [], [], None, None
    start = segment["points"][0]
    elapsed, steps = 0.0, 0

    while elapsed < horizon and steps < PREDICT_MAX_STEPS:
        steps += 1
        t = t0 + elapsed
        if node_at is not None and node_info is None and elapsed >= node_at - 1e-6:
            craft = _apply_node(craft, node)
            data = body(probe, current_id)
            mu = float(data.get("mu", 0.0) or 0.0)
            el = orbit.state_to_elements(mu, *(craft[k] for k in KEYS))
            radius = float(data.get("R", 0.0) or 0.0)
            node_info = {
                "bodyId": current_id,
                "at": elapsed,
                "deltaV": math.hypot(float(node.get("prograde", 0.0) or 0.0), float(node.get("radial", 0.0) or 0.0)),
                "bound": bool(el["bound"]),
                "periapsis": el["rp"] - radius,
                "apoapsis": (el["ra"] - radius) if el["bound"] else None,
                "point": helio(current_id, craft, t),
            }
        probe.update(craft)
        probe["bodyId"] = current_id
        probe["body"] = body(probe, current_id)
        dt = min(base, rails_step_limit(probe, t), horizon - elapsed)
        dt = max(dt, min(MIN_RAILS_STEP, horizon - elapsed))
        if node_at is not None and node_info is None and node_at > elapsed:
            dt = min(dt, node_at - elapsed)
        mu = float(probe["body"].get("mu", 0.0) or 0.0)
        if mu <= 0:
            break
        moved = orbit.propagate(mu, craft["x"], craft["y"], craft["vx"], craft["vy"], dt)
        craft = {k: moved[k] for k in KEYS}
        elapsed += dt
        t = t0 + elapsed
        if math.hypot(craft["x"], craft["y"]) <= float(probe["body"].get("R", 0.0) or 0.0):
            segment["points"].append(helio(current_id, craft, t))
            impact = {"bodyId": current_id, "time": elapsed}
            break
        for _ in range(MAX_CHAIN):
            found = _next_frame(probe, current_id, craft, t)
            if not found:
                break
            next_id, direction = found
            craft = convert(probe, craft, current_id, next_id, t)
            point = helio(next_id, craft, t)
            segment["points"].append(point)
            segments.append(segment)
            changes.append({"time": elapsed, "fromBody": current_id, "toBody": next_id, "direction": direction, "point": point})
            current_id = next_id
            segment = {"bodyId": current_id, "points": [point]}
        segment["points"].append(helio(current_id, craft, t))
        if watch:
            rel = convert(probe, craft, current_id, watch, t)
            distance = math.hypot(rel["x"], rel["y"])
            if best is None or distance < best["distance"]:
                best = {
                    "bodyId": watch,
                    "distance": distance,
                    "time": elapsed,
                    "relativeSpeed": math.hypot(rel["vx"], rel["vy"]),
                }

    segments.append(segment)
    return {
        "epoch": t0,
        "horizon": horizon,
        "bodyId": probe["bodyId"] if not changes else changes[0]["fromBody"],
        "position": start,
        "segments": segments,
        "changes": changes,
        "closestApproach": best,
        "impact": impact,
        "node": node_info,
    }


def _load_catalog():
    global _CATALOG
    if _CATALOG is not None:
        return _CATALOG
    root = Path(__file__).resolve().parents[2] / "frontend" / "data" / "planets"
    try:
        with (root / "bodies.json").open("r", encoding="utf-8") as handle:
            bodies = json.load(handle).get("bodies", {})
        with (root / "solar.json").open("r", encoding="utf-8") as handle:
            solar = {item["id"]: item for item in json.load(handle).get("bodies", [])}
    except (OSError, ValueError, KeyError):
        bodies, solar = {}, {}
    merged = {}
    for identifier in set(bodies) | set(solar):
        item = dict(bodies.get(identifier, {}))
        item.update(solar.get(identifier, {}))
        item["id"] = identifier
       
        if not item.get("R") and item.get("radius"):
            item["R"] = item["radius"]
        item.setdefault("rho0", 0.0)
        item.setdefault("scaleHeight", 1.0)
        item.setdefault("atmosphereTop", 0.0)
        merged[identifier] = item
    _CATALOG = merged
    return merged


def catalog(session=None):
    supplied = (session or {}).get("celestialBodies")
    return supplied if isinstance(supplied, dict) and supplied else _load_catalog()


def body(session, body_id):
    return catalog(session).get(body_id, {})


def soi_radius(body_data):
  
    value = (body_data or {}).get("soiRadius")
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if value > 0 and math.isfinite(value) else None


def children(session, body_id):
    return [(cid, c) for cid, c in catalog(session).items() if c.get("parent") == body_id and cid != body_id]




def _now(session, t):
    return float(session.get("missionTime", 0.0) if t is None else t)


def _cache(session, t):
   
    cache = session.get("_soiStates")
    if not isinstance(cache, dict) or cache.get("t") != t:
        cache = {"t": t, "states": {}}
        session["_soiStates"] = cache
    return cache["states"]


def body_state(session, body_id, t=None):
  
    t = _now(session, t)
    states = _cache(session, t)
    if body_id in states:
        return states[body_id]
    item = body(session, body_id)
    parent_id = item.get("parent")
    if not parent_id or not item.get("a"):
        state = dict.fromkeys(KEYS, 0.0)
    else:
        own = ephemeris.body_state(item, t, float(body(session, parent_id).get("mu", 0.0)))
        up = body_state(session, parent_id, t)
        state = {k: up[k] + own[k] for k in KEYS}
    states[body_id] = state
    return state


def convert(session, state, from_id, to_id, t=None):
    """Re-express a state given relative to ``from_id`` as relative to ``to_id``."""
    t = _now(session, t)
    a, b = body_state(session, from_id, t), body_state(session, to_id, t)
    return {k: state[k] + a[k] - b[k] for k in KEYS}


def parent_to_child(session, state, parent_id, child_id, t=None):
    return convert(session, state, parent_id, child_id, t)


def child_to_parent(session, state, child_id, parent_id, t=None):
    return convert(session, state, child_id, parent_id, t)


def _craft(session):
    return {k: float(session[k]) for k in KEYS}




def _next_frame(session, current_id, craft, t):
  
    current = body(session, current_id)
    parent_id = current.get("parent")
    radius = soi_radius(current)
    if parent_id and radius is not None and math.hypot(craft["x"], craft["y"]) > radius:
        return parent_id, "exit"
    for child_id, child in children(session, current_id):
        child_radius = soi_radius(child)
        if child_radius is None:
            continue
        relative = convert(session, craft, current_id, child_id, t)
        if math.hypot(relative["x"], relative["y"]) <= child_radius * ENTRY_HYSTERESIS:
            return child_id, "enter"
    return None


def _reframe_detached(session, from_id, to_id, t):
    for obj in session.get("detachedObjects", []):
        if obj.get("dead"):
            continue
        moved = convert(session, obj, from_id, to_id, t)
        obj.update(moved)
    session.pop("_objectOrbitCaches", None)


def check_handoff(session, t=None):
   
    t = _now(session, t)
    last = None
    for _ in range(MAX_CHAIN):
        current_id = session.get("bodyId")
        if not current_id:
            return last
        found = _next_frame(session, current_id, _craft(session), t)
        if not found:
            return last
        next_id, direction = found
        new = convert(session, _craft(session), current_id, next_id, t)
        _reframe_detached(session, current_id, next_id, t)
        session["bodyId"] = next_id
        session["body"] = body(session, next_id)
        session.update(new)
        session["padPosition"] = None
        session["pressureRatio"] = 0.0
        session.pop("_orbitCache", None)       
        events = session.setdefault("events", [])
        last = {
            "sequence": len(events),
            "type": "soi",
            "direction": direction,
            "fromBody": current_id,
            "toBody": next_id,
            "missionTime": t,
            "distance": math.hypot(new["x"], new["y"]),
            "msg": "SOI handoff: %s to %s" % (current_id, next_id),
        }
        events.append(last)
    return last




def _numeric_exit(mu, radius, x, y, vx, vy):
  
    hi = 1.0
    for _ in range(60):
        p = orbit.propagate(mu, x, y, vx, vy, hi)
        if math.hypot(p["x"], p["y"]) >= radius:
            break
        hi *= 2.0
    else:
        return None
    lo = 0.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        p = orbit.propagate(mu, x, y, vx, vy, mid)
        lo, hi = (mid, hi) if math.hypot(p["x"], p["y"]) < radius else (lo, mid)
    return hi


def time_to_exit(session):
   
    current = body(session, session.get("bodyId"))
    radius = soi_radius(current)
    mu = float(current.get("mu", 0.0) or 0.0)
    if radius is None or mu <= 0:
        return None
    x, y, vx, vy = (float(session[k]) for k in KEYS)
    r = math.hypot(x, y)
    if r >= radius:
        return 0.0
    try:
        el = orbit.state_to_elements(mu, x, y, vx, vy)
    except ValueError:
        return None
    if el["bound"] and el["ra"] <= radius:
        return None
    e, p = el["e"], el["p"]
    if p < 1.0 or abs(e - 1.0) < 1e-9:
        return _numeric_exit(mu, radius, x, y, vx, vy)
    cos_t = (p / radius - 1.0) / e
    if abs(cos_t) > 1.0:
        return None
    nu_t, nu = math.acos(cos_t), el["nu"]          
    if e < 1.0:
        def mean(v):
            E = 2.0 * math.atan2(math.sqrt(1.0 - e) * math.sin(v / 2.0), math.sqrt(1.0 + e) * math.cos(v / 2.0))
            return E - e * math.sin(E)
        n = math.sqrt(mu / el["a"] ** 3)
    else:
        def mean(v):
            F = 2.0 * math.atanh(math.sqrt((e - 1.0) / (e + 1.0)) * math.tan(v / 2.0))
            return e * math.sinh(F) - F
        n = math.sqrt(mu / abs(el["a"]) ** 3)
    return max(0.0, (mean(nu_t) - mean(nu)) / n)


def time_to_enter_child(session, child_id, t=None):
   
    t = _now(session, t)
    current_id = session["bodyId"]
    child_radius = soi_radius(body(session, child_id))
    if child_radius is None:
        return None
    rel = convert(session, _craft(session), current_id, child_id, t)
    distance, speed = math.hypot(rel["x"], rel["y"]), math.hypot(rel["vx"], rel["vy"])
    gap = distance - child_radius
    if gap <= 0:
        return 0.0
    return gap / max(speed, 1e-6)


def rails_step_limit(session, t=None):
   
    t = _now(session, t)
    limit = math.inf
    exit_in = time_to_exit(session)
    if exit_in is not None:
        limit = min(limit, exit_in + 1.0)
    for child_id, child in children(session, session.get("bodyId")):
        child_radius = soi_radius(child)
        if child_radius is None:
            continue
        rel = convert(session, _craft(session), session["bodyId"], child_id, t)
        speed = max(math.hypot(rel["vx"], rel["vy"]), 1e-6)
        approach = time_to_enter_child(session, child_id, t)
       
        floor = 0.005 * child_radius / speed
        if approach is not None:
            limit = min(limit, max(0.5 * approach, floor, MIN_RAILS_STEP))
    return limit


def warp_limited(session):
    """True when time warp must drop to physics speed because an SOI exit is imminent."""
    exit_in = time_to_exit(session)
    return exit_in is not None and exit_in < EXIT_WARP_WINDOW



SMALL_BODY_SOI = 1.0e6 


def proximity(session):
    current = body(session, session.get("bodyId"))
    radius = soi_radius(current)
    distance = math.hypot(session["x"], session["y"])
    relative_speed = math.hypot(session["vx"], session["vy"])
    rendezvous_distance = max(float(current.get("R", 0.0) or 0.0) * 10.0, 1000.0)
    return {
        "mode": "small_body" if radius is not None and radius <= SMALL_BODY_SOI else "planetary",
        "bodyId": session.get("bodyId"),
        "distance": distance,
        "altitude": max(0.0, distance - float(current.get("R", 0.0) or 0.0)),
        "relativeSpeed": relative_speed,
        "rendezvousDistance": rendezvous_distance,
        "withinRendezvousDistance": distance <= rendezvous_distance,
    }