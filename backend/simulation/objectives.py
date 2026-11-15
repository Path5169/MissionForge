from __future__ import annotations

import json
import math
from pathlib import Path

from backend.simulation import orbit, soi

MISSIONS_PATH = Path(__file__).resolve().parents[2] / "frontend" / "data" / "missions" / "missions.json"

INACTIVE_STATUSES = {"prelaunch", "landed", "crashed", "closed"}

EVENT_ALIASES = {
    "deploy_payload": {"deploy_payload", "payload_deployed", "deploy_rover", "rover_deploy", "rover_deployed", "rover", "deploy_seismometer", "seismometer_deployed", "seismometer"},
    "payload_deployed": {"deploy_payload", "payload_deployed", "deploy_rover", "rover_deploy", "rover_deployed", "rover", "deploy_seismometer", "seismometer_deployed", "seismometer"},
    "deploy_parachute": {"deploy_parachute", "parachute"},
    "parachute": {"deploy_parachute", "parachute"},
    "deploy_lander": {"deploy_lander", "separate_lander", "deploy_payload"},
    "separate_lander": {"deploy_lander", "separate_lander", "deploy_payload"},
    "jettison_heat_shield": {"jettison_heat_shield", "heat_shield_jettison"},
    "heat_shield_jettison": {"jettison_heat_shield", "heat_shield_jettison"},
    "collect_sample": {"collect_sample", "sample_collected"},
    "sample_collected": {"collect_sample", "sample_collected"},
    "perijove": {"perijove", "perijove_pass"},
    "perijove_pass": {"perijove", "perijove_pass"},
    "periapsis": {"periapsis", "periapsis_pass"},
    "periapsis_pass": {"periapsis", "periapsis_pass"},
    "flyby": {"flyby", "flyby_pass"},
    "jettison_fairing": {"jettison_fairing", "fairing_jettison", "fairing"},
    "fairing_jettison": {"jettison_fairing", "fairing_jettison", "fairing"},
    "deploy_rover": {"deploy_rover", "rover_deploy", "rover_deployed", "rover", "deploy_payload", "payload_deployed"},
    "rover_deploy": {"deploy_rover", "rover_deploy", "rover_deployed", "rover", "deploy_payload", "payload_deployed"},
    "deploy_seismometer": {"deploy_seismometer", "seismometer_deployed", "seismometer", "deploy_payload"},
}


class ObjectiveError(ValueError):
    pass


def _number(spec, key, default=None, minimum=None, positive=False):
    value = spec.get(key, default)
    if value is None:
        raise ObjectiveError(f"Objective '{spec.get('id')}' requires '{key}'.")
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ObjectiveError(f"Objective '{spec.get('id')}': '{key}' must be a finite number.")
    value = float(value)
    if positive and value <= 0:
        raise ObjectiveError(f"Objective '{spec.get('id')}': '{key}' must be greater than zero.")
    if minimum is not None and value < minimum:
        raise ObjectiveError(f"Objective '{spec.get('id')}': '{key}' must be at least {minimum}.")
    return value


def _text(spec, key):
    value = spec.get(key)
    if not isinstance(value, str) or not value:
        raise ObjectiveError(f"Objective '{spec.get('id')}' requires '{key}' as a non-empty string.")
    return value


def _ratio(current, target):
    if target <= 0:
        return 1.0
    return max(0.0, min(1.0, current / target))


def _prepare_altitude(spec):
    spec["value"] = _number(spec, "value", positive=True)


def _check_altitude(spec, obs):
    reached = obs["maxAltitude"]
    return reached >= spec["value"], _ratio(reached, spec["value"])


def _prepare_speed(spec):
    spec["value"] = _number(spec, "value", positive=True)


def _check_speed(spec, obs):
    return obs["speed"] >= spec["value"], _ratio(obs["speed"], spec["value"])


