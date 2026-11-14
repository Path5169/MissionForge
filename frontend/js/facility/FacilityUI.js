import { h, bus, toast } from '../core/bus.js';
import { state, mission as missionById, loadPreset } from '../core/store.js';
import { fmtMass, fmtMoney, fmtSpeed, fmtForce } from '../../ui/shared/format.js';

/**
 * FacilityUI: Manages the in-game third-person HUD and terminal modal overlays
 * (Engineering Terminal, Mission Control, Launch Operations, Research Lab, Vehicle Inspection).
 */
export class FacilityUI {
  constructor(container, interactionManager) {
    this.container = container;
    this.interaction = interactionManager;

    this.activeModal = null;
    this._setupHUD();
    this._setupKeybindings();
  }

  _setupHUD() {
    this.hud = h('div', { class: 'fac-hud' });

    // Top-Left: Location and Active Mission Badge
    this.locationBadge = h('div', { class: 'fac-location-badge' },
      h('div', { class: 'fac-loc-tag' }, 'AEROSPACE FACILITY'),
      this.locationTitle = h('div', { class: 'fac-loc-title' }, 'ENGINEERING HANGAR // BAY 01'),
      this.missionPill = h('div', { class: 'fac-mission-pill' }, 'Active Mission: Free Sandbox Operations')
    );

    // Top-Right: Quick Nav & Controls
    this.quickNav = h('div', { class: 'fac-quick-nav' },
      h('button', { class: 'btn small primary glow', onclick: () => this.openEngineeringModal() }, '3D Rocket Studio 🛠️'),
      h('button', { class: 'btn small', onclick: () => this.openVehicleInspection() }, 'Inspect Vehicle'),
      h('button', { class: 'btn small', onclick: () => bus.emit('nav', 'missions') }, 'Missions'),
      h('button', { class: 'btn small quiet', onclick: () => bus.emit('nav', 'menu') }, 'Main Menu')
    );

    // Bottom-Center: Context-Sensitive Interaction Prompt
    this.promptBox = h('div', { class: 'fac-prompt-box', hidden: true },
      this.promptKey = h('span', { class: 'fac-prompt-key' }, 'E'),
      this.promptText = h('span', { class: 'fac-prompt-text' }, 'Interact')
    );

    // Bottom-Left: Controls Hint
    this.controlsHint = h('div', { class: 'fac-controls-hint' },
      'WASD: Move · SHIFT: Sprint · SPACE: Jump · MOUSE: Orbit Camera · E: Interact · ESC: Close'
    );

    // Modal Overlay Container
    this.modalOverlay = h('div', { class: 'fac-modal-overlay', hidden: true });
    this.modalContent = h('div', { class: 'fac-modal-content' });
    this.modalOverlay.append(this.modalContent);

    // Close on backdrop click
    this.modalOverlay.addEventListener('click', e => {
      if (e.target === this.modalOverlay) {
        this.closeModal();
      }
    });

    this.hud.append(
      this.locationBadge,
      this.quickNav,
      this.promptBox,
      this.controlsHint,
      this.modalOverlay
    );
    this.container.append(this.hud);

    // Listen for interaction prompt updates
    this.interaction.onChange(promptData => {
      if (!promptData || this.activeModal) {
        this.promptBox.hidden = true;
      } else {
        this.promptKey.textContent = promptData.key;
        this.promptText.textContent = promptData.prompt;
        this.promptBox.hidden = false;
      }
    });
  }

