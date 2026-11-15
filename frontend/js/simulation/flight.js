
import { api } from '../core/api.js';

export class FlightSessionClient {
  constructor() {
    this.sessionId = null;
    this.currentSnapshot = null;
    this.closed = true;

    this._refreshPromise = null;
    this._commandQueue = Promise.resolve();
    this._eventCursor = -1;
  }

  async start({ blueprint, bodyId, start, missionId = null }) {
    if (!blueprint || !bodyId || !start) {
      throw new Error('Invalid flight configuration.');
    }

   
    this.closed = true;
    this.sessionId = null;
    this.currentSnapshot = null;
    this._refreshPromise = null;
    this._eventCursor = -1;

   
    await this._commandQueue;

    const result = await api.startFlight({
      blueprint,
      bodyId,
      start,
      missionId,
    });

    if (!result?.sessionId || !result?.snapshot) {
      throw new Error('Server returned an invalid flight session.');
    }

    this.sessionId = result.sessionId;
    this.currentSnapshot = null;

    this._applySnapshot(result.snapshot);
    this.closed = false;

    return this.currentSnapshot;
  }

  async refresh() {
    if (this.closed || !this.sessionId) {
      throw new Error('No active flight session.');
    }

    if (this._refreshPromise) {
      return this._refreshPromise;
    }

    const sessionId = this.sessionId;

    const request = api
      .getFlightSnapshot(sessionId)
      .then(snapshot => {
        if (this.closed || this.sessionId !== sessionId) {
          return this.currentSnapshot;
        }

        this._applySnapshot(snapshot);
        return this.currentSnapshot;
      })
      .finally(() => {
        if (this._refreshPromise === request) {
          this._refreshPromise = null;
        }
      });

    this._refreshPromise = request;

    return request;
  }

  _applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Invalid flight snapshot received.');
    }

    if (snapshot.sessionId !== this.sessionId) {
      throw new Error('Received a snapshot for another flight.');
    }

    const currentSequence = this.currentSnapshot?.sequence;
    const incomingSequence = snapshot.sequence;

    if (
      Number.isFinite(currentSequence) &&
      Number.isFinite(incomingSequence) &&
      incomingSequence < currentSequence
    ) {
      return;
    }

    this.currentSnapshot = snapshot;
  }

  command(command, payload = {}) {
    if (this.closed || !this.sessionId) {
      return Promise.reject(
        new Error('No active flight session.')
      );
    }

    const sessionId = this.sessionId;

    const request = this._commandQueue.then(async () => {
      if (this.closed || this.sessionId !== sessionId) {
        throw new Error('Flight session is no longer active.');
      }

      const result = await api.sendFlightCommand(
        sessionId,
        command,
        payload
      );

      if (this.closed || this.sessionId !== sessionId) {
        throw new Error('Flight session is no longer active.');
      }

      if (result?.accepted === false) {
        throw new Error(result.message || 'Command rejected.');
      }

      if (result?.snapshot) {
        this._applySnapshot(result.snapshot);
      }

      return result;
    });

    
    this._commandQueue = request.catch(() => {});

    return request;
  }

  setThrottle(value) {
    return this.command('set_throttle', { value });
  }

  setRotation(value) {
    return this.command('set_rotation', { value });
  }

  setSAS(mode) {
    return this.command('set_sas', { mode });
  }

  setWarp(value) {
    return this.command('set_time_warp', { value });
  }

  activateNextStage() {
    return this.command('activate_next_stage');
  }

  igniteStageEngines(stage) {
    return this.command('ignite_stage_engines', { stage });
  }

  toggleGroup(group) {
    return this.command('toggle_group', { group });
  }

  deployPayload() {
    return this.command('deploy_payload');
  }

  deployParachute() {
    return this.command('deploy_parachute');
  }

  jettisonHeatShield() {
    return this.command('jettison_heat_shield');
  }

  jettisonFairing() {
    return this.command('jettison_fairing');
  }

  collectSample() {
    return this.command('collect_sample');
  }

  deployLander() {
    return this.command('deploy_lander');
  }

  separateLander() {
    return this.command('separate_lander');
  }

  deployRover() {
    return this.command('deploy_rover');
  }

  deploySeismometer() {
    return this.command('deploy_seismometer');
  }

  switchVessel(target = 'toggle') {
    return this.command('switch_vessel', { target });
  }

  activatePart(uid) {
    return this.command('activate_part', { uid });
  }

  pause() {
    return this.command('pause');
  }

  resume() {
    return this.command('resume');
  }

  telemetry() {
    return this.currentSnapshot?.telemetry ?? null;
  }

  getRenderState() {
    return this.currentSnapshot?.renderState ?? null;
  }

  drainEvents() {
    const events = this.currentSnapshot?.events ?? [];

    const fresh = events.filter(event =>
      Number.isInteger(event.sequence) &&
      event.sequence > this._eventCursor
    );

    for (const event of fresh) {
      this._eventCursor = Math.max(
        this._eventCursor,
        event.sequence
      );
    }

    return fresh;
  }

  async close() {
    if (this.closed || !this.sessionId) {
      return;
    }

    const sessionId = this.sessionId;

    this.closed = true;
    this.sessionId = null;
    this.currentSnapshot = null;

   
    await this._commandQueue;

    await api.closeFlight(sessionId);
  }
}
