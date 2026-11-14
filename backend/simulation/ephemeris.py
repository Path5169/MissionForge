from __future__ import annotations

import math

TAU = 2.0 * math.pi
J2000_MS = 946728000000


def solve_kepler(mean_anomaly: float, eccentricity: float) -> float:
    if not math.isfinite(mean_anomaly) or eccentricity < 0 or not math.isfinite(eccentricity):
        raise ValueError("Kepler inputs are invalid.")
    if eccentricity < 1.0:
        M = (mean_anomaly + math.pi) % TAU - math.pi
        E = M if eccentricity < 0.8 else math.pi * math.copysign(1.0, M or 1.0)
        for _ in range(60):
            denominator = 1.0 - eccentricity * math.cos(E)
            delta = (E - eccentricity * math.sin(E) - M) / denominator
            E -= delta
            if abs(delta) < 1e-13:
                break
        return E
    if eccentricity == 1.0:
        value = 1.5 * mean_anomaly
        return 2.0 * math.atan(math.cbrt(value + math.sqrt(value * value + 1.0)))
    H = math.asinh(mean_anomaly / eccentricity)
    for _ in range(80):
        denominator = eccentricity * math.cosh(H) - 1.0
        delta = (eccentricity * math.sinh(H) - H - mean_anomaly) / denominator
        H -= delta
        if abs(delta) < 1e-13:
            break
    return H


def orbital_period(body: dict, mu: float):
    eccentricity = float(body.get("e", 0.0))
    if eccentricity >= 1.0:
        return None
    return body.get("period") or TAU * math.sqrt(body["a"] ** 3 / mu)


def _rotation(body, x, y):
    c, s = math.cos(body.get("periapsisLongitude", 0.0)), math.sin(body.get("periapsisLongitude", 0.0))
    return [x * c - y * s, x * s + y * c]


def body_position(body: dict, t: float, mu: float) -> list:
    if not body.get("a"):
        return [0.0, 0.0]
    a = float(body["a"])
    e = float(body.get("e", 0.0))
    if e < 1.0:
        period = orbital_period(body, mu)
        n = TAU / period
        E = solve_kepler(body["meanLongitude"] - body["periapsisLongitude"] + n * t, e)
        xp = a * (math.cos(E) - e)
        yp = a * math.sqrt(1.0 - e ** 2) * math.sin(E)
    else:
        semi_major = abs(a)
        n = math.sqrt(mu / semi_major ** 3)
        H = solve_kepler(body["meanLongitude"] - body["periapsisLongitude"] + n * t, e)
        xp = semi_major * (e - math.cosh(H))
        yp = semi_major * math.sqrt(e ** 2 - 1.0) * math.sinh(H)
    return _rotation(body, xp, yp)


def body_state(body: dict, t: float, mu: float) -> dict:
    if not body.get("a"):
        return {"x": 0.0, "y": 0.0, "vx": 0.0, "vy": 0.0}
    a = float(body["a"])
    e = float(body.get("e", 0.0))
    if e < 1.0:
        period = orbital_period(body, mu)
        n = TAU / period
        E = solve_kepler(body["meanLongitude"] - body["periapsisLongitude"] + n * t, e)
        root = math.sqrt(1.0 - e * e)
        rate = n / (1.0 - e * math.cos(E))
        xp = a * (math.cos(E) - e)
        yp = a * root * math.sin(E)
        vxp = -a * math.sin(E) * rate
        vyp = a * root * math.cos(E) * rate
    else:
        semi_major = abs(a)
        n = math.sqrt(mu / semi_major ** 3)
        H = solve_kepler(body["meanLongitude"] - body["periapsisLongitude"] + n * t, e)
        denominator = e * math.cosh(H) - 1.0
        rate = n / denominator
        root = math.sqrt(e * e - 1.0)
        xp = semi_major * (e - math.cosh(H))
        yp = semi_major * root * math.sinh(H)
        vxp = -semi_major * math.sinh(H) * rate
        vyp = semi_major * root * math.cosh(H) * rate
    position = _rotation(body, xp, yp)
    velocity = _rotation(body, vxp, vyp)
    return {"x": position[0], "y": position[1], "vx": velocity[0], "vy": velocity[1]}


def orbit_path(body: dict, count: int = 240) -> list:
    if not body.get("a"):
        return []
    a = float(body["a"])
    e = float(body.get("e", 0.0))
    out = []
    if e < 1.0:
        for i in range(count + 1):
            E = TAU * i / count
            out.append(_rotation(body, a * (math.cos(E) - e), a * math.sqrt(1.0 - e ** 2) * math.sin(E)))
        return out
    if e == 1.0:
        return []
    semi_major = abs(a)
    p = semi_major * (e * e - 1.0)
    limit = math.acos(-1.0 / e) * 0.995
    for i in range(count + 1):
        nu = -limit + 2.0 * limit * i / count
        radius = p / (1.0 + e * math.cos(nu))
        out.append(_rotation(body, radius * math.cos(nu), radius * math.sin(nu)))
    return out
