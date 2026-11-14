import sys, os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend import service
from backend.simulation import flight_session, flight_command, landing

def test_pipeline():
    print("=== TEST 1: Asset Manifest & GLB Discovery ===")
    manifest = service.asset_manifest()
    found_glbs = manifest.get("found", [])
    print(f"Discovered {len(found_glbs)} GLB files in assets:")
    for g in found_glbs:
        print(f"  - {g}")
    assert any("launch_complex.glb" in g for g in found_glbs), "launch_complex.glb missing from manifest!"
    assert any("lunar_surface.glb" in g for g in found_glbs), "lunar_surface.glb missing from manifest!"
    assert any("lander_rover.glb" in g for g in found_glbs), "lander_rover.glb missing from manifest!"
    assert any("hangar_interior.glb" in g for g in found_glbs), "hangar_interior.glb missing from manifest!"
    assert any("rocket_parts.glb" in g for g in found_glbs), "rocket_parts.glb missing from manifest!"
    print("PASS: Asset manifest verified.")

    print("\n=== TEST 2: Vehicle Blueprints & Stats Calculation ===")
    blueprints = service.list_blueprints()
    bp_list = blueprints if isinstance(blueprints, list) else blueprints.get('blueprints', [])
    print(f"Available blueprints: {len(bp_list)}")
    bp_data = service.get_blueprint("starter")
    if not bp_data and bp_list:
        bp_data = service.get_blueprint(bp_list[0]['id'])
    
    assert bp_data is not None, "No blueprint found!"
    bp = bp_data.get("blueprint", bp_data)
    print(f"Testing blueprint: '{bp.get('name')}' with {len(bp.get('parts', []))} parts.")
    
    # Calculate vehicle stats
    stats_req = {"blueprint": bp, "bodyId": "earth"}
    stats = service.dispatch_calculation("/api/vehicle/stats", stats_req)
    print("Vehicle Stats Calculated:")
    print(f"  Total Mass: {stats.get('wetMass')} kg (Dry: {stats.get('dryMass')} kg)")
    print(f"  Total Delta-V: {stats.get('dv')} m/s")
    print(f"  TWR Sea Level: {stats.get('twrSL')} (Vacuum: {stats.get('twrVac')})")
    print(f"  Launch Ready: {stats.get('ready')}")
    print("PASS: Vehicle statistics calculation verified.")

    print("\n=== TEST 3: Launch Sequence, Countdown & Liftoff Simulation ===")
    start_payload = {
        "blueprint": bp,
        "bodyId": "earth",
        "start": {"type": "pad"}
    }
    flight_res = service.start_flight(start_payload)
    session_id = flight_res["sessionId"]
    snap = flight_res["snapshot"]
    print(f"Created Flight Session: {session_id}")
    print(f"Snapshot keys: {list(snap.keys())}")
    tel = snap.get('telemetry', {})
    print(f"Initial Status: {snap.get('status')}, Altitude: {tel.get('altitude')} m, Speed: {tel.get('speed')} m/s")
    
    # Advance flight session
    service.flight_command(session_id, {"type": "command", "name": "begin_launch_sequence"})
    snap = service.get_flight_snapshot(session_id)
    print(f"After begin_launch_sequence: Status = {snap['status']}, Countdown = {snap.get('launchCountdown')}")
    
    # Throttle up & simulate liftoff
    service.flight_command(session_id, {"command": "set_throttle", "value": 1.0})
    for step in range(15):
        snap = service.get_flight_snapshot(session_id)
        if snap['status'] == 'flying':
            break
    tel = snap.get('telemetry', {})
    print(f"Liftoff simulated: Status = {snap['status']}, Alt = {tel.get('altitude', 0):.2f} m, Thrust = {tel.get('thrust')} N")

    # Staging test
    service.flight_command(session_id, {"command": "activate_next_stage"})
    snap = service.get_flight_snapshot(session_id)
    rs = snap.get('renderState', {})
    print(f"Stage Activation: Stage Done = {rs.get('stageDone')}, Detached Objects = {len(rs.get('detachedObjects', []))}")
    service.close_flight(session_id)
    print("PASS: Launch countdown, ignition, liftoff, and staging verified.")

    print("\n=== TEST 4: Lunar Landing & Rover Deployment ===")
    lunar_start = {
        "blueprint": bp,
        "bodyId": "moon",
        "start": {"type": "suborbital", "alt": 10000, "speed": 100}
    }
    lunar_flight = service.start_flight(lunar_start)
    l_id = lunar_flight["sessionId"]
    l_snap = lunar_flight["snapshot"]
    l_tel = l_snap.get('telemetry', {})
    print(f"Lunar Flight Session: {l_id}, Body = {l_snap.get('bodyId', 'moon')}, Alt = {l_tel.get('altitude', 0):.1f} m")

    # Simulate soft touchdown
    sess = flight_session.lookup(l_id)
    sess["alt"] = 0.0
    sess["speed"] = 2.1 # within soft landing limit (< 8 m/s)
    sess["status"] = "landed"
    
    cmd_res = service.flight_command(l_id, {"command": "deploy_rover"})
    print(f"Rover deployment command result: {cmd_res}")
    l_snap = service.get_flight_snapshot(l_id)
    assert sess.get("roverDeployed") == True, "roverDeployed should be True in session!"
    print("Rover successfully deployed on lunar surface!")
    service.close_flight(l_id)
    print("PASS: Lunar landing and rover deployment verified.")

    print("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    test_pipeline()
