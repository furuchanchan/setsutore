import { z } from "zod";
import { isValidDay } from "./time";

export const CATEGORIES = ["protein", "vegetable", "staple", "seasoning", "snack", "drink", "other"] as const;
export const KINDS = ["food", "seasoning"] as const;
export const LEVELS = ["full", "half", "low", "out"] as const;

export const categorySchema = z.enum(CATEGORIES);
export const kindSchema = z.enum(KINDS);
export const levelSchema = z.enum(LEVELS);

export const daySchema = z.string().refine(isValidDay, "YYYY-MM-DD の実在する日付にしてください");
export const nameSchema = z
  .string()
  .transform((s) => s.normalize("NFKC").trim())
  .pipe(z.string().min(1).max(60));
export const unitSchema = z.string().trim().min(1).max(20);
const yen = z.number().int().min(0).max(100_000_000);
const amount = z.number().min(0).max(1_000_000);
const imageKey = (prefix: string) => z.string().regex(new RegExp(`^${prefix}/[0-9a-f-]{36}$`));

export const settingsSchema = z.object({
  monthly_budget_yen: yen,
  protein_target_g: z.number().int().min(0).max(1000),
  kcal_target: z.number().int().min(0).max(20000),
  workouts_per_week: z.number().int().min(0).max(14),
});

export const receiptItemSchema = z.object({
  printed_name: z.string().trim().min(1).max(100),
  food_name: nameSchema,
  category: categorySchema,
  quantity: amount,
  unit: unitSchema,
  price_yen: yen,
});

export const receiptSaveSchema = z.object({
  image_key: imageKey("drafts").nullish(),
  store: z.string().trim().min(1).max(100),
  purchased_at: daySchema,
  total_yen: yen,
  items: z.array(receiptItemSchema.extend({ add_to_pantry: z.boolean() })).max(200),
});

export const pantryCreateSchema = z.object({
  name: nameSchema,
  kind: kindSchema,
  category: categorySchema,
  quantity: amount.nullish(),
  unit: unitSchema.nullish(),
  level: levelSchema.nullish(),
});

export const pantryPatchSchema = z
  .object({
    name: nameSchema,
    kind: kindSchema,
    category: categorySchema,
    quantity: amount.nullable(),
    unit: unitSchema.nullable(),
    level: levelSchema.nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "更新する項目がありません");

export const workoutInputSchema = z.object({
  exercise: nameSchema,
  weight_kg: z.number().min(0).max(1000).nullish(),
  reps: z.number().int().min(0).max(1000).nullish(),
  sets: z.number().int().min(0).max(100).nullish(),
  note: z.string().trim().max(500).nullish(),
  done_at: daySchema.nullish(),
});

export const mealSaveSchema = z.object({
  image_key: imageKey("drafts").nullish(),
  eaten_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)
    .refine((s) => isValidDay(s.slice(0, 10)), "実在する日付にしてください")
    .nullish(),
  title: z.string().trim().min(1).max(100),
  kcal: z.number().int().min(0).max(20000),
  protein_g: z.number().min(0).max(2000),
  fat_g: z.number().min(0).max(2000),
  carbs_g: z.number().min(0).max(5000),
  note: z.string().trim().max(500).nullish(),
  consume: z
    .array(z.object({ pantry_item_id: z.string().min(1), quantity: z.number().positive().max(1_000_000) }))
    .max(50)
    .default([]),
});

export const talkSchema = z.object({ text: z.string().trim().min(1).max(1000) });
export const loginSchema = z.object({ passcode: z.string().min(1).max(200) });
