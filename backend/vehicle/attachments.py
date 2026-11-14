from __future__ import annotations

import copy

SCHEMA = 2
EPS = 0.011
MAX_STAGE = 9
MAX_GROUP = 4
MIN_TANK_RATIO = 0.25


def catalog_index(components):
    return {item["id"]: item for item in components if isinstance(item, dict) and "id" in item}


def new_blueprint(name="Untitled vehicle"):
    return {"schema": SCHEMA, "name": name, "stagingMode": "auto", "parts": [], "looseParts": []}


def fits(upper_bottom_d, lower_top_d, upper_def, lower_def):
    if upper_bottom_d is None or lower_top_d is None:
        return False
    if abs(upper_bottom_d - lower_top_d) <= EPS:
        return True
    largest = max(upper_bottom_d, lower_top_d)
    if largest <= 0:
        return False
    return (min(upper_bottom_d, lower_top_d) / largest) >= MIN_TANK_RATIO


def find(blueprint, uid):
    for part in blueprint.get("parts", []):
        if part.get("uid") == uid:
            return part
    for part in blueprint.get("looseParts") or []:
        if part.get("uid") == uid:
            return part
    return None


def stack_child(blueprint, uid):
    for part in blueprint.get("parts", []):
        if part.get("parent") == uid and part.get("mount") == "below":
            return part
    return None


def side_children(blueprint, uid):
    return [p for p in blueprint.get("parts", []) if p.get("parent") == uid and p.get("mount") == "side"]


def side_child(blueprint, uid):
    children = side_children(blueprint, uid)
    return children[0] if children else None


def subtree_uids(blueprint, uid):
    out = [uid]
    index = 0
    while index < len(out):
        for part in blueprint.get("parts", []):
            if part.get("parent") == out[index] and part["uid"] not in out:
                out.append(part["uid"])
        index += 1
    return out


def is_lateral(blueprint, part):
    seen = set()
    current = part
    while current and current["uid"] not in seen:
        if current.get("mount") == "side":
            return True
        seen.add(current["uid"])
        parent = current.get("parent")
        current = find(blueprint, parent) if parent else None
    return False


def lateral_ok(definition):
    return (
        not definition.get("radial")
        and not definition.get("command")
        and definition.get("category") not in ("separator", "landing")
    )


def _name(definition, fallback=""):
    return definition.get("name") or definition.get("id") or fallback


def _next_uid(blueprint):
    highest = 0
    for part in list(blueprint.get("parts", [])) + list(blueprint.get("looseParts") or []):
        try:
            highest = max(highest, int(str(part.get("uid", ""))[1:]))
        except ValueError:
            continue
    return f"p{highest + 1}"


def _fail(error):
    return {"ok": False, "error": error}


def _done(blueprint, catalog, uid):
    if blueprint.get("stagingMode") == "auto":
        auto_stage(blueprint, catalog)
    return {"ok": True, "blueprint": blueprint, "uid": uid}


