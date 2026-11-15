import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
from backend import service

blueprint = {
    'schema': 2,
    'name': 'TerraWatch-1 (EOS Light Launcher)',
    'stagingMode': 'manual',
    'id': 'eos_terrawatch_launcher',
    'parts': [
        {'uid': 'p0', 'c': 'fairing_nosecone', 'parent': None, 'mount': 'below', 'stage': 0, 'group': 0},
        {'uid': 'p1', 'c': 'payload_eos_sat', 'parent': 'p0', 'mount': 'below', 'stage': 0, 'group': 0},
        {'uid': 'p2', 'c': 'BAS-DECOUPLER', 'parent': 'p1', 'mount': 'below', 'stage': 3, 'group': 0},
        {'uid': 'p3', 'c': 'OTH-CONTROL', 'parent': 'p2', 'mount': 'below', 'stage': 0, 'group': 0},
        {'uid': 'p4', 'c': 'WIDE-TANK-4', 'parent': 'p3', 'mount': 'below', 'stage': 0, 'group': 0},
        {'uid': 'p5', 'c': 'ENG-MID-PREM', 'parent': 'p4', 'mount': 'below', 'stage': 2, 'group': 0},
        {'uid': 'p6', 'c': 'BAS-DECOUPLER', 'parent': 'p5', 'mount': 'below', 'stage': 2, 'group': 0},
        {'uid': 'p7', 'c': 'RA-TANK-2', 'parent': 'p6', 'mount': 'below', 'stage': 0, 'group': 0},
        {'uid': 'p8', 'c': 'ENG-BOOST-PREM', 'parent': 'p7', 'mount': 'below', 'stage': 1, 'group': 0}
    ],
    'looseParts': []
}

st = service.vehicle_stats({'blueprint': blueprint, 'bodyId': 'earth'})
print('Cost:', st['cost'], 'Stages:', len(st['stages']))
for s in st['stages']:
    print(f"Stage {s['stage']}: dv={s['dv']:.1f} m/s, twrSL={s['twrSL']:.2f}, burnTime={s['burnTime']:.1f}s, m0={s['m0']:.0f}, m1={s['m1']:.0f}")
print('Total dv:', sum(s['dv'] for s in st['stages']))
