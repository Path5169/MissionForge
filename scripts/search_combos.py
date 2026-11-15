import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
from backend import service

cat = service.catalog_data()
defs = {p['id']: p for p in cat}

# Let's test combinations of stage 1 and stage 2 tanks to get total_dv between 9500 and 11000 and cost <= 2500000
for tank2 in ["WIDE-TANK-3", "WIDE-TANK-4", "WIDE-TANK-5", "BAS-TANK-3"]:
    for eng2 in ["BAS-ENG-2", "ENG-MID-PREM"]:
        for tank1 in ["RA-TANK-2", "RA-TANK-1", "WIDE-TANK-5"]:
            for eng1 in ["RA-ENG-1", "ENG-BOOST-PREM", "BAS-ENG-1"]:
                blueprint = {
                    "schema": 2,
                    "name": "TerraWatch-1 (EOS Light Launcher)",
                    "stagingMode": "manual",
                    "id": "eos_terrawatch_launcher",
                    "parts": [
                        {"uid": "p0", "c": "fairing_nosecone", "parent": None, "mount": "below", "stage": 0, "group": 0},
                        {"uid": "p1", "c": "payload_eos_sat", "parent": "p0", "mount": "below", "stage": 0, "group": 0},
                        {"uid": "p2", "c": "BAS-DECOUPLER", "parent": "p1", "mount": "below", "stage": 3, "group": 0},
                        {"uid": "p3", "c": "OTH-CONTROL", "parent": "p2", "mount": "below", "stage": 0, "group": 0},
                        {"uid": "p4", "c": tank2, "parent": "p3", "mount": "below", "stage": 0, "group": 0},
                        {"uid": "p5", "c": eng2, "parent": "p4", "mount": "below", "stage": 2, "group": 0},
                        {"uid": "p6", "c": "BAS-DECOUPLER", "parent": "p5", "mount": "below", "stage": 2, "group": 0},
                        {"uid": "p7", "c": tank1, "parent": "p6", "mount": "below", "stage": 0, "group": 0},
                        {"uid": "p8", "c": eng1, "parent": "p7", "mount": "below", "stage": 1, "group": 0}
                    ],
                    "looseParts": []
                }
                st = service.vehicle_stats({'blueprint': blueprint, 'bodyId': 'earth', 'missionId': 'earth_observation_1'})
                stages = st.get('stages', [])
                if len(stages) == 2:
                    s1, s2 = stages[0], stages[1]
                    tot_dv = s1['dv'] + s2['dv']
                    cost = st.get('cost', 0)
                    if tot_dv >= 9500 and s1['twrSL'] >= 1.2 and cost <= 2500000:
                        print(f"MATCH: {tank1}+{eng1} / {tank2}+{eng2} -> dv={tot_dv:.0f}m/s (s1:{s1['dv']:.0f}, s2:{s2['dv']:.0f}), twrSL={s1['twrSL']:.2f}, cost=${cost:,.0f}")
