from __future__ import annotations

from dataclasses import dataclass
import math
import time

from backend.simulation import altitude, engines, flight_session, separation, staging
from backend.vehicle import part_behaviors, part_state

COMMANDS = {
    "begin_launch_sequence", "abort_launch_sequence", "set_throttle", "set_rotation", "set_sas",
    "set_time_warp", "pause", "resume", "activate_part", "ignite_stage_engines", "toggle_group",
    "deploy_payload", "activate_next_stage", "switch_vessel",
    "deploy_parachute", "jettison_heat_shield", "jettison_fairing", "collect_sample",
    "deploy_lander", "separate_lander", "deploy_rover", "deploy_seismometer",
}
WARP_LEVELS = {1, 2, 4, 10, 50, 100, 1000, 10000, 100000}
SAS_MODES = altitude.SAS_MODES

OK = {"accepted": True, "message": ""}


class CommandError(ValueError):
    pass


@dataclass(frozen=True)
class FlightCommand:
    name: str
    value: object = None


def _number(value, name):
    if isinstance(value, bool):
        raise CommandError(f"{name} must be a finite number.")
    try:
        value = float(value)
    except (TypeError, ValueError) as exc:
        raise CommandError(f"{name} must be a finite number.") from exc
    if not math.isfinite(value):
        raise CommandError(f"{name} must be a finite number.")
    return value


def parse_command(data):
    if not isinstance(data, dict) or data.get("command") not in COMMANDS:
        raise CommandError("Unknown flight command.")
    name = data["command"]
    if name == "set_throttle":
        return FlightCommand(name, max(0.0, min(1.0, _number(data.get("value", 0), "Throttle"))))
    if name == "set_rotation":
        return FlightCommand(name, max(-1.0, min(1.0, _number(data.get("value", 0), "Rotation input"))))
    if name == "set_sas":
        if data.get("mode") not in SAS_MODES:
            raise CommandError("Invalid SAS mode.")
        return FlightCommand(name, data.get("mode"))
    if name == "set_time_warp":
        value = _number(data.get("value", 1), "Time warp")
        if not value.is_integer() or int(value) not in WARP_LEVELS:
            raise CommandError("Unsupported time warp.")
        return FlightCommand(name, int(value))
    if name == "activate_part":
        if not isinstance(data.get("uid"), str) or not data["uid"]:
            raise CommandError("Part ID is required.")
        return FlightCommand(name, data["uid"])
    if name == "ignite_stage_engines":
        value = data.get("stage")
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise CommandError("Stage is invalid.")
        return FlightCommand(name, value)
    if name == "toggle_group":
        value = data.get("group")
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 4:
            raise CommandError("Engine group is invalid.")
        return FlightCommand(name, value)
    if name == "switch_vessel":
        target = data.get("target") or data.get("targetId") or "toggle"
        return FlightCommand(name, str(target))
    return FlightCommand(name)


def _start_countdown(session):
    if session["status"] == "prelaunch" and session["countdownStart"] is None:
        session["countdownStart"] = time.time()
    return OK


def _abort_countdown(session):
    session["countdownStart"] = None
    return OK


def _set_throttle(session, value):
    session["throttle"] = value
    if value > 0 and session["status"] == "prelaunch":
        flight_session.begin_liftoff(session)
    elif value > 0.05 and session["status"] == "landed":
        stage = staging.current_stage(session)
        body = session.get("body", {})
        radius = float(body.get("R", 6371000.0))
        mu = float(body.get("mu", 398600441800000.0))
        local_g = mu / (radius * radius)
        max_thrust = float(stage.get("thrustVac", 0.0)) if stage else 0.0
        fuel = session.get("fuel", 0.0)
        mass = max(1.0, session.get("mass", 1.0))
        if fuel > 0 and (max_thrust * value / mass) > (local_g * 0.9):
            session["status"] = "flying"
            session.setdefault("events", []).append({
                "sequence": len(session["events"]),
                "type": "liftoff",
                "msg": f"Liftoff from {body.get('name', 'surface')}",
                "body": session.get("bodyId"),
            })
    return OK


