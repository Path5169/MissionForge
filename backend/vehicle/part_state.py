from __future__ import annotations

KIND_ENGINE = "engine"
KIND_DEPLOYABLE = "deployable"
KIND_PARACHUTE = "parachute"
KIND_SEPARATOR = "separator"

ACTIVATE = "activate"

SUPPORTED_COMMANDS = {
    KIND_ENGINE: (ACTIVATE,),
    KIND_DEPLOYABLE: (ACTIVATE,),
    KIND_PARACHUTE: (ACTIVATE,),
    KIND_SEPARATOR: (ACTIVATE,),
}


def behavior_kind(definition):
    definition = definition or {}
    if definition.get("engine"):
        return KIND_ENGINE
    if definition.get("landing") or (definition.get("power") or {}).get("deployable"):
        return KIND_DEPLOYABLE
    if definition.get("parachute"):
        return KIND_PARACHUTE
    if definition.get("separator"):
        return KIND_SEPARATOR
    return None


def supported_commands(definition):
    kind = behavior_kind(definition)

    if kind is None:
        return ()

    return SUPPORTED_COMMANDS.get(kind, ())


def default_part_state(part, definition=None):
    return {
        "uid": part.get("uid"),
        "alive": True,
        "stage": int(part.get("stage", 0) or 0),
        "group": int(part.get("group", 0) or 0),
        "deployed": False,
        "armed": False,
    }


def definitions_by_uid(blueprint, catalog):
    return {part.get("uid"): catalog.get(part.get("c"), {}) for part in blueprint.get("parts", [])}


def create_part_states(blueprint, catalog):
    return [default_part_state(part, catalog.get(part.get("c"))) for part in blueprint.get("parts", [])]


def find_state(states, uid):
    for state in states:
        if state.get("uid") == uid:
            return state
    return None


def is_alive(state, dead_uids=()):
    return bool(state.get("alive")) and state.get("uid") not in dead_uids


def apply_part_command(state, definition, command=ACTIVATE, flight_status=None):
    if not state or not state.get("alive"):
        return {"accepted": False, "action": None, "message": "Part is not attached."}
    kind = behavior_kind(definition)
    if kind is None or command not in SUPPORTED_COMMANDS[kind]:
        return {"accepted": False, "action": None, "message": "Part does not support this command."}
    if kind == KIND_ENGINE:
        return {"accepted": True, "action": "toggle_engine", "message": ""}
    if kind == KIND_DEPLOYABLE:
        state["deployed"] = not state.get("deployed", False)
        return {"accepted": True, "action": "deployed" if state["deployed"] else "retracted", "message": ""}
    if kind == KIND_PARACHUTE:
        state["armed"] = True
        return {"accepted": True, "action": "armed", "message": ""}
    if flight_status == "prelaunch":
        return {"accepted": False, "action": None, "message": "Cannot separate on the pad."}
    return {"accepted": True, "action": "next_stage", "message": ""}