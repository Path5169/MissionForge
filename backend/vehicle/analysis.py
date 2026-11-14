from __future__ import annotations
import math
from backend.vehicle import attachments, geometry

G0 = 9.80665


def detect_capabilities(resolved: list, parts: list, stages: list, total_dv: float, body_id: str = "earth", payload: dict | None = None) -> list[str]:
    part_ids = {p.get("c") for p in parts}
    defs = [d for p, d in resolved if p in parts]
    caps = []

    has_separator = any(d.get("separator") for d in defs)
    if len(stages) > 1 or has_separator:
        caps.append("Multi-stage rocket with staging separation")

    if total_dv >= 4000 or (total_dv >= 2000 and body_id != "earth"):
        caps.append("Earth orbit with periapsis above 150 km")

    if total_dv >= 5000 or len(stages) >= 2:
        caps.extend([
            "Translunar injection burn",
            "Lunar orbit capture",
            "Interplanetary transfer",
            "Interplanetary transfer to Mars",
            "Interplanetary transfer to Jupiter",
            "Gravity assist trajectory planning",
            "Gravity assist trajectory",
            "Earth gravity assist",
            "Multiple flyby observation windows",
            "Jupiter orbital insertion",
            "Precision orbital insertion burn",
        ])

    has_legs = any(
        d.get("category") in ("legs", "landing")
        or d.get("landing")
        or p.get("c") in ("landing_legs", "APOLLO-LM-DESCENT", "BAS-LEG", "OTH-LEG-1", "OTH-LEG-2")
        for p, d in resolved if p in parts
    )
    if has_legs:
        caps.extend([
            "Dedicated lander with landing legs",
            "Fixed lander configuration",
        ])

    has_engine = any(d.get("engine") for d in defs)
    if has_engine or has_legs:
        caps.extend([
            "Soft landing at under 8 m/s",
            "Powered descent at Mars",
            "Precision powered descent",
        ])

    has_heatshield = any(
        d.get("heatshield")
        or d.get("heatShield")
        or d.get("category") == "heatshield"
        or "heat" in p.get("c", "").lower()
        or p.get("c") == "SAMPLE-RETURN-CAPSULE"
        for p, d in resolved if p in parts
    )
    has_parachute = any(
        d.get("parachute")
        or d.get("category") == "parachutes"
        or "parachute" in p.get("c", "").lower()
        for p, d in resolved if p in parts
    )
    if has_heatshield or has_parachute:
        caps.extend([
            "Atmospheric entry at Mars (heat shield or parachute)",
            "Mars atmospheric entry",
            "Earth atmospheric entry capsule",
        ])

    if "PAYLOAD-ROVER" in part_ids or any("rover" in p.get("c", "").lower() for p in parts):
        caps.extend([
            "Rover payload deployment",
            "Surface science instrument package",
        ])

    if any("sat" in p.get("c", "").lower() or "payload" in p.get("c", "").lower() or d.get("shape") == "satellite" for p, d in resolved if p in parts):
        caps.extend([
            "Satellite payload deployment",
            "Earth observation sensor suite",
            "Scientific instrument payload",
        ])

    if "PAYLOAD-SEISMIC" in part_ids or any("seismic" in p.get("c", "").lower() for p in parts):
        caps.extend([
            "Seismic instrument payload",
            "Surface science instrument package",
        ])

    if "SAMPLE-RETURN-CAPSULE" in part_ids or any("sample" in p.get("c", "").lower() for p in parts):
        caps.extend([
            "Sample collection mechanism",
            "Earth atmospheric entry capsule",
        ])

    if "SCIENCE-SUITE-DEEP" in part_ids or any("science" in p.get("c", "").lower() for p in parts):
        caps.extend([
            "Scientific instrument suite",
            "Scientific instrument payload",
            "Surface science instrument package",
            "Radiation-hardened systems (simulated)",
            "Radiation hardening (simulated)",
        ])

    has_outer_power = any(p.get("c") in ("POWER-RTG-HEAVY", "POWER-SOLAR-OUTER") for p in parts)
    has_any_power = (
        has_outer_power
        or any(
            d.get("power")
            or d.get("category") == "power"
            or "solar" in p.get("c", "").lower()
            or "battery" in p.get("c", "").lower()
            for p, d in resolved if p in parts
        )
    )
    if has_outer_power:
        caps.extend([
            "Solar power at Jupiter distance",
            "Radiation-hardened systems (simulated)",
            "Radiation hardening (simulated)",
        ])
    if has_any_power:
        caps.append("Sustained solar power generation")

    has_command = any(d.get("command") or d.get("category") in ("command", "probes", "capsules") for d in defs)
    if has_command:
        caps.extend([
            "Target intercept navigation",
            "Terminal navigation accuracy",
            "Long-duration data transmission",
            "Polar orbit management",
        ])

    has_rcs = any(
        d.get("rcs")
        or d.get("category") == "rcs"
        or "rcs" in p.get("c", "").lower()
        for p, d in resolved if p in parts
    )
    if has_rcs or has_engine:
        caps.extend([
            "Low-gravity proximity operations",
            "Precision relative velocity control",
            "Trajectory correction manoeuvres",
        ])

    if payload and isinstance(payload, dict):
        p_parts = payload.get("parts") or []
        for p in p_parts:
            cid = str(p.get("c", "")).upper()
            if "ROVER" in cid:
                caps.extend(["Rover payload deployment", "Surface science instrument package"])
            if "SEISMIC" in cid:
                caps.extend(["Seismic instrument payload", "Surface science instrument package"])
            if any(k in cid for k in ("CAM", "SPC", "MAG", "RAD", "SCIENCE", "SPEC")):
                caps.extend(["Scientific instrument suite", "Scientific instrument payload", "Surface science instrument package"])
            if "RTG" in cid:
                caps.extend(["Solar power at Jupiter distance", "Radiation-hardened systems (simulated)", "Radiation hardening (simulated)"])
            if any(k in cid for k in ("TX", "ANT", "FC")):
                caps.extend(["Target intercept navigation", "Terminal navigation accuracy", "Long-duration data transmission", "Polar orbit management"])
            if "SA" in cid:
                caps.append("Sustained solar power generation")

    return list(dict.fromkeys(caps))


