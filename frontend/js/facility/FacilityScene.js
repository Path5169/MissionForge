import * as THREE from 'three';
import { assets } from '../rendering/assets.js';

/**
 * FacilityScene: Constructs the compact, connected NASA-inspired Aerospace Facility.
 * Comprises:
 * 1. Engineering Hangar (Vehicle Assembly Bay with high ceilings, crane, gantry catwalk, terminals)
 * 2. Mission Control Center (Flight controller consoles, multi-screen telemetry display wall)
 * 3. Launch Pad Complex (Outdoor platform, launch tower, flame trench, cryogenic tanks, access road)
 * 4. Research Laboratory (Cleanroom benches, optical tables, sample return vault, spectrometers)
 */
export class FacilityScene {
  constructor(scene, collisionManager, interactionManager) {
    this.scene = scene;
    this.collision = collisionManager;
    this.interaction = interactionManager;

    this.group = new THREE.Group();
    this.group.name = 'AerospaceFacility';
    this.scene.add(this.group);

    this.doorsOpen = false;
    this.doorMeshes = [];

    this._createMaterials();
    this._buildOutdoorEnvironment();
    this._buildHangar();
    this._buildMissionControl();
    this._buildResearchLab();
    this._buildLaunchPadComplex();
  }

  _createMaterials() {
    // Industrial Materials Palette (NASA aesthetic: concrete, steel, blue-grey, safety yellow, white)
    this.mats = {
      // Concrete
      concreteFloor: new THREE.MeshStandardMaterial({
        color: 0x58606c,
        roughness: 0.65,
        metalness: 0.12,
      }),
      concretePad: new THREE.MeshStandardMaterial({
        color: 0x484f5a,
        roughness: 0.8,
        metalness: 0.08,
      }),
      asphalt: new THREE.MeshStandardMaterial({
        color: 0x242830,
        roughness: 0.88,
        metalness: 0.05,
      }),
      cleanroomFloor: new THREE.MeshStandardMaterial({
        color: 0xd8dde5,
        roughness: 0.35,
        metalness: 0.18,
      }),
      missionControlCarpet: new THREE.MeshStandardMaterial({
        color: 0x1e2430,
        roughness: 0.9,
        metalness: 0.02,
      }),

      // Walls
      hangarWall: new THREE.MeshStandardMaterial({
        color: 0x6e7684,
        roughness: 0.7,
        metalness: 0.22,
      }),
      interiorWall: new THREE.MeshStandardMaterial({
        color: 0x2b323e,
        roughness: 0.75,
        metalness: 0.15,
      }),
      cleanroomWall: new THREE.MeshStandardMaterial({
        color: 0xecf0f6,
        roughness: 0.4,
        metalness: 0.1,
      }),

      // Structural Steel
      steelDark: new THREE.MeshStandardMaterial({
        color: 0x252a32,
        roughness: 0.45,
        metalness: 0.75,
      }),
      steelGrey: new THREE.MeshStandardMaterial({
        color: 0x7c8594,
        roughness: 0.4,
        metalness: 0.8,
      }),
      steelYellow: new THREE.MeshStandardMaterial({
        color: 0xf5a623,
        roughness: 0.4,
        metalness: 0.3,
      }),
      steelRed: new THREE.MeshStandardMaterial({
        color: 0xc9362e,
        roughness: 0.45,
        metalness: 0.55,
      }),
      hazardStripe: new THREE.MeshStandardMaterial({
        color: 0xffb726,
        roughness: 0.5,
        metalness: 0.2,
      }),

      // Equipment & Consoles
      consoleBody: new THREE.MeshStandardMaterial({
        color: 0x1b2028,
        roughness: 0.55,
        metalness: 0.6,
      }),
      screenGlow: new THREE.MeshStandardMaterial({
        color: 0x52d6ea,
        emissive: 0x228b9c,
        emissiveIntensity: 0.85,
        roughness: 0.25,
      }),
      screenMap: new THREE.MeshStandardMaterial({
        color: 0x142b44,
        emissive: 0x0c3258,
        emissiveIntensity: 0.95,
        roughness: 0.2,
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x88c0d0,
        transparent: true,
        opacity: 0.35,
        roughness: 0.1,
        metalness: 0.1,
        transmission: 0.85,
        ior: 1.5,
      }),
    };
  }

