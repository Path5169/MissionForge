from __future__ import annotations

from dataclasses import dataclass
import math
import time


FLIGHT_STATUSES = {"prelaunch", "launched", "flying", "orbiting", "landed", "crashed", "closed"}


def _number(value, name, minimum=None):
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number.")
    try:
        value = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a finite number.") from exc
    if not math.isfinite(value) or (minimum is not None and value < minimum):
        raise ValueError(f"{name} is invalid.")
    return value


@dataclass
class FlightState:
    x: float = 0.0
    y: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    rotation: float = 0.0
    angular_velocity: float = 0.0
    throttle: float = 0.0
    throttle_actual: float = 0.0
    mission_time: float = 0.0
    status: str = "prelaunch"
    body_id: str = "earth"
    active_stage: int = 0
    stage_index: int = 0
    mass: float = 1.0
    fuel: float = 0.0
    timestamp: float = 0.0
    sequence: int = 0

    @classmethod
    def from_session(cls, session):
        state = cls()
        state.sync_from(session)
        return state

    def validate(self):
        for name in ("x", "y", "vx", "vy", "rotation", "angular_velocity", "throttle", "throttle_actual", "mission_time", "mass", "fuel", "timestamp"):
            setattr(self, name, _number(getattr(self, name), name, 0.0 if name in {"mission_time", "mass", "fuel", "timestamp"} else None))
        if not 0 <= self.throttle <= 1 or not 0 <= self.throttle_actual <= 1:
            raise ValueError("Throttle must be between zero and one.")
        if self.status not in FLIGHT_STATUSES:
            raise ValueError("Invalid flight status.")
        if not isinstance(self.body_id, str) or not self.body_id:
            raise ValueError("Body ID is required.")
        if isinstance(self.active_stage, bool) or int(self.active_stage) < 0 or isinstance(self.stage_index, bool) or int(self.stage_index) < 0:
            raise ValueError("Stage state is invalid.")
        self.active_stage = int(self.active_stage)
        self.stage_index = int(self.stage_index)
        self.sequence = int(self.sequence)

    def sync_from(self, session):
        self.x, self.y = session.get("x", self.x), session.get("y", self.y)
        self.vx, self.vy = session.get("vx", self.vx), session.get("vy", self.vy)
        self.rotation = session.get("rotation", self.rotation)
        self.angular_velocity = session.get("angularVelocity", self.angular_velocity)
        self.throttle = session.get("throttle", self.throttle)
        self.throttle_actual = session.get("throttleActual", self.throttle_actual)
        self.mission_time = session.get("missionTime", self.mission_time)
        self.status = session.get("status", self.status)
        self.body_id = session.get("bodyId", self.body_id)
        self.active_stage = session.get("activeStage", self.active_stage)
        self.stage_index = session.get("stageIdx", self.stage_index)
        self.mass, self.fuel = session.get("mass", self.mass), session.get("fuel", self.fuel)
        self.timestamp = session.get("lastTime", time.time())
        self.sequence = session.get("sequence", self.sequence)
        self.validate()

    def apply_to(self, session):
        self.validate()
        session.update({"x": self.x, "y": self.y, "vx": self.vx, "vy": self.vy, "rotation": self.rotation, "angularVelocity": self.angular_velocity, "throttle": self.throttle, "throttleActual": self.throttle_actual, "missionTime": self.mission_time, "status": self.status, "bodyId": self.body_id, "activeStage": self.active_stage, "stageIdx": self.stage_index, "mass": self.mass, "fuel": self.fuel, "sequence": self.sequence})


Flightstate = FlightState