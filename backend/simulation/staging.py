from __future__ import annotations

import math
from backend.vehicle import geometry
from . import separation

LIFTOFF_MAX_TWR = 1.8       
MIN_LIFTOFF_THROTTLE = 0.1


def _num(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number == number and abs(number) != float("inf") else default


def stage_list(session):
    return sorted(session["stats"].get("stages") or [], key=lambda s: s["stage"])


def current_stage(session):
    stages = stage_list(session)
    index = session.get("stageIdx", 0)
    return stages[index] if 0 <= index < len(stages) else None


def has_next_stage(session):
    return session.get("stageIdx", 0) + 1 < len(stage_list(session))


def fire_first_stage(session):
    stages = stage_list(session)
    if stages and session.get("stagesFired", 0) == 0:
        session["stageIdx"] = 0
        session["stageDone"] = stages[0]["stage"]
        session["stagesFired"] = 1


def liftoff_throttle(session):
    stages = stage_list(session)
    twr = _num(stages[0].get("twrSL")) if stages else 0.0
    if twr <= LIFTOFF_MAX_TWR:
        return 1.0
    return max(MIN_LIFTOFF_THROTTLE, min(1.0, LIFTOFF_MAX_TWR / twr))


def activate_next_stage(session, definitions=None):
    if not has_next_stage(session):
        return None
    stages = stage_list(session)
    following = stages[session["stageIdx"] + 1]
    leftover = max(0.0, _num(session.get("fuel")))   # propellant still in the old stage

    session["stageIdx"] += 1
    session["activeStage"] += 1
    session["stageDone"] = following["stage"]
    session["stagesFired"] += 1

    gone = list(following.get("jettison") or [])
    if gone:
        if definitions is not None:
            separation.detach_parts(session, gone, definitions, extra_mass=leftover)
        else:
            for part in session["parts"]:
                if part["uid"] in gone:
                    part["alive"] = False
            session["deadUids"].update(gone)
            geometry.refresh(session)
        session["deadUids"].update(gone)
        session["mass"] = _num(following.get("m0"), session["mass"])

    session["fuel"] = max(0.0, _num(following.get("m0")) - _num(following.get("m1")))
    session["fuelCap"] = session["fuel"]
    session["events"].append({
        "sequence": len(session["events"]),
        "type": "stage",
        "msg": "Stage %d ignition" % following["stage"],
    })
    return following


def release_payload(session):
    blueprint = session.get("blueprint") or {}
    payload = blueprint.get("payload") or {}
    definitions = session.get("definitions") or {}

    payload_uids = []
    for part in session.get("parts", []):
        if not part.get("alive"):
            continue
        uid = part["uid"]
        defn = definitions.get(uid) or {}
        cat = defn.get("category") or ""
        part_id = defn.get("id") or defn.get("partId") or ""
        if (
            "payload" in str(cat).lower()
            or "payload" in str(part_id).lower()
            or "rover" in str(part_id).lower()
            or "seismic" in str(part_id).lower()
            or "demosat" in str(part_id).lower()
        ):
            payload_uids.append(uid)

    has_custom = bool(
        payload and (payload.get("parts") or payload.get("name") or payload.get("mass"))
    )
    if not has_custom and not payload_uids:
        return False, "No payload design is attached to this vehicle."
    if session.get("payloadDeployed"):
        return True, "Payload already deployed."

    session["payloadDeployed"] = True

    if payload_uids:
        session.setdefault("deadUids", set())
        session.setdefault("detachedObjects", [])
        separation.detach_parts(session, payload_uids, definitions, speed=1.5)

    if has_custom:
        summary = payload.get("summary") or {}
        p_mass = max(10.0, float(summary.get("mass") or payload.get("mass") or 50.0))
        count = int(session.get("separationCount", 0))
        session["separationCount"] = count + 1
        angle = float(session.get("rotation", 0.0))
        kick = 1.5
        p_body = {
            "id": f"payload-{count}",
            "type": "payload",
            "name": payload.get("name") or "Deployed Satellite",
            "uids": [],
            "payload": payload,
            "x": session["x"],
            "y": session["y"],
            "vx": session["vx"] + math.sin(angle) * kick,
            "vy": session["vy"] + math.cos(angle) * kick,
            "th": angle,
            "com": 0.0,
            "mass": p_mass,
            "dead": False,
        }
        session.setdefault("detachedObjects", []).append(p_body)
        session["mass"] = max(1.0, float(session.get("mass", 0.0)) - p_mass)

    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "payload_deployed",
        "body": session.get("bodyId"),
        "msg": f"{payload.get('name') or 'Payload'} deployed",
    })
    return True, "Payload deployed."
