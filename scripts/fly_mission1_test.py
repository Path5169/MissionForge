import sys, math, json
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

res = service.start_flight({'blueprint': blueprint, 'missionId': 'earth_observation_1', 'bodyId': 'earth', 'start': {'type': 'pad'}})
sid = res['sessionId']
session = flight_session.lookup(sid)

flight_command._set_throttle(session, 1.0)
session.advance()

print("Initial status:", session['status'], "mass:", session['mass'], "fuel:", session['fuel'])

dt = 0.2
staged = False
jettisoned_fairing = False
deployed_payload = False

for step in range(5000):
    t = step * dt
    session['missionTime'] = t
    session['lastTime'] = session['lastTime'] - dt
    
    r = math.hypot(session['x'], session['y'])
    alt = r - 6371000.0
    spd = math.hypot(session['vx'], session['vy'])
    
    # Gravity turn
    if alt > 1500 and alt < 120000:
        # turn smoothly from vertical to horizontal (90 deg)
        prog = min(1.0, (alt - 1500) / 75000.0)
        session['rotation'] = prog * (math.pi / 2)
    elif alt >= 120000:
        session['rotation'] = math.pi / 2
        
    # Jettison fairing above atmosphere
    if alt > 70000 and not jettisoned_fairing:
        flight_command.parse_command({"command": "jettison_fairing"})
        flight_command._jettison_fairing(session)
        jettisoned_fairing = True
        print(f"t={t:.1f}s: Jettisoned fairing at alt={alt/1000:.1f}km")

    # Stage when stage 1 fuel is empty
    if session['fuel'] <= 0.01 and not staged and staging.has_next_stage(session):
        print(f"t={t:.1f}s: Stage 1 burnout! Alt={alt/1000:.1f}km, Spd={spd:.1f}m/s. Staging!")
        staging.activate_next_stage(session, session['definitions'])
        flight_command._set_throttle(session, 1.0)
        staged = True
        
    # Check orbit circularization: once apoapsis >= 200 km, throttle control
    snap = flight_session.snapshot(session)
    orb = snap.get('orbit') or {}
    apo = (orb.get('ra', 0) - 6371000.0) if orb.get('bound') else alt
    peri = (orb.get('rp', 0) - 6371000.0) if orb.get('bound') else -1
    
    if orb.get('bound') and peri >= 165000 and apo <= 340000:
        # Orbit achieved! Cut throttle
        flight_command._set_throttle(session, 0.0)
        if not deployed_payload:
            print(f"t={t:.1f}s: Orbit achieved! Apo={apo/1000:.1f}km, Peri={peri/1000:.1f}km! Deploying payload!")
            flight_command._deploy_payload(session, None)
            deployed_payload = True
            snap = flight_session.snapshot(session)
            print("Objectives after deploy:", [(o['id'], o['met'], o['progress']) for o in snap.get('objectives', [])])
            print("Mission outcome:", snap.get('outcome'))
            break
            
    if session['status'] in ('crashed', 'landed') and t > 5:
        print(f"t={t:.1f}s: Crashed! Alt={alt/1000:.1f}km, Spd={spd:.1f}m/s")
        break

print("Finished simulation at t =", t)
snap = flight_session.snapshot(session)
print("Final objectives:", [(o['id'], o['met'], o['progress']) for o in snap.get('objectives', [])])
print("Final outcome:", snap.get('outcome'))
