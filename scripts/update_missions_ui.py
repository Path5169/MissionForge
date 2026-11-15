with open('frontend/ui/missions/missions.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Add helper functions before export const missions
helper_anchor = "function missionPhases(m) {"
helper_code = """function passCriteriaList(criteria) {
  if (!criteria?.length) return null;
  return h('ul', { class: 'ms-pass-list' },
    ...criteria.map(c => h('li', { class: 'ms-pass-item' }, h('span', { class: 'ms-check-icon' }, '✓'), c))
  );
}

function failCriteriaList(criteria) {
  if (!criteria?.length) return null;
  return h('ul', { class: 'ms-fail-list' },
    ...criteria.map(c => h('li', { class: 'ms-fail-item' }, h('span', { class: 'ms-fail-icon' }, '✕'), c))
  );
}

function programUnlocks(rewards) {
  if (!rewards?.certifications?.length && !rewards?.unlockedParts?.length) return null;
  return h('div', { class: 'ms-unlocks-list' },
    ...(rewards.certifications || []).map(c => h('div', { class: 'ms-unlock-pill' }, '🏅 ' + c)),
    ...(rewards.unlockedParts || []).map(p => h('div', { class: 'ms-unlock-pill ms-rover-pill' }, '🚀 ' + p))
  );
}

function missionPhases(m) {"""

assert helper_anchor in code, "helper_anchor not found"
code = code.replace(helper_anchor, helper_code)

# Add rendering in detail()
render_anchor = """    if (m.requiredCapabilities?.length) {
      d.append(h('div', { class: 'sec' }, 'Required spacecraft capabilities'));
      d.append(h('ul', { class: 'ms-caps' },
        ...m.requiredCapabilities.map(c => h('li', {}, c))
      ));
    }"""

render_code = """    if (m.requiredCapabilities?.length) {
      d.append(h('div', { class: 'sec' }, 'Required spacecraft capabilities'));
      d.append(h('ul', { class: 'ms-caps' },
        ...m.requiredCapabilities.map(c => h('li', {}, c))
      ));
    }

    if (m.passCriteria?.length) {
      d.append(h('div', { class: 'sec', style: 'color:#5fdb8f' }, 'Mission Pass Criteria'));
      d.append(passCriteriaList(m.passCriteria));
    }

    if (m.failCriteria?.length) {
      d.append(h('div', { class: 'sec', style: 'color:#ff7a6b' }, 'Mission Failure Criteria'));
      d.append(failCriteriaList(m.failCriteria));
    }"""

assert render_anchor in code, "render_anchor not found"
code = code.replace(render_anchor, render_code)

# Add unlocks in rewards section
rewards_anchor = """      if (m.rewards.scientificData?.length) {
        d.append(h('div', { class: 'sec' }, 'Scientific data awarded'));
        d.append(scienceData(m.rewards));
      }
    }"""

rewards_code = """      if (m.rewards.scientificData?.length) {
        d.append(h('div', { class: 'sec' }, 'Scientific data awarded'));
        d.append(scienceData(m.rewards));
      }
      if (m.rewards.certifications?.length || m.rewards.unlockedParts?.length) {
        d.append(h('div', { class: 'sec', style: 'color:#ffe2ac' }, 'Program Qualifications & Rewards'));
        d.append(programUnlocks(m.rewards));
      }
    }"""

assert rewards_anchor in code, "rewards_anchor not found"
code = code.replace(rewards_anchor, rewards_code)

with open('frontend/ui/missions/missions.js', 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated missions.js successfully')