def _prepare_orbit(spec):
    if spec.get("body") is None and spec.get("target") is not None:
        spec["body"] = str(spec["target"])
    spec["minPeriapsis"] = _number(spec, "minPeriapsis", default=0.0)
    for key in ("maxApoapsis", "minApoapsis", "maxEccentricity", "minEccentricity", "minPeriod", "maxPeriod"):
        if spec.get(key) is not None:
            spec[key] = _number(spec, key, minimum=0.0)

    target_ecc = spec.get("targetEccentricity") if spec.get("targetEccentricity") is not None else spec.get("eccentricity")
    if target_ecc is not None:
        ecc_val = _number(spec, "targetEccentricity" if "targetEccentricity" in spec else "eccentricity", minimum=0.0)
        tol = _number(spec, "eccentricityTolerance", default=0.05, minimum=0.0)
        if spec.get("minEccentricity") is None:
            spec["minEccentricity"] = max(0.0, ecc_val - tol)
        if spec.get("maxEccentricity") is None:
            spec["maxEccentricity"] = ecc_val + tol

    target_per = spec.get("targetPeriod") if spec.get("targetPeriod") is not None else spec.get("period")
    if target_per is not None:
        per_val = _number(spec, "targetPeriod" if "targetPeriod" in spec else "period", minimum=0.0)
        per_tol = _number(spec, "periodTolerance", default=per_val * 0.05, minimum=0.0)
        if spec.get("minPeriod") is None:
            spec["minPeriod"] = max(0.0, per_val - per_tol)
        if spec.get("maxPeriod") is None:
            spec["maxPeriod"] = per_val + per_tol

    if spec.get("maxApoapsis") is not None and spec["maxApoapsis"] < spec["minPeriapsis"]:
        raise ObjectiveError(f"Objective '{spec['id']}': 'maxApoapsis' is below 'minPeriapsis'.")
    if spec.get("minEccentricity") is not None and spec.get("maxEccentricity") is not None and spec["maxEccentricity"] < spec["minEccentricity"]:
        raise ObjectiveError(f"Objective '{spec['id']}': 'maxEccentricity' is below 'minEccentricity'.")
    if spec.get("minPeriod") is not None and spec.get("maxPeriod") is not None and spec["maxPeriod"] < spec["minPeriod"]:
        raise ObjectiveError(f"Objective '{spec['id']}': 'maxPeriod' is below 'minPeriod'.")


def _check_orbit(spec, obs):
    if obs["status"] in INACTIVE_STATUSES or not obs["bound"]:
        return False, 0.0
    if spec.get("body") is not None and obs["bodyId"] != spec["body"]:
        return False, 0.0
    peri = obs["peri"]
    apo = obs["apo"]
    minimum_peri = spec["minPeriapsis"]
    checks = [(peri >= minimum_peri, _ratio(peri, minimum_peri) if minimum_peri > 0 else 1.0)]
    if spec.get("maxApoapsis") is not None:
        checks.append((apo <= spec["maxApoapsis"], _ratio(spec["maxApoapsis"], apo)))
    if spec.get("minApoapsis") is not None:
        checks.append((apo >= spec["minApoapsis"], _ratio(apo, spec["minApoapsis"])))
    if spec.get("minEccentricity") is not None:
        checks.append((obs["ecc"] >= spec["minEccentricity"], _ratio(obs["ecc"], spec["minEccentricity"])))
    if spec.get("maxEccentricity") is not None:
        checks.append((obs["ecc"] <= spec["maxEccentricity"], _ratio(spec["maxEccentricity"], obs["ecc"])))
    if spec.get("minPeriod") is not None:
        checks.append((obs["period"] >= spec["minPeriod"], _ratio(obs["period"], spec["minPeriod"])))
    if spec.get("maxPeriod") is not None:
        checks.append((obs["period"] <= spec["maxPeriod"], _ratio(spec["maxPeriod"], obs["period"])))
    if all(passed for passed, _ in checks):
        return True, 1.0
    return False, min(0.99, min(score for _, score in checks))


def _prepare_soft_landing(spec):
    if spec.get("body") is None and spec.get("target") is not None:
        spec["body"] = str(spec["target"])
    spec["maxSpeed"] = _number(spec, "maxSpeed", positive=True)
    spec["minPriorAltitude"] = _number(spec, "minPriorAltitude", default=100.0, minimum=0.0)


def _check_soft_landing(spec, obs):
    if spec.get("body") is not None and obs["bodyId"] != spec["body"]:
        return False, 0.0
    ok = (
        obs["status"] == "landed"
        and obs["impactSpeed"] is not None
        and obs["impactSpeed"] <= spec["maxSpeed"]
        and obs["maxAltitude"] >= spec["minPriorAltitude"]
    )
    return ok, 1.0 if ok else 0.0