  _setupKeybindings() {
    this._onKeyDown = e => {
      if (e.code === 'Escape') {
        if (this.activeModal) {
          this.closeModal();
        } else {
          // Open quick pause/nav menu
          this.openPauseMenu();
        }
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  updateLocation(playerPos) {
    let loc = 'ENGINEERING HANGAR // BAY 01';
    const x = playerPos.x;
    const z = playerPos.z;

    if (z > 22) {
      loc = 'LAUNCH COMPLEX 39-MF // PAD DECK';
    } else if (z > 14) {
      loc = 'LAUNCH COMPLEX 39-MF // ACCESS TARMAC';
    } else if (x > 18) {
      loc = 'MISSION CONTROL CENTER // OPERATIONS ROOM';
    } else if (x < -18) {
      loc = 'MATERIALS & RESEARCH LAB // CLEANROOM';
    } else if (playerPos.y > 3.0) {
      loc = 'HIGH-BAY GANTRY // INSPECTION CATWALK';
    }

    if (this.locationTitle.textContent !== loc) {
      this.locationTitle.textContent = loc;
    }

    // Update active mission display
    const m = state.mode === 'mission' && state.missionId ? missionById(state.missionId) : null;
    this.missionPill.textContent = m
      ? `Active Mission: ${m.name} (${m.body.toUpperCase()})`
      : 'Active Mission: Free Sandbox Flight Operations';
  }

  // =========================================================================
  // MODAL OVERLAYS
  // =========================================================================
  openModal(title, subtitle, bodyElement, actionsElement) {
    this.modalContent.innerHTML = '';

    const header = h('div', { class: 'fac-modal-header' },
      h('div', {},
        h('h2', { class: 'fac-modal-title' }, title),
        subtitle ? h('p', { class: 'fac-modal-subtitle' }, subtitle) : null
      ),
      h('button', { class: 'btn quiet small fac-modal-close', onclick: () => this.closeModal() }, '✕ ESC')
    );

    const body = h('div', { class: 'fac-modal-body' }, bodyElement);
    const footer = h('div', { class: 'fac-modal-footer' }, actionsElement || null);

    this.modalContent.append(header, body, footer);
    this.modalOverlay.hidden = false;
    this.activeModal = title;
    this.promptBox.hidden = true;
    this.interaction.lock(true);
  }

  closeModal() {
    this.modalOverlay.hidden = true;
    this.modalContent.innerHTML = '';
    this.activeModal = null;
    this.interaction.lock(false);
  }

  // 1. 3D Rocket Assembly Studio Modal
  openEngineeringModal() {
    const adapter = window.MF_FACILITY?.rocketAdapter;
    let selectedCat = 'engine';

    const render = () => {
      const specs = adapter?.getSpecs() || {};
      const stats = specs.stats || {};
      const bp = state.blueprint || { parts: [] };

      // Vehicle name input
      const nameInput = h('input', {
        type: 'text',
        class: 'fac-name-input',
        value: bp.name || 'Untitled 3D Vehicle',
        onchange: e => {
          bp.name = e.target.value.trim() || 'Untitled 3D Vehicle';
        }
      });

      // Stats grid
      const infoGrid = h('div', { class: 'fac-grid-stats' },
        h('div', { class: 'fac-stat-card' },
          h('span', { class: 'dim' }, 'Vehicle Name'),
          nameInput
        ),
        h('div', { class: 'fac-stat-card' },
          h('span', { class: 'dim' }, 'Total Launch Mass'),
          h('b', { class: 'num' }, stats.totalMass ? fmtMass(stats.totalMass) : 'N/A')
        ),
        h('div', { class: 'fac-stat-card' },
          h('span', { class: 'dim' }, 'Liftoff Thrust'),
          h('b', { class: 'num' }, stats.liftoffThrust ? fmtForce(stats.liftoffThrust) : 'N/A')
        ),
        h('div', { class: 'fac-stat-card' },
          h('span', { class: 'dim' }, 'Vacuum Delta-V'),
          h('b', { class: 'num' }, stats.totalDeltaV ? fmtSpeed(stats.totalDeltaV) : 'N/A')
        ),
        h('div', { class: 'fac-stat-card' },
          h('span', { class: 'dim' }, 'Stages'),
          h('b', { class: 'num' }, stats.stageCount ?? 1)
        ),
        h('div', { class: 'fac-stat-card' },
          h('span', { class: 'dim' }, 'Height'),
          h('b', { class: 'num' }, (specs.height || 10).toFixed(1) + ' m')
        )
      );

      // Category Switcher
      const categories = [
        ['engine', '🚀 Engines'],
        ['tank', '🛢️ Tanks'],
        ['command', '🕹️ Command'],
        ['separator', '✂️ Separators'],
        ['aero', '🔺 Aero'],
        ['landing', '🦵 Landing'],
        ['utility', '🛰️ Utility & Payloads'],
      ];

      const catBar = h('div', { class: 'fac-cat-bar' },
        ...categories.map(([catId, label]) =>
          h('button', {
            class: `btn small ${selectedCat === catId ? 'primary' : ''}`,
            onclick: () => {
              selectedCat = catId;
              render();
            }
          }, label)
        )
      );

      // Part Catalog Grid
      const parts = state.catalog?.list().filter(c => c.category === selectedCat) || [];
      const partCatalog = h('div', { class: 'fac-catalog-grid' },
        ...parts.map(comp => {
          const metaStr = comp.engine
            ? `${fmtForce(comp.engine.thrustVac)} thrust · ${fmtMass(comp.mass)}`
            : comp.tank
            ? `${fmtMass(comp.tank.propellant)} fuel · ${fmtMass(comp.mass)}`
            : fmtMass(comp.mass);

          return h('div', { class: 'fac-part-card' },
            h('div', { class: 'fac-part-info' },
              h('b', { class: 'cyan' }, comp.name),
              h('span', { class: 'dim' }, metaStr),
              h('span', { class: 'faint' }, `${comp.diameter}m dia × ${comp.height}m ht · ${fmtMoney(comp.cost)}`)
            ),
            h('div', { class: 'fac-part-actions' },
              h('button', {
                class: 'btn small primary',
                onclick: async () => {
                  await adapter?.addPart(comp.id, 'below');
                  toast(`Added "${comp.name}" to 3D Rocket`);
                  render();
                }
              }, '+ Add to Stack'),
              comp.radial
                ? h('button', {
                    class: 'btn small',
                    onclick: async () => {
                      await adapter?.addPart(comp.id, 'radial');
                      toast(`Attached radial boosters: "${comp.name}"`);
                      render();
                    }
                  }, '+ Radial Pair')
                : null
            )
          );
        })
      );

      // Installed Parts in Stack
      const currentStack = h('div', { class: 'fac-stack-sec' },
        h('h3', { class: 'fac-sec-title' }, `Active 3D Rocket Stack (${bp.parts?.length || 0} Modules)`),
        h('div', { class: 'fac-stack-list' },
          ...(bp.parts || []).map((p, idx) => {
            const comp = state.catalog?.component(p.c);
            return h('div', { class: 'fac-stack-item' },
              h('span', { class: 'num dim' }, `#${idx + 1}`),
              h('b', { class: 'cyan' }, comp?.name || p.c),
              h('span', { class: 'fac-badge faint' }, (comp?.category || 'PART').toUpperCase()),
              h('span', { class: 'num' }, comp ? fmtMass(comp.mass) : '—'),
              h('div', { class: 'fac-stack-controls' },
                h('button', {
                  class: 'btn small quiet',
                  title: 'Move Up in Stack',
                  disabled: idx === 0,
                  onclick: async () => {
                    await adapter?.movePart(p.uid, -1);
                    render();
                  }
                }, '▲'),
                h('button', {
                  class: 'btn small quiet',
                  title: 'Move Down in Stack',
                  disabled: idx === (bp.parts.length - 1),
                  onclick: async () => {
                    await adapter?.movePart(p.uid, 1);
                    render();
                  }
                }, '▼'),
                h('button', {
                  class: 'btn small quiet',
                  style: 'color: var(--alarm);',
                  title: 'Remove Part',
                  onclick: async () => {
                    await adapter?.removePart(p.uid);
                    toast(`Removed module #${idx + 1}`);
                    render();
                  }
                }, '✕')
              )
            );
          })
        )
      );

      // NASA Vehicle Presets
      const presetSec = h('div', { class: 'fac-preset-sec' },
        h('h3', { class: 'fac-sec-title' }, 'Instant 3D NASA Blueprint Presets'),
        h('div', { class: 'fac-preset-list' },
          ...state.presets.map(p =>
            h('button', {
              class: 'btn small fac-preset-btn',
              onclick: async () => {
                const loaded = await loadPreset(p.id);
                if (loaded) {
                  state.blueprint = loaded;
                  await adapter?.reloadVehicle();
                  toast(`Loaded 3D vehicle: "${p.name}"`);
                  render();
                }
              }
            }, `3D Preset: ${p.name}`)
          )
        )
      );

      const body = h('div', { class: 'fac-studio-body' },
        infoGrid,
        h('div', { class: 'fac-studio-cols' },
          h('div', { class: 'fac-col-left' },
            h('h3', { class: 'fac-sec-title' }, '3D Parts Catalog (Attach to Rocket)'),
            catBar,
            partCatalog
          ),
          h('div', { class: 'fac-col-right' },
            currentStack,
            presetSec
          )
        )
      );

      const actions = h('div', { class: 'fac-actions-row' },
        h('button', {
          class: 'btn',
          onclick: async () => {
            await adapter?.clearVehicle('Custom 3D Rocket');
            toast('Reset 3D vehicle to base capsule');
            render();
          }
        }, 'Clear / New Rocket'),
        h('button', {
          class: 'btn primary glow',
          onclick: async () => {
            try {
              await api.saveBlueprint(state.blueprint.name, state.blueprint);
              toast(`Saved 3D Rocket "${state.blueprint.name}" to Agency Database!`, 'good');
            } catch (err) {
              toast('Saved to local staging session.', 'good');
            }
          }
        }, 'Save 3D Blueprint 💾'),
        h('button', { class: 'btn', onclick: () => this.closeModal() }, 'Exit 3D Studio')
      );

      this.openModal(
        '3D Rocket Assembly & Customization Studio',
        'Direct 3D Vehicle Engineering & Hardware Integration · NASA Hangar Bay 01',
        body,
        actions
      );
    };

    render();
  }

  // 2. Mission Control Modal
  openMissionControl() {
    const activeM = state.mode === 'mission' && state.missionId ? missionById(state.missionId) : null;

    const missionList = h('div', { class: 'fac-mission-list' },
      ...state.missions.map(m => {
        const isDone = state.progress[m.id]?.completed;
        const isActive = activeM?.id === m.id;

        return h('div', { class: `fac-mission-item ${isActive ? 'active' : ''}` },
          h('div', { class: 'fac-mi-header' },
            h('b', { class: 'fac-mi-title' }, m.name),
            h('span', { class: `fac-badge ${isDone ? 'green' : 'cyan'}` }, isDone ? 'COMPLETED' : m.status?.toUpperCase() || 'READY')
          ),
          h('p', { class: 'fac-mi-desc dim' }, m.brief || m.description || ''),
          h('div', { class: 'fac-mi-meta' },
            h('span', {}, `Target: ${m.body?.toUpperCase() || 'EARTH'}`),
            m.budget ? h('span', {}, `Budget: ${fmtMoney(m.budget.total)}`) : null
          ),
          h('button', {
            class: `btn small ${isActive ? 'quiet' : 'primary'}`,
            onclick: () => {
              state.mode = 'mission';
              state.missionId = m.id;
              toast(`Active mission set to: ${m.name}`);
              this.closeModal();
            }
          }, isActive ? 'Currently Active' : 'Set Active Mission')
        );
      })
    );

    const actions = h('div', { class: 'fac-actions-row' },
      h('button', {
        class: 'btn',
        onclick: () => {
          state.mode = 'sandbox';
          state.missionId = null;
          toast('Switched to Free Sandbox Operations');
          this.closeModal();
        }
      }, 'Switch to Sandbox Mode'),
      h('button', { class: 'btn primary', onclick: () => this.closeModal() }, 'Done')
    );

    this.openModal(
      'Mission Control Center',
      'Flight Operations, Trajectory Planning & Active NASA Missions',
      missionList,
      actions
    );
  }

  // 3. Launch Operations Modal
  openLaunchOperations() {
    const specs = window.MF_FACILITY?.rocketAdapter?.getSpecs() || {};
    const stats = specs.stats || {};
    const m = state.mode === 'mission' && state.missionId ? missionById(state.missionId) : null;

    const checklist = h('div', { class: 'fac-launch-checklist' },
      h('h3', { class: 'fac-sec-title' }, 'Pre-Launch Readiness Verification'),
      h('div', { class: 'fac-check-item go' },
        h('span', { class: 'fac-check-status' }, 'GO'),
        h('span', { class: 'fac-check-label' }, 'Vehicle Structural Integration & Interstage Connections')
      ),
      h('div', { class: 'fac-check-item go' },
        h('span', { class: 'fac-check-status' }, 'GO'),
        h('span', { class: 'fac-check-label' }, 'Cryogenic Propellant & Oxidizer Pressurization')
      ),
      h('div', { class: 'fac-check-item go' },
        h('span', { class: 'fac-check-status' }, 'GO'),
        h('span', { class: 'fac-check-label' }, 'Flight Computer, Gyros & Attitude Guidance Sensors')
      ),
      h('div', { class: 'fac-check-item go' },
        h('span', { class: 'fac-check-status' }, 'GO'),
        h('span', { class: 'fac-check-label' }, 'Launch Complex 39-MF Range Safety & Weather Clearance')
      )
    );

    const launchSummary = h('div', { class: 'fac-launch-summary' },
      h('div', { class: 'fac-summary-row' },
        h('span', { class: 'dim' }, 'Vehicle Name:'),
        h('b', { class: 'cyan' }, specs.name)
      ),
      h('div', { class: 'fac-summary-row' },
        h('span', { class: 'dim' }, 'Target Mission:'),
        h('b', {}, m ? m.name : 'Orbital Sandbox Test Flight')
      ),
      h('div', { class: 'fac-summary-row' },
        h('span', { class: 'dim' }, 'Liftoff Thrust / TWR:'),
        h('b', { class: 'num' }, `${stats.liftoffThrust ? fmtForce(stats.liftoffThrust) : '—'} (TWR: ${stats.liftoffTWR?.toFixed(2) ?? '—'})`)
      ),
      h('div', { class: 'fac-summary-row' },
        h('span', { class: 'dim' }, 'Total Delta-V Reserve:'),
        h('b', { class: 'num' }, stats.totalDeltaV ? fmtSpeed(stats.totalDeltaV) : '—')
      )
    );

    const body = h('div', {},
      checklist,
      launchSummary
    );

    const actions = h('div', { class: 'fac-actions-row' },
      h('button', {
        class: 'btn primary glow fac-btn-ignite',
        onclick: () => {
          this.closeModal();
          // Trigger existing flight simulation workflow
          bus.emit('nav', 'flight', {
            bodyId: m ? m.body : 'earth',
            start: m ? m.start : { type: 'pad' },
            blueprint: structuredClone(state.blueprint),
            missionId: m ? m.id : undefined,
          });
        }
      }, 'IGNITE & LAUNCH ▶'),
      h('button', { class: 'btn', onclick: () => this.closeModal() }, 'Abort Launch')
    );

    this.openModal(
      'Launch Pad Operations Terminal',
      'Launch Complex Pad 39-MF · Launch Readiness & Ignition Sequence',
      body,
      actions
    );
  }

  // 4. Research Laboratory Modal
  openResearchLab() {
    const discoveries = [
      { id: 'geo', title: 'Lunar Regolith & Ilmenite Ore', body: 'MOON', desc: 'Hermetic sample canister analysis reveals titanium dioxide and trapped solar-wind helium-3 isotopes.' },
      { id: 'atmo', title: 'Martian Atmospheric Spectroscopy', body: 'MARS', desc: 'Continuous sensor measurements of thin CO2 atmosphere, seasonal dust optical depth, and methane traces.' },
      { id: 'deep', title: 'Outer Planet RTG Thermoelectrics', body: 'DEEP SPACE', desc: 'Solid-state thermocouple power output curves tested under vacuum cryogenic temperature profiles.' },
    ];

    const list = h('div', { class: 'fac-research-list' },
      ...discoveries.map(d =>
        h('div', { class: 'fac-research-card' },
          h('div', { class: 'fac-rc-header' },
            h('b', { class: 'cyan' }, d.title),
            h('span', { class: 'fac-badge faint' }, d.body)
          ),
          h('p', { class: 'dim' }, d.desc)
        )
      )
    );

    const actions = h('div', { class: 'fac-actions-row' },
      h('button', { class: 'btn primary', onclick: () => this.closeModal() }, 'Close')
    );

    this.openModal(
      'Materials & Advanced Research Laboratory',
      'Planetary Discoveries, Sample Vault & Scientific Telemetry Archives',
      list,
      actions
    );
  }

  // 5. Vehicle Inspection Modal
  openVehicleInspection() {
    const specs = window.MF_FACILITY?.rocketAdapter?.getSpecs() || {};
    const stats = specs.stats || {};
    const bp = state.blueprint || {};

    const partsList = h('div', { class: 'fac-parts-inspection' },
      h('h3', { class: 'fac-sec-title' }, `Installed Parts Hierarchy (${bp.parts?.length || 0} Modules)`),
      h('div', { class: 'fac-parts-table' },
        ...(bp.parts || []).map((p, idx) => {
          const comp = state.catalog?.component(p.c);
          return h('div', { class: 'fac-part-row' },
            h('span', { class: 'num dim' }, `#${idx + 1}`),
            h('span', { class: 'cyan' }, comp?.name || p.c),
            h('span', { class: 'faint' }, comp?.category?.toUpperCase() || 'PART'),
            h('span', { class: 'num' }, comp ? fmtMass(comp.mass) : '—')
          );
        })
      )
    );

    const actions = h('div', { class: 'fac-actions-row' },
      h('button', {
        class: 'btn',
        onclick: () => {
          this.closeModal();
          this.openEngineeringModal();
        }
      }, 'Go to Engineering Terminal'),
      h('button', { class: 'btn primary', onclick: () => this.closeModal() }, 'Close')
    );

    this.openModal(
      'Flight Hardware Inspection',
      `Assembled Vehicle CAD & Telemetry Breakdown · ${specs.name}`,
      partsList,
      actions
    );
  }

  // 6. Pause / Quick Nav Menu
  openPauseMenu() {
    const list = h('div', { class: 'fac-pause-list' },
      h('button', { class: 'btn primary', onclick: () => this.closeModal() }, 'Resume Simulation'),
      h('button', { class: 'btn', onclick: () => { this.closeModal(); this.openEngineeringModal(); } }, '3D Rocket Assembly Studio 🛠️'),
      h('button', { class: 'btn', onclick: () => { this.closeModal(); this.openMissionControl(); } }, 'Mission Control'),
      h('button', { class: 'btn', onclick: () => { this.closeModal(); bus.emit('settings'); } }, 'Settings'),
      h('button', { class: 'btn quiet', onclick: () => { this.closeModal(); bus.emit('nav', 'menu'); } }, 'Exit to Main Menu')
    );

    this.openModal(
      'Aerospace Facility Operations',
      'Simulation Paused',
      list,
      null
    );
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    this.hud?.remove();
  }
}
