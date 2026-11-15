import sys, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import json
from backend import service

with open('frontend/data/vehicles/presets.json', 'r', encoding='utf-8') as f:
    presets = json.load(f)['presets']

print('--- ALL PRESETS DELTA-V ---')
for p in presets:
    try:
        st = service.vehicle_stats({'blueprint': p, 'bodyId': 'earth'})
        stages = st.get('stages', [])
        total_dv = sum(s.get('dv', 0) for s in stages)
        print(f"{p.get('id')}: name=\"{p.get('name')}\", stages={len(stages)}, total_dv={total_dv:.1f} m/s, wetMass={st.get('wetMass', 0):.0f} kg")
    except Exception as e:
        print(f"{p.get('id')}: error {e}")
