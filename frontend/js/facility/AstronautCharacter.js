import * as THREE from 'three';

/**
 * Procedural Articulated 3D Astronaut Character (NASA EMU Extravehicular Mobility Unit)
 * Features realistic PBR materials, gold reflective visor, life-support backpack,
 * and a skeletal hierarchy animated via procedural inverse kinematics and blending.
 */
export class AstronautCharacter {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Astronaut';

    // Animation state
    this.state = 'idle'; // 'idle', 'walk', 'run', 'jump', 'interact'
    this.animTime = 0;
    this.blendWeight = 0; // for transitions
    this.moveSpeed = 0;
    this.isGrounded = true;

    this._buildModel();
  }

  _buildModel() {
    // -------------------------------------------------------------
    // PBR Materials
    // -------------------------------------------------------------
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0xdedfe5,
      roughness: 0.82,
      metalness: 0.08,
      bumpScale: 0.05,
    });

    const suitDarkMat = new THREE.MeshStandardMaterial({
      color: 0x3a424e,
      roughness: 0.65,
      metalness: 0.25,
    });

    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xe5a323,
      metalness: 0.96,
      roughness: 0.12,
      emissive: 0x4a2c00,
      emissiveIntensity: 0.35,
    });

    const backpackMat = new THREE.MeshStandardMaterial({
      color: 0xf2f4f8,
      roughness: 0.5,
      metalness: 0.15,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x8892a0,
      roughness: 0.3,
      metalness: 0.85,
    });

    const nasaBlueMat = new THREE.MeshStandardMaterial({
      color: 0x0b3d91,
      roughness: 0.6,
      metalness: 0.1,
    });

    const nasaRedMat = new THREE.MeshStandardMaterial({
      color: 0xd8292f,
      roughness: 0.6,
      metalness: 0.1,
    });

    // -------------------------------------------------------------
    // Skeletal Hierarchy Nodes
    // -------------------------------------------------------------
    // Root base at ground level (feet = 0)
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.98;
    this.root.add(this.pelvis);

    // Pelvis mesh
    const pelvisGeom = new THREE.CylinderGeometry(0.24, 0.20, 0.22, 16);
    const pelvisMesh = new THREE.Mesh(pelvisGeom, suitMat);
    pelvisMesh.castShadow = true;
    this.pelvis.add(pelvisMesh);

    // Torso / Chest
    this.torso = new THREE.Group();
    this.torso.position.y = 0.18;
    this.pelvis.add(this.torso);

    const torsoGeom = new THREE.CylinderGeometry(0.26, 0.23, 0.44, 16);
    const torsoMesh = new THREE.Mesh(torsoGeom, suitMat);
    torsoMesh.position.y = 0.22;
    torsoMesh.castShadow = true;
    this.torso.add(torsoMesh);

    // DCM (Display and Control Module on chest)
    const dcmGeom = new THREE.BoxGeometry(0.24, 0.22, 0.12);
    const dcmMesh = new THREE.Mesh(dcmGeom, suitDarkMat);
    dcmMesh.position.set(0, 0.24, 0.18);
    dcmMesh.castShadow = true;
    this.torso.add(dcmMesh);

    // DCM dials & switches
    const dialGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8);
    dialGeom.rotateX(Math.PI / 2);
    const dial1 = new THREE.Mesh(dialGeom, metalMat);
    dial1.position.set(-0.06, 0.27, 0.245);
    const dial2 = new THREE.Mesh(dialGeom, nasaRedMat);
    dial2.position.set(0.06, 0.27, 0.245);
    const dial3 = new THREE.Mesh(dialGeom, nasaBlueMat);
    dial3.position.set(0, 0.20, 0.245);
    this.torso.add(dial1, dial2, dial3);

    // PLSS Backpack (Primary Life Support System)
    const packGeom = new THREE.BoxGeometry(0.42, 0.54, 0.22);
    const packMesh = new THREE.Mesh(packGeom, backpackMat);
    packMesh.position.set(0, 0.26, -0.22);
    packMesh.castShadow = true;
    this.torso.add(packMesh);

    // Backpack oxygen canisters on top
    const o2Geom = new THREE.CylinderGeometry(0.06, 0.06, 0.36, 12);
    o2Geom.rotateZ(Math.PI / 2);
    const o2Canister = new THREE.Mesh(o2Geom, metalMat);
    o2Canister.position.set(0, 0.56, -0.22);
    o2Canister.castShadow = true;
    this.torso.add(o2Canister);

    // Comm antenna
    const antGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.35, 6);
    const antMesh = new THREE.Mesh(antGeom, metalMat);
    antMesh.position.set(0.18, 0.64, -0.25);
    antMesh.rotation.z = -0.15;
    this.torso.add(antMesh);

    // -------------------------------------------------------------
    // Head & Helmet
    // -------------------------------------------------------------
    this.head = new THREE.Group();
    this.head.position.y = 0.48;
    this.torso.add(this.head);

    // Helmet outer shell
    const helmetGeom = new THREE.SphereGeometry(0.21, 20, 16);
    helmetGeom.scale(1.0, 1.05, 1.08);
    const helmetMesh = new THREE.Mesh(helmetGeom, suitMat);
    helmetMesh.position.y = 0.12;
    helmetMesh.castShadow = true;
    this.head.add(helmetMesh);

    // Reflective Gold Visor
    const visorGeom = new THREE.SphereGeometry(0.18, 20, 16, 0, Math.PI, 0, Math.PI * 0.75);
    visorGeom.rotateY(-Math.PI / 2);
    visorGeom.scale(1.02, 0.95, 1.15);
    const visorMesh = new THREE.Mesh(visorGeom, visorMat);
    visorMesh.position.set(0, 0.12, 0.04);
    visorMesh.castShadow = true;
    this.head.add(visorMesh);

    // Helmet light attachment
    const lampGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10);
    lampGeom.rotateX(Math.PI / 2);
    const lampL = new THREE.Mesh(lampGeom, metalMat);
    lampL.position.set(-0.21, 0.14, 0.08);
    const lampR = new THREE.Mesh(lampGeom, metalMat);
    lampR.position.set(0.21, 0.14, 0.08);
    this.head.add(lampL, lampR);

    // -------------------------------------------------------------
    // Arms (Left & Right)
    // -------------------------------------------------------------
    const makeArm = (isLeft) => {
      const sign = isLeft ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set(sign * 0.32, 0.38, 0);

      // Shoulder joint bell
      const shGeom = new THREE.SphereGeometry(0.10, 12, 10);
      const shMesh = new THREE.Mesh(shGeom, suitDarkMat);
      shMesh.castShadow = true;
      shoulder.add(shMesh);

      // Upper arm
      const upperArm = new THREE.Group();
      upperArm.position.y = -0.05;
      shoulder.add(upperArm);

      const upperArmGeom = new THREE.CylinderGeometry(0.085, 0.075, 0.28, 12);
      const upperArmMesh = new THREE.Mesh(upperArmGeom, suitMat);
      upperArmMesh.position.y = -0.14;
      upperArmMesh.castShadow = true;
      upperArm.add(upperArmMesh);

      // NASA patch band on shoulder
      const patchGeom = new THREE.CylinderGeometry(0.088, 0.086, 0.06, 12);
      const patchMesh = new THREE.Mesh(patchGeom, isLeft ? nasaBlueMat : nasaRedMat);
      patchMesh.position.y = -0.08;
      upperArm.add(patchMesh);

      // Forearm & Elbow
      const forearm = new THREE.Group();
      forearm.position.y = -0.28;
      upperArm.add(forearm);

      const elbowGeom = new THREE.SphereGeometry(0.075, 10, 8);
      const elbowMesh = new THREE.Mesh(elbowGeom, suitDarkMat);
      forearm.add(elbowMesh);

      const forearmGeom = new THREE.CylinderGeometry(0.075, 0.068, 0.26, 12);
      const forearmMesh = new THREE.Mesh(forearmGeom, suitMat);
      forearmMesh.position.y = -0.13;
      forearmMesh.castShadow = true;
      forearm.add(forearmMesh);

      // Glove
      const gloveGeom = new THREE.BoxGeometry(0.09, 0.12, 0.07);
      const gloveMesh = new THREE.Mesh(gloveGeom, suitDarkMat);
      gloveMesh.position.y = -0.28;
      gloveMesh.castShadow = true;
      forearm.add(gloveMesh);

      return { shoulder, upperArm, forearm };
    };

    this.leftArm = makeArm(true);
    this.rightArm = makeArm(false);
    this.torso.add(this.leftArm.shoulder);
    this.torso.add(this.rightArm.shoulder);

    // -------------------------------------------------------------
    // Legs (Left & Right)
    // -------------------------------------------------------------
    const makeLeg = (isLeft) => {
      const sign = isLeft ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(sign * 0.15, -0.06, 0);

      // Thigh / Upper Leg
      const thighGeom = new THREE.CylinderGeometry(0.11, 0.095, 0.42, 14);
      const thighMesh = new THREE.Mesh(thighGeom, suitMat);
      thighMesh.position.y = -0.21;
      thighMesh.castShadow = true;
      hip.add(thighMesh);

      // Knee & Shin / Lower Leg
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);

      const kneeJointGeom = new THREE.SphereGeometry(0.095, 12, 10);
      const kneeJointMesh = new THREE.Mesh(kneeJointGeom, suitDarkMat);
      knee.add(kneeJointMesh);

      const shinGeom = new THREE.CylinderGeometry(0.095, 0.085, 0.40, 14);
      const shinMesh = new THREE.Mesh(shinGeom, suitMat);
      shinMesh.position.y = -0.20;
      shinMesh.castShadow = true;
      knee.add(shinMesh);

      // Boot
      const bootGeom = new THREE.BoxGeometry(0.16, 0.14, 0.28);
      const bootMesh = new THREE.Mesh(bootGeom, suitDarkMat);
      bootMesh.position.set(0, -0.42, 0.05);
      bootMesh.castShadow = true;
      knee.add(bootMesh);

      // Boot sole tread
      const soleGeom = new THREE.BoxGeometry(0.17, 0.04, 0.30);
      const soleMesh = new THREE.Mesh(soleGeom, metalMat);
      soleMesh.position.set(0, -0.48, 0.05);
      soleMesh.castShadow = true;
      knee.add(soleMesh);

      return { hip, knee };
    };

    this.leftLeg = makeLeg(true);
    this.rightLeg = makeLeg(false);
    this.pelvis.add(this.leftLeg.hip);
    this.pelvis.add(this.rightLeg.hip);

    this.root.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  /**
   * Update character pose and animations.
   * @param {number} dt - delta time in seconds
   * @param {number} speed - current horizontal speed
   * @param {boolean} grounded - whether player is on ground
   * @param {string} forcedAction - e.g. 'interact'
   */
  update(dt, speed, grounded = true, forcedAction = null) {
    this.moveSpeed = speed;
    this.isGrounded = grounded;
    this.animTime += dt;

    if (forcedAction === 'interact') {
      this.state = 'interact';
    } else if (!grounded) {
      this.state = 'jump';
    } else if (speed > 4.5) {
      this.state = 'run';
    } else if (speed > 0.25) {
      this.state = 'walk';
    } else {
      this.state = 'idle';
    }

    const t = this.animTime;

    // Reset default transforms
    this.pelvis.position.y = 0.98;
    this.pelvis.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);

    // -------------------------------------------------------------
    // Animation States
    // -------------------------------------------------------------
    if (this.state === 'idle') {
      // Subtle rhythmic breathing & weight shift
      const breath = Math.sin(t * 1.8) * 0.015;
      this.torso.position.y = 0.18 + breath;
      this.torso.rotation.z = Math.sin(t * 0.9) * 0.012;
      this.head.rotation.x = Math.sin(t * 1.2) * 0.02;

      // Relaxed arms
      this.leftArm.shoulder.rotation.x = Math.sin(t * 1.8) * 0.04;
      this.leftArm.shoulder.rotation.z = 0.12;
      this.leftArm.forearm.rotation.x = -0.15;

      this.rightArm.shoulder.rotation.x = -Math.sin(t * 1.8) * 0.04;
      this.rightArm.shoulder.rotation.z = -0.12;
      this.rightArm.forearm.rotation.x = -0.15;

      // Legs neutral
      this.leftLeg.hip.rotation.set(0, 0, 0.02);
      this.leftLeg.knee.rotation.set(0, 0, 0);
      this.rightLeg.hip.rotation.set(0, 0, -0.02);
      this.rightLeg.knee.rotation.set(0, 0, 0);

    } else if (this.state === 'walk') {
      const strideFreq = 6.2;
      const cycle = t * strideFreq;
      const legAmp = 0.55;
      const armAmp = 0.45;

      // Pelvic bobbing & sway
      this.pelvis.position.y = 0.98 + Math.abs(Math.sin(cycle)) * 0.04;
      this.pelvis.rotation.y = Math.sin(cycle) * 0.08;
      this.torso.rotation.y = -Math.sin(cycle) * 0.06;
      this.torso.rotation.x = 0.06; // slight forward lean

      // Opposite arm-leg pendulum swing
      this.leftLeg.hip.rotation.x = Math.sin(cycle) * legAmp;
      this.rightLeg.hip.rotation.x = -Math.sin(cycle) * legAmp;

      // Knee bending during back-swing / lift
      this.leftLeg.knee.rotation.x = Math.max(0, -Math.sin(cycle + 0.3) * legAmp * 1.2);
      this.rightLeg.knee.rotation.x = Math.max(0, Math.sin(cycle + 0.3) * legAmp * 1.2);

      // Arm swing
      this.leftArm.shoulder.rotation.x = -Math.sin(cycle) * armAmp;
      this.leftArm.shoulder.rotation.z = 0.15;
      this.leftArm.forearm.rotation.x = -0.2 - Math.max(0, Math.sin(cycle) * 0.25);

      this.rightArm.shoulder.rotation.x = Math.sin(cycle) * armAmp;
      this.rightArm.shoulder.rotation.z = -0.15;
      this.rightArm.forearm.rotation.x = -0.2 - Math.max(0, -Math.sin(cycle) * 0.25);

    } else if (this.state === 'run') {
      const strideFreq = 9.5;
      const cycle = t * strideFreq;
      const legAmp = 0.85;
      const armAmp = 0.75;

      // Energetic pelvic bounce & forward lean
      this.pelvis.position.y = 0.98 + Math.abs(Math.sin(cycle)) * 0.08;
      this.torso.rotation.x = 0.22; // marked forward sprint lean
      this.torso.rotation.y = -Math.sin(cycle) * 0.12;

      // High leg strides
      this.leftLeg.hip.rotation.x = Math.sin(cycle) * legAmp;
      this.rightLeg.hip.rotation.x = -Math.sin(cycle) * legAmp;

      this.leftLeg.knee.rotation.x = Math.max(0, -Math.sin(cycle + 0.4) * 1.4);
      this.rightLeg.knee.rotation.x = Math.max(0, Math.sin(cycle + 0.4) * 1.4);

      // Athletic arm pumping
      this.leftArm.shoulder.rotation.x = -Math.sin(cycle) * armAmp;
      this.leftArm.forearm.rotation.x = -0.7 - Math.abs(Math.sin(cycle)) * 0.3;

      this.rightArm.shoulder.rotation.x = Math.sin(cycle) * armAmp;
      this.rightArm.forearm.rotation.x = -0.7 - Math.abs(Math.sin(cycle)) * 0.3;

    } else if (this.state === 'jump') {
      // Airborne pose
      this.pelvis.position.y = 0.96;
      this.torso.rotation.x = 0.1;

      // Legs tucked slightly
      this.leftLeg.hip.rotation.x = 0.35;
      this.leftLeg.knee.rotation.x = 0.65;
      this.rightLeg.hip.rotation.x = 0.25;
      this.rightLeg.knee.rotation.x = 0.50;

      // Arms flared outward for balance
      this.leftArm.shoulder.rotation.set(-0.3, 0, 0.45);
      this.rightArm.shoulder.rotation.set(-0.3, 0, -0.45);
      this.leftArm.forearm.rotation.x = -0.4;
      this.rightArm.forearm.rotation.x = -0.4;

    } else if (this.state === 'interact') {
      // Reaching arm towards terminal console
      this.torso.rotation.x = 0.08;
      this.head.rotation.x = 0.15; // looking down at controls

      // Right arm raised to touch/type on console
      this.rightArm.shoulder.rotation.set(-1.25, 0.15, -0.15);
      this.rightArm.forearm.rotation.set(-0.45, 0, 0);

      // Left arm resting slightly
      this.leftArm.shoulder.rotation.set(0.1, 0, 0.18);
      this.leftArm.forearm.rotation.x = -0.25;
    }
  }
}