def _set_rotation(session, value):
    altitude.set_rotation_input(session, value)
    return OK


def _set_sas(session, value):
    altitude.set_sas(session, value)
    return OK


def _set_warp(session, value):
    session["warp"] = value
    return OK


def _pause(session, value):
    session["paused"] = True
    return OK


def _resume(session, value):
    session["paused"] = False
    session["lastTime"] = time.time()
    return OK


def _next_stage(session):
    if staging.activate_next_stage(session, session["definitions"]) is None:
        return {"accepted": False, "message": "There is no further stage."}
    return OK


def _activate_next_stage(session, value):
    if session["status"] == "prelaunch":
        return _start_countdown(session)
    res = _next_stage(session)
    if session["status"] == "landed":
        stage = staging.current_stage(session)
        if stage and session.get("throttle", 0.0) > 0.05 and session.get("fuel", 0.0) > 0:
            session["status"] = "flying"
            session.setdefault("events", []).append({
                "sequence": len(session["events"]),
                "type": "liftoff",
                "msg": f"Ascent stage liftoff from {session.get('body', {}).get('name', 'surface')}",
                "body": session.get("bodyId"),
            })
    return res


def _activate_part(session, uid):
    if engines.find_engine(session, uid) is not None:
        return engines.toggle_engine(session, uid)
    state = part_state.find_state(session["parts"], uid)
    result = part_state.apply_part_command(state, session["definitions"].get(uid, {}), flight_status=session["status"])
    if not result["accepted"]:
        return {"accepted": False, "message": result["message"]}
    if result["action"] == "next_stage":
        return _next_stage(session)
    return OK


def _ignite_stage(session, stage_number):
    return engines.ignite_stage(session, stage_number)


def _toggle_group(session, group):
    return engines.toggle_group(session, group)


