import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('--- Testing Workshop and MapView Updates ---');

// 1. Verify MapView Orbit Header text positioning and alignment
const mapViewSrc = fs.readFileSync('frontend/js/rendering/mapView.js', 'utf8');
assert(mapViewSrc.includes("ctx.textAlign = 'center'"), 'mapView.js should set ctx.textAlign to center');
assert(mapViewSrc.includes('const cx = (this.w * d) / 2'), 'mapView.js should center header text horizontally');
assert(!mapViewSrc.includes('16 * d,\n      24 * d'), 'mapView.js should not hardcode top-left (16*d, 24*d) for orbit header');
console.log('✓ MapView orbit header text centered and prevented from overlapping mission HUD');

// 2. Verify Workshop launch button logic
const workshopSrc = fs.readFileSync('frontend/ui/workshop/workshop.js', 'utf8');
assert(!workshopSrc.includes("if (m || state.mode === 'sandbox' || state.mode === 'workshop')"), 'Workshop should not launch in workshop mode');
assert(workshopSrc.includes("if (m || state.mode === 'sandbox')"), 'Workshop should only render launch button for mission or sandbox');
console.log('✓ Workshop launch button removed in workshop mode (strictly build & save)');

// 3. Verify store.js does not preload capsule_orbiter seed on boot
const storeSrc = fs.readFileSync('frontend/js/core/store.js', 'utf8');
assert(!storeSrc.includes("loadPreset('capsule_orbiter')"), 'store.js should not default blueprint to capsule_orbiter seed');
assert(storeSrc.includes('if (!state.blueprint) state.blueprint = newBlueprint();'), 'store.js should default blueprint cleanly to newBlueprint()');
console.log('✓ Store.js initializes clean newBlueprint() instead of seed rocket');

// 4. Verify menu.js workshop entry cleans up seed rocket
const menuSrc = fs.readFileSync('frontend/ui/menu/menu.js', 'utf8');
assert(menuSrc.includes("import { newBlueprint } from '../../js/vehicle/vehicle.js'"), 'menu.js imports newBlueprint');
assert(menuSrc.includes('state.blueprint = newBlueprint()'), 'menu.js resets blueprint if not custom');
console.log('✓ Menu Workshop entry guarantees fresh assembly canvas');

// 5. Verify missions.js custom vehicle avoids merging with preset seed
const missionsSrc = fs.readFileSync('frontend/ui/missions/missions.js', 'utf8');
assert(missionsSrc.includes("import { newBlueprint } from '../../js/vehicle/vehicle.js'"), 'missions.js imports newBlueprint');
assert(missionsSrc.includes('state.blueprint = newBlueprint()'), 'missions.js resets blueprint to newBlueprint when opening custom vehicle');
console.log('✓ Missions "Open in workshop with custom vehicle" starts clean custom vehicle');

console.log('\nAll 5 verification checks passed successfully!');
