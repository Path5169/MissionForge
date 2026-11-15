import sys, math
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
from backend import service
from backend.simulation import flight_session, flight_command, staging

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
        {'uid': 'p4', 'c': 'WIDE-TANK-3', 'parent': 'p3', 'mount': 'below', 'stage': 0, 'group': 0},
        {'uid': 'p5', 'c': 'BAS-ENG-2', 'parent': 'p4', 'mount': 'below', 'stage': 2, 'group': 0},
        {'uid': 'p6', 'c': 'BAS-DECOUPLER', 'parent': 'p5', 'mount': 'below', 'stage': 2, 'group': 0},
        {'uid': 'p7', 'c': 'WIDE-TANK-5', 'parent': 'p6', 'mount': 'below', 'stage': 0, 'group': 0},
        {'uid': 'p8', 'c': 'ENG-BOOST-PREM', 'parent': 'p7', 'mount': 'below', 'stage': 1, 'group': 0}
    ],
    'looseParts': []
}

sim_clock = 1000.0
flight_session.time.time = lambda: sim_clock
flight_command.time.time = lambda: sim_clock

res = service.start_flight({'blueprint': blueprint, 'missionId': 'earth_observation_1', 'bodyId': 'earth', 'start': {'type': 'pad'}})
session = flight_session.lookup(res['sessionId'])
flight_command._set_throttle(session, 1.0)
session['lastTime'] = sim_clock
session.advance()

dt = 0.2
staged = False
deployed = False

for step in range(2500):
    sim_clock += dt
    r = math.hypot(session['x'], session['y'])
    alt = r - 6371000.0
    spd = math.hypot(session['vx'], session['vy'])
    
    # Climb vertically to 2km, then pitch to 45 deg by 15km, then follow prograde
    if alt < 2000:
        session['rotation'] = 0.0
    elif alt < 18000:
        session['rotation'] = (alt - 2000) / 16000.0 * math.radians(45)
    else:
        # Follow local horizontal tangent: atan2(x, y) + pi/2!
        phi = math.atan2(session['x'], session['y'])
        session['rotation'] = phi + math.pi / 2
        
    if session['fuel'] <= 0.01 and not staged and staging.has_next_stage(session):
        print(f"--- Staging at t={session['missionTime']:.1f}s ---")
        staging.activate_next_stage(session, session['definitions'])
        flight_command._set_throttle(session, 1.0)
        staged = True
        
    flight_session.advance_session(session)
    t = session['missionTime']
    
    snap = flight_session.snapshot(session)
    orb = snap.get('orbit') or {}
    apo = (orb.get('ra', 0) - 6371000.0) if orb.get('bound') else alt
    peri = (orb.get('rp', 0) - 6371000.0) if orb.get('bound') else -1
    
    if orb.get('bound') and peri >= 160000 and apo <= 350000:
        flight_command._set_throttle(session, 0.0)
        if not deployed:
            print(f">>> LEO ORBIT ACHIEVED at t={t:.1f}s! Peri={peri/1000:.1f}km, Apo={apo/1000:.1f}km! Deploying payload! <<<")
            dep_res = flight_command._deploy_payload(session, None)
            deployed = True
            snap = flight_session.snapshot(session)
            print("Objectives:", [(o['id'], o['met']) for o in snap.get('objectives', [])])
            print("Outcome:", snap.get('outcome'))
            break

print(f"End t={session['missionTime']:.1f}s, alt={alt/1000:.1f}km, spd={spd:.1f}m/s, peri={peri/1000:.1f}km, apo={apo/1000:.1f}km")
snap = flight_session.snapshot(session)
print("Final objectives:", [(o['id'], o['met']) for o in snap.get('objectives', [])])
print("Final outcome:", snap.get('outcome'))
