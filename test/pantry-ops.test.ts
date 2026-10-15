import { describe, expect, it } from "vitest";
import { PantryState, applyOps, applyPurchase, opSchema, type PantryRow } from "../src/pantry";

const NOW = "2026-10-15T00:00:00.000Z";
const row = (o: Partial<PantryRow> & { name: string }): PantryRow => ({
  id: `id-${o.name}`,
  kind: "food",
  category: "protein",
  quantity: null,
  unit: null,
  level: null,
  updated_at: NOW,
  ...o,
});

describe("applyOps", () => {
  it("在庫の数量を上書きし、調味料は level を変える", () => {
    const state = new PantryState([row({ name: "卵", quantity: 5, unit: "個" }), row({ name: "醤油", kind: "seasoning", category: "seasoning", level: "full" })]);
    const ops = [
      opSchema.parse({ op: "set_pantry", name: "卵", kind: "food", category: "protein", quantity: 3 }),
      opSchema.parse({ op: "set_pantry", name: "醤油", kind: "seasoning", category: "seasoning", level: "low" }),
    ];
    const { changes } = applyOps(state, ops, "2026-10-15", NOW);
    const eggs = state.get("卵")!;
    expect(eggs.quantity).toBe(3);
    expect(eggs.unit).toBe("個"); // 言われていない単位は残る
    expect(state.get("醤油")!.level).toBe("low");
    expect(changes[0]).toMatchObject({ name: "卵", before: { quantity: 5 }, after: { quantity: 3 } });
    expect(changes[1]).toMatchObject({ before: { level: "full" }, after: { level: "low" } });
    expect(state.writes().upserts).toHaveLength(2);
  });

  it("新しい調味料は full で入り、全角は正規化される", () => {
    const state = new PantryState([]);
    applyOps(state, [opSchema.parse({ op: "set_pantry", name: " ｻﾗﾀﾞ油 ", kind: "seasoning", category: "seasoning" })], "2026-10-15", NOW);
    expect(state.get("サラダ油")).toMatchObject({ level: "full", kind: "seasoning" });
  });

  it("消す操作。無いものを消しても変更に出ない。消してから足すと upsert になる", () => {
    const state = new PantryState([row({ name: "牛乳", quantity: 1, unit: "本" })]);
    const { changes } = applyOps(
      state,
      [
        opSchema.parse({ op: "remove_pantry", name: "牛乳" }),
        opSchema.parse({ op: "remove_pantry", name: "ない物" }),
      ],
      "2026-10-15",
      NOW,
    );
    expect(changes).toHaveLength(1);
    expect(state.writes().deletes).toEqual(["牛乳"]);
    applyOps(state, [opSchema.parse({ op: "set_pantry", name: "牛乳", kind: "food", category: "drink", quantity: 2, unit: "本" })], "2026-10-15", NOW);
    expect(state.writes().deletes).toEqual([]);
    expect(state.writes().upserts[0]).toMatchObject({ name: "牛乳", quantity: 2 });
  });

  it("筋トレの記録。日付が無ければ今日", () => {
    const state = new PantryState([]);
    const { workouts, changes } = applyOps(
      state,
      [
        opSchema.parse({ op: "log_workout", exercise: "ベンチプレス", weight_kg: 60, reps: 8, sets: 3 }),
        opSchema.parse({ op: "log_workout", exercise: "スクワット", done_at: "2026-10-14" }),
      ],
      "2026-10-15",
      NOW,
    );
    expect(workouts.map((w) => [w.exercise, w.done_at, w.weight_kg])).toEqual([
      ["ベンチプレス", "2026-10-15", 60],
      ["スクワット", "2026-10-14", null],
    ]);
    expect(changes).toHaveLength(2);
  });
});

describe("applyPurchase", () => {
  it("同じ name と unit は数量を足す", () => {
    const state = new PantryState([row({ name: "卵", quantity: 4, unit: "個" })]);
    applyPurchase(state, { food_name: "卵", category: "protein", quantity: 6, unit: "個" }, NOW);
    applyPurchase(state, { food_name: "卵", category: "protein", quantity: 2, unit: "個" }, NOW);
    expect(state.get("卵")!.quantity).toBe(12);
  });

  it("単位が違えば買った分で置き換える", () => {
    const state = new PantryState([row({ name: "鶏むね肉", quantity: 1, unit: "パック" })]);
    applyPurchase(state, { food_name: "鶏むね肉", category: "protein", quantity: 600, unit: "g" }, NOW);
    expect(state.get("鶏むね肉")).toMatchObject({ quantity: 600, unit: "g" });
  });

  it("調味料は level を full に戻す", () => {
    const state = new PantryState([row({ name: "醤油", kind: "seasoning", category: "seasoning", level: "out" })]);
    applyPurchase(state, { food_name: "醤油", category: "seasoning", quantity: 1, unit: "本" }, NOW);
    expect(state.get("醤油")).toMatchObject({ level: "full", kind: "seasoning" });
  });
});
