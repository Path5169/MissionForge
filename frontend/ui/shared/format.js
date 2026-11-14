export const fmtDist = m => !isFinite(m) ? '—' : Math.abs(m) < 10000 ? `${Math.round(m).toLocaleString('en')} m` : `${(m / 1000).toLocaleString('en', { maximumFractionDigits: Math.abs(m) < 1e6 ? 1 : 0 })} km`;
export const fmtSpeed = v => !isFinite(v) ? '—' : `${Math.abs(v) < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en')} m/s`;
export const fmtMass = kg => kg >= 10000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg).toLocaleString('en')} kg`;
export const fmtForce = n => n >= 1e6 ? `${(n / 1e6).toFixed(2)} MN` : `${(n / 1000).toFixed(n >= 1e5 ? 0 : 1)} kN`;
export const fmtMoney = c => {
  c = Number(c) || 0;
  const abs = Math.abs(c);
  if (abs >= 1e9) return `$${(c / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(c / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `$${Math.round(c).toLocaleString('en')} ($${(c / 1e6).toFixed(2)}M)`;
  return `$${Math.round(c).toLocaleString('en')}`;
};
export function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '—'; s = Math.round(s); const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
  return (d ? `${d}d ` : '') + (d || hh ? `${hh}h ` : '') + (d ? '' : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
}
export const fmtClock = s => { s = Math.floor(s); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'vehicle';
export const fmtMoneyShort = c => {
  c = Number(c) || 0;
  const abs = Math.abs(c);
  if (abs >= 1e9) return `$${(c / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(c / 1e6).toFixed(1)}M`;
  if (abs >= 1e5) return `$${(c / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(c / 1e3).toFixed(0)}K`;
  return `$${Math.round(c).toLocaleString('en')}`;
};