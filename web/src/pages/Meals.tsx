import { useEffect, useState } from "react";
import { api, type MealDraft } from "../api";
import { ErrorNotice, Field, NumberInput, PhotoPicker } from "../components/common";
import { shrinkImage } from "../lib/image";
import { errorMessage } from "../lib/useLoad";

type Ingredient = MealDraft["ingredients"][number] & { used: boolean };
type Draft = Omit<MealDraft, "ingredients"> & { ingredients: Ingredient[] };

export function Meals() {
  const [phase, setPhase] = useState<"idle" | "scanning" | "editing" | "saving">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function pick(file: File) {
    setError(null);
    setSaved(null);
    setPhase("scanning");
    try {
      const blob = await shrinkImage(file);
      setPreview(URL.createObjectURL(blob));
      const d = await api.scanMeal(blob);
      setDraft({ ...d, ingredients: d.ingredients.map((i) => ({ ...i, used: true })) });
      setPhase("editing");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  const setIngredient = (idx: number, patch: Partial<Ingredient>) =>
    setDraft((d) => d && { ...d, ingredients: d.ingredients.map((x, i) => (i === idx ? { ...x, ...patch } : x)) });

  async function save() {
    if (!draft) return;
    setPhase("saving");
    setError(null);
    try {
      await api.saveMeal({
        image_key: draft.image_key,
        title: draft.title,
        kcal: draft.kcal,
        protein_g: draft.protein_g,
        fat_g: draft.fat_g,
        carbs_g: draft.carbs_g,
        consume: draft.ingredients.filter((i) => i.used && i.quantity > 0).map((i) => ({ pantry_item_id: i.pantry_item_id, quantity: i.quantity })),
      });
      setSaved(`「${draft.title}」を保存しました`);
      setDraft(null);
      setPreview(null);
      setPhase("idle");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("editing");
    }
  }

  return (
    <main className="page page-meals">
      <h1 className="page-title">ごはん</h1>
      <ErrorNotice message={error} />
      {saved && <p className="status-saved">{saved}</p>}
      {(phase === "idle" || phase === "scanning") && (
        <PhotoPicker label={phase === "scanning" ? "読み取り中…" : "ごはんを撮る"} disabled={phase === "scanning"} onPick={pick} />
      )}
      {draft && (phase === "editing" || phase === "saving") && (
        <form
          className="meal-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {preview && <img className="meal-preview" src={preview} alt="撮ったごはん" />}
          <Field label="料理名">
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required maxLength={100} />
          </Field>
          <Field label="カロリー（kcal）">
            <NumberInput value={draft.kcal} onChange={(v) => setDraft({ ...draft, kcal: Math.round(v ?? 0) })} step={1} />
          </Field>
          <Field label="タンパク質（g）">
            <NumberInput value={draft.protein_g} onChange={(v) => setDraft({ ...draft, protein_g: v ?? 0 })} />
          </Field>
          <Field label="脂質（g）">
            <NumberInput value={draft.fat_g} onChange={(v) => setDraft({ ...draft, fat_g: v ?? 0 })} />
          </Field>
          <Field label="炭水化物（g）">
            <NumberInput value={draft.carbs_g} onChange={(v) => setDraft({ ...draft, carbs_g: v ?? 0 })} />
          </Field>
          <h2 className="section-title">使った食材</h2>
          {draft.ingredients.length === 0 && <p className="empty">在庫から使った食材は見つかりませんでした</p>}
          <ul className="ingredient-list">
            {draft.ingredients.map((ing, i) => (
              <li key={ing.pantry_item_id} className="ingredient-item">
                <label className="ingredient-used">
                  <input type="checkbox" checked={ing.used} onChange={(e) => setIngredient(i, { used: e.target.checked })} />
                  {ing.name}
                </label>
                <NumberInput value={ing.quantity} onChange={(v) => setIngredient(i, { quantity: v ?? 0 })} />
                <span className="ingredient-unit">{ing.unit ?? ""}</span>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button type="submit" disabled={phase === "saving"}>
              保存する
            </button>
            <button
              type="button"
              disabled={phase === "saving"}
              onClick={() => {
                setDraft(null);
                setPreview(null);
                setPhase("idle");
              }}
            >
              撮り直す
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
