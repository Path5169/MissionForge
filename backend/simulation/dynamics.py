#for simulation purpose calculations and all not everything tough
from __future__ import annotations
import math


def atmosphere(body: dict, altitude: float) -> tuple[float, float]:
    rho0 = float(body.get("rho0", 0.0))
    top = float(body.get("atmosphereTop", 0.0))
    scale = float(body.get("scaleHeight", 0.0))
    if rho0 <= 0 or top <= 0 or altitude >= top:
        return 0.0, 0.0
    if scale <= 0:
        raise ValueError("Atmospheric scale height must be positive.")
    density = rho0 * math.exp(-max(0.0, altitude) / scale)
    return density, min(1.0, density / rho0)


def _acceleration(body: dict, mass: float, drag_area: float, thrust: float,
                 angle: float, state: tuple[float, float, float, float]) -> tuple[float, float]:
    x, y, vx, vy = state
    r = math.hypot(x, y)
    if r <= 0 or mass <= 0:
        raise ValueError("Position radius and vehicle mass must be positive.")
    mu = float(body["mu"])
    if not all(math.isfinite(value) for value in (mu, drag_area, thrust, angle)):
        raise ValueError("Dynamics inputs must be finite.")
    ax = -mu * x / (r ** 3) + thrust / mass * math.sin(angle)
    ay = -mu * y / (r ** 3) + thrust / mass * math.cos(angle)
    altitude = r - float(body["R"])
    rho, _ = atmosphere(body, altitude)
    if rho > 0 and drag_area > 0:
        speed = math.hypot(vx, vy)
        if speed > 0:
            factor = 0.5 * rho * drag_area * speed / mass
            ax -= factor * vx
            ay -= factor * vy
    return ax, ay


def rk4_step(body: dict, state: dict, dt: float, *, mass: float,
             drag_area: float = 0.0, thrust: float = 0.0,
             angle: float = 0.0) -> dict:
    
    if not math.isfinite(dt) or dt < 0:
        raise ValueError("Time step must be a finite non-negative number.")
    if dt == 0:
        return {k: float(state[k]) for k in ("x", "y", "vx", "vy")}
    s = tuple(float(state[k]) for k in ("x", "y", "vx", "vy"))
    def deriv(q):
        ax, ay = _acceleration(body, mass, drag_area, thrust, angle, q)
        return q[2], q[3], ax, ay
    def add(q, k, h):
        return tuple(q[i] + k[i] * h for i in range(4))
    k1 = deriv(s)
    k2 = deriv(add(s, k1, dt / 2))
    k3 = deriv(add(s, k2, dt / 2))
    k4 = deriv(add(s, k3, dt))
    result = tuple(s[i] + dt / 6 * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]) for i in range(4))
    if not all(math.isfinite(v) for v in result):
        raise ArithmeticError("Flight integration produced a non-finite state.")
    return dict(zip(("x", "y", "vx", "vy"), result))         


def integrate_request(data: dict) -> dict:
 # To validate jSON
    state = data.get("state") or {}
    body = data.get("body") or {}
    result = rk4_step(body, state, float(data.get("dt", 0.0)),
                      mass=float(data["mass"]),
                      drag_area=float(data.get("dragArea", 0.0)),
                      thrust=float(data.get("thrust", 0.0)),
                      angle=float(data.get("angle", 0.0)))
    result["time"] = float(state.get("time", 0.0)) + float(data.get("dt", 0.0))
    return result
# Maths is kinda hard bro 
