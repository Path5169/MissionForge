import sys, math, json, time
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
from backend import service
from backend.simulation import flight_session, flight_command, staging

# Blueprint with WIDE-TANK-5 + ENG-BOOST-PREM (stage 1) and WIDE-TANK-3 + BAS-ENG-2 (stage 2)
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
        {"uid": "p4", "c": "WIDE-TANK-3", "parent": "p3", "mount": "below", "stage": 0, "group": 0},
        {"uid": "p5", "c": "BAS-ENG-2", "parent": "p4", "mount": "below", "stage": 2, "group": 0},
        {"uid": "p6", "c": "BAS-DECOUPLER", "parent": "p5", "mount": "below", "stage": 2, "group": 0},
        {"uid": "p7", "c": "WIDE-TANK-5", "parent": "p6", "mount": "below", "stage": 0, "group": 0},
        {"uid": "p8", "c": "ENG-BOOST-PREM", "parent": "p7", "mount": "below", "stage": 1, "group": 0}
    ],
    "looseParts": []
}

sim_clock = 1000.0
def mock_time():
    return sim_clock

flight_session.time.time = mock_time
flight_command.time.time = mock_time
objectives = flight_session.objectives
if hasattr(objectives, 'time'):
    objectives.time.time = mock_time

res = service.start_flight({'blueprint': blueprint, 'missionId': 'earth_observation_1', 'bodyId': 'earth', 'start': {'type': 'pad'}})
sid = res['sessionId']
session = flight_session.lookup(sid)

# Start flight
flight_command._set_throttle(session, 1.0)
session['lastTime'] = sim_clock
session.advance()

dt = 0.2
staged = False
jettisoned_fairing = False
deployed_payload = False

for step in range(3000):
    sim_clock += dt
    r = math.hypot(session['x'], session['y'])
    alt = r - 6371000.0
    spd = math.hypot(session['vx'], session['vy'])
    
    # Gravity turn pitch profile
    if alt > 2000 and alt < 140000:
        target_pitch = min(math.pi / 2, (alt - 2000) / 80000.0 * (math.pi / 2))
        session['rotation'] = target_pitch
    elif alt >= 140000:
        session['rotation'] = math.pi / 2
        
    if alt > 70000 and not jettisoned_fairing:
        flight_command._jettison_fairing(session)
        jettisoned_fairing = True
        print(f"t={session['missionTime']:.1f}s: Jettisoned fairing at alt={alt/1000:.1f}km")

    if session['fuel'] <= 0.01 and not staged and staging.has_next_stage(session):
        print(f"t={session['missionTime']:.1f}s: Stage 1 burnout! Alt={alt/1000:.1f}km, Spd={spd:.1f}m/s. Staging!")
        staging.activate_next_stage(session, session['definitions'])
        flight_command._set_throttle(session, 1.0)
        staged = True
        
    snap = flight_session.snapshot(session)
    orb = snap.get('orbit') or {}
    apo = (orb.get('ra', 0) - 6371000.0) if orb.get('bound') else alt
    peri = (orb.get('rp', 0) - 6371000.0) if orb.get('bound') else -1
    
    # Cut throttle when target apoapsis (220 km) is reached
    if apo >= 220000 and peri < 160000 and alt < 210000:
        flight_command._set_throttle(session, 0.0)
        
    # Circularize when near apoapsis
    if apo >= 180000 and alt >= 180000 and peri < 165000:
        session['rotation'] = math.pi / 2 # horizontal
        flight_command._set_throttle(session, 1.0)
        
    # Check orbit achieved
    if orb.get('bound') and peri >= 165000 and apo <= 340000:
        flight_command._set_throttle(session, 0.0)
        if not deployed_payload:
            print(f"t={session['missionTime']:.1f}s: Orbit achieved! Apo={apo/1000:.1f}km, Peri={peri/1000:.1f}km! Deploying payload!")
            res_deploy = flight_command._deploy_payload(session, None)
            deployed_payload = True
            snap = flight_session.snapshot(session)
            print("Deploy result:", res_deploy)
            print("Objectives:", [(o['id'], o['met'], o['progress']) for o in snap.get('objectives', [])])
            print("Outcome:", snap.get('outcome'))
            break
            
    if session['status'] in ('crashed', 'landed') and session['missionTime'] > 5:
        print(f"t={session['missionTime']:.1f}s: Crashed! Alt={alt/1000:.1f}km, Spd={spd:.1f}m/s")
        break

print(f"Final missionTime: {session['missionTime']:.1f}s")
snap = flight_session.snapshot(session)
print("Final objectives:", [(o['id'], o['met'], o['progress']) for o in snap.get('objectives', [])])
print("Final outcome:", snap.get('outcome'))
