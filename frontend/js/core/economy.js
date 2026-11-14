
import { layout } from '../vehicle/vehicle.js';

export const CURRENCY = '$';
export const DEFAULT_FUEL_PRICE_PER_KG = 1.5;

export function partCountAndCost(blueprint, catalog) {
  const L = layout(blueprint, catalog);
  let count = 0;
  let construction = 0;
  let fuelCapacity = 0;
  let knownFuelCost = 0;
  let unknownFuelCapacity = 0;

  for (const part of [...(blueprint.parts || []), ...(blueprint.looseParts || [])]) {
    const def = catalog.component(part.c);
    if (!def) continue;
    const instances = L.byUid[part.uid]?.count || 1;
    count += instances;
    construction += Math.round((Number(def.cost) || 0) * instances);

    if (def.tank?.propellant) {
      const capacity = Number(def.tank.propellant) * instances;
      fuelCapacity += capacity;
      knownFuelCost += capacity * (Number(def.tank.costPerKg) || DEFAULT_FUEL_PRICE_PER_KG);
    }
    if (def.solid?.propellant) {
      const capacity = Number(def.solid.propellant) * instances;
      fuelCapacity += capacity;
      
      knownFuelCost += capacity * DEFAULT_FUEL_PRICE_PER_KG;
    }
  }

  return {
    partCount: count,
    construction: Math.round(construction),
    fuelCapacity: Math.round(fuelCapacity),
    expectedFuel: Math.round(knownFuelCost),
  };
}

export function missionBudget(mission) {
  const b = mission?.budget;
  if (!b) return null;
  const total = Math.max(0, Math.round(Number(b.total) || 0));
  const construction = Math.max(0, Math.round(Number(b.construction) || 0));
  const fuel = Math.max(0, Math.round(Number(b.fuel) || 0));
  const operations = Math.max(0, Math.round(Number(b.operations) || 0));
  const contingency = Math.max(0, Math.round(Number(b.contingency) || 0));
  
  const payload = b.payload != null ? Math.max(0, Math.round(Number(b.payload) || 0)) : null;
  const specialEquipment = b.specialEquipment != null ? Math.max(0, Math.round(Number(b.specialEquipment) || 0)) : null;
   return { total, construction, fuel, operations, contingency, payload, specialEquipment, basis: b.basis || null };
}

export function financialSnapshot(blueprint, catalog, mission = null, mode = 'sandbox') {
  const parts = partCountAndCost(blueprint, catalog);
  const budget = missionBudget(mission);
  const career = mode === 'mission' && !!budget;
  const operating = career ? budget.operations : Math.round(parts.construction * 0.015);
  const expectedMissionCost = parts.construction + parts.expectedFuel + operating;
  const remainingConstruction = career ? budget.construction - parts.construction : null;
  const remainingTotal = career ? budget.total - expectedMissionCost : null;
  return {
    ...parts,
    mode: career ? 'career' : (mode === 'sandbox' ? 'sandbox' : 'workshop'),
    budget,
    operating,
    expectedMissionCost,
    remainingConstruction,
    remainingTotal,
    constructionOverrun: career ? Math.max(0, -remainingConstruction) : 0,
    budgetUtilization: career && budget.total > 0 ? expectedMissionCost / budget.total : null,
    referenceOverrun: !career && budget ? Math.max(0, expectedMissionCost - budget.total) : 0,
    canAfford: !career || remainingConstruction >= 0,
  };
}

export function canBuildBlueprint(blueprint, catalog, mission, mode = 'sandbox', baselineBlueprint = null) {
  const result = financialSnapshot(blueprint, catalog, mission, mode);
  if (result.canAfford) return true;

  if (baselineBlueprint) {
    const baseline = partCountAndCost(baselineBlueprint, catalog);
    return result.construction <= baseline.construction;
  }
  return false;
}
