import type { SaveEnvelope } from "@tkcom/sim-core";
import { describe, expect, it, vi } from "vitest";
import { AutosaveController, InMemorySaveRepository } from "./index";

function envelope<T>(saveId: string, payload: T): SaveEnvelope<T> {
  return {
    schemaVersion: 1,
    engineVersion: "test",
    contentPackIds: [],
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    saveId,
    revision: 1,
    payload,
  };
}

describe("InMemorySaveRepository", () => {
  it("stores, lists, retrieves, and deletes save envelopes", async () => {
    const repository = new InMemorySaveRepository();
    await repository.put(envelope("z-save", { turn: 2 }));
    await repository.put(envelope("a-save", { turn: 1 }));

    expect(await repository.list()).toEqual(["a-save", "z-save"]);
    expect((await repository.get<{ turn: number }>("z-save"))?.payload.turn).toBe(2);

    await repository.delete("z-save");
    expect(await repository.get("z-save")).toBeUndefined();
  });

  it("clones values so callers cannot mutate stored data", async () => {
    const repository = new InMemorySaveRepository();
    const original = envelope("slot", { units: ["alpha"] });
    await repository.put(original);

    const loaded = await repository.get<{ units: string[] }>("slot");
    loaded?.payload.units.push("bravo");

    expect((await repository.get<{ units: string[] }>("slot"))?.payload.units).toEqual(["alpha"]);
  });
});

describe("AutosaveController", () => {
  it("creates revision one and increments revisions on later writes", async () => {
    const repository = new InMemorySaveRepository();
    const timestamps = ["2026-09-06T01:00:00.000Z", "2026-09-06T01:01:00.000Z"];
    const controller = new AutosaveController(repository, {
      saveId: "autosave",
      schemaVersion: 1,
      engineVersion: "0.1.0",
      now: () => timestamps.shift() ?? "missing",
    });

    const first = await controller.saveNow({ turn: 1 });
    const second = await controller.saveNow({ turn: 2 });

    expect(first.revision).toBe(1);
    expect(second).toMatchObject({
      revision: 2,
      createdAt: "2026-09-06T01:00:00.000Z",
      updatedAt: "2026-09-06T01:01:00.000Z",
      payload: { turn: 2 },
    });
  });

  it("debounces scheduled saves and writes only the latest payload", async () => {
    vi.useFakeTimers();
    const repository = new InMemorySaveRepository();
    const controller = new AutosaveController<{ turn: number }>(repository, {
      saveId: "autosave",
      schemaVersion: 1,
      engineVersion: "0.1.0",
      delayMs: 20,
      now: () => "2026-09-06T02:00:00.000Z",
    });

    controller.schedule({ turn: 1 });
    controller.schedule({ turn: 3 });
    await vi.runAllTimersAsync();

    expect((await controller.load())?.payload).toEqual({ turn: 3 });
    expect((await controller.load())?.revision).toBe(1);
    vi.useRealTimers();
  });

  it("flushes pending work immediately and can delete the slot", async () => {
    const repository = new InMemorySaveRepository();
    const controller = new AutosaveController<{ turn: number }>(repository, {
      saveId: "autosave",
      schemaVersion: 1,
      engineVersion: "0.1.0",
      delayMs: 10_000,
      now: () => "2026-09-06T03:00:00.000Z",
    });

    controller.schedule({ turn: 4 });
    expect((await controller.flush())?.payload).toEqual({ turn: 4 });
    await controller.delete();
    expect(await controller.load()).toBeUndefined();
  });
});