def _switch_vessel(session, target="toggle"):
    controlled = session.get("controlledVessel", "launcher")
    detached = session.setdefault("detachedObjects", [])

    if target == "toggle":
        target = "launcher" if controlled in ("satellite", "rover", "payload") else "satellite"

    if target in ("satellite", "rover", "payload"):
        if controlled in ("satellite", "rover", "payload"):
            return {"accepted": True, "message": "Already controlling active payload.", "controlledVessel": controlled}
        sat_idx = next((i for i, o in enumerate(detached) if o.get("type") == "payload" or "payload" in str(o.get("id")).lower() or "sat" in str(o.get("label", "")).lower() or "rover" in str(o.get("label", "")).lower() or "rover" in str(o.get("id", "")).lower()), None)
        if sat_idx is None:
            return {"accepted": False, "message": "No deployed payload in flight to control."}
        sat_obj = detached.pop(sat_idx)

        # Save launcher as a detached object so it keeps orbiting
        launcher_obj = {
            "id": "launcher-core",
            "type": "stage",
            "label": "Spent Launcher Booster",
            "x": session["x"],
            "y": session["y"],
            "vx": session["vx"],
            "vy": session["vy"],
            "th": session["rotation"],
            "omega": session.get("angularVelocity", 0.0),
            "com": session.get("centerOfMass", 0.0),
            "mass": session["mass"],
            "dead": False,
        }
        detached.append(launcher_obj)

        session["activeSatellite"] = sat_obj
        session["controlledVessel"] = "satellite"
        session["x"] = sat_obj["x"]
        session["y"] = sat_obj["y"]
        session["vx"] = sat_obj["vx"]
        session["vy"] = sat_obj["vy"]
        session["rotation"] = sat_obj.get("th", 0.0)
        session["angularVelocity"] = 0.0
        session["rotInput"] = 0.0
        session["throttle"] = 0.0
        session["throttleActual"] = 0.0
        session["thrustNow"] = 0.0
        session["mass"] = sat_obj.get("mass", 280.0)
        session["fuel"] = 45.0
        session["fuelCap"] = 45.0
        session.setdefault("events", []).append({
            "sequence": len(session["events"]),
            "type": "switch_vessel",
            "msg": f"Active control transferred to {sat_obj.get('name', 'Satellite')}",
        })
        return {"accepted": True, "message": f"Controlling {sat_obj.get('name', 'Satellite')}", "controlledVessel": "satellite"}

    elif target == "launcher":
        if controlled == "launcher":
            return {"accepted": True, "message": "Already controlling launcher.", "controlledVessel": "launcher"}
        lnch_idx = next((i for i, o in enumerate(detached) if o.get("id") == "launcher-core" or o.get("type") == "stage"), None)
        if lnch_idx is None:
            return {"accepted": False, "message": "No launcher core found."}
        launcher_obj = detached.pop(lnch_idx)

        # Save satellite back into detached objects
        sat_data = session.get("activeSatellite") or {}
        sat_back = {
            "id": sat_data.get("id") or "payload-satellite",
            "type": "payload",
            "name": sat_data.get("name") or "TerraWatch-1 Satellite",
            "payload": sat_data.get("payload"),
            "x": session["x"],
            "y": session["y"],
            "vx": session["vx"],
            "vy": session["vy"],
            "th": session["rotation"],
            "omega": session.get("angularVelocity", 0.0),
            "com": 0.0,
            "mass": session["mass"],
            "dead": False,
        }
        detached.append(sat_back)

        session["controlledVessel"] = "launcher"
        session["x"] = launcher_obj["x"]
        session["y"] = launcher_obj["y"]
        session["vx"] = launcher_obj["vx"]
        session["vy"] = launcher_obj["vy"]
        session["rotation"] = launcher_obj.get("th", 0.0)
        session["angularVelocity"] = launcher_obj.get("omega", 0.0)
        session["rotInput"] = 0.0
        session["throttle"] = 0.0
        session["mass"] = launcher_obj.get("mass", 1200.0)
        session.setdefault("events", []).append({
            "sequence": len(session["events"]),
            "type": "switch_vessel",
            "msg": "Active control transferred back to Launcher",
        })
        return {"accepted": True, "message": "Controlling Launcher", "controlledVessel": "launcher"}

    return {"accepted": False, "message": "Unknown target vessel."}


def _deploy_payload(session, value):
    result = staging.release_payload(session)
    accepted, message = result if result else (True, "Payload deployed.")
    if accepted:
        # Automatically transfer control and camera focus to the newly deployed satellite!
        _switch_vessel(session, "satellite")
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "deploy_payload",
        "body": session.get("bodyId"),
        "msg": "Payload deployed into orbit",
    })
    return {"accepted": accepted, "message": "Payload deployed! Control transferred to satellite.", "controlledVessel": "satellite"}


def _deploy_parachute(session, value):
    definitions = session.get("definitions") or {}
    deployed_count = 0
    for part in session.get("parts", []):
        if not part.get("alive"):
            continue
        config = (definitions.get(part["uid"]) or {}).get("parachute")
        if config:
            part["armed"] = True
            part["deployed"] = True
            deployed_count += 1
    session["extraDragArea"] = part_behaviors.parachute_drag_area(session, definitions)
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "deploy_parachute",
        "msg": "Parachute deployed",
    })
    return {"accepted": True, "message": "Parachute deployed."}


