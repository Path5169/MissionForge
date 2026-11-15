import sys, math, json
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))

from backend import service
from backend.simulation import flight_session, flight_command, staging

with open('frontend/data/vehicles/presets.json', 'r', encoding='utf-8') as f:
    presets = json.load(f)['presets']
preset = next(p for p in presets if p['id'] == 'eos_terrawatch_launcher')

res = service.start_flight({'blueprint': preset, 'missionId': 'earth_observation_1', 'bodyId': 'earth', 'start': {'type': 'pad'}})
sid = res['sessionId']
session = flight_session.lookup(sid)

# Start launch
flight_command._set_throttle(session, 1.0)
session.advance()

print("Initial status:", session['status'], "mass:", session['mass'], "fuel:", session['fuel'])

# Simulate 200 seconds
dt = 0.1
max_alt = 0.0
max_spd = 0.0

for step in range(2000):
    t = step * dt
    session['missionTime'] = t
    session['lastTime'] = session['lastTime'] - dt # trick advance to advance dt
    
    # Gravity turn pitch profile
    alt = math.hypot(session['x'], session['y']) - 6371000.0
    spd = math.hypot(session['vx'], session['vy'])
    max_alt = max(max_alt, alt)
    max_spd = max(max_spd, spd)
    
    if alt > 1000:
        # pitch towards 90 deg (pi/2)
        target_pitch = min(math.pi / 2, (alt - 1000) / 70000.0 * (math.pi / 2))
        session['rotation'] = target_pitch
        
    # Check staging
    if session['fuel'] <= 0.001 and staging.has_next_stage(session):
        print(f"t={t:.1f}s: Staging to stage 2! Alt={alt/1000:.1f}km, Spd={spd:.1f}m/s")
        staging.activate_next_stage(session, session['definitions'])
        flight_command._set_throttle(session, 1.0)
        
    flight_session.advance_session(session)
    
    if session['status'] in ('crashed', 'landed') and t > 5:
        print(f"t={t:.1f}s: Craft hit ground / crashed! Alt={alt/1000:.1f}km, Spd={spd:.1f}m/s")
        break
        
print(f"Final max altitude: {max_alt/1000:.1f} km, max speed: {max_spd:.1f} m/s")
snap = flight_session.snapshot(session)
print("Orbit:", snap.get('orbit'))
print("Objectives:", [(o['id'], o['met']) for o in snap.get('objectives', [])])