def _prepare_stages(spec):
    spec["value"] = int(_number(spec, "value", positive=True))


def _check_stages(spec, obs):
    fired = obs["stagesFired"]
    return fired >= spec["value"], _ratio(fired, spec["value"])


def _prepare_event(spec):
    spec["event"] = _text(spec, "event")
    spec["count"] = int(_number(spec, "count", default=1, positive=True))
    if spec.get("body") is None and spec.get("target") is not None:
        spec["body"] = str(spec["target"])


def _event_match(spec, event):
    if not isinstance(event, dict):
        return False
    etype = event.get("type") or event.get("name")
    target_types = EVENT_ALIASES.get(spec["event"], {spec["event"]})
    if etype not in target_types:
        return False
    if spec.get("body") is not None:
        ebody = event.get("body")
        if ebody and ebody != spec["body"]:
            return False
    return True


def _check_event(spec, obs):
    matches = sum(1 for e in obs["events"] if _event_match(spec, e))
    ok = matches >= spec["count"]
    return ok, 1.0 if ok else _ratio(matches, spec["count"])


def _prepare_reach_body(spec):
    target = spec.get("value") or spec.get("target") or spec.get("body")
    if not target or not isinstance(target, str):
        raise ObjectiveError(f"Objective '{spec.get('id')}' requires 'value', 'target', or 'body'.")
    spec["value"] = target


def _check_reach_body(spec, obs):
    ok = obs["bodyId"] == spec["value"]
    return ok, 1.0 if ok else 0.0


def _prepare_flyby(spec):
    target = spec.get("target") or spec.get("body")
    if not target or not isinstance(target, str):
        raise ObjectiveError(f"Objective '{spec.get('id')}' requires 'target' or 'body' as a non-empty string.")
    spec["target"] = target
    if spec["target"] not in soi.catalog():
        raise ObjectiveError(f"Objective '{spec['id']}': unknown target body '{spec['target']}'.")
    dist_key = "maxDistance" if "maxDistance" in spec else ("distance" if "distance" in spec else "altitude")
    spec["maxDistance"] = _number(spec, dist_key, positive=True)
    spec["count"] = int(_number(spec, "count", default=1, positive=True))
    spec["rearmFactor"] = _number(spec, "rearmFactor", default=1.5, minimum=1.0)


def _check_flyby(spec, obs):
    needed = spec["count"]
    passes = obs["passes"]
    if passes >= needed:
        return True, 1.0
    current = obs["distance"]
    partial = 0.0
    if current is not None and current > spec["maxDistance"]:
        partial = _ratio(spec["maxDistance"], current)
    return False, min(0.99, (passes + partial) / needed)


def _prepare_rendezvous(spec):
    target = spec.get("target") or spec.get("body")
    if not target or not isinstance(target, str):
        raise ObjectiveError(f"Objective '{spec.get('id')}' requires 'target' or 'body' as a non-empty string.")
    spec["target"] = target
    if spec["target"] not in soi.catalog():
        raise ObjectiveError(f"Objective '{spec['id']}': unknown target body '{spec['target']}'.")
    dist_key = "maxDistance" if "maxDistance" in spec else ("distance" if "distance" in spec else "altitude")
    spec["maxDistance"] = _number(spec, dist_key, positive=True)
    spd_key = "maxRelativeSpeed" if "maxRelativeSpeed" in spec else ("maxSpeed" if "maxSpeed" in spec else "relativeSpeed")
    spec["maxRelativeSpeed"] = _number(spec, spd_key, positive=True)


def _check_rendezvous(spec, obs):
    if obs["status"] in ("crashed", "closed"):
        return False, 0.0
    rel_info = obs["relative"].get(spec["target"])
    if not rel_info:
        return False, 0.0
    distance, speed = rel_info
    ok = distance <= spec["maxDistance"] and speed <= spec["maxRelativeSpeed"]
    if ok:
        return True, 1.0
    progress = min(_ratio(spec["maxDistance"], distance), _ratio(spec["maxRelativeSpeed"], speed))
    return False, progress


