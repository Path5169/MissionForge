
from __future__ import annotations

import math

SIDE_GAP = 0.03


def _num(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _stack_child(parts, uid):
    return next((p for p in parts if p.get("parent") == uid and p.get("mount", "below") == "below"), None)


def _side_children(parts, uid):
    return [p for p in parts if p.get("parent") == uid and p.get("mount") == "side"]


def layout(parts, defs):
    
    items = {}

    def chain_of(first):
        out, current, seen = [], first, set()
        while current and current.get("uid") not in seen:
            seen.add(current.get("uid"))
            definition = defs.get(current.get("c"))
            if not definition:
                break
            out.append((current, definition))
            current = _stack_child(parts, current.get("uid"))
        return out

    def place(first, x, side, y_top):
        y = y_top
        for part, definition in chain_of(first):
            visual_height = 0.0 if definition.get("category") == "fairing" else _num(definition.get("height"))
            y_bottom = y + visual_height
            items[part["uid"]] = {
                "y0": y,
                "y1": y_bottom,
                "drop": _num((definition.get("landing") or {}).get("drop")),
                "side": side,
            }
            y = y_bottom
            for child in _side_children(parts, part["uid"]):
                branch = chain_of(child)
                if not branch:
                    continue
                wide = max(_num(q.get("diameter")) for _, q in branch)
                branch_height = sum(_num(q.get("height")) for _, q in branch)
                place(child, x + _num(definition.get("diameter")) / 2 + wide / 2 + SIDE_GAP,
                      True, y_bottom - branch_height)

    root = next((p for p in parts if not p.get("parent")), None)
    if root:
        place(root, 0.0, False, 0.0)
    return items


def extent(items, alive=None):
   
    top, bottom, found = math.inf, -math.inf, False
    for uid, item in items.items():
        if alive is not None and uid not in alive:
            continue
        found = True
        top = min(top, item["y0"])
        bottom = max(bottom, item["y1"] + item["drop"])
    return (top, bottom) if found else (0.0, 0.0)


def initialise(session, blueprint, defs):
   
    items = layout(blueprint.get("parts") or [], defs)
    session["layout"] = items
    top, bottom = extent(items)
    session["topY"] = top
    session["bottomY"] = bottom
    session["centerOfMass"] = bottom   
    session["baseOffset"] = 0.0
    return items


def refresh(session):
    
    items = session.get("layout")
    if not items:
        return 0.0
    alive = {p["uid"] for p in session["parts"] if p.get("alive", True) and p["uid"] not in session["deadUids"]}
    top, bottom = extent(items, alive)
    old_bottom = _num(session.get("bottomY"))
    shift = old_bottom - bottom                      
    session["topY"] = top
    session["bottomY"] = bottom
    session["centerOfMass"] = bottom
    if abs(shift) > 1e-9:
        radius = math.hypot(session["x"], session["y"])
        if radius > 0:
            scale = (radius + shift) / radius
            session["x"] *= scale
            session["y"] *= scale
    return shift