  // =========================================================================
  // OUTDOOR ENVIRONMENT & LIGHTING
  // =========================================================================
  _buildOutdoorEnvironment() {
    // 1. Ambient Lighting
    const hemiLight = new THREE.HemisphereLight(0xcde1f8, 0x333b47, 0.75);
    this.group.add(hemiLight);

    // 2. Sunlight (Directional Light with Crisp Shadows)
    const sunLight = new THREE.DirectionalLight(0xfff6e6, 1.4);
    sunLight.position.set(45, 65, 35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -75;
    sunLight.shadow.camera.right = 75;
    sunLight.shadow.camera.top = 75;
    sunLight.shadow.camera.bottom = -75;
    sunLight.shadow.bias = -0.0004;
    this.group.add(sunLight);

    // 3. Ground Terrain Plane (Outdoor tarmac, grass, and access apron)
    const terrainGeom = new THREE.PlaneGeometry(240, 240);
    terrainGeom.rotateX(-Math.PI / 2);
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x2f362e, // coastal cape scrub/grass
      roughness: 0.92,
      metalness: 0.05,
    });
    const terrain = new THREE.Mesh(terrainGeom, terrainMat);
    terrain.position.y = -0.05;
    terrain.receiveShadow = true;
    this.group.add(terrain);

    // Register base ground floor
    this.collision.addFloor(0, 0, 240, 240, 0, { tag: 'ground' });

