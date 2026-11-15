import sys, json, math
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))

from backend import service
from backend.simulation import flight_session, flight_command, staging, objectives

# 1. Test missions.json
with open('frontend/data/missions/missions.json', 'r', encoding='utf-8') as f:
    missions_data = json.load(f)

m1 = next(m for m in missions_data['missions'] if m['id'] == 'earth_observation_1')
assert len(m1.get('passCriteria', [])) >= 4, "Missing passCriteria in Mission 1"
assert len(m1.get('failCriteria', [])) >= 4, "Missing failCriteria in Mission 1"
assert m1['rewards']['baseReward'] == 8500000, "Base reward mismatch"
assert any(b['id'] == 'under_budget' for b in m1['rewards']['bonuses']), "Missing under_budget bonus"
assert any(b['id'] == 'circular_orbit' for b in m1['rewards']['bonuses']), "Missing circular_orbit bonus"
assert 'unlockedParts' in m1['rewards'], "Missing unlockedParts in Mission 1 rewards"
print("✓ Mission 1 missions.json verified")

# 2. Test catalogue.json for rover
with open('frontend/data/payloads/catalogue.json', 'r', encoding='utf-8') as f:
    cat = json.load(f)
rover_comp = next((c for c in cat['components'] if c['id'] == 'INST-ROVER-M2020'), None)
assert rover_comp is not None, "INST-ROVER-M2020 not found in catalogue"
assert rover_comp.get('mount') == 'top', f"Expected mount 'top', got {rover_comp.get('mount')}"
assert rover_comp.get('shape') == 'rover', f"Expected shape 'rover', got {rover_comp.get('shape')}"
print("✓ Rover catalogue component verified")

# 3. Test Failure Diagnostics: Pad crash test
res = service.start_flight({'missionId': 'earth_observation_1', 'bodyId': 'earth', 'start': {'type': 'pad'}})
sid = res['sessionId']
session = flight_session.lookup(sid)
# Set session as crashed
session['status'] = 'crashed'
session['vx'] = 0.0
session['vy'] = 0.0
session['events'].append({"sequence": 0, "type": "crash", "msg": "Vehicle crashed at 0 m/s"})
report = objectives.evaluate(session)
assert report['outcome'] == 'failure', f"Expected failure outcome, got {report['outcome']}"
assert report.get('failureReason') is not None, "Missing failureReason"
assert report.get('failureDetails') is not None, "Missing failureDetails"
print(f"✓ Crash diagnosis test passed: reason='{report.get('failureReason')}', details='{report.get('failureDetails')}'")

# 4. Test Failure Diagnostics: Premature payload deploy
res = service.start_flight({'missionId': 'earth_observation_1', 'bodyId': 'earth', 'start': {'type': 'pad'}})
sid = res['sessionId']
session = flight_session.lookup(sid)
session['missionTime'] = 20.0
session['events'].append({"sequence": 0, "type": "deploy_payload", "msg": "Payload deployed prematurely"})
report = objectives.evaluate(session)
assert report['outcome'] == 'failure', f"Expected failure outcome, got {report['outcome']}"
assert "Premature" in report.get('failureReason', ''), f"Unexpected reason: {report.get('failureReason')}"
print(f"✓ Premature deploy diagnosis test passed: reason='{report.get('failureReason')}', details='{report.get('failureDetails')}'")

# 5. Test Successful Mission 1 with Rover or Satellite Payload
# Let's fly a simulated success
with open('frontend/data/vehicles/presets.json', 'r', encoding='utf-8') as f:
    presets = json.load(f)['presets']
preset = next(p for p in presets if p['id'] == 'eos_terrawatch_launcher')

res = service.start_flight({'blueprint': preset, 'missionId': 'earth_observation_1', 'bodyId': 'earth', 'start': {'type': 'pad'}})
session = flight_session.lookup(res['sessionId'])

session['status'] = 'flying'
session['stagesFired'] = 2
objectives.evaluate(session)

# Simulate circular orbit at 200 km
# Earth R = 6371000, target r = 6571000
# v_circ = sqrt(mu / r) = sqrt(3.986004418e14 / 6571000) ~ 7788 m/s
session['x'] = 6571000.0
session['y'] = 0.0
session['vx'] = 0.0
session['vy'] = 7788.0
session['altitude'] = 200000.0
session['missionTime'] = 300.0
snap = flight_session.snapshot(session)
assert snap['objectives'][2]['met'] == True, f"Orbit objective not met: {snap['objectives'][2]}"

# Deploy payload (rover or sat)
flight_command._deploy_payload(session, None)
snap = flight_session.snapshot(session)
assert snap['objectives'][3]['met'] == True, f"Deploy objective not met: {snap['objectives'][3]}"
assert snap['outcome'] == 'complete', f"Expected outcome complete, got {snap['outcome']}"
assert len(snap.get('passCriteria', [])) > 0, "Missing passCriteria in snapshot"
print("✓ Successful mission completion test passed!")

print("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!")
