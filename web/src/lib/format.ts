import type { Category, Level } from "../api";

export const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
export const num = (n: number) => `${Math.round(n * 10) / 10}`;

export const CATEGORY_LABEL: Record<Category, string> = {
  protein: "たんぱく質",
  vegetable: "野菜",
  staple: "主食",
  seasoning: "調味料",
  snack: "お菓子",
  drink: "飲み物",
  other: "その他",
};

export const LEVEL_LABEL: Record<Level, string> = {
  full: "たっぷり",
  half: "半分",
  low: "もうすぐ切れそう",
  out: "切れた",
};

/** 日本時間の今日 YYYY-MM-DD */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function monthJst(): string {
  return todayJst().slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** 入力欄の文字を数値へ。空なら null */
export function toNumber(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
