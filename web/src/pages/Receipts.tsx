import { useEffect, useState } from "react";
import { CATEGORIES, api, type ReceiptDraft, type ReceiptItemDraft } from "../api";
import { ErrorNotice, Field, NumberInput, PhotoPicker } from "../components/common";
import { CATEGORY_LABEL, yen } from "../lib/format";
import { shrinkImage } from "../lib/image";
import { errorMessage } from "../lib/useLoad";

type EditItem = ReceiptItemDraft & { add_to_pantry: boolean };
type Draft = Omit<ReceiptDraft, "items"> & { items: EditItem[] };

export function Receipts() {
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
      const d = await api.scanReceipt(blob);
      setDraft({ ...d, items: d.items.map((i) => ({ ...i, add_to_pantry: i.category !== "other" })) });
      setPhase("editing");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  const setItem = (idx: number, patch: Partial<EditItem>) =>
    setDraft((d) => d && { ...d, items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  async function save() {
    if (!draft) return;
    setPhase("saving");
    setError(null);
    try {
      await api.saveReceipt({
        image_key: draft.image_key,
        store: draft.store,
        purchased_at: draft.purchased_at,
        total_yen: draft.total_yen,
        items: draft.items,
      });
      setSaved(`${draft.store} ${yen(draft.total_yen)} を保存しました`);
      setDraft(null);
      setPreview(null);
      setPhase("idle");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("editing");
    }
  }

  return (
    <main className="page page-receipts">
      <h1 className="page-title">レシート</h1>
      <ErrorNotice message={error} />
      {saved && <p className="status-saved">{saved}</p>}
      {(phase === "idle" || phase === "scanning") && (
        <PhotoPicker label={phase === "scanning" ? "読み取り中…" : "レシートを撮る"} disabled={phase === "scanning"} onPick={pick} />
      )}
      {draft && (phase === "editing" || phase === "saving") && (
        <form
          className="receipt-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {preview && <img className="receipt-preview" src={preview} alt="撮ったレシート" />}
          <Field label="店名">
            <input value={draft.store} onChange={(e) => setDraft({ ...draft, store: e.target.value })} required />
          </Field>
          <Field label="購入日">
            <input type="date" value={draft.purchased_at} onChange={(e) => setDraft({ ...draft, purchased_at: e.target.value })} required />
          </Field>
          <Field label="合計（円）">
            <NumberInput value={draft.total_yen} onChange={(v) => setDraft({ ...draft, total_yen: v ?? 0 })} step={1} required />
          </Field>
          <ul className="receipt-items">
            {draft.items.map((it, i) => (
              <li key={i} className="receipt-item">
                <p className="receipt-item-printed">レシートの表記: {it.printed_name}</p>
                <Field label="食材名">
                  <input value={it.food_name} onChange={(e) => setItem(i, { food_name: e.target.value })} required />
                </Field>
                <Field label="分類">
                  <select value={it.category} onChange={(e) => setItem(i, { category: e.target.value as EditItem["category"] })}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="数量">
                  <NumberInput value={it.quantity} onChange={(v) => setItem(i, { quantity: v ?? 0 })} />
                </Field>
                <Field label="単位">
                  <input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} required />
                </Field>
                <Field label="金額（円）">
                  <NumberInput value={it.price_yen} onChange={(v) => setItem(i, { price_yen: v ?? 0 })} step={1} />
                </Field>
                <label className="receipt-item-pantry">
                  <input type="checkbox" checked={it.add_to_pantry} onChange={(e) => setItem(i, { add_to_pantry: e.target.checked })} />
                  在庫に足す
                </label>
                <button type="button" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== i) })}>
                  この品目を消す
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                items: [...draft.items, { printed_name: "手入力", food_name: "", category: "other", quantity: 1, unit: "個", price_yen: 0, add_to_pantry: false }],
              })
            }
          >
            品目を足す
          </button>
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
