# Dynamic, LLM-authored research (design proposal)

**Status:** Design draft, pre-code, post-alpha. Extends the LLM future state (plan Section 21) and the base/campaign design ([`base-and-campaign.md`](base-and-campaign.md)). No implementation is authorized here.

## 1. The idea

Replace the fixed research list with **fluid, player-directed research**:

1. The player starts a project, picks a **category** (weapons, defense, medical, optics, and so on), and types a goal in plain language, for example "we need laser weapons for our soldiers."
2. A language model turns that into a **structured project plan**: named waves ("wave 1 laser theory, wave 2 laser pistol, wave 3 laser rifle"), a cost and timeline estimate per wave, and the **stats of the device each wave produces** (a laser pistol with accuracy X, damage Y, and so on).
3. **The plan comes back as a proposal, framed as a dialog with the player's head of research.** The player reviews it and can **approve**, ask to **narrow the scope** (drop later waves, cheaper target), or **abandon and start the description over**. Nothing is committed and no resources are spent until they approve; abandoning costs nothing.
4. Once approved, the project runs as a normal campaign research project. Progress is a function of the plan plus **variability**, the **resources** spent, and the **number of scientists** assigned. Real-world-style uncertainty means the timeline drifts as the game goes on (breakthroughs and setbacks).
5. On completion of each wave, the game gains a **real, usable item** with the tracked characteristics.

### 1a. The head-of-research dialog

The generation step is a conversation, not a commit. The proposal is shown in the head-of-research's voice ("Director, we can get there in three phases..."), and the player has three moves:

- **Approve:** the plan is validated, clamped, and stored as a `ResearchProject` (see below). Only now are scientists and budget committed.
- **Revise / narrow:** the player edits the goal or asks to cut scope; this is another one-shot generation producing a fresh proposal. No state changes between proposals.
- **Abandon:** discard the proposal entirely and optionally start a new description. Nothing is spent or recorded.

This keeps the player in control of an inherently open-ended feature and makes the LLM's output advisory until accepted.

This makes the tech tree emergent and different every campaign, instead of a fixed ladder.

## 2. Why it fits the architecture

It is exactly the Lane C pattern (plan Section 21): the model sits at the **input boundary**, and its output is **recorded as data**, never driving the simulation live.

- The LLM is called **once, at project initiation**. Its entire output (waves, costs, variability parameters, and the resulting item definitions) is written into the campaign save as a plain `ResearchProject`.
- From then on, **no model calls happen**. Daily progress is a deterministic seeded simulation over the stored plan. So the campaign still replays to an identical hash and works fully offline after the project is created.
- The generated items are ordinary `content-schema` item definitions, so the rest of the game (battle-sim, inventory) uses them with no special path.

## 3. Determinism-safe flow

```text
player: category + free-text goal
   -> LLM (once) -> proposed plan { waves[], perWaveCost, resultingItems[], variabilityParams }
   -> head-of-research dialog: approve | revise (regenerate) | abandon
        - revise -> back to LLM with the new goal (no state change)
        - abandon -> discard (no cost, nothing recorded)
        - approve v
   -> validate + clamp against content-schema balance bands
   -> store as ResearchProject in the campaign save (data)  <- resources committed here
   -> deterministic daily simulation advances progress (no more LLM)
   -> wave completes -> validated item added to the game
```

## 4. Progress model

Per day, per active project, all integer / fixed-point and seeded:

```text
progress += baseRate
          * min(assignedScientists, labCapacity)
          * facilityBonus
          * variance(seededRng)     // e.g. 0.7 to 1.3, occasional setback/breakthrough
```

A wave completes when cumulative progress reaches its (LLM-estimated, clamped) cost. Variance is drawn from the campaign's deterministic RNG, so the "real-world drift" the player sees is reproducible on replay. Setbacks can extend a wave; breakthroughs can shorten it or improve the resulting item within its clamp band.

## 5. Guardrails (non-negotiable)

- **Schema clamping:** every LLM-proposed cost, timeline, and item stat is validated against `content-schema` and **clamped to balance bands**, so the model cannot create broken, free, instant, or overpowered gear. The category selects the band.
- **Untrusted free text:** the player's prompt is untrusted input. Sandbox it with a system contract; it may only fill a constrained plan template, never reach tool calls, saves, or engine commands directly (same rule as the adversary persona in Section 21.3).
- **Offline / no-model fallback:** if no model is reachable, a deterministic template generator produces a plausible plan from the category and keywords (no LLM). The feature degrades, it never blocks play. See "Where the model runs" below.
- **Cost and rate caps:** waves, per-wave cost, and total timeline are bounded so a project is always finishable within sane campaign time.

## 5a. Where the model runs

Generation happens once per approved project, so latency and availability are tolerable and any of these can sit behind the same Lane C adapter interface:

- **Hosted (default when online):** the optional sync worker proxies to a hosted model (default to the latest Claude models). Best quality; keys never ship in the client (plan Section 12).
- **On-device via WebLLM:** an in-browser engine (MLC WebLLM) runs a small quantized model on **WebGPU**. A compact model is roughly a few hundred MB (the "~300 MB simple model" tier), downloaded once and cached for fully offline generation. Needs WebGPU; slower and lower quality than hosted, which is fine for a one-shot plan.
- **On-device via the browser's built-in model:** Chrome's built-in Prompt API (Gemini Nano) exposes an on-device model whose weights Chrome downloads and manages once. No weights ship with TKCom. Chrome-only and still maturing, so treat it as an opportunistic path, not the baseline.
- **Deterministic template generator (always available):** no model at all; assembles a plan from the category and keywords. Guarantees the feature works on any browser and offline.

Selection is graceful: prefer hosted when online and permitted, else an available on-device model, else the template generator. All of them feed the same validate-and-clamp step, so downstream behavior is identical regardless of source.

## 6. Feasibility verdict

**Feasible, and a strong fit.** The only real work beyond the base/campaign v2 systems is: the project-plan schema (waves + resulting items + variability), the one-shot generation-and-clamp step behind the Lane C adapter, and the deterministic progress simulation (which reuses the campaign clock and RNG already built). Because generation happens once and is stored, none of the determinism, replay, or offline guarantees are at risk.

## 7. Phasing

1. **Prereq:** base/campaign v2 (rate-based research, scientists, facilities) from [`base-and-campaign.md`](base-and-campaign.md).
2. **Prereq:** the Lane C narrative adapter and the item-generation clamp.
3. Ship a **deterministic template generator** first (no LLM) to prove the fluid-project data model and progress simulation.
4. Swap in the **LLM generator** behind the same interface once the template path is solid.

## 8. Open decisions for Ted

1. Categories to offer at launch (weapons, defense, medical, optics, utility?).
2. How visible the uncertainty should be: show the player a range ("3 to 6 days") or a single estimate that drifts?
3. Should failed/abandoned projects still yield partial tech, or nothing?
