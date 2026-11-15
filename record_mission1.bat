@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")
%PY% --version >nul 2>nul || (echo Python 3 is required. Install it from python.org ^(tick "Add python.exe to PATH"^) and retry. & pause & exit /b 1)
%PY% sync_part_sizes.py --apply
%PY% scripts\record_first_mission.py
pause