def add_part(blueprint, catalog, comp_id, anchor_uid=None, mount="below", opts=None):
    opts = opts or {}
    definition = catalog.get(comp_id)
    if not definition:
        return _fail(f'Unknown part "{comp_id}".')
    nxt = copy.deepcopy(blueprint)
    nxt.setdefault("parts", [])
    part = {"uid": _next_uid(nxt), "c": comp_id, "parent": None, "mount": "below", "stage": 0, "group": 0}
    dname = _name(definition, comp_id)

    if not nxt["parts"]:
        nxt["parts"].append(part)
        return _done(nxt, catalog, part["uid"])

    anchor = find(nxt, anchor_uid) if anchor_uid else None
    if not anchor:
        return _fail("Select a part to attach to first.")
    adef = catalog.get(anchor["c"]) or {}
    aname = _name(adef, anchor["c"])

    if mount == "side":
        if adef.get("clamp"):
            if not lateral_ok(definition):
                return _fail(f"{dname} cannot be attached to a side separator.")
            if side_children(nxt, anchor["uid"]):
                return _fail(f"{aname} already has a part attached.")
            part["parent"] = anchor["uid"]
            part["mount"] = "side"
            if anchor.get("dir"):
                part["dir"] = anchor["dir"]
        else:
            if not definition.get("radial"):
                if definition.get("category") == "tank" or definition.get("engine"):
                    return _fail(f"{dname} can only be attached to the side through a side separator (SS-1).")
                return _fail(f"{dname} cannot be side-mounted.")
            if not adef.get("radialHost"):
                return _fail(f"{aname} cannot carry side-mounted parts.")
            if definition.get("clamp") and is_lateral(nxt, anchor):
                return _fail("Cannot mount a side separator on a lateral booster.")
            direction = opts.get("dir") if opts.get("dir") in (-1, 1) else 0
            have = side_children(nxt, anchor["uid"])
            if any(not q.get("dir") for q in have):
                return _fail(f"{aname} already carries a side-mounted pair.")
            if direction == 0 and have:
                return _fail(f"{aname} already carries a side-mounted part, so a mirrored pair does not fit.")
            if any(q.get("dir") == direction for q in have):
                return _fail(f"{aname} already carries a part on its {'left' if direction < 0 else 'right'} side.") # type: ignore 
            part["parent"] = anchor["uid"]
            part["mount"] = "side"
            if direction:
                part["dir"] = direction 
    else:
        if definition.get("radial"):
            return _fail(f"{dname} must be side-mounted.")
        if adef.get("clamp"):
            return _fail(f"{aname} has no top or bottom: attach parts to its outer side.")
        if adef.get("radial"):
            return _fail("Nothing can be stacked on a side-mounted part.")
        if mount == "above":
            if definition.get("bottomD") is None:
                return _fail(f"{dname} has no bottom attachment.")
            if adef.get("topD") is None:
                return _fail(f"{aname} has a closed top; nothing fits above it.")
            if not fits(definition["bottomD"], adef["topD"], definition, adef):
                return _fail(
                    f"Diameter mismatch: {dname} is {definition['bottomD']} m at the bottom, "
                    f"{aname} is {adef['topD']} m at the top."
                )
            upper = find(nxt, anchor["parent"]) if anchor.get("parent") else None
            if upper and anchor.get("mount") != "side":
                udef = catalog.get(upper["c"]) or {}
                if definition.get("topD") is None or not fits(udef.get("bottomD"), definition["topD"], udef, definition):
                    return _fail(f"{dname} does not fit between {_name(udef, upper['c'])} and {aname}.")
            if anchor.get("mount") == "side":
                if not lateral_ok(definition):
                    return _fail(f"{dname} cannot be attached to a side separator.")
                part["mount"] = "side"
                if anchor.get("dir"):
                    part["dir"] = anchor["dir"]
                anchor["mount"] = "below"
                anchor.pop("dir", None)
            part["parent"] = anchor.get("parent")
            anchor["parent"] = part["uid"]
        else:
            if definition.get("topD") is None:
                return _fail(f"{dname} has a closed top; it must be the topmost part.")
            if adef.get("bottomD") is None:
                return _fail(f"{aname} has no bottom attachment.")
            if not fits(adef["bottomD"], definition["topD"], adef, definition):
                return _fail(
                    f"Diameter mismatch: {dname} is {definition['topD']} m at the top, "
                    f"{aname} is {adef['bottomD']} m at the bottom."
                )
            # Lateral stacking permitted
            below = stack_child(nxt, anchor["uid"])
            if below:
                bdef = catalog.get(below["c"]) or {}
                if definition.get("bottomD") is None or not fits(definition["bottomD"], bdef.get("topD"), definition, bdef):
                    return _fail(f"{dname} does not fit above {_name(bdef, below['c'])}.")
                below["parent"] = part["uid"]
            part["parent"] = anchor["uid"]

    nxt["parts"].append(part)
    return _done(nxt, catalog, part["uid"])


def add_loose_part(blueprint, catalog, comp_id, x, y, opts=None):
    opts = opts or {}
    if not catalog.get(comp_id):
        return _fail(f'Unknown part "{comp_id}".')
    nxt = copy.deepcopy(blueprint)
    nxt.setdefault("looseParts", [])
    uid = opts.get("uid") or _next_uid(nxt)
    if find(nxt, uid):
        return _fail(f'Part "{uid}" already exists.')
    nxt["looseParts"].append(
        {"uid": uid, "c": comp_id, "x": x, "y": y, "stage": opts.get("stage") or 0, "group": opts.get("group") or 0}
    )
    return {"ok": True, "blueprint": nxt, "uid": uid}


def remove_part(blueprint, catalog, uid):
    part = find(blueprint, uid)
    if not part:
        return _fail("Part not found.")
    nxt = copy.deepcopy(blueprint)
    notes = []
    gone = {uid}

    if any(q.get("uid") == uid for q in nxt.get("looseParts") or []):
        nxt["looseParts"] = [q for q in nxt["looseParts"] if q.get("uid") != uid]
        return {"ok": True, "blueprint": nxt, "removed": [uid], "notes": notes}

    for child in side_children(nxt, uid):
        gone.update(subtree_uids(nxt, child["uid"]))

    below = stack_child(nxt, uid)
    parent = find(nxt, part["parent"]) if part.get("parent") else None

    if below:
        if parent:
            pdef = catalog.get(parent["c"]) or {}
            cdef = catalog.get(below["c"]) or {}
            compatible = part.get("mount") == "side" or fits(pdef.get("bottomD"), cdef.get("topD"), pdef, cdef)
        else:
            compatible = True
        if compatible:
            below["parent"] = part.get("parent")
        else:
            notes.append("The parts below no longer fit and were removed too.")
            gone.update(subtree_uids(nxt, below["uid"]))

    nxt["parts"] = [q for q in nxt["parts"] if q["uid"] not in gone]
    if nxt.get("stagingMode") == "auto":
        auto_stage(nxt, catalog)
    return {"ok": True, "blueprint": nxt, "removed": sorted(gone), "notes": notes}


