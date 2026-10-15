import { useState } from "react";
import { api } from "../api";
import { ErrorNotice, Loading } from "../components/common";
import { addMonths, lastDayOfMonth, monthJst, num, todayJst, yen } from "../lib/format";
import { errorMessage, useLoad } from "../lib/useLoad";

type Tab = "spending" | "meals" | "workouts";

function Spending() {
  const [month, setMonth] = useState(monthJst());
  const { data, error, loading, reload } = useLoad(() => api.receipts(month), [month]);
  const [actionError, setActionError] = useState<string | null>(null);
  return (
    <div className="history-spending">
      <MonthStepper month={month} onChange={setMonth} />
      <ErrorNotice message={error ?? actionError} />
      {loading && !data && <Loading />}
      {data && (
        <>
          <p className="history-total">{yen(data.total_yen)}</p>
          {data.receipts.length === 0 && <p className="empty">この月のレシートはありません</p>}
          <ul className="receipt-list">
            {data.receipts.map((r) => (
              <li key={r.id} className="receipt-entry">
                <p className="receipt-entry-head">
                  <span className="receipt-date">{r.purchased_at}</span>
                  <span className="receipt-store">{r.store}</span>
                  <span className="receipt-total">{yen(r.total_yen)}</span>
                </p>
                <ul className="receipt-entry-items">
                  {r.items.map((it) => (
                    <li key={it.id}>
                      {it.food_name} {num(it.quantity)}
                      {it.unit}・{yen(it.price_yen)}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`${r.purchased_at} ${r.store} のレシートを消しますか？（在庫は戻りません）`)) return;
                    try {
                      await api.deleteReceipt(r.id);
                      reload();
                    } catch (e) {
                      setActionError(errorMessage(e));
                    }
                  }}
                >
                  消す
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Meals() {
  const [date, setDate] = useState(todayJst());
  const { data, error, loading, reload } = useLoad(() => api.meals(date), [date]);
  const [actionError, setActionError] = useState<string | null>(null);
  return (
    <div className="history-meals">
      <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="日付" />
      <ErrorNotice message={error ?? actionError} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <p className="empty">この日の食事の記録はありません</p>}
      <ul className="meal-list">
        {data?.map((m) => (
          <li key={m.id} className="meal-item">
            <span className="meal-time">{m.eaten_at.slice(11, 16)}</span>
            <span className="meal-title">{m.title}</span>
            <span className="meal-nutrition">
              {m.kcal} kcal・P {num(m.protein_g)} g・F {num(m.fat_g)} g・C {num(m.carbs_g)} g
            </span>
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`「${m.title}」を消しますか？`)) return;
                try {
                  await api.deleteMeal(m.id);
                  reload();
                } catch (e) {
                  setActionError(errorMessage(e));
                }
              }}
            >
              消す
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkoutsHistory() {
  const [month, setMonth] = useState(monthJst());
  const { data, error, loading } = useLoad(() => api.workouts(`${month}-01`, lastDayOfMonth(month)), [month]);
  return (
    <div className="history-workouts">
      <MonthStepper month={month} onChange={setMonth} />
      <ErrorNotice message={error} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <p className="empty">この月の記録はありません</p>}
      <ul className="workout-list">
        {data?.map((w) => (
          <li key={w.id} className="workout-item">
            <span className="workout-date">{w.done_at}</span>
            <span className="workout-exercise">{w.exercise}</span>
            <span className="workout-detail">
              {[w.weight_kg !== null ? `${num(w.weight_kg)}kg` : "", w.reps !== null ? `${w.reps}回` : "", w.sets !== null ? `${w.sets}セット` : ""].filter(Boolean).join(" ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonthStepper({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="month-stepper">
      <button type="button" onClick={() => onChange(addMonths(month, -1))}>
        前の月
      </button>
      <span className="month-label">{month}</span>
      <button type="button" onClick={() => onChange(addMonths(month, 1))}>
        次の月
      </button>
    </div>
  );
}

export function History() {
  const [tab, setTab] = useState<Tab>("spending");
  const tabs: [Tab, string][] = [
    ["spending", "食費"],
    ["meals", "食事"],
    ["workouts", "筋トレ"],
  ];
  return (
    <main className="page page-history">
      <h1 className="page-title">記録</h1>
      <div className="tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "spending" && <Spending />}
      {tab === "meals" && <Meals />}
      {tab === "workouts" && <WorkoutsHistory />}
    </main>
  );
}
