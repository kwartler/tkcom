/**
 * The seam between the campaign and the tactical battle (app-side).
 *
 * `deployMission` turns the campaign's active operatives into a battle; when
 * the battle ends, `toMissionOutcome` summarises it as the plain contract the
 * campaign consumes via ResolveMission. This mapping is the only place that
 * knows both engines; battle-sim and campaign-sim stay decoupled.
 */
import { type BattleState, type Unit, createBattleState, findUnit } from "@tkcom/battle-sim";
import { type CampaignState, activeOperatives, currentDay } from "@tkcom/campaign-sim";
import type { MissionOutcome } from "@tkcom/campaign-sim";
import { type GridPosition, type MapFile, parseMapFile } from "@tkcom/map-schema";

const MAX_SQUAD = 4;
const SALVAGE_PER_KILL = 50;

function missionArena(width: number, height: number): MapFile {
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({ position: { x, y, z: 0 }, floor: "core.tile.floor" });
    }
  }
  return parseMapFile({
    schemaVersion: 1,
    dimensions: { width, height, levels: 1 },
    cells,
    zones: [],
  });
}

/** Cells a unit can stand on (floor present, no blocking object), sorted for determinism. */
function walkableCells(map: MapFile): GridPosition[] {
  return map.cells
    .filter((c) => c.floor !== undefined && c.object === undefined)
    .map((c) => c.position)
    .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}

function player(op: { id: string; xp: number }, position: GridPosition): Unit {
  return {
    id: op.id,
    faction: "player",
    position,
    actionPoints: 12,
    maxActionPoints: 12,
    hitPoints: 6,
    maxHitPoints: 6,
    // Experience sharpens aim, capped so it stays in a sane band.
    aim: Math.min(900, 700 + op.xp * 10),
    armor: 0,
    weaponDamage: 5,
    reaction: 0,
  };
}

function enemy(i: number, position: GridPosition): Unit {
  return {
    id: `hostile-${i + 1}`,
    faction: "enemy",
    position,
    actionPoints: 12,
    maxActionPoints: 12,
    hitPoints: 6,
    maxHitPoints: 6,
    aim: 650,
    armor: 0,
    weaponDamage: 5,
    reaction: 300,
  };
}

export interface DeployedMission {
  readonly battle: BattleState;
  readonly operativeIds: readonly string[];
  readonly missionId: string;
}

/**
 * Build a battle from the campaign's active operatives against a small enemy
 * force. If an authored `map` is supplied and has room, units deploy onto its
 * walkable cells (players from one end, enemies from the other); otherwise a
 * plain arena is generated.
 */
export function deployMission(
  campaign: CampaignState,
  seed: number,
  authored?: MapFile,
): DeployedMission {
  const squad = activeOperatives(campaign).slice(0, MAX_SQUAD);
  const enemyCount = Math.max(2, Math.min(squad.length, MAX_SQUAD));

  let map = authored ?? missionArena(8, 8);
  let cells = walkableCells(map);
  if (cells.length < squad.length + enemyCount) {
    map = missionArena(8, 8);
    cells = walkableCells(map);
  }

  // Prefer authored spawn zones; fall back to the ends of the walkable list.
  const key = (p: GridPosition): string => `${p.x},${p.y},${p.z}`;
  const walkableSet = new Set(cells.map(key));
  const zoneCells = (kind: string): GridPosition[] =>
    (map.zones.find((z) => z.kind === kind)?.cells ?? []).filter((c) => walkableSet.has(key(c)));

  let playerCells = zoneCells("player-spawn");
  let enemyCells = zoneCells("enemy-spawn");
  if (playerCells.length < squad.length || enemyCells.length < enemyCount) {
    playerCells = cells.slice(0, squad.length);
    enemyCells = cells.slice(-enemyCount).reverse();
  }

  const fallback: GridPosition = { x: 0, y: 0, z: 0 };
  const players: Unit[] = squad.map((op, i) => player(op, playerCells[i] ?? fallback));
  const enemies: Unit[] = Array.from({ length: enemyCount }, (_v, i) =>
    enemy(i, enemyCells[i] ?? fallback),
  );

  const missionId = `core.mission.d${currentDay(campaign)}.${campaign.missionsWon + campaign.missionsLost}`;
  const battle = createBattleState({ map, units: [...players, ...enemies], seed });
  return { battle, operativeIds: squad.map((op) => op.id), missionId };
}

/** Summarise a finished (or aborted) battle for the campaign. */
export function toMissionOutcome(
  battle: BattleState,
  operativeIds: readonly string[],
  missionId: string,
): MissionOutcome {
  const won = battle.outcome.kind === "victory" && battle.outcome.winner === "player";

  const operatives = operativeIds.map((id) => {
    const unit = findUnit(battle, id);
    const killed = !unit || unit.hitPoints <= 0;
    const wounded = !killed && unit !== undefined && unit.hitPoints < unit.maxHitPoints;
    return { id, kills: 0, killed, wounded };
  });

  const enemiesDown = battle.units.filter((u) => u.faction === "enemy" && u.hitPoints <= 0).length;
  return { missionId, won, operatives, salvageCredits: won ? enemiesDown * SALVAGE_PER_KILL : 0 };
}
