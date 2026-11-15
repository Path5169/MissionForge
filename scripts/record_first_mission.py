"""
MissionForge - Screen Recording & Demonstration Launcher
--------------------------------------------------------
This script starts the local MissionForge backend and opens your web browser
configured in Demonstration / Autoplay mode for Mission 01 (TerraWatch-1).

Usage:
    python scripts/record_first_mission.py
"""

import sys
import time
import webbrowser
import subprocess
from pathlib import Path
from urllib.request import urlopen

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PORT = 8000
SERVER_URL = f"http://127.0.0.1:{PORT}"
RECORD_URL = f"{SERVER_URL}/?autoplay=1"

def is_server_running():
    try:
        with urlopen(f"{SERVER_URL}/api/health", timeout=1.5) as res:
            return res.status == 200
    except Exception:
        return False

def main():
    print("=" * 65)
    print(" 🚀 MissionForge: Screen Recording / Demo Assistant")
    print("=" * 65)
    print("Preparing flight demonstration environment for Mission 01...\n")

    server_process = None
    if not is_server_running():
        print("Starting MissionForge local server...")
        server_process = subprocess.Popen(
            [sys.executable, "frontend_server.py", "--no-browser"],
            cwd=str(PROJECT_ROOT)
        )
        for _ in range(10):
            time.sleep(0.5)
            if is_server_running():
                print("✓ MissionForge backend server is online!")
                break
        else:
            print("❌ Server failed to start in time. Check frontend_server.py.")
            sys.exit(1)
    else:
        print("✓ MissionForge backend server is already running.")

    print(f"\nOpening browser in autonomous demonstration mode:")
    print(f"👉 {RECORD_URL}\n")
    print("-" * 65)
    print("🎥 SCREEN RECORDING TIPS:")
    print(" • The flight sequencer will automatically ignite, liftoff, pitch,")
    print("   jettison the fairing, separate stages, circularize, and deploy!")
    print(" • Press [ . ] (period) to accelerate time warp (1x -> 2x -> 4x).")
    print(" • Press [ Shift + C ] at any point for INSTANT Mission Completion.")
    print(" • Press [ Shift + A ] (or U) to toggle Autonomous Guidance.")
    print(" • No debug/cheat text appears in the UI (HUD displays clean 'SAS AUTO').")
    print("-" * 65)

    webbrowser.open(RECORD_URL)

    if server_process:
        try:
            print("\nPress Ctrl+C to terminate server when recording is finished.")
            server_process.wait()
        except KeyboardInterrupt:
            print("\nStopping server...")
            server_process.terminate()

if __name__ == "__main__":
    main()
