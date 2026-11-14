import math

from backend.simulation import resources

G0 = 9.80665


class Engine:
    def __init__(self, part, vehicle_parts):
        self.part = part
        self.vehicle_parts = vehicle_parts
        self.definition = part.get("def", {})
        self.spec = self.definition.get("engine", {})

       

        self.uid = part.get("uid")
        self.name = self.definition.get("name", self.uid)
        self.type = self.spec.get("type", "liquid")

        self.thrust_vac = max(0.0, float(self.spec.get("thrustVac", 0)))
        self.isp_vac = max(0.0, float(self.spec.get("ispVac", 0)))
        self.isp_sl = max(0.0, float(self.spec.get("ispSL", self.isp_vac)))
        self.min_throttle = float(self.spec.get("minThrottle", 0))
        self.restartable = bool(self.spec.get("restartable", True))

        self.count = max(1, int(part.get("count", 1)))
        self.running = bool(part.get("firing", False))
        self.ignited = bool(part.get("ignited", False))
        self.spent = bool(part.get("spent", False))
        self.throttle = float(part.get("throttle", 0))

        self.current_thrust = 0.0
        self.fuel_consumed = 0.0


    def get_connected_tanks(self):
        if self.type != "liquid" or not self.part.get("alive", True):
            return []
        return resources.get_connected_tanks(self.part, self.vehicle_parts)

    @property
    def available_fuel(self):
        if self.type == "solid":
            return max(0.0, float(self.part.get("fuel", 0)))

        if self.type == "liquid":
            return sum(
                max(0.0, float(tank.get("fuel", 0)))
                for tank in self.get_connected_tanks()
            )

        return 0.0

    def ignite(self, throttle=1.0):
        if self.running:
            return False, "The engine is already running."

        if not self.part.get("alive", True):
            return False, "Engine is detached."

        if self.spent:
            return False, "Engine is spent."

        if self.type == "electric":
            return False, "Electric propulsion is not integrated yet."

        if self.type not in ("liquid", "solid"):
            return False, "Unsupported engine type."

        if self.available_fuel <= 0:
            return False, "No propellant available."

        if self.ignited and not self.restartable:
            return False, "Engine cannot be restarted."

        if self.type == "solid":
            self.throttle = 1.0
        else:
            success, message = self.set_throttle(throttle)
            if not success:
                return False, message

        self.running = True
        self.ignited = True
        self.part["ignited"] = True
        self.part["firing"] = True

        return True, "Ignition successful."

    def shutdown(self):
        if not self.running:
            return False, "The engine is already shut down."

        if self.type == "solid":
            return False, "Solid motors cannot be shut down."

        self.running = False
        self.throttle = 0.0
        self.current_thrust = 0.0

        self.part["firing"] = False
        self.part["throttle"] = 0.0

        return True, "Engine shut down."

    def set_throttle(self, value):
        try:
            value = float(value)
        except (TypeError, ValueError):
            return False, "Invalid throttle value."

        if not math.isfinite(value) or not 0 <= value <= 1:
            return False, "Throttle must be between 0 and 1."

        if self.type == "solid":
            return False, "Solid motor throttle is not adjustable."

        if self.type == "electric":
            return False, "Electric propulsion is not integrated yet."

        if value > 0:
            value = max(value, self.min_throttle)

        self.throttle = value
        self.part["throttle"] = value

        return True, "Throttle updated."

    def consume_fuel(self, amount):
        if self.type == "solid":
            available = max(0.0, float(self.part.get("fuel", 0)))
            used = min(available, max(0.0, float(amount)))
            self.part["fuel"] = available - used
            return used
        return resources.draw_fuel(self.get_connected_tanks(), amount)

    def update(self, dt, atmospheric_fraction=0.0, throttle=None):
        dt = float(dt)
        atmospheric_fraction = float(atmospheric_fraction)

        if not math.isfinite(dt) or dt < 0:
            raise ValueError("Invalid simulation time step.")

        if not 0 <= atmospheric_fraction <= 1:
            raise ValueError("Invalid atmospheric fraction.")

        if throttle is not None and self.type != "solid":
            success, message = self.set_throttle(throttle)
            if not success:
                raise ValueError(message)

        self.current_thrust = 0.0
        self.fuel_consumed = 0.0

        if not self.running or dt == 0:
            return self.telemetry()

        if not self.part.get("alive", True):
            self.running = False
            self.part["firing"] = False
            return self.telemetry()

        if self.type == "electric":
            self.running = False
            self.part["firing"] = False
            return self.telemetry()

        isp = self.isp_vac + (self.isp_sl - self.isp_vac) * atmospheric_fraction
        if isp <= 0 or self.isp_vac <= 0 or self.thrust_vac <= 0:
            self.running = False
            self.part["firing"] = False
            return self.telemetry()

        thrust = self.thrust_vac * self.count * isp / self.isp_vac

        power = 1.0 if self.type == "solid" else self.throttle

        if power <= 0:
            return self.telemetry()

        commanded_thrust = thrust * power
        required_fuel = commanded_thrust * dt / (isp * G0)

        consumed = self.consume_fuel(required_fuel)
        self.fuel_consumed = consumed

        fraction = min(1.0, consumed / required_fuel)

        self.current_thrust = commanded_thrust * fraction

        if consumed + 1e-12 < required_fuel or self.available_fuel <= 1e-12:
            self.running = False
            self.throttle = 0.0
            self.part["firing"] = False
            self.part["throttle"] = 0.0

            if self.type == "solid":
                self.spent = True
                self.part["spent"] = True

        return self.telemetry()

    def telemetry(self):
        return {
            "uid": self.uid,
            "name": self.name,
            "type": self.type,
            "running": self.running,
            "ignited": self.ignited,
            "spent": self.spent,
            "throttle": self.throttle,
            "thrust": self.current_thrust,
            "fuelConsumed": self.fuel_consumed,
            "remainingFuel": self.available_fuel
        }


