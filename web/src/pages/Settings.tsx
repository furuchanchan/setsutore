import { useEffect, useState } from "react";
import { api, type Settings as SettingsData } from "../api";
import { ErrorNotice, Field, Loading, NumberInput } from "../components/common";
import { errorMessage, useLoad } from "../lib/useLoad";

export function Settings({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { data, error, loading } = useLoad(() => api.settings(), []);
  const [form, setForm] = useState<SettingsData | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (k: keyof SettingsData) => (v: number | null) => {
    setSaved(false);
    setForm((f) => f && { ...f, [k]: Math.round(v ?? 0) });
  };

  return (
    <main className="page page-settings">
      <h1 className="page-title">設定</h1>
      <ErrorNotice message={error ?? actionError} />
      {loading && !form && <Loading />}
      {form && (
        <form
          className="settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setActionError(null);
            try {
              setForm(await api.saveSettings(form));
              setSaved(true);
            } catch (err) {
              setActionError(errorMessage(err));
            }
          }}
        >
          <Field label="1か月の食費の予算（円）">
            <NumberInput value={form.monthly_budget_yen} onChange={set("monthly_budget_yen")} step={1} />
          </Field>
          <Field label="1日のタンパク質の目標（g）">
            <NumberInput value={form.protein_target_g} onChange={set("protein_target_g")} step={1} />
          </Field>
          <Field label="1日のカロリーの目標（kcal）">
            <NumberInput value={form.kcal_target} onChange={set("kcal_target")} step={1} />
          </Field>
          <Field label="1週間の筋トレの目標（回）">
            <NumberInput value={form.workouts_per_week} onChange={set("workouts_per_week")} step={1} />
          </Field>
          <button type="submit">保存する</button>
          {saved && <p className="status-saved">保存しました</p>}
        </form>
      )}
      <button
        type="button"
        className="logout-button"
        onClick={async () => {
          try {
            await api.logout();
            onLoggedOut();
          } catch (e) {
            setActionError(errorMessage(e));
          }
        }}
      >
        ログアウト
      </button>
    </main>
  );
}
