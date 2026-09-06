/**
 * Battle reducer (Lane A).
 *
 * `applyCommand` is a pure function: the same state and command always produce
 * the same next state and events. Randomness comes only from the RNG carried in
 * the state, so a command log replays to an identical result and hash
 * (IMPLEMENTATION_PLAN.md Sections 6.1 and 6.2). Invalid commands are rejected
 * with a `CommandRejected` event and leave the state (and RNG) untouched.
 *
 * Movement uses weighted A* over the terrain grid; fire requires line of sight;
 * an enemy that moves into an opponent's sight and range may draw reaction fire.
 */
import { type RngState, type SimResult, rollPermille } from "@tkcom/sim-core";
import type { GridPosition } from "@tkcom/map-schema";
import {
  AIM_FALLOFF_PER_TILE,
  type BattleCommand,
  type BattleEvent,
  FIRE_AP_COST,
  MAX_AIM_PERMILLE,
  MIN_AIM_PERMILLE,
  WEAPON_RANGE,
} from "./commands.js";
import { hasLineOfSight } from "./los.js";
import { findPath } from "./pathfind.js";
import { type TerrainGrid, keyOf, terrainFromMap } from "./terrain.js";
import {
  type BattleState,
  type Unit,
  activeFaction,
  findUnit,
  isOngoing,
  livingUnitAt,
} from "./types.js";

/** Chebyshev (8-direction) distance on the grid plane. */
export function chebyshev(a: GridPosition, b: GridPosition): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** To-hit chance in permille for a shot over `distance` tiles from base aim. */
export function hitChancePermille(baseAim: number, distance: number): number {
  const raw = baseAim - AIM_FALLOFF_PER_TILE * Math.max(0, distance - 1);
  return Math.min(MAX_AIM_PERMILLE, Math.max(MIN_AIM_PERMILLE, raw));
}

function inBounds(state: BattleState, pos: GridPosition): boolean {
  const { width, height, levels } = state.map.dimensions;
  return (
    pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height && pos.z >= 0 && pos.z < levels
  );
}

/** Replace a unit by id, returning a new units array. */
function withUnit(units: readonly Unit[], updated: Unit): readonly Unit[] {
  return units.map((u) => (u.id === updated.id ? updated : u));
}

function reject(
  state: BattleState,
  command: BattleCommand,
  reason: string,
): SimResult<BattleState> {
  const events: BattleEvent[] = [{ type: "CommandRejected", command, reason }];
  return { state, events };
}

/** After a state change, declare victory if exactly one faction still has living units. */
function resolveOutcome(state: BattleState, events: BattleEvent[]): SimResult<BattleState> {
  if (!isOngoing(state)) {
    return { state, events };
  }
  const alive = new Set<string>();
  for (const u of state.units) {
    if (u.hitPoints > 0) {
      alive.add(u.faction);
    }
  }
  if (alive.size === 1) {
    const winner = [...alive][0];
    if (winner !== undefined) {
      const ended: BattleState = { ...state, outcome: { kind: "victory", winner } };
      const withEnd: BattleEvent[] = [...events, { type: "MissionEnded", winner }];
      return { state: ended, events: withEnd };
    }
  }
  return { state, events };
}

interface ShotOutcome {
  readonly units: readonly Unit[];
  readonly rng: RngState;
  readonly events: BattleEvent[];
  readonly killed: boolean;
}