class EngineSystem:
    def __init__(self, vehicle_parts):
        self.vehicle_parts = vehicle_parts

        self.engines = [
            Engine(part, vehicle_parts)
            for part in vehicle_parts
            if part.get("def", {}).get("engine")
        ]

    def get_engine(self, uid):
        return next(
            (engine for engine in self.engines if engine.uid == uid),
            None
        )

    def ignite_stage(self, stage, throttle=1.0, group=None):
        results = []

        for engine in self.engines:
            if engine.part.get("stage", 0) != stage:
                continue

            if group is not None and engine.part.get("group", 0) != group:
                continue

            results.append({
                "uid": engine.uid,
                "result": engine.ignite(throttle)
            })

        return results

    def shutdown_stage(self, stage, group=None):
        results = []

        for engine in self.engines:
            if engine.part.get("stage", 0) != stage:
                continue

            if group is not None and engine.part.get("group", 0) != group:
                continue

            results.append({
                "uid": engine.uid,
                "result": engine.shutdown()
            })

        return results

    def set_throttle(self, value):
        return [
            {
                "uid": engine.uid,
                "result": engine.set_throttle(value)
            }
            for engine in self.engines
            if engine.running
        ]

    def update(self, dt, atmospheric_fraction=0.0, throttle=None):
        results = [
            engine.update(dt, atmospheric_fraction, throttle)
            for engine in self.engines
        ]

        return {
            "thrust": sum(engine["thrust"] for engine in results),
            "fuelConsumed": sum(
                engine["fuelConsumed"] for engine in results
            ),
            "engines": results
        }

    def telemetry(self):
        return [
            engine.telemetry()
            for engine in self.engines
        ]


SPOOL_RATE = 0.8


def _manual_shutdown(session):
    return session.setdefault("manualShutdown", set())


