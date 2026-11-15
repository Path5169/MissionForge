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
            or "sat" in str(part_id).lower()
        ):
            payload_uids.append(uid)

    # Also include any parts mounted to payload parts (e.g. rover wheels, cameras, instruments)
    bp_parts = (session.get("blueprint") or {}).get("parts") or []
    expanded = True
    while expanded:
        expanded = False
        for p in bp_parts:
            p_uid = p.get("uid")
            if p_uid and p_uid not in payload_uids and p.get("parent") in payload_uids:
                payload_uids.append(p_uid)
                expanded = True

    has_custom = bool(
        payload and (payload.get("parts") or payload.get("name") or payload.get("mass"))
    )
    if not has_custom and not payload_uids:
        return False, "No payload design is attached to this vehicle."
    if session.get("payloadDeployed"):
        return True, "Payload already deployed."

    session["payloadDeployed"] = True
    session.setdefault("deadUids", set())
    session.setdefault("detachedObjects", [])

    angle = float(session.get("rotation", 0.0))
    fwd_x = math.sin(angle)
    fwd_y = math.cos(angle)

    # Compute physical location of payload relative to rocket COM
    items = session.get("layout") or {}
    p_uids = [u for u in payload_uids if u in items]
    com = float(session.get("centerOfMass", 0.0))
    if p_uids:
        p_y0 = min(items[u]["y0"] for u in p_uids)
        p_y1 = max(items[u]["y1"] for u in p_uids)
        p_center = (p_y0 + p_y1) / 2.0
        # In vehicle stack, top is smaller Y, so distance forward from COM:
        sep_dist = max(1.0, com - p_center)
    else:
        sep_dist = 2.4

    kick = 1.8       # Forward spring ejection push (m/s)

    summary = payload.get("summary") or {}
    p_mass = max(20.0, float(summary.get("mass") or payload.get("mass") or 280.0))
    count = int(session.get("separationCount", 0))
    session["separationCount"] = count + 1

    # Kill payload parts on launcher vehicle
    if payload_uids:
        session["deadUids"].update(payload_uids)
        for part in session.get("parts", []):
            if part.get("uid") in payload_uids:
                part["alive"] = False
        geometry.refresh(session)

    # Rocket booster experiences backwards recoil
    rocket_mass = max(10.0, float(session.get("mass", 800.0)))
    recoil = kick * (p_mass / rocket_mass)
    session["vx"] -= fwd_x * recoil
    session["vy"] -= fwd_y * recoil
    session["mass"] = max(1.0, rocket_mass - p_mass)

    sat_name = payload.get("name") or "TerraWatch-1 Satellite"
    p_body = {
        "id": f"payload-{count}",
        "type": "payload",
        "name": sat_name,
        "label": sat_name,
        "uids": list(payload_uids),
        "payload": payload,
        "x": session["x"] + fwd_x * sep_dist,
        "y": session["y"] + fwd_y * sep_dist,
        "vx": session["vx"] + fwd_x * kick,
        "vy": session["vy"] + fwd_y * kick,
        "th": angle,
        "omega": 0.0,
        "com": 0.0,
        "mass": p_mass,
        "dead": False,
    }
    session["detachedObjects"].append(p_body)

    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": "payload_deployed",
        "body": session.get("bodyId"),
        "msg": f"{payload.get('name') or 'Payload'} deployed",
    })
    return True, "Payload deployed."
