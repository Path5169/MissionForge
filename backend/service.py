from __future__ import annotations
import json
import threading
import time
from pathlib import Path
from backend.simulation import orbit, ephemeris, dynamics, flight_session
from backend.vehicle import attachments
from backend.simulation.flight_command import CommandError, apply_command, parse_command
from backend.vehicle.analysis import analyze_blueprint
from backend.simulation import orbit, ephemeris, dynamics, flight_session, soi

class UnknownEndpoint(Exception):
    pass

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
STATE = ROOT / "backend" / "state"
_STATE_LOCK = threading.RLock()
_CATALOG_CACHE = None
_BODIES_CACHE = None
_MISSIONS_CACHE = None


def _read(path: Path, fallback):
    try:
        with path.open("r", encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return fallback


def _write(name: str, value):
    STATE.mkdir(parents=True, exist_ok=True)
    target = STATE / name
    temp = target.with_suffix(target.suffix + ".tmp")
    with temp.open("w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
    temp.replace(target)


def catalog_data():
    base = _read(FRONTEND / "data" / "components" / "components.json", {"components": []})
    index = _read(FRONTEND / "data" / "parts" / "index.json", {"parts": []})
    definitions = []
    for item in index.get("parts", []):
        rel = item.get("definition", "").lstrip("/")
        definition = _read(FRONTEND / rel, None)
        if definition:
            definitions.append(definition)
    return list(base.get("components", [])) + definitions


def bodies_data():
    return _read(FRONTEND / "data" / "planets" / "bodies.json", {}).get("bodies", {})


def missions_data():
    return _read(FRONTEND / "data" / "missions" / "missions.json", {}).get("missions", [])


def vehicle_stats(payload: dict) -> dict:
    blueprint = payload.get("blueprint") or {}
    body_id = payload.get("bodyId", "earth")
    mission_id = payload.get("missionId")
    mission = None
    if mission_id:
        for m in missions_data():
            if m.get("id") == mission_id:
                mission = m
                break
    result = analyze_blueprint(blueprint, catalog_data(), bodies_data(), body_id, mission)
    if not isinstance(result, dict):
        raise ValueError("Vehicle analysis produced no result.")
    return result

AUDIO_EXTENSIONS = {".wav", ".mp3", ".ogg", ".webm"}

AUDIO_SLOT_KEYWORDS = {
    "ui_hover": ["hover"],
    "ui_click": ["click", "press"],
    "ui_confirm": ["confirm", "select"],
    "music_menu": ["menu", "theme", "title", "music"],
    "ambience_launch": ["launch", "pad", "countdown"],
    "atmospheric_flight": ["atmo", "wind", "flight", "air"],
    "ambience_planetary": ["space", "planetary", "orbit", "cosmic"],
    "engine_ignition": ["ignition", "ignite", "start"],
    "engine_loop": ["loop", "engine", "thrust", "burn"],
    "stage_separation": ["separation", "stage", "decouple", "jettison"],
    "mission_success": ["success", "complete", "victory", "win"],
    "mission_failure": ["failure", "fail", "crash", "explosion"],
    "rover_movement": ["rover", "drive", "wheel", "roll"],
}


def audio_manifest():
    audio_dir = FRONTEND / "assets" / "audio"
    custom_manifest = _read(audio_dir / "manifest.json", {})
    discovered = []
    by_category = {"ui": [], "music": [], "ambience": [], "engines": [], "events": []}
    slots = dict(custom_manifest.get("slots", {}))

    if audio_dir.exists():
        for p in audio_dir.rglob("*"):
            if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS:
                rel = p.relative_to(FRONTEND).as_posix()
                name_lower = p.stem.lower()
                discovered.append({"file": rel, "name": p.name, "category": p.parent.name})
                cat = p.parent.name.lower()
                if cat in by_category:
                    by_category[cat].append(rel)
                
                # Semantic slot discovery
                for slot, kw_list in AUDIO_SLOT_KEYWORDS.items():
                    if slot not in slots or not slots[slot].get("file"):
                        if any(kw in name_lower for kw in kw_list):
                            slots[slot] = {"file": "/" + rel, "name": p.name}

    return {
        "discovered": discovered,
        "byCategory": by_category,
        "slots": slots,
        "categories": custom_manifest.get("categories", {}),
    }


def asset_manifest():
    registry = _read(FRONTEND / "assets" / "registry.json", {"parts": {}, "bodies": {}})
    found = []
    asset_root = FRONTEND / "assets"
    if asset_root.exists():
        found = [p.relative_to(asset_root).as_posix() for p in asset_root.rglob("*.glb") if p.is_file()]

    planets_manifest = _read(FRONTEND / "assets" / "planets" / "manifest.json", {"planets": {}})
    discovered_planets = {}
    planets_dir = FRONTEND / "assets" / "planets"
    if planets_dir.exists():
        for p in planets_dir.glob("*.glb"):
            planet_id = p.stem.lower()
            meta = planets_manifest.get("planets", {}).get(planet_id, {})
            discovered_planets[planet_id] = {
                "id": planet_id,
                "file": "assets/planets/" + p.name,
                "name": meta.get("name", planet_id.title()),
                "radius": meta.get("radius", 1.0),
                "rotationPeriod": meta.get("rotationPeriod", 86400),
                "axialTilt": meta.get("axialTilt", 0.0),
                "atmosphere": meta.get("atmosphere", False),
                "atmosphereColor": meta.get("atmosphereColor", "#ffffff"),
            }

    for body_id, rel in registry.get("bodies", {}).items():
        if body_id not in discovered_planets and rel in found:
            discovered_planets[body_id] = {
                "id": body_id,
                "file": rel if rel.startswith("assets/") else "assets/" + rel,
                "name": body_id.title(),
                "radius": 1.0,
            }

    return {
        "registry": registry,
        "found": found,
        "planets": discovered_planets,
        "audio": audio_manifest(),
    }


def list_blueprints():
    with _STATE_LOCK:
        data = _read(STATE / "blueprints.json", {})
        return [{"id": key, "name": value.get("name", "Untitled vehicle"), "updatedAt": value.get("updatedAt")} for key, value in data.items()]


def get_blueprint(identifier: str):
    with _STATE_LOCK:
        return _read(STATE / "blueprints.json", {}).get(identifier)


def save_blueprint(identifier: str, blueprint: dict):
    if not identifier or len(identifier) > 100: raise ValueError("Invalid blueprint ID.")
    with _STATE_LOCK:
        data = _read(STATE / "blueprints.json", {})
        data[identifier] = {
            "id": identifier,
            "name": blueprint.get("name", "Untitled vehicle"),
            "blueprint": blueprint,
            "updatedAt": int(time.time() * 1000)
        }
        _write("blueprints.json", data)
        return data[identifier]


def delete_blueprint(identifier: str):
    with _STATE_LOCK:
        data = _read(STATE / "blueprints.json", {})
        existed = identifier in data
        data.pop(identifier, None)
        _write("blueprints.json", data)
        return existed


def get_settings():
    with _STATE_LOCK:
        return _read(STATE / "settings.json", {})

def put_settings(settings: dict):
    with _STATE_LOCK:
        current = get_settings(); current.update(settings or {}); _write("settings.json", current); return current

def get_progress():
    with _STATE_LOCK:
        return _read(STATE / "progress.json", {})

def put_progress(identifier: str, value: dict):
    with _STATE_LOCK:
        current = get_progress()
        prev = current.get(identifier, {})
        entry = dict(value)
        new_stats = entry.get("stats") or {}
        prev_best = prev.get("best") or prev.get("stats") or {}
        if prev_best:
            best = dict(prev_best)
            if "time" in new_stats:
                best["time"] = min(prev_best.get("time", float("inf")), new_stats["time"])
            if "cost" in new_stats:
                best["cost"] = min(prev_best.get("cost", float("inf")), new_stats["cost"])
            if "mass" in new_stats:
                best["mass"] = min(prev_best.get("mass", float("inf")), new_stats["mass"])
            entry["best"] = best
        elif "stats" in entry:
            entry["best"] = entry["stats"]
        current[identifier] = entry
        _write("progress.json", current)
        return current


def _DEFS():
    return {d["id"]: d for d in catalog_data()}


def start_flight(payload: dict) -> dict:
    blueprint = payload.get("blueprint") or {}
    body_id = payload.get("bodyId", "earth")
    start = payload.get("start") or {"type": "pad"}
    stats = vehicle_stats({"blueprint": blueprint, "bodyId": body_id, "missionId": payload.get("missionId")})
    body = bodies_data().get(body_id, {})
    session = flight_session.create_session(blueprint, body_id, body, start, payload.get("missionId"), stats, _DEFS())
    with flight_session.LOCK:
        flight_session.register(session)
        snapshot = flight_session.snapshot(session)
    return {"sessionId": session.session_id, "snapshot": snapshot}


def get_flight_snapshot(session_id: str):
    with flight_session.LOCK:
        session = flight_session.lookup(session_id)
        if session is None:
            return None
        return flight_session.snapshot(session)


def flight_command(session_id: str, data: dict) -> dict:
    with flight_session.LOCK:
        session = flight_session.lookup(session_id)
        if session is None:
            return {"accepted": False, "message": "Flight session not found."}
        try:
            command = parse_command(data)
        except CommandError as exc:
            return {"accepted": False, "message": str(exc)}
        result = apply_command(session, command)
        if result["accepted"]:
            result["snapshot"] = flight_session.snapshot(session)
        return result


def close_flight(session_id: str) -> dict:
    flight_session.close_session(session_id)
    return {"ok": True}

def predict_flight(session_id: str, data: dict):
    with flight_session.LOCK:
        session = flight_session.lookup(session_id)
        if session is None:
            return None
        return soi.predict(
            session,
            horizon=data.get("horizon"),
            count=int(data.get("count", 360)),
            node=data.get("node"),
            target=data.get("target"),
        )


def _require(data, *keys):
    missing = [key for key in keys if key not in data]
    if missing:
        raise ValueError("Missing field: " + ", ".join(missing))


def _vehicle_add_part(data):
    _require(data, "blueprint", "partId")
    return attachments.add_part(data["blueprint"], _DEFS(), data["partId"], data.get("anchor"), data.get("mount") or "below", {"dir": data.get("dir", 0)})


def _vehicle_add_loose_part(data):
    _require(data, "blueprint", "partId", "x", "y")
    options = {"uid": data.get("uid"), "stage": data.get("stage"), "group": data.get("group")}
    return attachments.add_loose_part(data["blueprint"], _DEFS(), data["partId"], float(data["x"]), float(data["y"]), options)


def _vehicle_remove_part(data):
    _require(data, "blueprint", "uid")
    return attachments.remove_part(data["blueprint"], _DEFS(), data["uid"])


def _vehicle_check_targets(data):
    _require(data, "blueprint", "partId")
    results = attachments.check_targets(data["blueprint"], _DEFS(), data["partId"], data.get("targets", []))
    return {"results": [{"ok": r["ok"], "error": r.get("error"), "uid": r.get("uid"), "blueprint": r.get("blueprint")} for r in results]}

def _vehicle_attach_targets(data):
    _require(data, "blueprint", "partId")
    sym = data.get("sym", True)
    return {"targets": attachments.attach_targets(data["blueprint"], _DEFS(), data["partId"], bool(sym))}

def _vehicle_blueprint_op(path, data):
    _require(data, "blueprint")
    blueprint = data["blueprint"]
    if path == "/api/vehicle/validate":
        return attachments.validate_blueprint(blueprint, _DEFS())
    if path == "/api/vehicle/auto-stage":
        return {"blueprint": attachments.set_staging_mode(blueprint, _DEFS(), "auto")}
    if path == "/api/vehicle/connections":
        return {"edges": attachments.serialize_connections(blueprint, _DEFS())}
    _require(data, "uid", "value")
    if path == "/api/vehicle/set-stage":
        return {"blueprint": attachments.set_stage(blueprint, data["uid"], data["value"])}
    return {"blueprint": attachments.set_group(blueprint, data["uid"], data["value"])}


VEHICLE_BLUEPRINT_PATHS = {
    "/api/vehicle/validate",
    "/api/vehicle/auto-stage",
    "/api/vehicle/connections",
    "/api/vehicle/set-stage",
    "/api/vehicle/set-group",
}


def dispatch_calculation(path: str, data: dict):
    if path == "/api/flight/start": return start_flight(data)
    if path == "/api/vehicle/stats": return vehicle_stats(data)
    if path == "/api/flight/integrate": return dynamics.integrate_request(data)
    if path == "/api/vehicle/add-part": return _vehicle_add_part(data)
    if path == "/api/vehicle/remove-part": return _vehicle_remove_part(data)
    if path == "/api/vehicle/add-loose-part": return _vehicle_add_loose_part(data)
    if path == "/api/vehicle/check-targets": return _vehicle_check_targets(data)
    if path == "/api/vehicle/attach-targets": return _vehicle_attach_targets(data)
    if path in VEHICLE_BLUEPRINT_PATHS: return _vehicle_blueprint_op(path, data)
    if path == "/api/ephemeris/snapshot":
        at = float(data["time"])
        snapshot = {}
        for item in data.get("bodies", []):
            body = item["body"]
            identifier = body["id"]
            mu = float(item["mu"])
            snapshot[identifier] = {
                "position": ephemeris.body_position(body, at, mu),
                "period": ephemeris.orbital_period(body, mu) if body.get("a") else None,
            }
        return snapshot
    if path == "/api/orbit/elements":
        return orbit.state_to_elements(data["mu"], data["x"], data["y"], data["vx"], data["vy"])
    if path == "/api/orbit/propagate":
        return orbit.propagate(data["mu"], data["x"], data["y"], data["vx"], data["vy"], data.get("dt", 0))
    if path == "/api/orbit/conic":
        return {"points": orbit.sample_conic(data["elements"], int(data.get("count", 240)), float(data.get("maxRadius", float("inf"))))}
    if path == "/api/ephemeris/position":
        return {"position": ephemeris.body_position(data["body"], data["time"], data["mu"])}
    if path == "/api/ephemeris/path":
        return {"points": ephemeris.orbit_path(data["body"], int(data.get("count", 240)))}
    if path == "/api/ephemeris/period":
        return {"period": ephemeris.orbital_period(data["body"], data["mu"])}
    raise UnknownEndpoint("Unknown calculation endpoint.")