def _prepare_land_on(spec):
    target = spec.get("target") or spec.get("body")
    if not target or not isinstance(target, str):
        raise ObjectiveError(f"Objective '{spec.get('id')}' requires 'target' or 'body' as a non-empty string.")
    spec["target"] = target
    if spec["target"] not in soi.catalog():
        raise ObjectiveError(f"Objective '{spec['id']}': unknown target body '{spec['target']}'.")
    spec["maxSpeed"] = _number(spec, "maxSpeed", default=8.0, positive=True)


def _check_land_on(spec, obs):
    if obs["bodyId"] != spec["target"]:
        return False, 0.0
    speed = obs["impactSpeed"]
    ok = obs["status"] == "landed" and speed is not None and speed <= spec["maxSpeed"]
    return ok, 1.0 if ok else 0.0


def _prepare_return_entry(spec):
    target = spec.get("target") or spec.get("body") or "earth"
    if not isinstance(target, str) or not target:
        raise ObjectiveError(f"Objective '{spec.get('id')}': invalid target body.")
    spec["target"] = target
    if spec["target"] not in soi.catalog():
        raise ObjectiveError(f"Objective '{spec['id']}': unknown target body '{spec['target']}'.")
    spec["maxSpeed"] = _number(spec, "maxSpeed", default=10.0, positive=True)
    spec["minPriorAltitude"] = _number(spec, "minPriorAltitude", default=100000.0, minimum=0.0)


def _check_return_entry(spec, obs):
    if obs["bodyId"] != spec["target"]:
        return False, 0.0
    away = any(visited != spec["target"] for visited in obs["visited"]) or (obs["maxAltitude"] >= spec["minPriorAltitude"])
    if not away:
        return False, 0.0
    speed = obs["impactSpeed"]
    ok = obs["status"] == "landed" and speed is not None and speed <= spec["maxSpeed"]
    return ok, 1.0 if ok else 0.1


def _prepare_impact(spec):
    target = spec.get("target") or spec.get("body")
    if not target or not isinstance(target, str):
        raise ObjectiveError(f"Objective '{spec.get('id')}' requires 'target' or 'body' as a non-empty string.")
    spec["target"] = target
    if spec["target"] not in soi.catalog():
        raise ObjectiveError(f"Objective '{spec['id']}': unknown target body '{spec['target']}'.")
    spd_key = "minSpeed" if "minSpeed" in spec else ("speed" if "speed" in spec else "minImpactSpeed")
    spec["minSpeed"] = _number(spec, spd_key, default=0.0, minimum=0.0)


def _check_impact(spec, obs):
    if obs["bodyId"] != spec["target"]:
        return False, 0.0
    speed = obs["impactSpeed"] if obs["impactSpeed"] is not None else obs["speed"]
    if obs["status"] == "crashed" and speed is not None:
        ok = speed >= spec["minSpeed"]
        return ok, 1.0 if ok else _ratio(speed, spec["minSpeed"])
    return False, _ratio(obs["speed"], spec["minSpeed"])


_TYPES = {
    "altitude": (_prepare_altitude, _check_altitude),
    "speed": (_prepare_speed, _check_speed),
    "orbit": (_prepare_orbit, _check_orbit),
    "soft_landing": (_prepare_soft_landing, _check_soft_landing),
    "stages": (_prepare_stages, _check_stages),
    "event": (_prepare_event, _check_event),
    "reach_body": (_prepare_reach_body, _check_reach_body),
    "flyby": (_prepare_flyby, _check_flyby),
    "impact": (_prepare_impact, _check_impact),
    "land_on": (_prepare_land_on, _check_land_on),
    "return_entry": (_prepare_return_entry, _check_return_entry),
    "rendezvous": (_prepare_rendezvous, _check_rendezvous),
}


def _after(raw, spec):
    value = raw.get("after")
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        raise ObjectiveError(f"Objective '{spec['id']}': 'after' must be an objective id or a list of ids.")
    unique = []
    for item in value:
        if item not in unique:
            unique.append(item)
    return unique