/** Resolve one shot from `shooter` at `target` given a to-hit `chance`. Pure. */
function fireShot(
  units: readonly Unit[],
  rng: RngState,
  shooter: Unit,
  target: Unit,
  chance: number,
): ShotOutcome {
  const [hit, nextRng]: readonly [boolean, RngState] = rollPermille(rng, chance);
  if (!hit) {
    return {
      units,
      rng: nextRng,
      events: [
        {
          type: "ProjectileResolved",
          shooterId: shooter.id,
          targetId: target.id,
          hit: false,
          chancePermille: chance,
          damage: 0,
        },
      ],
      killed: false,
    };
  }
  const damage = Math.max(1, shooter.weaponDamage - target.armor);
  const hp = Math.max(0, target.hitPoints - damage);
  const updated = withUnit(units, { ...target, hitPoints: hp });
  const events: BattleEvent[] = [
    {
      type: "ProjectileResolved",
      shooterId: shooter.id,
      targetId: target.id,
      hit: true,
      chancePermille: chance,
      damage,
    },
  ];
  events.push(
    hp <= 0
      ? { type: "UnitKilled", unitId: target.id }
      : { type: "UnitWounded", unitId: target.id, hitPoints: hp },
  );
  return { units: updated, rng: nextRng, events, killed: hp <= 0 };
}

/**
 * After `moverId` moves, let each eligible opposing unit take a reaction shot at
 * it (has reaction, spare action points, range, and line of sight). Watchers act
 * in unit-array order for determinism; a watcher that fires spends action points.
 */
function applyReactions(
  state: BattleState,
  moverId: string,
  terrain: TerrainGrid,
): SimResult<BattleState> {
  let current = state;
  const events: BattleEvent[] = [];
  for (const ref of state.units) {
    const watcher = findUnit(current, ref.id);
    const mover = findUnit(current, moverId);
    if (!watcher || !mover) continue;
    if (mover.hitPoints <= 0) break;
    if (watcher.hitPoints <= 0 || watcher.faction === mover.faction) continue;
    if (watcher.reaction <= 0 || watcher.actionPoints < FIRE_AP_COST) continue;
    const distance = chebyshev(watcher.position, mover.position);
    if (distance > WEAPON_RANGE) continue;
    if (!hasLineOfSight(terrain, watcher.position, mover.position)) continue;

    const [triggered, rngAfterRoll]: readonly [boolean, RngState] = rollPermille(
      current.rng,
      watcher.reaction,
    );
    if (!triggered) {
      current = { ...current, rng: rngAfterRoll };
      continue;
    }
    const watcherAfter: Unit = { ...watcher, actionPoints: watcher.actionPoints - FIRE_AP_COST };
    const units = withUnit(current.units, watcherAfter);
    const shot = fireShot(
      units,
      rngAfterRoll,
      watcherAfter,
      mover,
      hitChancePermille(watcher.aim, distance),
    );
    events.push({ type: "ReactionTriggered", watcherId: watcher.id, moverId });
    events.push(...shot.events);
    const resolved = resolveOutcome({ ...current, units: shot.units, rng: shot.rng }, []);
    current = resolved.state;
    events.push(...(resolved.events as readonly BattleEvent[]));
    if (shot.killed) break;
  }
  return { state: current, events };
}

function applyMove(
  state: BattleState,
  command: BattleCommand & { type: "MoveUnit" },
): SimResult<BattleState> {
  const unit = findUnit(state, command.unitId);
  if (!unit) return reject(state, command, "unknown unit");
  if (unit.hitPoints <= 0) return reject(state, command, "unit is dead");
  if (unit.faction !== activeFaction(state))
    return reject(state, command, "not this faction's turn");
  if (!inBounds(state, command.to)) return reject(state, command, "target out of bounds");
  if (command.to.z !== unit.position.z)
    return reject(state, command, "vertical movement not supported yet");
  if (chebyshev(unit.position, command.to) === 0)
    return reject(state, command, "already at target");
  if (livingUnitAt(state, command.to)) return reject(state, command, "target tile occupied");

  const terrain = terrainFromMap(state.map);
  const blocked = new Set(
    state.units.filter((u) => u.hitPoints > 0 && u.id !== unit.id).map((u) => keyOf(u.position)),
  );
  const path = findPath(terrain, unit.position, command.to, blocked);
  if (!path) return reject(state, command, "no path to target");
  if (path.cost > unit.actionPoints) return reject(state, command, "not enough action points");

  const moved: Unit = {
    ...unit,
    position: command.to,
    actionPoints: unit.actionPoints - path.cost,
  };
  const afterMove: BattleState = { ...state, units: withUnit(state.units, moved) };
  const events: BattleEvent[] = [
    {
      type: "UnitMoved",
      unitId: unit.id,
      from: unit.position,
      to: command.to,
      path: path.steps,
      apSpent: path.cost,
    },
  ];
  const reacted = applyReactions(afterMove, unit.id, terrain);
  return { state: reacted.state, events: [...events, ...reacted.events] };
}