def set_stage(blueprint, uid, value):
    nxt = copy.deepcopy(blueprint)
    part = find(nxt, uid)
    if part:
        part["stage"] = max(0, min(MAX_STAGE, int(value)))
        nxt["stagingMode"] = "manual"
    return nxt


def set_group(blueprint, uid, value):
    nxt = copy.deepcopy(blueprint)
    part = find(nxt, uid)
    if part:
        part["group"] = max(0, min(MAX_GROUP, int(value)))
    return nxt


def set_staging_mode(blueprint, catalog, mode):
    nxt = copy.deepcopy(blueprint)
    nxt["stagingMode"] = mode
    if mode == "auto":
        auto_stage(nxt, catalog)
    return nxt


def auto_stage(blueprint, catalog):
    by_uid = {p["uid"]: p for p in blueprint.get("parts", [])}

    def definition_of(part):
        return catalog.get(part["c"]) or {}

    def segments(uid):
        depth = 0
        seen = set()
        current = by_uid.get(uid)
        while current and current["uid"] not in seen:
            seen.add(current["uid"])
            cdef = definition_of(current)
            if cdef.get("separator") and not cdef.get("clamp"):
                depth += 1
            current = by_uid.get(current.get("parent"))
        return depth

    depths = {uid: segments(uid) for uid in by_uid}
    deepest = max(depths.values(), default=0)
    for part in blueprint.get("parts", []):
        cdef = definition_of(part)
        d = depths[part["uid"]]
        if cdef.get("engine"):
            part["stage"] = deepest - d + 1
        elif cdef.get("clamp") or cdef.get("separator"):
            part["stage"] = deepest - d + 2
        else:
            part["stage"] = 0
    return blueprint


def feed_chain(parts, engine):
    by_uid = {p["uid"]: p for p in parts}
    out = []
    seen = set()
    current = by_uid.get(engine.get("parent"))
    while current and current["uid"] not in seen:
        seen.add(current["uid"])
        if current["def"].get("separator"):
            break
        if current["def"].get("tank"):
            out.append(current)
        current = by_uid.get(current.get("parent"))
    return out


def validate_blueprint(blueprint, catalog):
    errors = []
    warnings = []
    parts = blueprint.get("parts", [])
    if not parts:
        return {"errors": ["The vehicle is empty."], "warnings": warnings}
    if len([p for p in parts if not p.get("parent")]) != 1:
        errors.append("The vehicle must have exactly one top part.")
    pairs = [(p, catalog.get(p["c"])) for p in parts]
    for part, definition in pairs:
        if not definition:
            errors.append(f'Unknown part "{part["c"]}".')
    if errors:
        return {"errors": errors, "warnings": warnings}

    cores = [1 for _, d in pairs if d.get("command")]
    if not cores:
        errors.append("No guidance core (GC-1): the vehicle cannot be flown.")
    if len(cores) > 1:
        errors.append("Only one guidance core is allowed.")
    engines = [(p, d) for p, d in pairs if d.get("engine")]
    if not engines:
        errors.append("No engine.")

    runtime = [{"uid": p["uid"], "def": d, "parent": p.get("parent")} for p, d in pairs]
    for item in runtime:
        engine = item["def"].get("engine")
        if engine and engine.get("type") == "liquid" and not feed_chain(runtime, item):
            errors.append(f"{_name(item['def'])} has no propellant tank above it.")

    for part, definition in pairs:
        if part.get("mount") != "below" or not part.get("parent"):
            continue
        upper = find(blueprint, part["parent"])
        if not upper:
            errors.append(f"{_name(definition)} references a missing parent.")
            continue
        pdef = catalog.get(upper["c"]) or {}
        if not fits(pdef.get("bottomD"), definition.get("topD"), pdef, definition):
            errors.append(f"Diameter mismatch between {_name(pdef)} and {_name(definition)}.")

    for part, definition in engines:
        if part.get("stage", 0) == 0 and part.get("group", 0) == 0:
            warnings.append(f"{_name(definition)} is not in any stage or group and will never ignite.")
    for part, definition in pairs:
        if definition.get("clamp") and not side_children(blueprint, part["uid"]):
            warnings.append(f"{_name(definition)} has nothing attached to it.")
    has_separator = any(d.get("separator") for _, d in pairs)
    has_tank = any(d.get("tank") for _, d in pairs)
    if not has_separator and has_tank and len(engines) > 1:
        warnings.append("Several engines but no stage separator: all engines share one stage.")
    return {"errors": errors, "warnings": warnings}


