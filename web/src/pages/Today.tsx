import { api } from "../api";
import { ErrorNotice, Loading, Section } from "../components/common";
import { num, todayJst, yen } from "../lib/format";
import { useLoad } from "../lib/useLoad";

export function Today() {
  const summary = useLoad(() => api.summary(), []);
  const meals = useLoad(() => api.meals(todayJst()), []);
  const s = summary.data;

  return (
    <main className="page page-today">
      <h1 className="page-title">きょう</h1>
      <ErrorNotice message={summary.error ?? meals.error} />
      {summary.loading && !s && <Loading />}
      {s && (
        <>
          <Section title="今月の食費">
            <p className="budget-spent">
              {yen(s.month.spent_yen)} / {yen(s.month.budget_yen)}
            </p>
            <progress className="budget-meter" value={Math.min(s.month.spent_yen, s.month.budget_yen)} max={Math.max(s.month.budget_yen, 1)} />
            <p className="budget-remaining">残り {yen(s.month.remaining_yen)}</p>
            <p className="budget-allowance">
              あと {s.month.days_left} 日、1日あたり {yen(s.month.daily_allowance_yen)} が目安
            </p>
          </Section>

          <Section title="今日の食事">
            <p className="nutrition-kcal">
              {num(s.meals_today.kcal)} / {num(s.meals_today.kcal_target)} kcal
            </p>
            <progress value={Math.min(s.meals_today.kcal, s.meals_today.kcal_target)} max={Math.max(s.meals_today.kcal_target, 1)} />
            <p className="nutrition-protein">
              タンパク質 {num(s.meals_today.protein_g)} / {num(s.meals_today.protein_target_g)} g
            </p>
            <progress value={Math.min(s.meals_today.protein_g, s.meals_today.protein_target_g)} max={Math.max(s.meals_today.protein_target_g, 1)} />
            {meals.data && meals.data.length === 0 && <p className="empty">まだ食事の記録はありません</p>}
            <ul className="meal-list">
              {meals.data?.map((m) => (
                <li key={m.id} className="meal-item">
                  <span className="meal-title">{m.title}</span>
                  <span className="meal-nutrition">
                    {m.kcal} kcal・P {num(m.protein_g)} g
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="今週の筋トレ">
            <p className="workout-count">
              {s.workouts_week.sessions} / {s.workouts_week.target} 回
            </p>
          </Section>

          <Section title="在庫のお知らせ">
            {s.pantry_low.count === 0 ? (
              <p className="empty">足りなくなりそうなものはありません</p>
            ) : (
              <ul className="low-list">
                {s.pantry_low.items.map((i) => (
                  <li key={i.id} className={`low-item low-item-${i.status}`}>
                    {i.name}
                    <span className="low-status">{i.status === "out" ? "切れています" : "残りわずか"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </main>
  );
}
