// セツトレ API の型つきクライアント。エラーはサーバーが返した理由文を message に持つ

export const CATEGORIES = ["protein", "vegetable", "staple", "seasoning", "snack", "drink", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const LEVELS = ["full", "half", "low", "out"] as const;
export type Level = (typeof LEVELS)[number];
export type Kind = "food" | "seasoning";

export type Settings = {
  monthly_budget_yen: number;
  protein_target_g: number;
  kcal_target: number;
  workouts_per_week: number;
};

export type Summary = {
  today: string;
  month: {
    month: string;
    spent_yen: number;
    budget_yen: number;
    remaining_yen: number;
    days_left: number;
    daily_allowance_yen: number;
  };
  meals_today: { kcal: number; kcal_target: number; protein_g: number; protein_target_g: number };
  workouts_week: { from: string; to: string; sessions: number; target: number };
  pantry_low: { count: number; items: { id: string; name: string; status: "low" | "out" }[] };
};

export type PantryItem = {
  id: string;
  name: string;
  kind: Kind;
  category: Category;
  quantity: number | null;
  unit: string | null;
  level: Level | null;
  updated_at: string;
};
export type PantryInput = {
  name: string;
  kind: Kind;
  category: Category;
  quantity?: number | null;
  unit?: string | null;
  level?: Level | null;
};

export type ReceiptItemDraft = {
  printed_name: string;
  food_name: string;
  category: Category;
  quantity: number;
  unit: string;
  price_yen: number;
};
export type ReceiptDraft = {
  image_key: string;
  store: string;
  purchased_at: string;
  total_yen: number;
  items: ReceiptItemDraft[];
};
export type ReceiptSaveInput = {
  image_key: string | null;
  store: string;
  purchased_at: string;
  total_yen: number;
  items: (ReceiptItemDraft & { add_to_pantry: boolean })[];
};
export type Receipt = {
  id: string;
  store: string;
  purchased_at: string;
  total_yen: number;
  image_key: string | null;
  items: (ReceiptItemDraft & { id: string })[];
};

export type MealDraft = {
  image_key: string;
  title: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  ingredients: { pantry_item_id: string; name: string; quantity: number; unit: string | null }[];
};
export type MealSaveInput = {
  image_key: string | null;
  eaten_at?: string | null;
  title: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  note?: string | null;
  consume: { pantry_item_id: string; quantity: number }[];
};
export type Meal = {
  id: string;
  eaten_at: string;
  image_key: string | null;
  title: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  note: string | null;
};

export type Workout = {
  id: string;
  done_at: string;
  exercise: string;
  weight_kg: number | null;
  reps: number | null;
  sets: number | null;
  note: string | null;
};
export type WorkoutInput = {
  exercise: string;
  weight_kg?: number | null;
  reps?: number | null;
  sets?: number | null;
  note?: string | null;
  done_at?: string | null;
};
export type Exercise = { exercise: string; last_done_at: string; times: number };

export type ChatMessage = { id: number; role: "user" | "assistant"; content: string; created_at: string };
export type Change = { op: "set_pantry" | "remove_pantry" | "log_workout"; name: string; before: unknown; after: unknown };
export type TalkResult = { reply: string; changes: Change[]; pantry: PantryItem[] };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export const UNAUTHORIZED_EVENT = "setsutore:unauthorized";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "include", headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError("通信できませんでした。電波の良いところでもう一度試してください", 0);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = (data as { error?: string } | null)?.error ?? `エラーが発生しました（${res.status}）`;
    if (res.status === 401 && path !== "/login") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(reason, res.status);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const send = <T>(method: string, path: string, body?: unknown) => request<T>(method, path, body);

function imageForm(image: Blob): FormData {
  const form = new FormData();
  form.set("image", image, "photo.jpg");
  return form;
}

export const api = {
  login: (passcode: string) => send<{ ok: true }>("POST", "/login", { passcode }),
  logout: () => send<{ ok: true }>("POST", "/logout"),
  summary: () => get<Summary>("/summary"),
  settings: () => get<Settings>("/settings"),
  saveSettings: (s: Settings) => send<Settings>("PUT", "/settings", s),

  pantry: () => get<{ pantry: PantryItem[] }>("/pantry").then((r) => r.pantry),
  addPantry: (p: PantryInput) => send<PantryItem>("POST", "/pantry", p),
  updatePantry: (id: string, p: Partial<PantryInput>) => send<PantryItem>("PATCH", `/pantry/${id}`, p),
  deletePantry: (id: string) => send<{ ok: true }>("DELETE", `/pantry/${id}`),

  talk: (text: string) => send<TalkResult>("POST", "/talk", { text }),
  talkMessages: () => get<{ messages: ChatMessage[] }>("/talk/messages").then((r) => r.messages),

  scanReceipt: (image: Blob) => send<ReceiptDraft>("POST", "/receipts/scan", imageForm(image)),
  saveReceipt: (r: ReceiptSaveInput) => send<{ id: string; image_key: string | null; pantry: PantryItem[] }>("POST", "/receipts", r),
  receipts: (month: string) => get<{ month: string; total_yen: number; receipts: Receipt[] }>(`/receipts?month=${month}`),
  deleteReceipt: (id: string) => send<{ ok: true }>("DELETE", `/receipts/${id}`),

  scanMeal: (image: Blob) => send<MealDraft>("POST", "/meals/scan", imageForm(image)),
  saveMeal: (m: MealSaveInput) => send<{ id: string; pantry: PantryItem[] }>("POST", "/meals", m),
  meals: (date: string) => get<{ date: string; meals: Meal[] }>(`/meals?date=${date}`).then((r) => r.meals),
  deleteMeal: (id: string) => send<{ ok: true }>("DELETE", `/meals/${id}`),

  workouts: (from: string, to: string) =>
    get<{ workouts: Workout[] }>(`/workouts?from=${from}&to=${to}`).then((r) => r.workouts),
  addWorkout: (w: WorkoutInput) => send<Workout>("POST", "/workouts", w),
  deleteWorkout: (id: string) => send<{ ok: true }>("DELETE", `/workouts/${id}`),
  exercises: () => get<{ exercises: Exercise[] }>("/workouts/exercises").then((r) => r.exercises),
};
