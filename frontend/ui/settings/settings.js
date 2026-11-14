import { keybindings } from '../../js/core/keybindings.js';
import { state } from '../../js/core/store.js';
import { api } from '../../js/core/api.js';
import { h, toast } from '../../js/core/bus.js';
import { menu } from '../menu/menu.js';

const qualityOptions = [
  { value: 'high', title: 'High fidelity', detail: 'Bloom and post-processing' },
  { value: 'low', title: 'Performance', detail: 'Faster rendering' },
];
const motionOptions = [
  { value: 'full', title: 'Full motion', detail: 'Camera drift and orbital motion enabled' },
  { value: 'reduced', title: 'Reduce motion', detail: 'Stops camera drift and orbital motion' },
];
const LOCAL_SETTINGS_KEY = 'missionforge.settings';

function persistLocally(settings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function openSettings() {
  const dialog = document.getElementById('dialog');
  const originalSettings = {
    quality: state.settings.quality,
    reduceMotion: state.settings.reduceMotion,
  };
  let saved = false;
  let cleaned = false;
  const handleCancel = event => {
    event.preventDefault();
    closeSettings();
  };
  const handleEscape = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSettings();
    }
  };
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (!saved) {
      menu.scene?.setQuality(originalSettings.quality);
      if (menu.scene) menu.scene.reduce = originalSettings.reduceMotion;
    }
    dialog.className = '';
    dialog.removeAttribute('aria-labelledby');
    dialog.removeAttribute('aria-describedby');
    document.getElementById('view-menu').classList.remove('settings-active');
    dialog.removeEventListener('cancel', handleCancel);
    dialog.removeEventListener('keydown', handleEscape);
  };
  const closeSettings = () => {
    if (dialog.open) dialog.close();
    controlsSection.cleanup();
    cleanup();
  };
  dialog.className = 'settings-screen';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.setAttribute('aria-describedby', 'settings-description');

  const settingGroup = (name, id, description, options, selected, onChange) => {
    const buttons = options.map(option => h('button', {
      class: 'settings-option',
      type: 'button',
      'aria-pressed': selected === option.value ? 'true' : 'false',
      onclick: () => onChange(option.value),
    },
      h('span', { class: 'settings-option-title' }, option.title),
      h('span', { class: 'settings-option-detail' }, option.detail)));
    const group = h('section', { class: 'settings-group', 'aria-labelledby': id },
      h('h2', { id, class: 'settings-group-title' }, h('span', { class: 't' }, name)),
      h('p', { class: 'settings-group-description' }, description),
      h('div', { class: 'settings-options', role: 'group', 'aria-label': name }, buttons));

    return {
      element: group,
      select(value) {
        buttons.forEach((button, index) => {
          button.setAttribute('aria-pressed', options[index].value === value);
        });
      },
    };
  };

  let selectedQuality = originalSettings.quality;
  let selectedMotion = originalSettings.reduceMotion ? 'reduced' : 'full';
  const quality = settingGroup(
    'Graphics quality',
    'settings-quality-title',
    'Choose the balance that suits your system.',
    qualityOptions,
    selectedQuality,
    value => {
      selectedQuality = value;
      quality.select(value);
      menu.scene?.setQuality(value);
    });

  // Controls & Keybindings customization section
  const buildControlsSection = () => {
    const list = h('div', { class: 'keybind-grid' });
    let activeRebind = null;

    const updateGrid = () => {
      list.innerHTML = '';
      const allBindings = keybindings.getAll();
      const groups = {};
      for (const item of allBindings) {
        if (!groups[item.group]) groups[item.group] = [];
        groups[item.group].push(item);
      }

      for (const [groupName, items] of Object.entries(groups)) {
        const groupHeader = h('div', { class: 'keybind-group-header' }, groupName);
        list.append(groupHeader);

        for (const item of items) {
          const isListening = activeRebind?.action === item.action;
          const keyBtn = h('button', {
            type: 'button',
            class: 'keybind-btn' + (isListening ? ' is-listening' : ''),
            title: 'Click to remap this key',
            onclick: (e) => {
              e.stopPropagation();
              if (activeRebind?.action === item.action) {
                activeRebind = null;
                updateGrid();
                return;
              }
              activeRebind = { action: item.action };
              updateGrid();
            }
          }, isListening ? 'Press key...' : item.formatted);

          const row = h('div', { class: 'keybind-row' },
            h('span', { class: 'keybind-label' }, item.label),
            keyBtn
          );
          list.append(row);
        }
      }
    };

    updateGrid();

    const handleKeyCapture = (e) => {
      if (!activeRebind) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        activeRebind = null;
        updateGrid();
        return;
      }

      keybindings.set(activeRebind.action, e.code);
      toast(`Bound ${activeRebind.action} to ${keybindings.formatKey(e.code)}`, 'good');
      activeRebind = null;
      updateGrid();
    };

    window.addEventListener('keydown', handleKeyCapture, true);

    const resetBtn = h('button', {
      type: 'button',
      class: 'btn small quiet',
      style: 'margin-top: 10px;',
      onclick: () => {
        keybindings.resetDefaults();
        toast('Keybindings reset to defaults', 'good');
        updateGrid();
      }
    }, 'Reset all controls to defaults');

    const section = h('section', { class: 'settings-group', 'aria-labelledby': 'settings-controls-title' },
      h('h2', { id: 'settings-controls-title', class: 'settings-group-title' }, h('span', { class: 't' }, 'Flight Controls & Keybindings')),
      h('p', { class: 'settings-group-description' }, 'Click any button below to remap its action. Press Escape to cancel.'),
      list,
      resetBtn
    );

    return {
      element: section,
      cleanup: () => {
        window.removeEventListener('keydown', handleKeyCapture, true);
      }
    };
  };

  const controlsSection = buildControlsSection();

  const motion = settingGroup(
    'Motion',
    'settings-motion-title',
    'Choose how much movement appears in the scene.',
    motionOptions,
    selectedMotion,
    value => {
      selectedMotion = value;
      motion.select(value);
      if (menu.scene) menu.scene.reduce = value === 'reduced';
    });
  const save = h('button', { class: 'settings-action primary', type: 'button' }, 'Save changes');

  dialog.innerHTML = '';
  dialog.append(
    h('div', { class: 'settings-dim', 'aria-hidden': 'true' }),
    h('main', { class: 'settings-page' },
      h('header', { class: 'settings-page-heading' },
        h('h1', { id: 'settings-title', class: 'settings-page-title' }, 'Settings'),
        h('p', { id: 'settings-description', class: 'settings-page-description' }, 'Configure your MissionForge experience.')),
      quality.element,
      motion.element,
      controlsSection.element,
      h('footer', { class: 'settings-actions' },
        save,
          h('button', { class: 'settings-action', type: 'button', onclick: closeSettings }, 'Cancel'))));

  save.addEventListener('click', async () => {
    save.disabled = true;
    save.textContent = 'Saving...';
    try {
      const nextSettings = {
        quality: selectedQuality,
        reduceMotion: selectedMotion === 'reduced',
      };
      await api.putSettings(nextSettings);
      persistLocally(nextSettings);
      state.settings.quality = selectedQuality;
      state.settings.reduceMotion = selectedMotion === 'reduced';
      saved = true;
      toast('Settings saved', 'good');
      closeSettings();
    } catch (error) {
      const nextSettings = {
        quality: selectedQuality,
        reduceMotion: selectedMotion === 'reduced',
      };
      if (persistLocally(nextSettings)) {
        state.settings.quality = selectedQuality;
        state.settings.reduceMotion = selectedMotion === 'reduced';
        saved = true;
        toast('Settings saved locally; server sync is unavailable.', 'warn', 5000);
        closeSettings();
      } else {
        toast('Could not save settings: ' + error.message, 'bad', 5000);
      }
    } finally {
      save.disabled = false;
      save.textContent = 'Save changes';
    }
  });

  dialog.addEventListener('cancel', handleCancel);
  dialog.addEventListener('keydown', handleEscape);
  document.getElementById('view-menu').classList.add('settings-active');
  dialog.showModal();
  dialog.querySelector('.settings-option[aria-pressed="true"]')?.focus({ preventScroll: true });
}
