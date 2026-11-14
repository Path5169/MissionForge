// basically just a constants file for the physics engine. --- IGNORE ---
export const G0 = 9.80665;               // standard gravity, m/s^2 (Isp conversion)
export const FIXED_DT = 1 / 60;          // fixed physics timestep, s
export const MAX_STEPS_PER_FRAME = 16;   // spiral-of-death guard
export const PHYSICS_WARPS = [1, 2, 4];  // full-fidelity warp (any situation)
export const WARP_LEVELS = [1, 2, 4, 10, 50, 100, 1000, 10000, 100000]; // >4 = on-rails (Kepler) only
export const MAX_RATE = 0.9;             // max commanded rotation rate, rad/s
export const ATT_ALPHA0 = 2.0;           // reference angular acceleration, rad/s^2 (assist, see ARCHITECTURE.md)
export const ATT_I0 = 20000;             // reference moment of inertia for ATT_ALPHA0, kg m^2
export const SEPARATION_SPEED = 1.5;     // relative speed on stage separation, m/s
export const SAFE_LANDING_SPEED = 5;     // m/s without legs
export const SAFE_TILT = 0.6;            // rad