    // 4. Perimeter Fence around the complex
    this._buildPerimeterFence();
  }

  _buildPerimeterFence() {
    const fenceMat = new THREE.MeshStandardMaterial({
      color: 0x6e7885,
      wireframe: true,
      roughness: 0.6,
      metalness: 0.8,
    });
    // North, South, East, West fence segments
    const makeFence = (x, z, w, d) => {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(w, 2.8, d), fenceMat);
      fence.position.set(x, 1.4, z);
      this.group.add(fence);
      this.collision.addBox(x, 1.4, z, w, 2.8, d, 'fence');
    };

    makeFence(0, 110, 150, 0.2); // North edge
    makeFence(-75, 45, 0.2, 130); // West edge
    makeFence(75, 45, 0.2, 130);  // East edge
    makeFence(0, -38, 150, 0.2); // South edge
  }

  // =========================================================================
  // A. ENGINEERING HANGAR (VEHICLE ASSEMBLY BAY)
  // =========================================================================
  _buildHangar() {
    const hangar = new THREE.Group();
    hangar.name = 'EngineeringHangar';
    this.group.add(hangar);

    const W = 38; // Width
    const D = 46; // Depth
    const H = 26; // Height (High-Bay for vertical rockets)
    const cx = 0;
    const cz = -7;

    // 1. Concrete Floor with Staging Bay Pit Markings
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), this.mats.concreteFloor);
    floor.position.set(cx, -0.2, cz);
    floor.receiveShadow = true;
    hangar.add(floor);
    this.collision.addFloor(cx, cz, W, D, 0, { tag: 'hangar_floor' });

    // Staging Bay Hazard Border Decals (yellow/black safety rectangle)
    const hazardBorder = new THREE.Mesh(
      new THREE.RingGeometry(5.2, 5.8, 4),
      this.mats.hazardStripe
    );
    hazardBorder.rotation.x = -Math.PI / 2;
    hazardBorder.rotation.z = Math.PI / 4;
    hazardBorder.position.set(0, 0.02, -6);
    hangar.add(hazardBorder);

    // Staging Pad Base Plinth
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.4, 0.35, 32),
      this.mats.steelDark
    );
    plinth.position.set(0, 0.175, -6);
    plinth.receiveShadow = true;
    hangar.add(plinth);

    // 2. High-Bay Walls
    // South Wall (Back)
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.6), this.mats.hangarWall);
    southWall.position.set(cx, H / 2, cz - D / 2);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    hangar.add(southWall);
    this.collision.addBox(cx, H / 2, cz - D / 2, W, H, 0.6, 'wall');

    // North Wall with High-Bay Door Opening
    const doorW = 16;
    const doorH = 18;
    const sideW = (W - doorW) / 2;

    // Left wall piece
    const nWallL = new THREE.Mesh(new THREE.BoxGeometry(sideW, H, 0.6), this.mats.hangarWall);
    nWallL.position.set(cx - doorW / 2 - sideW / 2, H / 2, cz + D / 2);
    nWallL.castShadow = true;
    hangar.add(nWallL);
    this.collision.addBox(cx - doorW / 2 - sideW / 2, H / 2, cz + D / 2, sideW, H, 0.6, 'wall');

    // Right wall piece
    const nWallR = new THREE.Mesh(new THREE.BoxGeometry(sideW, H, 0.6), this.mats.hangarWall);
    nWallR.position.set(cx + doorW / 2 + sideW / 2, H / 2, cz + D / 2);
    nWallR.castShadow = true;
    hangar.add(nWallR);
    this.collision.addBox(cx + doorW / 2 + sideW / 2, H / 2, cz + D / 2, sideW, H, 0.6, 'wall');

    // Lintel above door
    const lintelH = H - doorH;
    const nWallTop = new THREE.Mesh(new THREE.BoxGeometry(doorW, lintelH, 0.6), this.mats.hangarWall);
    nWallTop.position.set(cx, doorH + lintelH / 2, cz + D / 2);
    hangar.add(nWallTop);
    this.collision.addBox(cx, doorH + lintelH / 2, cz + D / 2, doorW, lintelH, 0.6, 'wall');

    // Roll-Up Hangar Doors (Interactive)
    const doorLeafL = new THREE.Mesh(new THREE.BoxGeometry(doorW / 2, doorH, 0.3), this.mats.steelDark);
    doorLeafL.position.set(cx - doorW / 4, doorH / 2, cz + D / 2);
    const doorLeafR = new THREE.Mesh(new THREE.BoxGeometry(doorW / 2, doorH, 0.3), this.mats.steelDark);
    doorLeafR.position.set(cx + doorW / 4, doorH / 2, cz + D / 2);
    hangar.add(doorLeafL, doorLeafR);
    this.doorMeshes.push(doorLeafL, doorLeafR);

    // Initial state: Slightly open (raised 6m) for smooth seamless outdoor egress
    doorLeafL.position.y += 6.5;
    doorLeafR.position.y += 6.5;

    // West Wall (Shared with Research Lab, with doorway at z = -6)
    const wWallSolid1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, 18), this.mats.hangarWall);
    wWallSolid1.position.set(cx - W / 2, H / 2, cz - 14);
    hangar.add(wWallSolid1);
    this.collision.addBox(cx - W / 2, H / 2, cz - 14, 0.6, H, 18, 'wall');

    const wWallSolid2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, 20), this.mats.hangarWall);
    wWallSolid2.position.set(cx - W / 2, H / 2, cz + 13);
    hangar.add(wWallSolid2);
    this.collision.addBox(cx - W / 2, H / 2, cz + 13, 0.6, H, 20, 'wall');

    // Lintel above Lab Door
    const labDoorLintel = new THREE.Mesh(new THREE.BoxGeometry(0.6, H - 4, 8), this.mats.hangarWall);
    labDoorLintel.position.set(cx - W / 2, 4 + (H - 4) / 2, cz - 1);
    hangar.add(labDoorLintel);
    this.collision.addBox(cx - W / 2, 4 + (H - 4) / 2, cz - 1, 0.6, H - 4, 8, 'wall');

    // East Wall (Shared with Mission Control, with doorway at z = -2)
    const eWallSolid1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, 20), this.mats.hangarWall);
    eWallSolid1.position.set(cx + W / 2, H / 2, cz - 13);
    hangar.add(eWallSolid1);
    this.collision.addBox(cx + W / 2, H / 2, cz - 13, 0.6, H, 20, 'wall');

    const eWallSolid2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, 18), this.mats.hangarWall);
    eWallSolid2.position.set(cx + W / 2, H / 2, cz + 14);
    hangar.add(eWallSolid2);
    this.collision.addBox(cx + W / 2, H / 2, cz + 14, 0.6, H, 18, 'wall');

    const mcDoorLintel = new THREE.Mesh(new THREE.BoxGeometry(0.6, H - 4, 8), this.mats.hangarWall);
    mcDoorLintel.position.set(cx + W / 2, 4 + (H - 4) / 2, cz);
    hangar.add(mcDoorLintel);
    this.collision.addBox(cx + W / 2, 4 + (H - 4) / 2, cz, 0.6, H - 4, 8, 'wall');

    // 3. Structural Steel Roof Trusses & Crane
    for (let tz = cz - D / 2 + 5; tz < cz + D / 2; tz += 9) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(W, 1.2, 0.4), this.mats.steelYellow);
      truss.position.set(cx, H - 0.8, tz);
      hangar.add(truss);

      // Support columns along walls
      const colL = new THREE.Mesh(new THREE.BoxGeometry(0.8, H, 0.8), this.mats.steelDark);
      colL.position.set(cx - W / 2 + 0.4, H / 2, tz);
      const colR = new THREE.Mesh(new THREE.BoxGeometry(0.8, H, 0.8), this.mats.steelDark);
      colR.position.set(cx + W / 2 - 0.4, H / 2, tz);
      hangar.add(colL, colR);
      this.collision.addBox(cx - W / 2 + 0.4, H / 2, tz, 0.8, H, 0.8, 'column');
      this.collision.addBox(cx + W / 2 - 0.4, H / 2, tz, 0.8, H, 0.8, 'column');
    }

    // Overhead 50-Ton Crane Bridge
    const craneBridge = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 1.8, 2.4), this.mats.steelYellow);
    craneBridge.position.set(cx, H - 2.8, cz - 4);
    craneBridge.castShadow = true;
    hangar.add(craneBridge);

    // Crane Trolley and Hoist Cable
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 2.8), this.mats.steelDark);
    trolley.position.set(cx, H - 3.4, cz - 4);
    hangar.add(trolley);

    const hoistCable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 7), this.mats.steelGrey);
    hoistCable.position.set(cx, H - 7.5, cz - 4);
    hangar.add(hoistCable);

    // 4. Inspection Catwalk / Balcony (at elevation y = 4.5m)
    const catwalkElev = 4.5;
    const catwalkW = 3.5;
    const catwalkL = 34;

    // Catwalk Deck along West Wall
    const catwalkDeck = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkW, 0.25, catwalkL),
      this.mats.steelDark
    );
    catwalkDeck.position.set(cx - W / 2 + catwalkW / 2 + 0.5, catwalkElev, cz);
    catwalkDeck.receiveShadow = true;
    hangar.add(catwalkDeck);
    this.collision.addFloor(cx - W / 2 + catwalkW / 2 + 0.5, cz, catwalkW, catwalkL, catwalkElev, {
      tag: 'catwalk',
    });

    // Safety Railing on Catwalk
    const railGeom = new THREE.BoxGeometry(0.08, 1.1, catwalkL);
    const rail = new THREE.Mesh(railGeom, this.mats.steelYellow);
    rail.position.set(cx - W / 2 + catwalkW + 0.5, catwalkElev + 0.55, cz);
    hangar.add(rail);
    this.collision.addBox(cx - W / 2 + catwalkW + 0.5, catwalkElev + 0.55, cz, 0.2, 1.1, catwalkL, 'railing');

    // Access Staircase up to Catwalk
    this._buildStairs(cx - W / 2 + catwalkW / 2 + 0.5, cz - catwalkL / 2, catwalkElev, 'z', -1);

    // 5. Engineering Workstations & Terminals
    this._buildEngineeringWorkstation(cx + 8, cz - 12);
    this._buildComponentRacks(cx + 12, cz + 2);

    // High-Bay Industrial Lighting
    for (let lx = -10; lx <= 10; lx += 20) {
      for (let lz = cz - 12; lz <= cz + 12; lz += 12) {
        const light = new THREE.PointLight(0xf4f7fb, 1.2, 38, 1.4);
        light.position.set(lx, H - 4, lz);
        hangar.add(light);

        // Visual lamp fixture
        const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 0.4, 12), this.mats.steelDark);
        fixture.position.set(lx, H - 3.8, lz);
        hangar.add(fixture);
      }
    }
  }

  _buildStairs(x, zStart, targetY, axis = 'z', dir = 1) {
    const steps = 18;
    const stepL = 0.45;
    const stepW = 2.2;
    const stepH = targetY / steps;

    for (let i = 0; i < steps; i++) {
      const sy = i * stepH;
      const sz = zStart + i * stepL * dir;
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH + 0.05, stepL), this.mats.steelDark);
      stepMesh.position.set(x, sy + stepH / 2, sz);
      stepMesh.receiveShadow = true;
      this.group.add(stepMesh);
    }

    // Register ramp floor for smooth player stair climbing
    const rampLength = steps * stepL;
    this.collision.addFloor(x, zStart + (rampLength / 2) * dir, stepW, rampLength, targetY, {
      rampAxis: 'z',
      elevationStart: dir > 0 ? 0 : targetY,
      elevationEnd: dir > 0 ? targetY : 0,
      tag: 'stairs',
    });
  }

  _buildEngineeringWorkstation(x, z) {
    const desk = new THREE.Group();
    desk.position.set(x, 0, z);

    // Tabletop & Pedestals
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.6), this.mats.consoleBody);
    top.position.y = 0.85;
    top.castShadow = true;
    desk.add(top);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 1.4), this.mats.steelGrey);
    legL.position.set(-1.6, 0.425, 0);
    const legR = legL.clone();
    legR.position.x = 1.6;
    desk.add(legL, legR);

    // Dual Monitor Terminals
    for (let mx = -0.7; mx <= 0.7; mx += 1.4) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), this.mats.steelGrey);
      stand.position.set(mx, 1.1, -0.2);
      const screenBezel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.65, 0.06), this.mats.consoleBody);
      screenBezel.position.set(mx, 1.45, -0.2);
      screenBezel.rotation.x = -0.15;
      const screenDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.58), this.mats.screenGlow);
      screenDisplay.position.set(mx, 1.45, -0.16);
      screenDisplay.rotation.x = -0.15;
      desk.add(stand, screenBezel, screenDisplay);
    }

    // Keyboard & Control Panel
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.32), this.mats.steelDark);
    keyboard.position.set(0, 0.92, 0.2);
    desk.add(keyboard);

    // Operator Chair
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.65), this.mats.steelDark);
    chair.position.set(0, 0.5, 0.9);
    desk.add(chair);

    this.group.add(desk);
    this.collision.addBox(x, 0.8, z, 3.8, 1.6, 1.8, 'workstation');

    // Register Engineering Terminal Interaction
    this.interaction.register('hangar_terminal', {
      position: new THREE.Vector3(x, 1.0, z + 1.2),
      radius: 2.8,
      prompt: 'Access Engineering Terminal',
      keyPrompt: 'E',
      action: () => {
        window.MF_FACILITY?.openEngineeringModal();
      },
    });

    // Register Vehicle Inspection Zone
    this.interaction.register('vehicle_inspection', {
      position: new THREE.Vector3(0, 0.5, -1.8),
      radius: 4.5,
      prompt: 'Inspect Vehicle Hardware',
      keyPrompt: 'E',
      action: () => {
        window.MF_FACILITY?.openVehicleInspection();
      },
    });
  }

  _buildComponentRacks(x, z) {
    const rack = new THREE.Group();
    rack.position.set(x, 0, z);

    // Steel Framing
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.6, 5.5), this.mats.steelYellow);
    frame.position.y = 1.8;
    rack.add(frame);

    // Shelved Spare Parts (propellant tank mockup, engine bells)
    for (let sy = 0.8; sy <= 2.6; sy += 1.0) {
      const tankMock = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 16), this.mats.steelGrey);
      tankMock.rotation.z = Math.PI / 2;
      tankMock.position.set(0, sy, 0);
      rack.add(tankMock);
    }

    this.group.add(rack);
    this.collision.addBox(x, 1.8, z, 1.8, 3.6, 5.5, 'equipment_rack');
  }

  // =========================================================================
  // B. MISSION CONTROL CENTER
  // =========================================================================
  _buildMissionControl() {
    const mc = new THREE.Group();
    mc.name = 'MissionControl';
    this.group.add(mc);

    const W = 22;
    const D = 18;
    const H = 6.2;
    const cx = 30; // East of the Hangar
    const cz = -2;

    // Floor with tiered flight controller seating
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), this.mats.missionControlCarpet);
    floor.position.set(cx, -0.15, cz);
    floor.receiveShadow = true;
    mc.add(floor);
    this.collision.addFloor(cx, cz, W, D, 0, { tag: 'mc_floor' });

    // Outer Walls
    // East wall
    const eWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, D), this.mats.interiorWall);
    eWall.position.set(cx + W / 2, H / 2, cz);
    mc.add(eWall);
    this.collision.addBox(cx + W / 2, H / 2, cz, 0.6, H, D, 'wall');

    // North wall
    const nWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.6), this.mats.interiorWall);
    nWall.position.set(cx, H / 2, cz + D / 2);
    mc.add(nWall);
    this.collision.addBox(cx, H / 2, cz + D / 2, W, H, 0.6, 'wall');

    // South wall
    const sWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.6), this.mats.interiorWall);
    sWall.position.set(cx, H / 2, cz - D / 2);
    mc.add(sWall);
    this.collision.addBox(cx, H / 2, cz - D / 2, W, H, 0.6, 'wall');

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), this.mats.interiorWall);
    ceiling.position.set(cx, H, cz);
    mc.add(ceiling);

    // Front Telemetry Wall (Massive multi-screen display wall at the East end)
    const displayWallW = 14;
    const displayWallH = 4.2;
    const screenWall = new THREE.Mesh(
      new THREE.PlaneGeometry(displayWallW, displayWallH),
      this.mats.screenMap
    );
    screenWall.position.set(cx + W / 2 - 0.28, 3.2, cz);
    screenWall.rotation.y = -Math.PI / 2;
    mc.add(screenWall);

    // NASA Meatball & Status Banner above screens
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.9), this.mats.screenGlow);
    banner.position.set(cx + W / 2 - 0.28, 5.5, cz);
    banner.rotation.y = -Math.PI / 2;
    mc.add(banner);

    // Tiered Flight Controller Consoles (Flight Director, FIDO, CAPCOM, GUIDANCE)
    const makeConsoleRow = (offsetX, label) => {
      const row = new THREE.Group();
      row.position.set(offsetX, 0, cz);

      // Curved console desk
      const deskMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.05, 12), this.mats.consoleBody);
      deskMesh.position.y = 0.525;
      deskMesh.castShadow = true;
      row.add(deskMesh);

      // Bank of glowing monitors
      for (let mz = -5; mz <= 5; mz += 1.8) {
        const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), this.mats.screenGlow);
        mon.position.set(0.95, 1.15, mz);
        mon.rotation.y = Math.PI / 2;
        mon.rotation.x = -0.15;
        row.add(mon);
      }

      mc.add(row);
      this.collision.addBox(offsetX, 0.6, cz, 2.2, 1.2, 12.2, 'console_row');
    };

    makeConsoleRow(cx - 3, 'ROW_01');
    makeConsoleRow(cx + 3, 'ROW_02');

    // Flight Director Center Console (Interactive Station)
    const fidoX = cx - 5.5;
    const fidoZ = cz;
    this.interaction.register('mission_control_console', {
      position: new THREE.Vector3(fidoX, 1.0, fidoZ),
      radius: 3.2,
      prompt: 'Open Mission Control',
      keyPrompt: 'E',
      action: () => {
        window.MF_FACILITY?.openMissionControl();
      },
    });

    // Center Holographic Earth Globe Projector (Powered by earth.glb)
    const holoPedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.8, 0.45, 32),
      this.mats.steelDark
    );
    holoPedestal.position.set(cx, 0.225, cz);
    holoPedestal.castShadow = true;
    mc.add(holoPedestal);

    const holoRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.45, 32),
      this.mats.screenGlow
    );
    holoRing.rotation.x = -Math.PI / 2;
    holoRing.position.set(cx, 0.46, cz);
    mc.add(holoRing);

    // 3D Earth Hologram Group
    this.earthHolo = new THREE.Group();
    this.earthHolo.position.set(cx, 2.0, cz);
    mc.add(this.earthHolo);

    assets.loadPlanet('earth', { radius: 1.1 }).then(earthMesh => {
      if (earthMesh) {
        this.earthHolo.add(earthMesh);
      }
    }).catch(e => console.warn('Earth GLB load notice:', e));

    // Soft Interior Lighting
    const mcLight = new THREE.PointLight(0xa5c4e8, 1.5, 22, 1.2);
    mcLight.position.set(cx, H - 1.2, cz);
    mc.add(mcLight);
  }

  // =========================================================================
  // D. ADVANCED RESEARCH LABORATORY
  // =========================================================================
  _buildResearchLab() {
    const lab = new THREE.Group();
    lab.name = 'ResearchLaboratory';
    this.group.add(lab);

    const W = 18;
    const D = 18;
    const H = 5.8;
    const cx = -28; // West of the Hangar
    const cz = -7;

    // Cleanroom Epoxy Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), this.mats.cleanroomFloor);
    floor.position.set(cx, -0.15, cz);
    floor.receiveShadow = true;
    lab.add(floor);
    this.collision.addFloor(cx, cz, W, D, 0, { tag: 'lab_floor' });

    // Outer Lab Walls
    const wWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, D), this.mats.cleanroomWall);
    wWall.position.set(cx - W / 2, H / 2, cz);
    lab.add(wWall);
    this.collision.addBox(cx - W / 2, H / 2, cz, 0.6, H, D, 'wall');

    const nWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.6), this.mats.cleanroomWall);
    nWall.position.set(cx, H / 2, cz + D / 2);
    lab.add(nWall);
    this.collision.addBox(cx, H / 2, cz + D / 2, W, H, 0.6, 'wall');

    const sWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.6), this.mats.cleanroomWall);
    sWall.position.set(cx, H / 2, cz - D / 2);
    lab.add(sWall);
    this.collision.addBox(cx, H / 2, cz - D / 2, W, H, 0.6, 'wall');

    // Central Optical & Experiment Table
    const tableGeom = new THREE.BoxGeometry(4.2, 0.9, 2.4);
    const table = new THREE.Mesh(tableGeom, this.mats.steelGrey);
    table.position.set(cx, 0.45, cz);
    table.castShadow = true;
    lab.add(table);
    this.collision.addBox(cx, 0.45, cz, 4.4, 0.9, 2.6, 'lab_table');

    // Glass Enclosure for Sample Return Canister
    const vitrine = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.4), this.mats.glass);
    vitrine.position.set(cx, 1.5, cz);
    lab.add(vitrine);

    // Sample Return Canister inside vitrine
    const sampleCan = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 16), this.mats.steelYellow);
    sampleCan.position.set(cx, 1.35, cz);
    lab.add(sampleCan);

    // 3D Earth Planetary Science Globe Hologram (earth.glb)
    this.labEarth = new THREE.Group();
    this.labEarth.position.set(cx + 1.2, 1.6, cz);
    lab.add(this.labEarth);

    assets.loadPlanet('earth', { radius: 0.45 }).then(m => {
      if (m) this.labEarth.add(m);
    }).catch(() => {});

    // Spectrometer Equipment Racks along North Wall
    const specRack = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.8, 1.2), this.mats.consoleBody);
    specRack.position.set(cx, 1.4, cz + D / 2 - 0.8);
    lab.add(specRack);
    this.collision.addBox(cx, 1.4, cz + D / 2 - 0.8, 6.5, 2.8, 1.2, 'lab_equipment');

    // Wall Data Screens
    const dataScreen = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.8), this.mats.screenGlow);
    dataScreen.position.set(cx, 3.2, cz + D / 2 - 0.18);
    lab.add(dataScreen);

    // Interactive Research Terminal
    this.interaction.register('research_terminal', {
      position: new THREE.Vector3(cx, 1.0, cz - 2.2),
      radius: 3.0,
      prompt: 'Access Research Laboratory',
      keyPrompt: 'E',
      action: () => {
        window.MF_FACILITY?.openResearchLab();
      },
    });

    // Cleanroom Pure White Lighting
    const labLight = new THREE.PointLight(0xffffff, 1.4, 20, 1.2);
    labLight.position.set(cx, H - 1.2, cz);
    lab.add(labLight);
  }

  // =========================================================================
  // C. OUTDOOR LAUNCH PAD COMPLEX (PAD 39-MF)
  // =========================================================================
  _buildLaunchPadComplex() {
    const pad = new THREE.Group();
    pad.name = 'LaunchPadComplex';
    this.group.add(pad);

    const padX = 0;
    const padZ = 78; // Outdoor location connected via tarmac road
    const padElev = 2.5; // Elevated reinforced launch table
    const padW = 28;
    const padD = 28;

    // 1. Asphalt Access Road connecting Hangar to Pad
    const roadL = padZ - 16;
    const road = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, roadL), this.mats.asphalt);
    road.position.set(0, 0.05, 16 + roadL / 2);
    road.receiveShadow = true;
    pad.add(road);
    this.collision.addFloor(0, 16 + roadL / 2, 14, roadL, 0.08, { tag: 'road' });

    // 2. Concrete Launch Pad Platform (Elevated Table)
    const padDeck = new THREE.Mesh(new THREE.BoxGeometry(padW, 0.8, padD), this.mats.concretePad);
    padDeck.position.set(padX, padElev - 0.4, padZ);
    padDeck.receiveShadow = true;
    pad.add(padDeck);
    this.collision.addFloor(padX, padZ, padW, padD, padElev, { tag: 'launch_pad_deck' });

    // Concrete Pedestal Base Legs
    for (const lx of [-padW / 2 + 2, padW / 2 - 2]) {
      for (const lz of [padZ - padD / 2 + 2, padZ + padD / 2 - 2]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(3.5, padElev, 3.5), this.mats.concretePad);
        pillar.position.set(lx, padElev / 2, lz);
        pillar.castShadow = true;
        pad.add(pillar);
        this.collision.addBox(lx, padElev / 2, lz, 3.5, padElev, 3.5, 'pillar');
      }
    }

    // Vehicle Access Ramp up to Launch Deck
    const rampL = 12;
    const rampW = 8;
    const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(rampW, 0.3, rampL), this.mats.concretePad);
    rampMesh.position.set(0, padElev / 2, padZ - padD / 2 - rampL / 2);
    rampMesh.rotation.x = Math.atan2(padElev, rampL);
    rampMesh.receiveShadow = true;
    pad.add(rampMesh);

    this.collision.addFloor(0, padZ - padD / 2 - rampL / 2, rampW, rampL, padElev, {
      rampAxis: 'z',
      elevationStart: 0,
      elevationEnd: padElev,
      tag: 'pad_ramp',
    });

    // 3. Central Flame Trench & Blast Deflector (Below pad deck)
    const trenchDeflector = new THREE.Mesh(
      new THREE.ConeGeometry(4.5, 3.5, 4),
      this.mats.steelDark
    );
    trenchDeflector.rotation.y = Math.PI / 4;
    trenchDeflector.position.set(padX, 1.2, padZ);
    pad.add(trenchDeflector);

    // 4. Launch Service Tower (Truss Tower with Umbilical Bridge)
    this._buildLaunchServiceTower(padX - 8.5, padZ, padElev);

    // Load Blender 3D Launch Complex Model into Pad Area
    assets.loadModel('launch_complex').then(model => {
      if (model) {
        model.position.set(padX, 0, padZ);
        model.traverse(c => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        pad.add(model);
      }
    }).catch(err => console.warn('[FacilityScene] Launch complex GLB notice:', err));

    // 5. Cryogenic Propellant Storage (LOX/LH2 Spheres & Piping)
    this._buildCryoStorage(padX + 22, padZ + 4);

    // 6. Outdoor Launch Operations Console Kiosk
    const consoleX = 6.5;
    const consoleZ = padZ - 8.5;
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), this.mats.consoleBody);
    kiosk.position.set(consoleX, padElev + 0.6, consoleZ);
    kiosk.castShadow = true;
    pad.add(kiosk);
    this.collision.addBox(consoleX, padElev + 0.6, consoleZ, 1.8, 1.2, 1.2, 'launch_kiosk');

    const kioskScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), this.mats.screenGlow);
    kioskScreen.position.set(consoleX, padElev + 1.25, consoleZ + 0.55);
    kioskScreen.rotation.x = -0.25;
    pad.add(kioskScreen);

    // Register Launch Operations Terminal
    this.interaction.register('launch_console', {
      position: new THREE.Vector3(consoleX, padElev + 0.6, consoleZ + 1.6),
      radius: 3.2,
      prompt: 'Access Launch Operations',
      keyPrompt: 'E',
      action: () => {
        window.MF_FACILITY?.openLaunchOperations();
      },
    });

    // Pad Perimeter Railing
    const railMat = this.mats.steelYellow;
    const makePadRail = (x, z, w, d) => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), railMat);
      r.position.set(x, padElev + 0.55, z);
      pad.add(r);
      this.collision.addBox(x, padElev + 0.55, z, w, 1.1, d, 'pad_railing');
    };

    makePadRail(padX - padW / 2 + 0.1, padZ, 0.2, padD); // West
    makePadRail(padX + padW / 2 - 0.1, padZ, 0.2, padD); // East
    makePadRail(padX, padZ + padD / 2 - 0.1, padW, 0.2); // North
    makePadRail(padX - 8.5, padZ - padD / 2 + 0.1, 11, 0.2); // South West
    makePadRail(padX + 8.5, padZ - padD / 2 + 0.1, 11, 0.2); // South East
  }

  _buildLaunchServiceTower(x, z, baseElev) {
    const tower = new THREE.Group();
    tower.position.set(x, baseElev, z);

    const towerH = 34; // 34 meters tall structural steel truss
    const towerW = 4.2;

    // 4 Corner Truss Columns (Aerospace Red/White)
    for (const cx of [-towerW / 2, towerW / 2]) {
      for (const cz of [-towerW / 2, towerW / 2]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, towerH, 8), this.mats.steelRed);
        col.position.set(cx, towerH / 2, cz);
        col.castShadow = true;
        tower.add(col);
      }
    }

    // Horizontal & Diagonal Bracing Platforms
    for (let py = 5; py < towerH; py += 5) {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(towerW + 0.6, 0.3, towerW + 0.6), this.mats.steelGrey);
      platform.position.y = py;
      tower.add(platform);

      const xBrace = new THREE.Mesh(new THREE.BoxGeometry(towerW, 0.1, 0.1), this.mats.steelRed);
      xBrace.position.set(0, py + 2.5, towerW / 2);
      xBrace.rotation.z = Math.PI / 4;
      tower.add(xBrace);
    }

    // Lightning Protection Mast on Tower Summit
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 9, 8), this.mats.steelGrey);
    mast.position.set(0, towerH + 4.5, 0);
    tower.add(mast);

    // Swing Arm (Umbilical Gantry Bridge to Rocket Upper Stage)
    const armL = 7.5;
    const swingArm = new THREE.Mesh(new THREE.BoxGeometry(armL, 1.2, 1.2), this.mats.steelGrey);
    swingArm.position.set(armL / 2, 22, 0);
    swingArm.castShadow = true;
    tower.add(swingArm);

    // Umbilical lines / hoses extending down to vehicle
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5), this.mats.steelDark);
    hose.position.set(armL - 0.4, 20.2, 0);
    tower.add(hose);

    this.group.add(tower);
    this.collision.addBox(x, baseElev + towerH / 2, z, towerW + 0.8, towerH, towerW + 0.8, 'launch_tower');
  }

  _buildCryoStorage(x, z) {
    const cryo = new THREE.Group();
    cryo.position.set(x, 0, z);

    // Two Large Spherical Vacuum Insulated Cryogenic Tanks
    for (const sx of [-4.5, 4.5]) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 18), this.mats.cleanroomWall);
      sphere.position.set(sx, 4.2, 0);
      sphere.castShadow = true;
      cryo.add(sphere);

      // Support plinth legs
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 1.5, 16), this.mats.concretePad);
      plinth.position.set(sx, 0.75, 0);
      cryo.add(plinth);

      // Cryo Piping
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 14), this.mats.steelGrey);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 1.8, 0);
      cryo.add(pipe);
    }

    this.group.add(cryo);
    this.collision.addBox(x, 4.0, z, 16, 8.0, 8.0, 'cryo_storage');
  }

  /**
   * Toggles roll-up high-bay doors open or closed.
   */
  toggleDoors() {
    this.doorsOpen = !this.doorsOpen;
    const targetY = this.doorsOpen ? 16 : 9; // 18m tall door
    for (const d of this.doorMeshes) {
      d.position.y = targetY;
    }
    return this.doorsOpen;
  }

  update(dt) {
    if (this.earthHolo) {
      this.earthHolo.rotation.y += 0.25 * dt;
    }
    if (this.labEarth) {
      this.labEarth.rotation.y += 0.18 * dt;
    }
  }
}