def _normalise(raw, index):
    if not isinstance(raw, dict):
        raise ObjectiveError(f"Objective {index + 1} must be an object.")
    spec = dict(raw)
    spec["id"] = str(raw.get("id") or f"objective_{index + 1}")
    spec["label"] = str(raw.get("label") or spec["id"])
    kind = raw.get("type")
    if kind not in _TYPES:
        raise ObjectiveError(f"Objective '{spec['id']}' has unknown type '{kind}'.")
    if raw.get("body") is not None and not isinstance(raw.get("body"), str):
        raise ObjectiveError(f"Objective '{spec['id']}': 'body' must be a string.")
    if raw.get("phase") is not None:
        try:
            spec["phase"] = int(raw["phase"])
        except (ValueError, TypeError):
            spec["phase"] = raw["phase"]
    spec["after"] = _after(raw, spec)
    hold = raw.get("holdSeconds")
    if hold is None:
        hold = raw.get("hold")
    if hold is None:
        hold = raw.get("duration")
    if hold is None:
        hold = raw.get("durationSeconds", 0.0)
    spec["hold"] = _number(spec, "hold", default=float(hold), minimum=0.0)
    _TYPES[kind][0](spec)
    return spec


def _load_mission(mission_id):
    try:
        with MISSIONS_PATH.open(encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise ObjectiveError(f"Mission data could not be read: {exc}") from exc
    for mission in data.get("missions", []):
        if isinstance(mission, dict) and mission.get("id") == mission_id:
            return mission
    raise ObjectiveError(f"Unknown mission '{mission_id}'.")


def _target_altitude(session, target):
    current_id = session.get("bodyId")
    t = float(session.get("missionTime", 0.0) or 0.0)
    craft = {key: float(session.get(key, 0.0) or 0.0) for key in soi.KEYS}
    relative = craft if current_id == target else soi.convert(session, craft, current_id, target, t)
    radius = float(soi.body(session, target).get("R", 0.0) or 0.0)
    return max(0.0, math.hypot(relative["x"], relative["y"]) - radius)


def _relative_state(session, target):
    current_id = session.get("bodyId")
    t = float(session.get("missionTime", 0.0) or 0.0)
    craft = {key: float(session.get(key, 0.0) or 0.0) for key in soi.KEYS}
    relative = craft if current_id == target else soi.convert(session, craft, current_id, target, t)
    radius = float(soi.body(session, target).get("R", 0.0) or 0.0)
    center_dist = math.hypot(relative["x"], relative["y"])
    surface_dist = max(0.0, center_dist - radius)
    dist = min(center_dist, surface_dist)
    return dist, math.hypot(relative["vx"], relative["vy"])


def _observe(session, run):
    body = session.get("body") or {}
    radius = float(body.get("R", 0.0))
    mu = float(body.get("mu", 0.0))
    x = float(session.get("x", 0.0))
    y = float(session.get("y", 0.0))
    vx = float(session.get("vx", 0.0))
    vy = float(session.get("vy", 0.0))
    altitude = max(0.0, math.hypot(x, y) - radius)
    speed = math.hypot(vx, vy)
    status = session.get("status")

    bound = False
    apo = altitude
    peri = altitude
    ecc = 0.0
    period = 0.0
    try:
        elements = orbit.state_to_elements(mu, x, y, vx, vy)
        bound = bool(elements["bound"])
        ecc = float(elements["e"])
        period = float(elements["period"])
        peri = elements["rp"] - radius
        apo = elements["ra"] - radius if bound else altitude
    except (ArithmeticError, KeyError, TypeError, ValueError):
        pass

    if status not in ("landed", "crashed"):
        run.last_speed = speed
    impact = session.get("impactSpeed")
    if impact is None and status == "landed":
        impact = run.last_speed

    distances = {target: _target_altitude(session, target) for target in run.targets}

    run.visited.add(session.get("bodyId"))
    relative = {target: _relative_state(session, target) for target in run.rendezvous_targets}

    return {
        "bodyId": session.get("bodyId"),
        "status": status,
        "altitude": altitude,
        "maxAltitude": max(float(session.get("maxAltitude", 0.0) or 0.0), altitude),
        "speed": speed,
        "bound": bound,
        "apo": apo,
        "peri": peri,
        "ecc": ecc,
        "period": period,
        "impactSpeed": None if impact is None else float(impact),
        "stagesFired": int(session.get("stagesFired", 0) or 0),
        "events": list(session.get("events") or []),
        "distances": distances,
        "closest": {},
        "relative": relative,
        "visited": set(run.visited),
        "time": float(session.get("missionTime", 0.0) or 0.0),
    }


class ObjectiveRun:
    def __init__(self, mission_id, specs, session=None, mission_data=None):
        self.mission_id = mission_id
        self.specs = specs
        self.session = session
        self.mission_data = mission_data or {}
        count = len(specs)
        position = {spec["id"]: index for index, spec in enumerate(specs)}
        self.after = [[position[name] for name in spec["after"]] for spec in specs]
        self.met = [False] * count
        self.locked = [bool(deps) for deps in self.after]
        self.since = [None] * count
        self.progress = [0.0] * count
        self.event_base = [0] * count
        self.met_marker = [0] * count
        self.best = [None] * count
        self.counts = [0] * count
        self.inside = [False] * count
        self.last_speed = 0.0
        self.last_vr = None
        self.targets = sorted({spec["target"] for spec in specs if spec["type"] == "flyby"})
        self.rendezvous_targets = sorted({spec["target"] for spec in specs if spec["type"] == "rendezvous"})
        self.visited = set()
        self.outcome = "active"
        self.failure_reason = None
        self.failure_details = None
        self.failed_objective = None

    def _ready(self, index):
        return all(self.met[dep] for dep in self.after[index])

    def _view(self, index, spec, obs, session):
        view = dict(obs)
        base = self.event_base[index]
        view["events"] = [
            event for event in obs["events"]
            if isinstance(event, dict) and event.get("sequence", 0) >= base
        ]
        if spec["type"] == "flyby":
            distance = obs["distances"].get(spec["target"])
            best = self.best[index]
            if distance is not None and (best is None or distance < best):
                self.best[index] = distance
            if self.best[index] is not None:
                view["closest"] = {spec["target"]: self.best[index]}
            if distance is not None:
                if distance <= spec["maxDistance"]:
                    if not self.inside[index]:
                        self.inside[index] = True
                        self.counts[index] += 1
                        ev = {
                            "sequence": len(session.get("events", [])),
                            "type": "flyby",
                            "body": spec["target"],
                            "distance": distance,
                            "msg": f"Flyby of {spec['target'].title()}",
                        }
                        if session is not None and "events" in session:
                            session["events"].append(ev)
                        view["events"].append(ev)
                elif distance > spec["maxDistance"] * spec["rearmFactor"]:
                    self.inside[index] = False
            view["distance"] = distance
            view["passes"] = self.counts[index]
        if spec["type"] == "event":
            self.counts[index] = sum(
                1 for event in view["events"]
                if _event_match(spec, event)
            )
        return view

    def update(self, session):
        self.session = session

        # Detect periapsis / perijove crossings before observing
        body = session.get("body") or {}
        mu = float(body.get("mu", 0.0) or 0.0)
        x = float(session.get("x", 0.0))
        y = float(session.get("y", 0.0))
        vx = float(session.get("vx", 0.0))
        vy = float(session.get("vy", 0.0))
        speed = math.hypot(vx, vy)
        r = math.hypot(x, y)
        if r > 0 and speed > 0 and mu > 0:
            vr = (x * vx + y * vy) / r
            bound = False
            try:
                elements = orbit.state_to_elements(mu, x, y, vx, vy)
                bound = bool(elements["bound"])
            except (ArithmeticError, KeyError, TypeError, ValueError):
                pass
            if bound and self.last_vr is not None and self.last_vr < -0.1 and vr >= 0.0:
                current_body = session.get("bodyId")
                events = session.setdefault("events", [])
                events.append({
                    "sequence": len(events),
                    "type": "periapsis",
                    "body": current_body,
                    "msg": f"{current_body.title() if current_body else 'Orbit'} periapsis pass",
                })
                if current_body == "jupiter":
                    events.append({
                        "sequence": len(events),
                        "type": "perijove",
                        "body": "jupiter",
                        "msg": "Jupiter perijove pass",
                    })
            self.last_vr = vr

        obs = _observe(session, self)

        for index, spec in enumerate(self.specs):
            if self.met[index]:
                self.progress[index] = 1.0
                continue
            if not self._ready(index):
                self.locked[index] = True
                self.since[index] = None
                self.progress[index] = 0.0
                continue
            if self.locked[index]:
                self.locked[index] = False
                self.event_base[index] = max((self.met_marker[dep] for dep in self.after[index]), default=0)
            view = self._view(index, spec, obs, session)
            required_body = spec.get("body")
            if required_body is not None and spec["type"] not in ("flyby", "rendezvous", "impact", "reach_body", "land_on", "return_entry"):
                if obs["bodyId"] != required_body:
                    self.since[index] = None
                    self.progress[index] = 0.0
                    continue
            ok, progress = _TYPES[spec["type"]][1](spec, view)
            if ok:
                if self.since[index] is None:
                    self.since[index] = obs["time"]
                held = obs["time"] - self.since[index]
                if spec["hold"] <= 0.0 or held >= spec["hold"]:
                    self.met[index] = True
                    self.met_marker[index] = len(obs["events"])
                    self.progress[index] = 1.0
                    if spec["type"] == "rendezvous" and "events" in session:
                        session["events"].append({
                            "sequence": len(session["events"]),
                            "type": "rendezvous",
                            "body": spec["target"],
                            "msg": f"Rendezvous with {spec['target'].title()} confirmed",
                        })
                else:
                    self.progress[index] = min(0.99, max(0.01, held / spec["hold"]))
            else:
                self.since[index] = None
                self.progress[index] = progress

        if self.outcome == "active":
            if self.specs and all(self.met):
                self.outcome = "complete"
            elif obs["status"] == "crashed":
                self.outcome = "failure"
                self._diagnose_failure(session, obs)
            else:
                premature = self._check_premature_deployment(session, obs)
                if premature:
                    self.outcome = "failure"
                    self.failure_reason = "Premature Payload Deployment"
                    self.failure_details = premature
                    self._mark_failed_objective()
                elif self._check_suborbital_exhaustion(session, obs):
                    self.outcome = "failure"
                    self.failure_reason = "Suborbital Propellant Depletion"
                    self.failure_details = "All rocket stages depleted while on a suborbital descent trajectory without reaching required orbital velocity (~7,800 m/s)."
                    self._mark_failed_objective()
        return self.report()

    def _mark_failed_objective(self):
        for idx, spec in enumerate(self.specs):
            if not self.met[idx]:
                self.failed_objective = spec.get("label", spec.get("id"))
                break

    def _diagnose_failure(self, session, obs):
        self._mark_failed_objective()
        time = float(obs.get("time", 0.0) or 0.0)
        speed = float(obs.get("speed", 0.0) or 0.0)
        max_alt = float(obs.get("maxAltitude", 0.0) or 0.0)
        fuel = float(obs.get("fuel", 0.0) or 0.0)
        
        if time < 5.0 and max_alt < 50.0:
            self.failure_reason = "Launch Pad Collapse / Insufficient Thrust"
            self.failure_details = "Vehicle failed to generate adequate thrust-to-weight ratio (TWR > 1.0) and toppled or exploded on the launch pad."
            return

        if fuel <= 0.01 and max_alt < 150000.0:
            self.failure_reason = "Suborbital Propellant Depletion"
            self.failure_details = f"Propellant exhausted at peak altitude {max_alt/1000:.1f} km before achieving orbital velocity (7,800 m/s). Vehicle re-entered atmosphere and crashed at {speed:.0f} m/s."
            return

        if speed > 20.0:
            self.failure_reason = "High-Velocity Surface Impact"
            self.failure_details = f"Vehicle impacted terrain at {speed:.0f} m/s. Impact energy exceeded structural tolerance."
            return

        self.failure_reason = "Hard Landing / Structural Failure"
        self.failure_details = f"Touchdown velocity ({speed:.1f} m/s) exceeded safe landing limits (max 8 m/s)."

    def _check_premature_deployment(self, session, obs):
        events = session.get("events", [])
        for ev in events:
            ev_type = ev.get("type", "")
            if ev_type in ("deploy_payload", "payload_deployed", "deploy_rover"):
                for idx, spec in enumerate(self.specs):
                    if spec.get("type") == "orbit" and not self.met[idx]:
                        alt = obs.get("altitude", 0.0)
                        return f"Payload deployed prematurely inside atmosphere at altitude {alt/1000:.1f} km before orbital circularization was achieved."
        return None

    def _check_suborbital_exhaustion(self, session, obs):
        time = float(obs.get("time", 0.0) or 0.0)
        fuel = float(obs.get("fuel", 0.0) or 0.0)
        alt = float(obs.get("altitude", 0.0) or 0.0)
        speed = float(obs.get("speed", 0.0) or 0.0)
        vy = float(session.get("vy", 0.0))
        has_orbit = any(spec.get("type") == "orbit" for spec in self.specs)
        if has_orbit and time > 30.0 and fuel <= 0.001 and alt < 120000.0 and vy < -5.0 and speed < 6500.0:
            return True
        return False

    def report(self):
        active_phase = None
        total_phases = 0
        all_phases = [spec.get("phase") for spec in self.specs if spec.get("phase") is not None]
        if all_phases:
            total_phases = max(all_phases)
            for idx, spec in enumerate(self.specs):
                if not self.met[idx] and spec.get("phase") is not None:
                    active_phase = spec.get("phase")
                    break
            if active_phase is None and all(self.met):
                active_phase = total_phases

        return {
            "objectives": [
                {
                    "id": spec["id"],
                    "label": spec["label"],
                    "type": spec["type"],
                    "met": self.met[index],
                    "locked": self.locked[index],
                    "after": list(spec["after"]),
                    "count": self.counts[index],
                    "required": spec.get("count"),
                    "progress": round(self.progress[index], 4),
                    "phase": spec.get("phase"),
                    "hold": spec.get("hold"),
                }
                for index, spec in enumerate(self.specs)
            ],
            "activePhase": active_phase,
            "totalPhases": total_phases,
            "missionStatus": self.outcome,
            "outcome": self.outcome,
            "failureReason": self.failure_reason,
            "failureDetails": self.failure_details,
            "failedObjective": self.failed_objective,
            "passCriteria": self.mission_data.get("passCriteria", []),
            "failCriteria": self.mission_data.get("failCriteria", []),
        }


def _check_order(specs):
    ids = {spec["id"] for spec in specs}
    graph = {}
    for spec in specs:
        for name in spec["after"]:
            if name == spec["id"]:
                raise ObjectiveError(f"Objective '{spec['id']}' cannot come after itself.")
            if name not in ids:
                raise ObjectiveError(f"Objective '{spec['id']}' comes after unknown objective '{name}'.")
        graph[spec["id"]] = spec["after"]
    state = {}

    def visit(name):
        if state.get(name) == 1:
            raise ObjectiveError(f"Objective order has a loop at '{name}'.")
        if state.get(name) == 2:
            return
        state[name] = 1
        for parent in graph[name]:
            visit(parent)
        state[name] = 2

    for name in graph:
        visit(name)


def create_run(session):
    mission_id = session.get("missionId")
    if not mission_id:
        return None
    mission = _load_mission(mission_id)
    raw = mission.get("objectives") or []
    if not raw:
        return None
    specs = [_normalise(item, index) for index, item in enumerate(raw)]
    ids = [spec["id"] for spec in specs]
    if len(set(ids)) != len(ids):
        raise ObjectiveError(f"Mission '{mission_id}' has duplicate objective ids.")

    has_phases = any(spec.get("phase") is not None for spec in specs)
    if has_phases:
        phase_map = {}
        for s in specs:
            p = s.get("phase")
            if p is not None:
                phase_map.setdefault(p, []).append(s["id"])
        sorted_phases = sorted(phase_map.keys())
        for idx, p in enumerate(sorted_phases):
            if idx > 0:
                prev_phase_ids = phase_map[sorted_phases[idx - 1]]
                for s in specs:
                    if s.get("phase") == p and not s["after"]:
                        s["after"] = list(prev_phase_ids)

    if mission.get("ordered") is True:
        for index in range(1, len(specs)):
            if not specs[index]["after"]:
                specs[index]["after"] = [specs[index - 1]["id"]]

    _check_order(specs)
    return ObjectiveRun(mission_id, specs, session=session, mission_data=mission)


def evaluate(session):
    if "objectiveRun" not in session:
        session["objectiveRun"] = create_run(session)
    run = session["objectiveRun"]
    if run is None:
        return {"objectives": [], "activePhase": None, "totalPhases": 0, "missionStatus": None}
    return run.update(session)