def check_targets(blueprint, catalog, comp_id, targets):
    results = []
    for target in targets:
        result = add_part(
            blueprint,
            catalog,
            comp_id,
            target.get("anchor"),
            target.get("mount", "below"),
            {"dir": target.get("dir", 0)},
        )
        results.append(result)
    return results

def placed_parts(blueprint, catalog):
    placed = []
    seen = set()

    def chain(first):
        out = []
        current = first
        while current and current["uid"] not in seen:
            if not catalog.get(current["c"]):
                break
            seen.add(current["uid"])
            out.append(current)
            current = stack_child(blueprint, current["uid"])
        return out

    def place(first, side, direction):
        for part in chain(first):
            placed.append({"uid": part["uid"], "side": side, "dir": direction})
            for child in side_children(blueprint, part["uid"]):
                place(child, True, child.get("dir") or 0)

    root = next((p for p in blueprint.get("parts", []) if not p.get("parent")), None)
    if root:
        place(root, False, 0)
    return placed


def candidate_targets(blueprint, catalog, comp_id, sym=True):
    definition = catalog.get(comp_id)
    if not definition:
        raise ValueError(f'Unknown part "{comp_id}".')
    if not blueprint.get("parts"):
        return [{"anchor": None, "mount": "below", "dir": 0, "free": True}]
    out = []
    for item in placed_parts(blueprint, catalog):
        uid = item["uid"]
        if item["side"]:
            out.append({"anchor": uid, "mount": "side", "dir": item["dir"]})
        elif definition.get("radial") and not sym:
            for direction in (1, -1):
                out.append({"anchor": uid, "mount": "side", "dir": direction})
        else:
            out.append({"anchor": uid, "mount": "side", "dir": 0})
        out.append({"anchor": uid, "mount": "above", "dir": 0})
        out.append({"anchor": uid, "mount": "below", "dir": 0})
    return out


def attach_targets(blueprint, catalog, comp_id, sym=True):
    candidates = candidate_targets(blueprint, catalog, comp_id, sym)
    checked = check_targets(blueprint, catalog, comp_id, candidates)
    targets = []
    for candidate, result in zip(candidates, checked):
        entry = dict(candidate)
        entry["ok"] = result["ok"]
        entry["error"] = result.get("error")
        entry["uid"] = result.get("uid")
        entry["blueprint"] = result.get("blueprint")
        targets.append(entry)
    return targets


def build_attachment_graph(blueprint, catalog):
    nodes = {}
    edges = []
    attached = {p["uid"] for p in blueprint.get("parts", [])}
    for part in list(blueprint.get("parts", [])) + list(blueprint.get("looseParts") or []):
        definition = catalog.get(part["c"])
        if not definition:
            continue
        is_attached = not part.get("detached") and part["uid"] in attached
        nodes[part["uid"]] = {"uid": part["uid"], "definition": definition, "part": part, "attached": is_attached}
        if part.get("parent") and part["uid"] in attached:
            edges.append(
                {
                    "id": f"{part['parent']}:{part['uid']}",
                    "a": part["parent"],
                    "b": part["uid"],
                    "mount": part.get("mount") or "below",
                    "kind": "separable" if definition.get("separator") else "structural",
                    "active": True,
                }
            )
    return {"nodes": nodes, "edges": edges}


def connected_components(graph, excluded_edges=frozenset()):
    adjacency = {uid: [] for uid in graph["nodes"]}
    for edge in graph["edges"]:
        if not edge["active"] or edge["id"] in excluded_edges:
            continue
        if edge["a"] not in adjacency or edge["b"] not in adjacency:
            continue
        adjacency[edge["a"]].append(edge["b"])
        adjacency[edge["b"]].append(edge["a"])
    seen = set()
    groups = []
    for uid in adjacency:
        if uid in seen:
            continue
        group = []
        queue = [uid]
        seen.add(uid)
        while queue:
            current = queue.pop()
            group.append(current)
            for nxt in adjacency[current]:
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        groups.append(group)
    return groups


def connection_for_part(graph, uid):
    for edge in graph["edges"]:
        if edge["a"] == uid or edge["b"] == uid:
            return edge
    return None


def split_at_connection(graph, edge_id):
    edge = next((item for item in graph["edges"] if item["id"] == edge_id), None)
    if not edge:
        return {"ok": False, "groups": [], "error": "Connection not found."}
    return {"ok": True, "edge": edge, "groups": connected_components(graph, edge_id)}


def serialize_connections(blueprint, catalog):
    return copy.deepcopy(build_attachment_graph(blueprint, catalog)["edges"])