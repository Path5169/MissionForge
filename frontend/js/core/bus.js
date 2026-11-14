//DOM helper ifkyk
const subs = new Map();
export const bus = {
  on(ev, fn) { (subs.get(ev) || subs.set(ev, new Set()).get(ev)).add(fn); return () => subs.get(ev)?.delete(fn); },
  emit(ev, data, extra) { subs.get(ev)?.forEach(fn => fn(data, extra)); },
};
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export function toast(msg, kind = '', ms = 3200) {
  const t = h('div', { class: 'toast ' + kind }, msg); document.getElementById('toasts').append(t); setTimeout(() => t.remove(), ms);
}
/** Modal dialog helper. buttons: [{label, value, primary}] -> resolves the chosen value (null on Esc). */
export function ask(title, body, buttons) {
  const d = document.getElementById('dialog'); d.innerHTML = '';
  return new Promise(res => {
    d.append(h('div', { class: 'dlg-h' }, title), h('div', { class: 'dlg-b' }, body), h('div', { class: 'dlg-f' },
      buttons.map(b => h('button', { class: 'btn' + (b.primary ? ' primary' : ''), onclick: () => d.close(JSON.stringify(b.value)) }, b.label))));
    d.returnValue = ''; d.onclose = () => { const v = d.returnValue; d.returnValue = ''; d.onclose = null; res(v ? JSON.parse(v) : null); }; d.showModal();
  });
}
