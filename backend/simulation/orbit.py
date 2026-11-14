from __future__ import annotations
import math
TAU = 2.0 * math.pi


def state_to_elements(mu: float, x: float, y: float, vx: float, vy: float) -> dict:
    r = math.hypot(x, y)
    if r <= 0 or mu <= 0:
        raise ValueError("Position radius and gravitational parameter must be positive.")
    v2 = vx * vx + vy * vy
    h = x * vy - y * vx
    rv = x * vx + y * vy
    k = v2 - mu / r
    ex, ey = (k * x - rv * vx) / mu, (k * y - rv * vy) / mu
    e = math.hypot(ex, ey)
    energy = v2 / 2.0 - mu / r
    p = h * h / mu
    a = math.inf if abs(energy) < 1e-9 else -mu / (2.0 * energy)
    bound = energy < 0
    rp = a * (1.0 - e) if bound else p / (1.0 + e)
    ra = a * (1.0 + e) if bound else math.inf
    period = TAU * math.sqrt(a ** 3 / mu) if bound and a > 0 else math.inf
    nu = 0.0
    if e > 1e-9:
        c = max(-1.0, min(1.0, (ex * x + ey * y) / (e * r)))
        nu = math.acos(c) * (-1.0 if rv < 0 else 1.0)
    w = math.atan2(ey, ex) if e > 1e-9 else math.atan2(y, x)
    direction = 1 if h <= 0 else -1
    out = {"mu": mu, "r": r, "speed": math.sqrt(v2), "h": h, "p": p, "e": e,
           "bound": bound, "energy": energy, "a": a, "rp": rp, "ra": ra,
           "period": period, "nu": nu, "w": w, "dir": direction, "radialSpeed": rv / r}
    if bound and e > 1e-9:
        # e can round to 1.0000000002 on a straight-up climb; clamp so sqrt never goes negative
        E = 2.0 * math.atan2(math.sqrt(max(0.0, 1.0 - e)) * math.sin(nu / 2.0), math.sqrt(1.0 + e) * math.cos(nu / 2.0))
        M = E - e * math.sin(E)
        n = TAU / period
        wrap = lambda m: m % TAU
        out["tToPeriapsis"] = wrap(-M) / n
        out["tToApoapsis"] = wrap(math.pi - M) / n
    elif bound:
        out["tToPeriapsis"] = out["tToApoapsis"] = 0.0
    else:
        out["tToPeriapsis"] = math.nan if nu < 0 else -math.inf
        out["tToApoapsis"] = math.inf
    return out

def _stumpff_c(z: float) -> float:
    if z > 1e-6: return (1.0 - math.cos(math.sqrt(z))) / z
    if z < -1e-6: return (math.cosh(math.sqrt(-z)) - 1.0) / -z
    return 0.5 - z / 24.0 + z * z / 720.0


def _stumpff_s(z: float) -> float:
    if z > 1e-6:
        s = math.sqrt(z); return (s - math.sin(s)) / (s ** 3)
    if z < -1e-6:
        s = math.sqrt(-z); return (math.sinh(s) - s) / (s ** 3)
    return 1.0 / 6.0 - z / 120.0 + z * z / 5040.0


