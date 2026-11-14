
from __future__ import annotations

import math

ROTATE_RATE = 0.6          
SAS_TURN_RATE = 0.8        # rad/s maximum SAS turn rate
SAS_MIN_SPEED = 2.0        # m/s; below this prograde/retrograde have no direction
SAS_MODES = frozenset({None, "stability", "prograde", "retrograde", "radial"})
STEERABLE_STATUSES = frozenset({"launched", "flying", "orbiting"})

_TWO_PI = 2.0 * math.pi


def wrap_angle(angle):
   
    return (angle + math.pi) % _TWO_PI - math.pi


def validate_sas_mode(mode):

    try:
        ok = mode in SAS_MODES
    except TypeError:         
        ok = False
    if not ok:
        raise ValueError("Invalid SAS mode.")
    return mode


def validate_rotation_input(value):
   
    if isinstance(value, bool):
        raise ValueError("Rotation input must be a finite number.")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Rotation input must be a finite number.") from exc
    if not math.isfinite(number):
        raise ValueError("Rotation input must be a finite number.")
    return max(-1.0, min(1.0, number))


def set_rotation_input(session, value):
    session["rotInput"] = validate_rotation_input(value)
    return session["rotInput"]


def set_sas(session, mode):
    session["sas"] = validate_sas_mode(mode)
    return session["sas"]


def sas_target(mode, x, y, vx, vy):
  
    if mode == "radial":
        return math.atan2(x, y)
    if mode in ("prograde", "retrograde") and math.hypot(vx, vy) > SAS_MIN_SPEED:
        return math.atan2(vx, vy) if mode == "prograde" else math.atan2(-vx, -vy)
    return None


def turn_toward(current, target, max_step):
   
    diff = wrap_angle(target - current)
    return current + max(-max_step, min(max_step, diff))


def step_attitude(session, dt):
   
    previous = session["rotation"]
    if dt > 0 and session["status"] in STEERABLE_STATUSES:
        steer = session.get("rotInput", 0.0)
        if steer:
            session["rotation"] = previous + steer * ROTATE_RATE * dt
        else:
            target = sas_target(session.get("sas"), session["x"], session["y"],
                                session["vx"], session["vy"])
            if target is not None:
                session["rotation"] = turn_toward(previous, target, SAS_TURN_RATE * dt)
    omega = (session["rotation"] - previous) / dt if dt > 0 else 0.0
    session["angularVelocity"] = omega
    return omega