import sys, math, json
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
from backend import service
from backend.simulation import flight_session, flight_command, staging

# Let's test a 2-stage or 3-stage rocket:
# Payload: payload_eos_sat (280 kg)
# Fairing: fairing_nosecone
# Stage 2 Decoupler: BAS-DECOUPLER
# Stage 2 Control: OTH-CONTROL
# Stage 2 Tank: WIDE-TANK-5 (or WIDE-TANK-4, or BAS-TANK-3)
# Stage 2 Engine: BAS-ENG-2 (SE-2, isp 450s!) or ENG-MID-PREM
# Stage 1 Decoupler: BAS-DECOUPLER
# Stage 1 Tank: RA-TANK-2 (28150 kg propellant) or RA-TANK-1 (38980 kg)
# Stage 1 Engine: RA-ENG-1 (MA-1 Booster, 760 kN thrust)

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
        {"uid": "p4", "c": "WIDE-TANK-5", "parent": "p3", "mount": "below", "stage": 0, "group": 0},
        {"uid": "p5", "c": "BAS-ENG-2", "parent": "p4", "mount": "below", "stage": 2, "group": 0},
        {"uid": "p6", "c": "BAS-DECOUPLER", "parent": "p5", "mount": "below", "stage": 2, "group": 0},
        {"uid": "p7", "c": "RA-TANK-2", "parent": "p6", "mount": "below", "stage": 0, "group": 0},
        {"uid": "p8", "c": "RA-ENG-1", "parent": "p7", "mount": "below", "stage": 1, "group": 0}
    ],
    "looseParts": []
}

st = service.vehicle_stats({'blueprint': blueprint, 'bodyId': 'earth', 'missionId': 'earth_observation_1'})
print("Cost:", st.get('cost'))
print("Wet mass:", st.get('wetMass'))
print("Stages count:", len(st.get('stages', [])))
for s in st.get('stages', []):
    print(f"Stage {s['stage']}: dv={s['dv']:.1f} m/s, burnTime={s['burnTime']:.1f}s, m0={s['m0']:.0f}, m1={s['m1']:.0f}, twrSL={s['twrSL']:.2f}")
print("Total dv:", sum(s['dv'] for s in st.get('stages', [])))
