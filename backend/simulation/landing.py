from __future__ import annotations

import math

from backend.vehicle import part_behaviors


def create_vehicle(altitude, vertical_speed, horizontal_speed, tilt):
    return {
        "altitude": altitude,
        "vertical_speed": vertical_speed,
        "horizontal_speed": horizontal_speed,
        "tilt": tilt,
    }


def has_touched_ground(vehicle):
    return vehicle["altitude"] <= 0


def impact_speed(vehicle):
    return math.hypot(vehicle["vertical_speed"], vehicle["horizontal_speed"])


def is_crash(vehicle, max_vertical_speed=2.0, max_horizontal_speed=1.0, max_tilt=10.0):
    return (
        abs(vehicle["vertical_speed"]) > max_vertical_speed
        or abs(vehicle["horizontal_speed"]) > max_horizontal_speed
        or abs(vehicle["tilt"]) > max_tilt
    )


def check_landing(vehicle, max_vertical_speed=2.0, max_horizontal_speed=1.0, max_tilt=10.0):
    if not has_touched_ground(vehicle):
        return "in_flight"
    return "crashed" if is_crash(vehicle, max_vertical_speed, max_horizontal_speed, max_tilt) else "landed"


def ground_contact(session, body, radius, thrust):
    if math.hypot(session["x"], session["y"]) > radius:
        return None
    speed = math.hypot(session["vx"], session["vy"])
    session["impactSpeed"] = speed
    gravity = float(body.get("mu", 3.986e14)) / (radius * radius)
    lifting = thrust > max(1.0, session["mass"]) * gravity

    norm = math.hypot(session["x"], session["y"]) or 1.0
    vr = (session["x"] * session["vx"] + session["y"] * session["vy"]) / norm
    if lifting and vr >= -0.05:
        # Ascending / climbing outwards away from surface
        session["x"] = session["x"] / norm * max(radius, norm)
        return None

    if session.get("holdDown"):
        settle_on_surface(session, radius)
        return "hold"

    spooling = (
        session["status"] == "flying"
        and speed <= 1.0
        and session["fuel"] > 0
        and (thrust > 0 or session["throttle"] > 0)
        and session.get("missionTime", 0.0) < 1.0
    )
    if spooling:
        settle_on_surface(session, radius)
        return "hold"
    limit = part_behaviors.landing_speed_limit(session, session["definitions"])
    vehicle = create_vehicle(
        0.0,
        speed,
        0.0,
        0.0,
    )
    result = check_landing(
        vehicle,
        max_vertical_speed=max(1.0, limit),
        max_horizontal_speed=max(1.0, limit),
        max_tilt=10.0,
    )
    if session["missionTime"] > 3.0:
        session["status"] = result
        if result == "crashed":
            session["events"].append({"sequence": len(session["events"]), "type": "crash", "msg": "Vehicle crashed at %.0f m/s" % speed})
        else:
            session["events"].append({"sequence": len(session["events"]), "type": "touchdown", "msg": "Vehicle landed at %.1f m/s" % speed})
    settle_on_surface(session, radius)
    return "stop"


def settle_on_surface(session, radius):
    norm = math.hypot(session["x"], session["y"]) or 1.0
    session["x"], session["y"] = session["x"] / norm * radius, session["y"] / norm * radius
    session["vx"] = session["vy"] = 0.0
