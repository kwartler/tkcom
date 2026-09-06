# Base and campaign design (X-COM-informed)

**Status:** Design draft, pre-code. Improves the abstractions and expectations for the strategic layer before it is built out. No implementation is authorized by this document.

**Reference:** the 1994 original (UFO: Enemy Unknown / X-COM: UFO Defense), studied for behavior only per the clean-room policy ([`../source-notes/`](../source-notes/)). No original assets or code are used.

## 1. What the reference does (the base loop)

The original ties the whole game together at the base. The parts that matter for TKCom:

- **The base is a place.** A grid of facilities you build and pay upkeep on: access lift, living quarters, laboratories, workshops, stores, detection/radar, hangars, containment, defenses. Facilities cost money and take days to build, occupy space, and must connect to the lift.
- **Personnel are typed resources.** Scientists do research, engineers do manufacturing, soldiers fight, and each draws a salary. Facility capacity caps how many you can house and how many can work at once.
- **Research is rate-based.** Progress scales with the number of scientists assigned (up to lab capacity) over time; projects unlock a tech tree of items, upgrades, and lore. Some projects need recovered artifacts or live captures.
- **Manufacturing mirrors research.** Engineers plus workshop space plus materials plus time produce items you use or sell.
- **The economy is monthly.** Funding arrives each month, scaled by how well you performed; salaries, maintenance, and purchases drain it; a bad month cuts funding, and sustained failure ends the game.
- **Time is continuous with interrupts.** A real-time clock at chosen speed advances research, building, and travel, and stops for events that need a decision. A monthly review scores performance.
- **Multiple bases and coverage** expand the map game later.

## 2. Where TKCom is today (thin abstractions)

Current `campaign-sim` (Milestone 6) deliberately collapses most of that:

- One abstract HQ (a label, not a place). No facilities, no grid.
- One currency, a flat daily upkeep, mission rewards and salvage.
- One research slot; a project completes purely on elapsed days.
- Personnel are a flat roster with active/recovering/dead; recovery is a timer. No scientists/engineers.
- A 30-day scenario; win by finishing all research, lose if the squad is wiped or time runs out.

This is a working spine. The gap versus the reference is the **base as a place**, **typed personnel**, **rate-based research/manufacturing**, and a **monthly performance economy**.

## 3. Improved abstractions: a staged fidelity plan

Rather than jump to a 6x6 facility grid, grow fidelity in three stages so each is playable and testable.

### Stage v1 (shipped): abstract HQ
What exists today. Keep as the floor.

### Stage v2 (next): capacities, typed personnel, monthly economy
Model the base as a set of **named capacities** rather than a spatial grid. This captures ~80% of the reference feel with a fraction of the complexity.

- **Personnel types:** scientists, engineers, soldiers. Each has a daily salary. Soldiers are the existing operatives.
- **Facilities as capacities** (buildable, each with build cost, build days, and monthly maintenance):
  - Laboratory: raises max scientists that can work; research rate scales with assigned scientists up to this cap.
  - Workshop: same for engineers and manufacturing.
  - Quarters: caps total housed personnel.
  - Stores: caps items held.
  - Sickbay: shortens operative recovery time.
  - Detection: raises the rate at which mission opportunities appear.
- **Research becomes rate-based:** `progress/day = perScientistRate * min(assignedScientists, labCapacity) * focusMultiplier`. Multiple queued projects; assign scientists between them.
- **Manufacturing (optional in v2):** engineers plus workshop capacity plus materials plus time produce items to equip or sell.
- **Monthly economy:** a monthly funding tick scaled by a performance score (missions won, objectives, losses), minus salaries and maintenance. Sustained negative balance is a fail condition, replacing today's simpler bankruptcy-agnostic model.

### Stage v3 (later): the base as a place
Introduce the spatial grid and the rest of the reference systems: facility layout and adjacency, hangars and craft, multiple bases, detection coverage on a world map, base defense. This is a large milestone and stays deferred until v2 proves fun.

## 4. Proposed default knobs for v2 (to tune, not final)

Numbers are starting points, all integers, all data-driven so balancing never touches code.

| Knob | Proposed default |
|---|---|
| Scientist salary / day | 20 credits |
| Engineer salary / day | 20 credits |
| Soldier salary / day | 15 credits |
| Per-scientist research rate | 1 progress unit / day |
| Laboratory capacity (per lab) | 10 scientists |
| Laboratory build | 400 credits, 5 days, 40/mo upkeep |
| Workshop capacity (per shop) | 10 engineers |
| Sickbay recovery speedup | recovery days x0.6 |
| Detection: mission offer cadence | one offer every 2 to 4 days (seeded) |
| Monthly funding baseline | 3000 credits, scaled 0.5x to 1.5x by performance |
| Fail condition | two consecutive months net-negative, or squad eliminated |

## 5. Expectations this sets

- Research and manufacturing become **decisions about scientists/engineers and money**, not just "wait N days."
- The player feels **temporal pressure** through the monthly review, not just the 30-day cap.
- The base grows through **spending choices** (build a second lab vs a sickbay), which is the core of the reference loop.
- Everything stays **deterministic and data-driven**: capacities, salaries, and rates are content, and progress is a seeded simulation, so saves replay identically.

## 6. Open decisions for Ted

1. Is the **capacities** model (v2) the right next step, or go straight for the spatial base grid (v3)?
2. Include **manufacturing** in v2, or research-and-economy only first?
3. **Monthly funding** tied to performance: keep the 30-day scenario as the first act, or switch to open-ended monthly play?
4. Any reference systems to explicitly cut for TKCom (for example base defense, or craft/interception)?

See [`dynamic-research.md`](dynamic-research.md) for a proposed change to how research projects are defined (fluid, LLM-generated tech instead of a fixed tree).