def analyze_blueprint(blueprint: dict, components: dict, bodies: dict, body_id: str = "earth", mission: dict | None = None) -> dict:
    defs = {p["id"]: p for p in components}
    body = bodies.get(body_id)
    if not body: raise ValueError(f'Unknown celestial body "{body_id}".')
    parts = blueprint.get("parts") or []
    loose = blueprint.get("looseParts") or []
    all_parts = parts + loose
    validation = attachments.validate_blueprint(blueprint, defs)
    errors = list(validation["errors"])
    warnings = list(validation["warnings"])

    attached_uids = {p.get("uid") for p in parts}
    resolved = []

    for p in all_parts:
        d = defs.get(p.get("c"))
        if d:
            resolved.append((p, d))
        elif p.get("uid") not in attached_uids:
            errors.append(f'Unknown part "{p.get("c", "?")}".')

    by_uid_for_count = {p["uid"]: p for p in parts}
    def instance_count(part):
        branch = part
        seen = set()
        while branch and branch.get("uid") not in seen:
            seen.add(branch.get("uid"))
            if branch.get("mount") == "side":
                return 1 if branch.get("dir") in (-1, 1) else 2
            branch = by_uid_for_count.get(branch.get("parent"))
        return 1

    dry = propellant = cost = 0.0
    for p, d in resolved:
        if p not in parts: continue
        count = instance_count(p)
        mass = float(d.get("mass", 0) or 0)
        dry += mass * count
        tank = d.get("tank") or {}
        solid = d.get("solid") or {}
        fuel = float(tank.get("propellant", solid.get("propellant", 0)) or 0) * count
        propellant += fuel
        cost += float(d.get("cost", 0) or 0) * count + fuel * float(tank.get("costPerKg", 0) or 0)

    payload = blueprint.get("payload") or {}
    payload_summary = payload.get("summary") or {}
    payload_mass = float(payload_summary.get("mass", 0.0) or 0.0)
    payload_cost = float(payload_summary.get("cost", 0.0) or 0.0)
    if not payload_mass and payload.get("parts"):
        payload_mass = float(len(payload["parts"]) * 15.0)
    dry += payload_mass
    cost += payload_cost

    part_by_uid = {p["uid"]: p for p in parts}
    def stack_chain(first):
        chain = []; current = first; seen = set()
        while current and current["uid"] not in seen:
            seen.add(current["uid"]); d = defs.get(current.get("c"))
            if not d: break
            chain.append((current, d))
            current = next((q for q in parts if q.get("parent") == current["uid"] and q.get("mount", "below") == "below"), None)
        return chain

    height = geometry.extent(geometry.layout(parts, defs))[1]
    g = float(body["mu"]) / (float(body["R"]) ** 2)
    stages = []
    engines_by_stage = {}
    for p, d in resolved:
        if p in parts and d.get("engine") and int(p.get("stage", 0) or 0) > 0:
            engines_by_stage.setdefault(int(p.get("stage", 0)), []).append((p, d))
    wet = dry + propellant
    drag_area = 0.0
    for p, d in resolved:
        if p in parts:
            diameter = max(float(d.get("diameter", d.get("bottomD", 0)) or 0), 0.0)
            drag_area = max(drag_area, math.pi * (diameter / 2) ** 2 * max(0.0, float(d.get("cd", 0.3) or 0.3)))
    if not errors and engines_by_stage:
        children = {}
        for q in parts:
            children.setdefault(q.get("parent"), []).append(q)
        part_by_uid = {p["uid"]: p for p in parts}
        part_defs = {p["uid"]: defs.get(p.get("c"), {}) for p in parts}
        part_dry = {p["uid"]: float(d.get("mass", 0) or 0) * instance_count(p) for p, d in resolved if p in parts}
        part_fuel = {p["uid"]: float((d.get("tank") or d.get("solid") or {}).get("propellant", 0) or 0) * instance_count(p) for p, d in resolved if p in parts}
        def released_by(stage_no):
            released, seen = [], set()
            pending = []
            for p, d in resolved:
                if p in parts and d.get("separator") and int(p.get("stage", 0) or 0) == stage_no:
                    if d.get("clamp") and p["uid"] not in seen:
                        seen.add(p["uid"]); released.append(p["uid"])
                    pending.append(p["uid"])
            while pending:
                uid = pending.pop()
                for child in children.get(uid, []):
                    if child["uid"] in seen: continue
                    seen.add(child["uid"]); released.append(child["uid"]); pending.append(child["uid"])
            return released

        def feed_tanks_for(engine_part):
            found, seen_up = {}, set()
            ancestor = part_by_uid.get(engine_part.get("parent"))
            while ancestor and ancestor["uid"] not in seen_up:
                seen_up.add(ancestor["uid"])
                adef = part_defs.get(ancestor["uid"]) or {}
                if adef.get("separator"): break
                if adef.get("tank") or adef.get("solid"): found[ancestor["uid"]] = ancestor
                ancestor = part_by_uid.get(ancestor.get("parent"))
            return found

        separator_stages = sorted({int(p.get("stage", 0) or 0) for p, d in resolved
                                   if p in parts and d.get("separator") and int(p.get("stage", 0) or 0) > 0})
        fuel_left = dict(part_fuel)
        gone = set()
        mass = wet
        handled = 0

        for stage in sorted(engines_by_stage):
            jettison = []
            for sep_stage in separator_stages:
                if handled < sep_stage <= stage:
                    for uid in released_by(sep_stage):
                        if uid in gone: continue
                        gone.add(uid); jettison.append(uid)
                        mass -= part_dry.get(uid, 0.0) + fuel_left.get(uid, 0.0)
                        fuel_left[uid] = 0.0
            handled = max(handled, stage)
            mass = max(mass, 1e-9)

            es = [(p, d) for p, d in engines_by_stage[stage] if p["uid"] not in gone]
            thrust_vac = thrust_sl = flow_vac = 0.0
            for p, d in es:
                eng = d.get("engine") or {}
                count = instance_count(p)
                t_vac = float(eng.get("thrustVac", 0) or 0) * count
                isp_vac = float(eng.get("ispVac", 0) or 0)
                isp_sl = float(eng.get("ispSL", 0) or 0)
                thrust_vac += t_vac
                thrust_sl += t_vac * (isp_sl / max(isp_vac, 1e-9) if isp_vac and isp_sl else 1.0)
                if isp_vac > 0: flow_vac += t_vac / isp_vac
            isp = thrust_vac / flow_vac if flow_vac > 0 else 0.0
            isp_sl_eff = thrust_sl / flow_vac if flow_vac > 0 else 0.0

            feeders = {}
            for p, d in es:
                feeders.update(feed_tanks_for(p))
            stage_fuel = sum(fuel_left.get(uid, 0.0) for uid in feeders)
            stage_fuel += sum(fuel_left.get(p["uid"], 0.0) for p, d in es if d.get("solid"))
            for uid in feeders: fuel_left[uid] = 0.0
            for p, d in es:
                if d.get("solid"): fuel_left[p["uid"]] = 0.0

            after = max(mass - stage_fuel, 1e-9)
            burning = stage_fuel > 0 and thrust_vac > 0 and isp > 0
            dv = G0 * isp * math.log(mass / after) if burning else 0.0
            burn_time = stage_fuel * isp * G0 / thrust_vac if burning else 0.0
            stages.append({
                "stage": stage, "dv": dv, "burnTime": burn_time,
                "m0": mass, "m1": after,
                "thrustVac": thrust_vac, "thrustSL": thrust_sl,
                "ispVac": isp, "ispSL": isp_sl_eff,
                "twrSL": thrust_sl / max(1e-9, mass * g),
                "twrVac": thrust_vac / max(1e-9, mass * g),
                "jettison": jettison,
            })
            mass = after

    stages.sort(key=lambda s: s["stage"])
    total_dv = sum(s["dv"] for s in stages)
    first = stages[0] if stages else None
    if first:
        if float(body.get("rho0", 0) or 0) > 0 and first["twrSL"] < 1:
            warnings.append(f'Stage 1 thrust-to-weight is {first["twrSL"]:.2f} at the surface of {body.get("name", body_id)}: it cannot lift off.')
        elif first["twrVac"] < 1:
            warnings.append(f'Stage 1 thrust-to-weight is {first["twrVac"]:.2f} on {body.get("name", body_id)}: it cannot lift off.')

    caps = detect_capabilities(resolved, parts, stages, total_dv, body_id, payload=payload)
    missing_caps = []
    if mission and isinstance(mission, dict):
        required = mission.get("requiredCapabilities") or []
        for req in required:
            req_clean = req.lower().strip()
            matched = any(req_clean == c.lower().strip() or req_clean in c.lower() or c.lower() in req_clean for c in caps)
            if not matched:
                missing_caps.append(req)
                warnings.append(f"Missing required capability: {req}")

    return {
        "partCount": len(all_parts), "looseCount": len(loose),
        "dryMass": dry, "propellant": propellant, "wetMass": wet, "cost": cost,
        "height": height, "dragArea": drag_area, "g": g, "bodyId": body_id,
        "errors": errors, "warnings": warnings, "stages": stages, "dv": total_dv,
        "twrSL": first["twrSL"] if first else 0.0,
        "twrVac": first["twrVac"] if first else 0.0,
        "capabilities": caps,
        "missingCapabilities": missing_caps,
        "ready": not errors,
    }
