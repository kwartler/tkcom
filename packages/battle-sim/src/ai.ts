/**
 * Enemy AI (Lane A, Milestone 5).
 *
 * A small deterministic utility planner. It produces an ordered list of
 * commands for the active faction's whole turn, ending with EndFactionTurn.
 * It plans through the same public command model the player uses
 * (IMPLEMENTATION_PLAN.md Section 7.6), so its output is recorded in the replay
 * log and reproduces exactly.
 *
 * Planning does not roll dice: it tracks positions and action points on a light
 * working model and never consumes the battle RNG. Real hit resolution happens
 * when the commands are applied. Over-planned shots at an already-dead target
 * are simply rejected on apply, so plans stay safe.
 *
 * First-cut behaviour per unit: shoot the best visible target in range; else
 * advance toward the nearest enemy; else hold. Deeper roles (flank, suppress,
 * retreat, guard) build on this.
 */
import { type BattleCommand, FIRE_AP_COST, WEAPON_RANGE } from "./commands.js";
import { hasLineOfSight } from "./los.js";
import { reachable } from "./pathfind.js";
import { chebyshev, hitChancePermille } from "./reduce.js";
import { type TerrainGrid, keyOf, terrainFromMap } from "./terrain.js";
import { type BattleState, type Unit, activeFaction } from "./types.js";

interface Working {
  pos: Unit["position"];
  ap: number;
}

/** Plan the active faction's entire turn as an ordered command list. */
export function planTurn(state: BattleState): BattleCommand[] {
  const faction = activeFaction(state);
  const terrain = terrainFromMap(state.map);
  const commands: BattleCommand[] = [];

  const work = new Map<string, Working>();
  for (const u of state.units) {
    if (u.faction === faction && u.hitPoints > 0) {
      work.set(u.id, { pos: u.position, ap: u.actionPoints });
    }
  }
  const enemies = (): Unit[] => state.units.filter((u) => u.faction !== faction && u.hitPoints > 0);

  for (const unit of state.units) {
    if (unit.faction !== faction || unit.hitPoints <= 0) continue;
    const w = work.get(unit.id);
    if (!w) continue;

    let guard = 0;
    while (guard++ < 50) {
      const foes = enemies();
      if (foes.length === 0) break;

      const targets = foes.filter(
        (e) =>
          chebyshev(w.pos, e.position) <= WEAPON_RANGE &&
          hasLineOfSight(terrain, w.pos, e.position),
      );
      if (w.ap >= FIRE_AP_COST && targets.length > 0) {
        const target = bestTarget(unit, w.pos, targets);
        commands.push({ type: "FireWeapon", shooterId: unit.id, targetId: target.id });
        w.ap -= FIRE_AP_COST;
        continue;
      }

      const move = planApproach(terrain, state, faction, unit.id, w, foes);
      if (move) {
        commands.push({ type: "MoveUnit", unitId: unit.id, to: move.pos });
        w.pos = move.pos;
        w.ap -= move.cost;
        continue;
      }
      break;
    }
  }

  commands.push({ type: "EndFactionTurn", faction });
  return commands;
}

/** Pick the most valuable target: prefer a kill, then the highest hit chance. */
function bestTarget(shooter: Unit, from: Unit["position"], targets: readonly Unit[]): Unit {
  let best = targets[0] as Unit;
  let bestScore = -1;
  for (const t of targets) {
    const dist = chebyshev(from, t.position);
    const chance = hitChancePermille(shooter.aim, dist);
    const damage = Math.max(1, shooter.weaponDamage - t.armor);
    const killable = damage >= t.hitPoints ? 1 : 0;
    const score = killable * 1_000_000 + chance * 100 - dist;
    if (score > bestScore || (score === bestScore && t.id < best.id)) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

/** Choose a reachable cell that gets closest to the nearest enemy. */
function planApproach(
  terrain: TerrainGrid,
  state: BattleState,
  faction: string,
  unitId: string,
  w: Working,
  foes: readonly Unit[],
): { pos: Unit["position"]; cost: number } | null {
  const target = nearest(w.pos, foes);
  if (!target) return null;

  const blocked = new Set<string>();
  for (const e of foes) blocked.add(keyOf(e.position));
  for (const [id, other] of factionPositions(state, faction)) {
    if (id !== unitId) blocked.add(keyOf(other));
  }

  const reach = reachable(terrain, w.pos, w.ap, blocked);
  const here = chebyshev(w.pos, target.position);
  let best: { pos: Unit["position"]; cost: number } | null = null;
  let bestDist = here;
  let bestCost = 0;
  for (const entry of reach.values()) {
    if (entry.cost === 0) continue; // the starting cell
    const d = chebyshev(entry.pos, target.position);
    if (d < bestDist || (d === bestDist && best !== null && entry.cost < bestCost)) {
      best = { pos: entry.pos, cost: entry.cost };
      bestDist = d;
      bestCost = entry.cost;
    }
  }
  return best;
}

function nearest(from: Unit["position"], foes: readonly Unit[]): Unit | undefined {
  let best: Unit | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const e of foes) {
    const d = chebyshev(from, e.position);
    if (d < bestD || (d === bestD && best !== undefined && e.id < best.id)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Live positions of `faction`'s units from the base state (other friendly
 * units are treated as static obstacles while one unit plans its move). */
function factionPositions(state: BattleState, faction: string): Map<string, Unit["position"]> {
  const map = new Map<string, Unit["position"]>();
  for (const u of state.units) {
    if (u.faction === faction && u.hitPoints > 0) map.set(u.id, u.position);
  }
  return map;
}
