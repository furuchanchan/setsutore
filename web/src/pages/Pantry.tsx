import { useState } from "react";
import { api, type PantryItem } from "../api";
import { ErrorNotice, Loading } from "../components/common";
import { PantryEditor } from "../components/PantryEditor";
import { CATEGORY_LABEL, LEVEL_LABEL, num } from "../lib/format";
import { errorMessage, useLoad } from "../lib/useLoad";

function amount(p: PantryItem): string {
  if (p.kind === "seasoning") return p.level ? LEVEL_LABEL[p.level] : "";
  return p.quantity === null ? "" : `${num(p.quantity)}${p.unit ?? ""}`;
}

export function Pantry() {
  const { data, error, loading, reload } = useLoad(() => api.pantry(), []);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const done = () => {
    setEditing(null);
    reload();
  };

  return (
    <main className="page page-pantry">
      <h1 className="page-title">在庫</h1>
      <ErrorNotice message={error ?? actionError} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <p className="empty">在庫はまだありません。レシートを撮るか、話して教えてください</p>}
      <ul className="pantry-list">
        {data?.map((p) =>
          editing === p.id ? (
            <li key={p.id} className="pantry-item pantry-item-editing">
              <PantryEditor item={p} onSaved={done} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={p.id} className={`pantry-item pantry-item-${p.level ?? "stocked"}`}>
              <span className="pantry-name">{p.name}</span>
              <span className="pantry-category">{CATEGORY_LABEL[p.category]}</span>
              <span className="pantry-amount">{amount(p)}</span>
              <button type="button" onClick={() => setEditing(p.id)}>
                直す
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`「${p.name}」を在庫から消しますか？`)) return;
                  try {
                    await api.deletePantry(p.id);
                    reload();
                  } catch (e) {
                    setActionError(errorMessage(e));
                  }
                }}
              >
                消す
              </button>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <PantryEditor onSaved={done} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing("new")}>
          在庫を足す
        </button>
      )}
    </main>
  );
}
