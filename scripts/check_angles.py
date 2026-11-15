import sys, math, json
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
from backend import service
from backend.simulation import flight_session, flight_command, staging

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

dt = 0.5
staged = False

for step in range(1200):
    t = step * dt
    session['missionTime'] = t
    session['lastTime'] = session['lastTime'] - dt
    
    r = math.hypot(session['x'], session['y'])
    alt = r - 6371000.0
    spd = math.hypot(session['vx'], session['vy'])
    
    # Let's inspect pitch angle:
    # 0 is pointing vertically up from Earth surface at pad [0, R].
    # In MissionForge coordinate system: pad is at x=0, y=R.
    # What angle corresponds to vertical up at pad?
    # Let's check session['rotation'] and thrust vector!
    if step == 0:
        print("At step 0: pad=(x=0, y=R). rotation=", session['rotation'], "thrust vector direction in rk4_step:")
    
    flight_session.advance_session(session)
    
    if step % 40 == 0:
        snap = flight_session.snapshot(session)
        orb = snap.get('orbit') or {}
        apo = (orb.get('ra', 0) - 6371000.0) if orb.get('bound') else alt
        peri = (orb.get('rp', 0) - 6371000.0) if orb.get('bound') else -1
        print(f"t={t:5.1f}s: alt={alt/1000:6.1f}km, spd={spd:6.1f}m/s, fuel={session['fuel']:6.1f}, th={session['rotation']:.2f}, apo={apo/1000:6.1f}km, peri={peri/1000:6.1f}km, status={session['status']}")
        
    if session['fuel'] <= 0.01 and not staged and staging.has_next_stage(session):
        print(f"--- Staging at t={t:.1f}s ---")
        staging.activate_next_stage(session, session['definitions'])
        flight_command._set_throttle(session, 1.0)
        staged = True
        
    if session['status'] in ('crashed', 'landed') and t > 5:
        print("Crash at t =", t)
        break
