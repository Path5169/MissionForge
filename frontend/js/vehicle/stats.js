import { api } from '../core/api.js';

export async function computeStats(bp, cat, bodyId = 'earth', missionId = null) {
  let stats = await api.vehicleStats(bp, bodyId, missionId);

 
  if (stats && typeof stats === 'object' && !Array.isArray(stats.stages)) {
    const inner = stats.stats || stats.result || stats.data;
    if (inner && typeof inner === 'object') stats = inner;
  }

  if (!stats || typeof stats !== 'object' || !Array.isArray(stats.stages) || !Array.isArray(stats.errors)) {
    console.error('[MissionForge] Unexpected /api/vehicle/stats response:', stats);
    const keys = stats && typeof stats === 'object' ? Object.keys(stats).join(', ') : typeof stats;
    throw new Error(`The server returned incomplete vehicle statistics (keys received: ${keys || 'none'}).`);
  }
  if (!Array.isArray(stats.warnings)) stats.warnings = [];
  return stats;
}