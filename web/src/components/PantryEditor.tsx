import { useState } from "react";
import { CATEGORIES, LEVELS, api, type Kind, type PantryItem } from "../api";
import { CATEGORY_LABEL, LEVEL_LABEL } from "../lib/format";
import { errorMessage } from "../lib/useLoad";
import { ErrorNotice, Field, NumberInput } from "./common";

export function PantryEditor({ item, onSaved, onCancel }: { item?: PantryItem; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<Kind>(item?.kind ?? "food");
  const [category, setCategory] = useState(item?.category ?? "protein");
  const [quantity, setQuantity] = useState<number | null>(item?.quantity ?? null);
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [level, setLevel] = useState(item?.level ?? "full");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const input = {
      name,
      kind,
      category,
      quantity: kind === "food" ? quantity : null,
      unit: kind === "food" && unit.trim() ? unit.trim() : null,
      level: kind === "seasoning" ? level : null,
    };
    try {
      if (item) await api.updatePantry(item.id, input);
      else await api.addPantry(input);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="pantry-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="名前">
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
      </Field>
      <Field label="種類">
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="food">食材（数で管理）</option>
          <option value="seasoning">調味料（残りの目安で管理）</option>
        </select>
      </Field>
      <Field label="分類">
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      {kind === "food" ? (
        <>
          <Field label="数量">
            <NumberInput value={quantity} onChange={setQuantity} />
          </Field>
          <Field label="単位">
            <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="個・g・パック" />
          </Field>
        </>
      ) : (
        <Field label="残り">
          <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <ErrorNotice message={error} />
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          保存
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          やめる
        </button>
      </div>
    </form>
  );
}