function applyFire(
  state: BattleState,
  command: BattleCommand & { type: "FireWeapon" },
): SimResult<BattleState> {
  const shooter = findUnit(state, command.shooterId);
  const target = findUnit(state, command.targetId);
  if (!shooter) return reject(state, command, "unknown shooter");
  if (!target) return reject(state, command, "unknown target");
  if (shooter.hitPoints <= 0) return reject(state, command, "shooter is dead");
  if (target.hitPoints <= 0) return reject(state, command, "target already down");
  if (shooter.faction !== activeFaction(state))
    return reject(state, command, "not this faction's turn");
  if (target.faction === shooter.faction)
    return reject(state, command, "cannot fire on own faction");
  if (shooter.actionPoints < FIRE_AP_COST)
    return reject(state, command, "not enough action points");

  const distance = chebyshev(shooter.position, target.position);
  if (distance > WEAPON_RANGE) return reject(state, command, "target out of range");

  const terrain = terrainFromMap(state.map);
  if (!hasLineOfSight(terrain, shooter.position, target.position)) {
    return reject(state, command, "no line of sight");
  }

  const shooterAfter: Unit = { ...shooter, actionPoints: shooter.actionPoints - FIRE_AP_COST };
  const units = withUnit(state.units, shooterAfter);
  const shot = fireShot(
    units,
    state.rng,
    shooterAfter,
    target,
    hitChancePermille(shooter.aim, distance),
  );
  const next: BattleState = { ...state, units: shot.units, rng: shot.rng };
  return resolveOutcome(next, shot.events);
}

function applyEndTurn(
  state: BattleState,
  command: BattleCommand & { type: "EndFactionTurn" },
): SimResult<BattleState> {
  if (command.faction !== activeFaction(state))
    return reject(state, command, "not this faction's turn");

  const nextIndex = (state.activeFactionIndex + 1) % state.factions.length;
  const wrapped = nextIndex === 0;
  const nextFaction = state.factions[nextIndex];
  if (nextFaction === undefined) return reject(state, command, "no next faction");

  const units = state.units.map((u) =>
    u.faction === nextFaction ? { ...u, actionPoints: u.maxActionPoints } : u,
  );
  const turn = wrapped ? state.turn + 1 : state.turn;
  const next: BattleState = { ...state, units, activeFactionIndex: nextIndex, turn };
  const events: BattleEvent[] = [
    { type: "TurnEnded", endedFaction: command.faction, nextFaction, turn },
  ];
  return { state: next, events };
}

/** Apply one command. Pure and deterministic; rejects invalid commands. */
export function applyCommand(state: BattleState, command: BattleCommand): SimResult<BattleState> {
  if (!isOngoing(state)) {
    return reject(state, command, "battle already ended");
  }
  switch (command.type) {
    case "MoveUnit":
      return applyMove(state, command);
    case "FireWeapon":
      return applyFire(state, command);
    case "EndFactionTurn":
      return applyEndTurn(state, command);
  }
}

/** Fold a command list into a final state, appending accepted commands to the log. */
export function applyCommands(
  state: BattleState,
  commands: readonly BattleCommand[],
): SimResult<BattleState> {
  let current = state;
  const allEvents: BattleEvent[] = [];
  for (const command of commands) {
    const result = applyCommand(current, command);
    const events = result.events as readonly BattleEvent[];
    const rejected = events.some((e) => e.type === "CommandRejected");
    allEvents.push(...events);
    current = rejected
      ? result.state
      : { ...result.state, log: [...result.state.log, { source: "player", command }] };
  }
  return { state: current, events: allEvents };
}
