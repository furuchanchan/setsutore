import { Hono } from "hono";
import { HttpError } from "../errors";
import type { AppEnv } from "../env";
import { loadPantry, type PantryRow } from "../pantry";
import { pantryCreateSchema, pantryPatchSchema } from "../schemas";
import { readJson } from "../validate";

export const pantryRoutes = new Hono<AppEnv>();

async function getRow(db: D1Database, id: string): Promise<PantryRow> {
  const row = await db.prepare("SELECT * FROM pantry_items WHERE id = ?").bind(id).first<PantryRow>();
  if (!row) throw new HttpError(404, "その在庫はありません");
  return row;
}

async function nameTaken(db: D1Database, name: string, exceptId?: string): Promise<boolean> {
  const row = await db.prepare("SELECT id FROM pantry_items WHERE name = ?").bind(name).first<{ id: string }>();
  return !!row && row.id !== exceptId;
}

pantryRoutes.get("/pantry", async (c) => c.json({ pantry: await loadPantry(c.env.DB) }));

pantryRoutes.post("/pantry", async (c) => {
  const p = await readJson(c, pantryCreateSchema);
  if (await nameTaken(c.env.DB, p.name)) throw new HttpError(409, `「${p.name}」はすでに在庫にあります`);
  const row: PantryRow = {
    id: crypto.randomUUID(),
    name: p.name,
    kind: p.kind,
    category: p.category,
    quantity: p.quantity ?? null,
    unit: p.unit ?? null,
    level: p.level ?? (p.kind === "seasoning" ? "full" : null),
    updated_at: new Date().toISOString(),
  };
  await c.env.DB.prepare(
    "INSERT INTO pantry_items (id, name, kind, category, quantity, unit, level, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(row.id, row.name, row.kind, row.category, row.quantity, row.unit, row.level, row.updated_at)
    .run();
  return c.json(row, 201);
});

pantryRoutes.patch("/pantry/:id", async (c) => {
  const id = c.req.param("id");
  const cur = await getRow(c.env.DB, id);
  const patch = await readJson(c, pantryPatchSchema);
  if (patch.name !== undefined && (await nameTaken(c.env.DB, patch.name, id))) {
    throw new HttpError(409, `「${patch.name}」はすでに在庫にあります`);
  }
  const next: PantryRow = { ...cur, ...patch, updated_at: new Date().toISOString() };
  await c.env.DB.prepare(
    "UPDATE pantry_items SET name = ?, kind = ?, category = ?, quantity = ?, unit = ?, level = ?, updated_at = ? WHERE id = ?",
  )
    .bind(next.name, next.kind, next.category, next.quantity, next.unit, next.level, next.updated_at, id)
    .run();
  return c.json(next);
});

pantryRoutes.delete("/pantry/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM pantry_items WHERE id = ?").bind(c.req.param("id")).run();
  if (r.meta.changes === 0) throw new HttpError(404, "その在庫はありません");
  return c.json({ ok: true });
});