def propagate(mu: float, x: float, y: float, vx: float, vy: float, dt: float) -> dict:
    if dt == 0: return {"x": x, "y": y, "vx": vx, "vy": vy}
    if mu <= 0: raise ValueError("Gravitational parameter must be positive.")
    r0 = math.hypot(x, y)
    if r0 <= 0: raise ValueError("Initial position radius must be positive.")
    v2 = vx * vx + vy * vy
    sq = math.sqrt(mu)
    alpha = 2.0 / r0 - v2 / mu
    rv = x * vx + y * vy
    if alpha > 1e-12:
        period = TAU / (sq * alpha ** 1.5)
        dt %= period
        if dt == 0: return {"x": x, "y": y, "vx": vx, "vy": vy}


    if alpha > 1e-12:
        chi = sq * alpha * dt
    elif alpha < -1e-12:
        a = 1.0 / alpha
        arg = (-2.0 * mu * alpha * dt) / (rv + math.copysign(1.0, dt) * math.sqrt(-mu * a) * (1.0 - r0 * alpha))
        chi = math.copysign(1.0, dt) * math.sqrt(-a) * math.log(arg if arg > 0 else 1.0001)
    else:
        chi = sq * dt / r0
    for _ in range(80):
        z = alpha * chi * chi; c = _stumpff_c(z); s = _stumpff_s(z)
        F = rv / sq * chi * chi * c + (1.0 - alpha * r0) * chi ** 3 * s + r0 * chi - sq * dt
        dF = rv / sq * chi * (1.0 - z * s) + (1.0 - alpha * r0) * chi * chi * c + r0
        if abs(dF) < 1e-20: break
        d = F / dF; chi -= d
        if abs(d) < 1e-9 * max(1.0, abs(chi)): break
    z = alpha * chi * chi; c = _stumpff_c(z); s = _stumpff_s(z)
    f = 1.0 - chi * chi / r0 * c
    g = dt - chi ** 3 / sq * s
    nx, ny = f * x + g * vx, f * y + g * vy
    r = math.hypot(nx, ny)
    fd = sq / (r * r0) * (z * s - 1.0) * chi
    gd = 1.0 - chi * chi / r * c
    return {"x": nx, "y": ny, "vx": fd * x + gd * vx, "vy": fd * y + gd * vy}


def sample_conic(elements: dict, count: int = 240, max_radius: float = math.inf) -> list:
    if elements["p"] < 1: return []
    e = elements["e"]
    limit = math.pi if e < 1 else min(math.pi * 0.995, math.acos(-1.0 / e) * 0.995)
    points = []
    for i in range(count + 1):
        nu = -limit + 2.0 * limit * i / count
        r = elements["p"] / (1.0 + e * math.cos(nu))
        if 0 <= r <= max_radius:
            angle = elements["w"] + nu * (-1 if elements["dir"] == 1 else 1)
            points.append([r * math.cos(angle), r * math.sin(angle)])
    return points


PATH_POINTS = 240
SHAPE_TOL = 1e-5
ANGLE_TOL = 1e-4
CIRCULAR_E = 1e-4


def _same_shape(a: dict, b: dict) -> bool:
    if a["dir"] != b["dir"]:
        return False
    if abs(a["p"] - b["p"]) > SHAPE_TOL * max(1.0, abs(b["p"])) or abs(a["e"] - b["e"]) > SHAPE_TOL:
        return False
    if a["e"] < CIRCULAR_E and b["e"] < CIRCULAR_E:
        return True
    return abs(math.remainder(a["w"] - b["w"], TAU)) <= ANGLE_TOL


def _radial_path(el: dict, x: float, y: float, radius: float) -> list:
 
    r = el["r"]
    if r <= 0:
        return []
    ux, uy = x / r, y / r
    top = el["ra"] if el["bound"] and math.isfinite(el["ra"]) else max(r * 4.0, radius * 8.0)
    top = max(top, r)
    start = min(radius, r)
    if top - start < 1.0:      # sitting on the pad: nothing to draw
        return []
    return [[round(ux * start, 1), round(uy * start, 1)], [round(ux * top, 1), round(uy * top, 1)]]


def orbit_payload(cache: dict, mu: float, radius: float, x: float, y: float,
                  vx: float, vy: float, count: int = PATH_POINTS) -> dict | None:
    try:
        el = state_to_elements(mu, x, y, vx, vy)
    except ValueError:
        return None
    if el["p"] < 1.0:          # same guard sample_conic uses: (near-)radial flight
        cache.pop("shape", None)   # apoapsis changes every tick, so never reuse a cached line
        return {**el, "path": _radial_path(el, x, y, radius)}
    last = cache.get("shape")
    if last is None or not _same_shape(el, last):
        reach = max(el["r"] * 4.0, radius * 8.0) if not el["bound"] else math.inf
        cache["shape"] = {k: el[k] for k in ("p", "e", "w", "dir")}
        cache["points"] = [[round(px, 1), round(py, 1)] for px, py in sample_conic(el, count, reach)]
    return {**el, "path": cache["points"]}


def clears_planet(mu: float, radius: float, clearance: float, x: float, y: float, vx: float, vy: float) -> bool:
    
    r = math.hypot(x, y)
    if r < radius + clearance:
        return False
    el = state_to_elements(mu, x, y, vx, vy)
    if el["rp"] >= radius + clearance:
        return True
   
    return (not el["bound"]) and el["radialSpeed"] > 0