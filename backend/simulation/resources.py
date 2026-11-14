from __future__ import annotations


def create_tank(name, fuel, capacity):
    return {"name": name, "fuel": max(0.0, float(fuel)), "capacity": max(0.0, float(capacity))}


def get_connected_tanks(engine_part, parts):
    by_uid = {part.get("uid"): part for part in parts}
    connected = []
    seen = set()
    parent = engine_part.get("parent") if engine_part else None
    while parent and parent not in seen:
        seen.add(parent)
        part = by_uid.get(parent)
        if not part or not part.get("alive", True):
            break
        definition = part.get("def", {})
        if definition.get("separator"):
            break
        if definition.get("tank"):
            connected.append(part)
        parent = part.get("parent")
    return connected


def draw_fuel(tanks, amount):
    remaining = max(0.0, float(amount))
    consumed = 0.0
    for tank in tanks:
        if remaining <= 1e-12:
            break
        available = max(0.0, float(tank.get("fuel", 0.0)))
        taken = min(available, remaining)
        tank["fuel"] = available - taken
        consumed += taken
        remaining -= taken
    return consumed


def transfer_fuel(tanks, source, destination, amount):
    if source not in tanks or destination not in tanks:
        return False, "tank not found.", 0
    if source == destination:
        return False, "source and destination are the same tank.", 0
    amount = float(amount)
    if amount <= 0:
        return False, "amount must be more than zero.", 0
    room = max(0.0, tanks[destination].get("capacity", 0.0) - tanks[destination].get("fuel", 0.0))
    moved = min(amount, max(0.0, tanks[source].get("fuel", 0.0)), room)
    if moved <= 0:
        return False, "nothing to move", 0
    tanks[source]["fuel"] -= moved
    tanks[destination]["fuel"] += moved
    return True, "transfer done", moved


def total_fuel(tanks):
    return sum(max(0.0, float(tank.get("fuel", 0.0))) for tank in tanks)
