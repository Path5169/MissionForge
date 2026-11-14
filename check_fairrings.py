import sys
from backend import service
from backend.vehicle import attachments as A

defs = service._DEFS()
bp = A.new_blueprint()
last = None
for pid in ["BAS-CAPSULE", "BAS-TANK-2", "BAS-ENG-1"]:
    r = A.add_part(bp, defs, pid, last, "below")
    print(pid, "->", "ok" if r["ok"] else r["error"])
    if not r["ok"]:
        sys.exit()
    bp, last = r["blueprint"], r["uid"]

for pid in sorted(i for i, d in defs.items() if d.get("category") == "fairing"):
    d = defs[pid]
    targets = A.attach_targets(bp, defs, pid, True)
    ok = [t["mount"] for t in targets if t["ok"]]
    errors = [t["error"] for t in targets if not t["ok"] and t["mount"] != "side"]
    print(pid, d.get("topD"), d.get("bottomD"), "ok:", len(ok), "" if ok else errors[:1])