import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
PNG_DIR = FRONTEND / "assets" / "parts"
TOLERANCE = 0.02
APPLY = "--apply" in sys.argv


def main():
    index = json.loads((FRONTEND / "data" / "parts" / "index.json").read_text(encoding="utf-8"))
    rows, changed = [], 0
    for item in index["parts"]:
        png = PNG_DIR / f"{item['id']}.png"
        if not png.exists():
            continue
        part_file = FRONTEND / item["definition"].lstrip("/")
        d = json.loads(part_file.read_text(encoding="utf-8"))
        with Image.open(png) as im:
            w, h = im.size
            box = im.convert("RGBA").getchannel("A").getbbox()
        # Measure the VISIBLE art, exactly like assets.artBox() in the browser.
        bw, bh = (box[2] - box[0], box[3] - box[1]) if box else (w, h)
        if d.get("category") == "tank":
            bw, bh = w, h  # tank art is sliced on the full image, so tanks keep using it whole
        new_h = round(d["diameter"] * bh / bw, 2)
        old_h = d["height"]
        off = abs(new_h - old_h) / old_h > TOLERANCE
        rows.append((item["id"], d["diameter"], old_h, new_h, off))
        if off and APPLY:
            d["height"] = new_h
            if isinstance(d.get("dimensions"), dict):
                d["dimensions"]["heightM"] = new_h
            part_file.write_text(json.dumps(d, indent=2), encoding="utf-8")
            changed += 1

    print(f"{'part':18}{'diameter':>9}{'height now':>12}{'from art':>10}  status")
    for pid, dia, old_h, new_h, off in rows:
        status = ("UPDATED" if APPLY else "WOULD CHANGE") if off else "ok"
        print(f"{pid:18}{dia:>9}{old_h:>12}{new_h:>10}  {status}")
    if not rows:
        print("No PNGs found in", PNG_DIR)
    elif APPLY:
        print(f"\nDone. {changed} part.json file(s) updated. Hard refresh the browser (Ctrl+Shift+R).")
    else:
        print("\nNothing was written. Run again with --apply to write these heights.")


if __name__ == "__main__":
    main()