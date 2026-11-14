from __future__ import annotations
import math

PARACHUTE_CD = 1.5


def _number(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number == number and abs(number) != float("inf") else default


def _live_parts(session):
    dead = session.get("deadUids") or ()
    return [p for p in session.get("parts", []) if p.get("alive") and p.get("uid") not in dead]


def _event(session, kind, uid, message):
    session.setdefault("events", []).append({
        "sequence": len(session["events"]),
        "type": kind,
        "uid": uid,
        "msg": message,
    })


def step_parachutes(session, definitions, altitude, speed, temperature=290.0):
    deployed_now = []
    if session.get("status") in ("prelaunch", "landed", "crashed", "closed"):
        return deployed_now
    for part in _live_parts(session):
        config = (definitions.get(part["uid"]) or {}).get("parachute")
        if not config:
            continue
        max_speed = _number(config.get("maxDeploySpeed"), float("inf"))
        deploy_alt = _number(config.get("deploymentAltitude"))
        if part.get("deployed"):
            if speed > max_speed * 1.5 or temperature > 600.0:
                part["alive"] = False
                part["deployed"] = False
                _event(session, "parachute_failure", part["uid"], "Parachute shredded by aerodynamic stress")
            continue
        if not part.get("armed"):
            continue
        if altitude <= deploy_alt and speed <= max_speed and temperature < 550.0:
            part["deployed"] = True
            deployed_now.append(part["uid"])
            _event(session, "parachute", part["uid"], "Parachute deployed")
    return deployed_now


def parachute_drag_area(session, definitions):
    total = 0.0
    for part in _live_parts(session):
        config = (definitions.get(part["uid"]) or {}).get("parachute")
        if config and part.get("deployed"):
            total += max(0.0, _number(config.get("canopyArea"))) * PARACHUTE_CD
    return total


def power_output_kw(session, definitions):
    total = 0.0
    for part in _live_parts(session):
        config = (definitions.get(part["uid"]) or {}).get("power")
        if not config:
            continue
        if config.get("deployable") and not part.get("deployed"):
            continue
        total += max(0.0, _number(config.get("outputKW")))
    return total


def landing_speed_limit(session, definitions):
    limits = []
    for part in _live_parts(session):
        limit = ((definitions.get(part["uid"]) or {}).get("landing") or {}).get("maxSpeed")
        if isinstance(limit, (int, float)) and not isinstance(limit, bool) and limit > 0:
            limits.append(float(limit))
    return max(limits, default=0.0)


def deployed_landing_parts(session, definitions):
    return [p["uid"] for p in _live_parts(session) if (definitions.get(p["uid"]) or {}).get("landing") and p.get("deployed")]


def step_entry_heating(session, definitions, altitude, speed, dt=0.05, body=None):
    if body is None:
        body = session.get("body") or {}
    rho0 = _number(body.get("rho0"))
    top = _number(body.get("atmosphereTop"))
    scale = _number(body.get("scaleHeight"), 8500.0)

    if rho0 <= 0 or altitude >= top or speed < 50.0 or scale <= 0:
        session["heatFlux"] = 0.0
        session["temperature"] = max(290.0, session.get("temperature", 290.0) - dt * 2.0)
        session["entryHeating"] = False
        return

    density = rho0 * math.exp(-max(0.0, altitude) / scale)
    heat_flux = 1.15e-4 * math.sqrt(density) * (speed ** 3)
    equilibrium_temp = 290.0 + (heat_flux / 5.67e-8) ** 0.25 * 0.32
    current_temp = session.get("temperature", 290.0)
    alpha = min(1.0, max(0.01, dt * 0.8))
    new_temp = current_temp + (equilibrium_temp - current_temp) * alpha
    session["temperature"] = round(new_temp, 1)
    session["heatFlux"] = round(heat_flux, 1)
    session["entryHeating"] = heat_flux > 8000.0

    heatshield_parts = []
    for part in _live_parts(session):
        defn = definitions.get(part["uid"]) or {}
        cat = defn.get("category") or defn.get("c") or ""
        part_id = defn.get("partId") or defn.get("id") or ""
        if (
            defn.get("heatshield")
            or "heatshield" in str(cat).lower()
            or "heat" in str(part_id).lower()
            or "thermal_protection" in str(defn.get("behaviorType", "")).lower()
        ):
            heatshield_parts.append(part)

    total_ablative = 0.0
    shield_protecting = False

    for shield in heatshield_parts:
        config = (definitions.get(shield["uid"]) or {}).get("heatshield") or {}
        max_temp = _number(config.get("maxTemperature"), 3000.0)
        if "ablativeMass" not in shield:
            shield["ablativeMass"] = _number(config.get("ablativeMass"), 15.0)

        ablation_rate = heat_flux / 3.5e7
        shield["ablativeMass"] = max(0.0, shield["ablativeMass"] - ablation_rate * dt)
        total_ablative += shield["ablativeMass"]

        if new_temp > max_temp:
            shield["alive"] = False
            _event(session, "heatshield_destroyed", shield["uid"], "Heat shield thermal failure")
        elif shield["ablativeMass"] > 0:
            shield_protecting = True

    session["ablativeMass"] = round(total_ablative, 2)

    if heat_flux > 10000.0 and not session.get("entryEventEmitted"):
        session["entryEventEmitted"] = True
        _event(session, "entry", "craft", "Atmospheric entry interface")

    if not shield_protecting and new_temp > 1400.0:
        for part in _live_parts(session):
            defn = definitions.get(part["uid"]) or {}
            if defn.get("heatshield"):
                continue
            if new_temp > 1750.0:
                part["alive"] = False
                _event(session, "heat_failure", part["uid"], f"{defn.get('name', 'Component')} destroyed by entry heating")


def step_part_behaviors(session, definitions, altitude, speed, dt=0.05, body=None):
    step_entry_heating(session, definitions, altitude, speed, dt, body)
    deployed = step_parachutes(session, definitions, altitude, speed, session.get("temperature", 290.0))
    extra_drag = parachute_drag_area(session, definitions)
    session["extraDragArea"] = extra_drag
    session["powerKW"] = power_output_kw(session, definitions)
    return {
        "parachutesDeployed": deployed,
        "extraDragArea": extra_drag,
        "powerKW": session["powerKW"],
        "landingSpeedLimit": landing_speed_limit(session, definitions),
        "temperature": session.get("temperature", 290.0),
        "heatFlux": session.get("heatFlux", 0.0),
        "ablativeMass": session.get("ablativeMass", 0.0),
    }
