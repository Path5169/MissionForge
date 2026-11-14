import { state } from '../../js/core/store.js';
import { h, bus } from '../../js/core/bus.js';
import { MenuScene } from '../../js/rendering/menuScene.js';
import { audio } from '../../js/core/audio.js';

export const menu = {
  mount(root) {
    this.root = root;
    root.innerHTML = '';
    const canvas = h('canvas', { id: 'menu-canvas' }),
      labels = h('div', { class: 'menu-ui', style: 'pointer-events:none' });

    const getReady = () => state.missions.filter(m => m.status === 'ready' || m.status === 'available' || m.status !== 'locked').length;
    const getDone = () => state.missions.filter(m => state.progress[m.id]?.completed).length;

    this.missionDesc = h('span', { class: 'd' }, `${state.missions.length} NASA missions, ${getReady()} flyable now · ${getDone()} completed`);

    const item = (t, d, nav, extra) =>
      h('button', { class: 'mi', onclick: () => (extra ? extra() : bus.emit('nav', nav)) },
        h('span', { class: 't' }, t),
        typeof d === 'string' ? h('span', { class: 'd' }, d) : d
      );

    const list = h('nav', { class: 'menu-list', 'aria-label': 'Main menu' },
      item('Aerospace Facility (3D)', 'Explore the 3D NASA facility, assemble your rocket in 3D, and run operations', 'facility'),
      item('NASA Missions', this.missionDesc, 'missions'),
      item('Solar System (3D)', 'Planetary positions & live Kepler clock featuring 3D Earth', 'solar'),
      item('Settings', 'Graphics quality, motion, and audio', null, () => bus.emit('settings'))
    );

    const mark = h('div', { class: 'wordmark' },
      h('h1', {}, 'MissionForge'),
      h('p', {}, 'Build.', ' ', 'Launch.', ' ', h('span', {}, 'Explore.'))
    );

    root.append(canvas, labels, h('div', { class: 'menu-ui' }, list, mark));
    this.labels = labels;
    this.canvas = canvas;

    try {
      this.scene = new MenuScene(canvas, labels, {
        reduceMotion: state.settings.reduceMotion,
        quality: state.settings.quality,
      });
    } catch (e) {
      console.error('Menu scene failed', e);
    }
    window.addEventListener('resize', () => this.scene?.resize());
  },

  show() {
    const ready = state.missions.filter(m => m.status === 'ready' || m.status === 'available' || m.status !== 'locked').length;
    const done = state.missions.filter(m => state.progress[m.id]?.completed).length;
    if (this.missionDesc) {
      this.missionDesc.textContent = `${state.missions.length} NASA missions, ${ready} flyable now · ${done} completed`;
    }
    this.scene?.resize();
    this.scene?.start();
    this.root.querySelector('.mi')?.focus({ preventScroll: true });
    audio.playLoop('music_menu', { volume: 0.4 });
  },

  hide() {
    this.scene?.stop();
    audio.stopLoop('music_menu', 1.0);
  },
};
