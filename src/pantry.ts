import { z } from "zod";
import { categorySchema, kindSchema, levelSchema, daySchema, nameSchema } from "./schemas";

export type Category = z.infer<typeof categorySchema>;
export type Kind = z.infer<typeof kindSchema>;
export type Level = z.infer<typeof levelSchema>;

export type PantryRow = {
  id: string;
  name: string;
  kind: Kind;
  category: Category;
  quantity: number | null;
  unit: string | null;
  level: Level | null;
  updated_at: string;
};

export type PantrySnapshot = { quantity: number | null; unit: string | null; level: Level | null };

export function snapshot(row: PantryRow | null): PantrySnapshot | null {
  return row ? { quantity: row.quantity, unit: row.unit, level: row.level } : null;
}

/** 在庫の変更を溜めておき、最後にまとめて書き込む差分を返す */
export class PantryState {
  private readonly orig = new Map<string, PantryRow>();
  private readonly cur = new Map<string, PantryRow | null>();

  constructor(rows: PantryRow[]) {
    for (const r of rows) this.orig.set(r.name, r);
  }

  get(name: string): PantryRow | null {
    if (this.cur.has(name)) return this.cur.get(name) ?? null;
    return this.orig.get(name) ?? null;
  }

  put(row: PantryRow): void {
    this.cur.set(row.name, row);
  }

  remove(name: string): void {
    this.cur.set(name, null);
  }

  writes(): { upserts: PantryRow[]; deletes: string[] } {
    const upserts: PantryRow[] = [];
    const deletes: string[] = [];
    for (const [name, row] of this.cur) {
      if (row) upserts.push(row);
      else if (this.orig.has(name)) deletes.push(name);
    }
    return { upserts, deletes };
  }
}

export function pantryStatements(db: D1Database, state: PantryState): D1PreparedStatement[] {
  const { upserts, deletes } = state.writes();
  return [
    ...deletes.map((name) => db.prepare("DELETE FROM pantry_items WHERE name = ?").bind(name)),
    ...upserts.map((r) =>
      db
        .prepare(
          `INSERT INTO pantry_items (id, name, kind, category, quantity, unit, level, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (name) DO UPDATE SET kind = excluded.kind, category = excluded.category,
             quantity = excluded.quantity, unit = excluded.unit, level = excluded.level, updated_at = excluded.updated_at`,
        )
        .bind(r.id, r.name, r.kind, r.category, r.quantity, r.unit, r.level, r.updated_at),
    ),
  ];
}

export async function loadPantry(db: D1Database): Promise<PantryRow[]> {
  const { results } = await db.prepare("SELECT * FROM pantry_items ORDER BY name").all<PantryRow>();
  return results;
}

// ---- レシートの品目を在庫へ足す ----

export type PurchasedItem = { food_name: string; category: Category; quantity: number; unit: string };

/**
 * 同じ name と unit なら数量を足す。調味料は level を full に戻す。
 * 単位が違う在庫は足せないので、買った分で置き換える（name は一意のため）。
 */
export function applyPurchase(state: PantryState, item: PurchasedItem, nowIso: string): void {
  const existing = state.get(item.food_name);
  const isSeasoning = item.category === "seasoning";
  if (isSeasoning) {
    state.put({
      id: existing?.id ?? crypto.randomUUID(),
      name: item.food_name,
      kind: "seasoning",
      category: "seasoning",
      quantity: existing?.quantity ?? null,
      unit: existing?.unit ?? null,
      level: "full",
      updated_at: nowIso,
    });
    return;
  }
  const sameUnit = existing && existing.unit === item.unit && existing.quantity !== null;
  state.put({
    id: existing?.id ?? crypto.randomUUID(),
    name: item.food_name,
    kind: "food",
    category: item.category,
    quantity: sameUnit ? existing.quantity! + item.quantity : item.quantity,
    unit: item.unit,
    level: null,
    updated_at: nowIso,
  });
}

// ---- 会話の操作 ----

export const opSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set_pantry"),
    name: nameSchema,
    kind: kindSchema,
    category: categorySchema,
    quantity: z.number().min(0).max(1_000_000).optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    level: levelSchema.optional(),
  }),
  z.object({ op: z.literal("remove_pantry"), name: nameSchema }),
  z.object({
    op: z.literal("log_workout"),
    exercise: nameSchema,
    weight_kg: z.number().min(0).max(1000).optional(),
    reps: z.number().int().min(0).max(1000).optional(),
    sets: z.number().int().min(0).max(100).optional(),
    done_at: daySchema.optional(),
  }),
]);
export type Op = z.infer<typeof opSchema>;

export type WorkoutInsert = {
  id: string;
  done_at: string;
  exercise: string;
  weight_kg: number | null;
  reps: number | null;
  sets: number | null;
  note: string | null;
  created_at: string;
};

export type Change = { op: Op["op"]; name: string; before: unknown; after: unknown };

/** 操作を順に適用し、在庫の差分・筋トレの記録・変更の一覧を作る（DB には触らない） */
export function applyOps(
  state: PantryState,
  ops: Op[],
  today: string,
  nowIso: string,
): { workouts: WorkoutInsert[]; changes: Change[] } {
  const workouts: WorkoutInsert[] = [];
  const changes: Change[] = [];
  for (const op of ops) {
    if (op.op === "set_pantry") {
      const before = state.get(op.name);
      const next: PantryRow = {
        id: before?.id ?? crypto.randomUUID(),
        name: op.name,
        kind: op.kind,
        category: op.category,
        quantity: op.quantity ?? before?.quantity ?? null,
        unit: op.unit ?? before?.unit ?? null,
        level: op.level ?? before?.level ?? (op.kind === "seasoning" ? "full" : null),
        updated_at: nowIso,
      };
      state.put(next);
      changes.push({ op: op.op, name: op.name, before: snapshot(before), after: snapshot(next) });
    } else if (op.op === "remove_pantry") {
      const before = state.get(op.name);
      if (!before) continue;
      state.remove(op.name);
      changes.push({ op: op.op, name: op.name, before: snapshot(before), after: null });
    } else {
      const w: WorkoutInsert = {
        id: crypto.randomUUID(),
        done_at: op.done_at ?? today,
        exercise: op.exercise,
        weight_kg: op.weight_kg ?? null,
        reps: op.reps ?? null,
        sets: op.sets ?? null,
        note: null,
        created_at: nowIso,
      };
      workouts.push(w);
      changes.push({
        op: op.op,
        name: op.exercise,
        before: null,
        after: { done_at: w.done_at, weight_kg: w.weight_kg, reps: w.reps, sets: w.sets },
      });
    }
  }
  return { workouts, changes };
}

export function workoutStatement(db: D1Database, w: WorkoutInsert): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO workouts (id, done_at, exercise, weight_kg, reps, sets, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(w.id, w.done_at, w.exercise, w.weight_kg, w.reps, w.sets, w.note, w.created_at);
}
