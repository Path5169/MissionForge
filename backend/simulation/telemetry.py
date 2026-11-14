from __future__ import annotations

import math

from backend.simulation import orbit, separation, soi


def flight_values(session):
    body = session["body"]
    radius = float(body.get("R", 6371000.0))
    stats = session["stats"]

    r = math.hypot(session["x"], session["y"])
    alt = max(0.0, r - radius)
    speed = math.hypot(session["vx"], session["vy"])
    gravity = float(body.get("mu", 398600441800000.0)) / max(1.0, r * r)
    vert = (session["x"] * session["vx"] + session["y"] * session["vy"]) / max(1e-9, r)
    horiz = (session["x"] * session["vy"] - session["y"] * session["vx"]) / max(1e-9, r)

    apo, peri, bound, t_apo = alt, alt, False, None
    try:
        elements = orbit.state_to_elements(
            float(body.get("mu", 398600441800000.0)),
            session["x"], session["y"], session["vx"], session["vy"],
        )
        bound = bool(elements["bound"])
        peri = elements["rp"] - radius
        apo = (elements["ra"] - radius) if bound else alt
        t_apo = elements.get("tToApoapsis")
    except Exception:
        pass

    stage = next((item for item in stats.get("stages", []) if item.get("stage") == session.get("stageDone")), None)
    remaining_dv = 0.0
    if stage and session["fuel"] > 0:
        final_mass = max(1e-9, session["mass"] - session["fuel"])
        if session["mass"] > final_mass:
            remaining_dv = 9.8 * float(stage.get("ispVac", 0.0)) * math.log(session["mass"] / final_mass)
    return {
        "alt": alt,
        "speed": speed,
        "vert": vert,
        "horiz": horiz,
        "mass": session["mass"],
        "fuel": session["fuel"],
        "fuelCap": max(1.0, session["fuelCap"]),
        "throttle": session["throttle"],
        "thrust": session.get("thrustNow", 0.0),
        "twr": session.get("thrustNow", 0.0) / max(1e-9, session["mass"] * gravity),
        "deltaV": remaining_dv,
        "status": session["status"],
        "warp": session["warp"],
        "rails": bool(session.get("rails", False)),
        "sas": session["sas"],
        "apo": apo,
        "peri": peri,
        "tToApo": t_apo,
        "bound": bound,
        "bodyId": session.get("bodyId"),
        "parentBody": body.get("parent"),
        "soiRadius": soi.soi_radius(body),
        "timeToSoiExit": soi.time_to_exit(session),
        "proximity": soi.proximity(session),
        "temperature": session.get("temperature", 290.0),
        "heatFlux": session.get("heatFlux", 0.0),
        "entryHeating": bool(session.get("entryHeating", False)),
        "ablativeMass": session.get("ablativeMass", 0.0),
        "surfaceDistance": session.get("surfaceDistance", 0.0),
        "surfaceSpeed": session.get("surfaceSpeed", 0.0),
    }


def render_state(session):
    return {
        "body": session["body"],
        "bodyId": session["bodyId"],
        "position": {"x": session["x"], "y": session["y"]},
        "velocity": {"x": session["vx"], "y": session["vy"], "vx": session["vx"], "vy": session["vy"]},
        "rotation": session["rotation"],
        "angularVelocity": session["angularVelocity"],
        "throttle": session["throttle"],
        "activeStage": session["activeStage"],
        "status": session["status"],
        "padPosition": session["padPosition"],
        "parts": session["parts"],
        "engines": session["engines"],
        "baseOffset": session["baseOffset"],
        "topY": session["topY"],
        "bottomY": session["bottomY"],
        "centerOfMass": session["centerOfMass"],
        "maxAltitude": session["maxAltitude"],
        "detachedObjects": separation.render_objects(session),
        "pressureRatio": session.get("pressureRatio", 1.0),
        "parentBody": session["body"].get("parent"),
        "soiRadius": soi.soi_radius(session["body"]),
        "timeToSoiExit": soi.time_to_exit(session),
        "proximity": soi.proximity(session),
        "temperature": session.get("temperature", 290.0),
        "heatFlux": session.get("heatFlux", 0.0),
        "entryHeating": bool(session.get("entryHeating", False)),
        "ablativeMass": session.get("ablativeMass", 0.0),
        "surfaceDistance": session.get("surfaceDistance", 0.0),
        "surfaceSpeed": session.get("surfaceSpeed", 0.0),
    }


def controls(session, countdown=None):
    return {
        "stageDone": session["stageDone"],
        "stagesFired": session["stagesFired"],
        "holdDown": session["holdDown"],
        "launchCountdown": countdown,
    }