def _log(session, uid, message):
    session["events"].append({"sequence": len(session["events"]), "type": "engine", "uid": uid, "msg": message})


def find_engine(session, uid):
    return next((engine for engine in session["engines"] if engine["uid"] == uid), None)


def spool_throttle(session, dt):
    actual = session.get("throttleActual", session["throttle"])
    limit = SPOOL_RATE * dt
    actual += max(-limit, min(limit, session["throttle"] - actual))
    session["throttleActual"] = actual
    return actual


def toggle_engine(session, uid):
    engine = find_engine(session, uid)
    if engine is None:
        return {"accepted": False, "message": "Engine not found."}
    if uid in session["deadUids"]:
        return {"accepted": False, "message": "Engine is detached."}
    manual = _manual_shutdown(session)
    if uid in manual:
        manual.discard(uid)
        message = "Engine restarted"
    else:
        manual.add(uid)
        message = "Engine shut down"
    engine["firing"] = False
    engine["thrust"] = 0.0
    _log(session, uid, message)
    return {"accepted": True, "message": message}


def ignite_stage(session, stage_number):
    manual = _manual_shutdown(session)
    matches = [e for e in session["engines"] if e["stage"] == stage_number and e["uid"] not in session["deadUids"]]
    if not matches:
        return {"accepted": False, "message": "No engines in that stage."}
    for engine in matches:
        manual.discard(engine["uid"])
    return {"accepted": True, "message": ""}


def toggle_group(session, group):
    manual = _manual_shutdown(session)
    matches = [e for e in session["engines"] if e.get("group") == group and e["uid"] not in session["deadUids"]]
    if not matches:
        return {"accepted": True, "message": ""}
    enable = any(e["uid"] in manual for e in matches)
    for engine in matches:
        if enable:
            manual.discard(engine["uid"])
        else:
            manual.add(engine["uid"])
    return {"accepted": True, "message": ""}


def step(session, dt, air_fraction, stage):
    throttle = spool_throttle(session, dt)
    current = stage["stage"] if stage else None
    dead = session["deadUids"]
    manual = _manual_shutdown(session)
    live = [e for e in session["engines"] if e["uid"] not in dead]
    in_stage = [e for e in live if e["stage"] == current]
    available = [e for e in in_stage if e["uid"] not in manual]
    fraction = len(available) / len(in_stage) if in_stage else 0.0

    thrust = 0.0
    if stage and throttle > 0 and session["fuel"] > 0 and fraction > 0 and dt > 0:
        isp_vac = max(1e-9, float(stage.get("ispVac", 0.0)))
        isp = max(1e-9, isp_vac + (float(stage.get("ispSL", isp_vac)) - isp_vac) * air_fraction)
        max_thrust = float(stage.get("thrustVac", 0.0)) * isp / isp_vac
        thrust = max_thrust * throttle * fraction
        burn = thrust / (isp * G0) * dt
        resource = {"fuel": max(0.0, float(session.get("fuel", 0.0))), "capacity": max(0.0, float(session.get("fuelCap", 0.0)))}
        consumed = resources.draw_fuel([resource], burn)
        if consumed < burn:
            thrust = consumed / dt * isp * G0
        session["fuel"] = resource["fuel"]
        burn = consumed
        session["mass"] -= burn

    firing = {e["uid"] for e in available if 0 < e["stage"] <= session["stageDone"]}
    for engine in session["engines"]:
        alive = engine["uid"] not in dead
        engine["ignited"] = alive and 0 < engine["stage"] <= session["stageDone"]
        engine["firing"] = thrust > 0 and engine["uid"] in firing
        engine["thrust"] = thrust / len(firing) if engine["firing"] else 0.0
        engine["spent"] = engine["ignited"] and (engine["stage"] < (current or 0) or (engine["stage"] == current and session["fuel"] <= 0))
    session["thrustNow"] = thrust
    return thrust