def _jettison_heat_shield(session, value):
    definitions = session.get("definitions") or {}
    heat_uids = []
    for part in session.get("parts", []):
        if not part.get("alive"):
            continue
        uid = part["uid"]
        defn = definitions.get(uid) or {}
        cat = defn.get("category") or defn.get("c") or ""
        part_id = defn.get("partId") or defn.get("id") or ""
        if (
            defn.get("heatshield")
            or "heatshield" in str(cat).lower()
            or "heat" in str(part_id).lower()
            or "thermal_protection" in str(defn.get("behaviorType", "")).lower()
        ):
            heat_uids.append(uid)
    if heat_uids:
        session.setdefault("deadUids", set())
        session.setdefault("detachedObjects", [])
        session.setdefault("rotation", 0.0)
        session.setdefault("centerOfMass", 0.0)
        separation.detach_parts(session, heat_uids, definitions)
    session["heatShieldJettisoned"] = True
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "jettison_heat_shield",
        "msg": "Heat shield jettisoned",
    })
    return {"accepted": True, "message": "Heat shield jettisoned."}


def _jettison_fairing(session, value=None):
    definitions = session.get("definitions") or {}
    fairing_uids = []
    for part in session.get("parts", []):
        if not part.get("alive"):
            continue
        uid = part["uid"]
        defn = definitions.get(uid) or {}
        cat = defn.get("category") or ""
        part_id = defn.get("id") or defn.get("partId") or ""
        if cat == "fairing" or "fairing" in str(part_id).lower() or "fair" in str(part_id).lower() or defn.get("shape") == "ogive":
            fairing_uids.append(uid)
    if fairing_uids:
        session.setdefault("deadUids", set())
        session.setdefault("detachedObjects", [])
        separation.detach_parts(session, fairing_uids, definitions, speed=2.5, type="fairing", label="Fairing shroud")
    session["fairingJettisoned"] = True
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "jettison_fairing",
        "msg": "Payload fairing jettisoned",
    })
    return {"accepted": True, "message": "Fairing jettisoned."}


def _collect_sample(session, value=None):
    body_id = session.get("bodyId", "earth")
    session["sampleCollected"] = True
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "collect_sample",
        "body": body_id,
        "msg": f"Sample collected on {body_id.title()}",
    })
    return {"accepted": True, "message": f"Sample collected on {body_id.title()}."}


def _deploy_lander(session, value=None):
    session["landerDeployed"] = True
    staging.release_payload(session)
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "deploy_lander",
        "body": session.get("bodyId"),
        "msg": "Lander deployed",
    })
    return {"accepted": True, "message": "Lander deployed."}


def _deploy_rover(session, value=None):
    session["roverDeployed"] = True
    staging.release_payload(session)
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "deploy_rover",
        "body": session.get("bodyId"),
        "msg": "Rover deployed",
    })
    return {"accepted": True, "message": "Rover deployed."}


def _deploy_seismometer(session, value=None):
    session["seismometerDeployed"] = True
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "deploy_seismometer",
        "body": session.get("bodyId"),
        "msg": "Seismometer deployed",
    })
    return {"accepted": True, "message": "Seismometer deployed."}


_HANDLERS = {
    "begin_launch_sequence": lambda s, v: _start_countdown(s),
    "abort_launch_sequence": lambda s, v: _abort_countdown(s),
    "set_throttle": _set_throttle,
    "set_rotation": _set_rotation,
    "set_sas": _set_sas,
    "set_time_warp": _set_warp,
    "pause": _pause,
    "resume": _resume,
    "activate_part": _activate_part,
    "ignite_stage_engines": _ignite_stage,
    "toggle_group": _toggle_group,
    "deploy_payload": _deploy_payload,
    "activate_next_stage": _activate_next_stage,
    "switch_vessel": lambda s, v: _switch_vessel(s, v),
    "deploy_parachute": _deploy_parachute,
    "jettison_heat_shield": _jettison_heat_shield,
    "jettison_fairing": _jettison_fairing,
    "collect_sample": _collect_sample,
    "deploy_lander": _deploy_lander,
    "separate_lander": _deploy_lander,
    "deploy_rover": _deploy_rover,
    "deploy_seismometer": _deploy_seismometer,
}


def apply_command(session, command):
    return dict(_HANDLERS[command.name](session, command.value))
