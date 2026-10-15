import { useState } from "react";
import { api } from "../api";
import { ErrorNotice, Field, Loading, NumberInput, Section } from "../components/common";
import { num, todayJst } from "../lib/format";
import { errorMessage, useLoad } from "../lib/useLoad";

function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

export function Workouts() {
  const today = todayJst();
  const list = useLoad(() => api.workouts(addDays(today, -30), today), [today]);
  const exercises = useLoad(() => api.exercises(), []);
  const [exercise, setExercise] = useState("");
  const [weight, setWeight] = useState<number | null>(null);
  const [reps, setReps] = useState<number | null>(null);
  const [sets, setSets] = useState<number | null>(null);
  const [doneAt, setDoneAt] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api.addWorkout({ exercise, weight_kg: weight, reps, sets, done_at: doneAt });
      setReps(null);
      setSets(null);
      list.reload();
      exercises.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page-workouts">
      <h1 className="page-title">筋トレ</h1>
      <Section title="記録を足す">
        {exercises.data && exercises.data.length > 0 && (
          <ul className="exercise-chips">
            {exercises.data.map((e) => (
              <li key={e.exercise}>
                <button type="button" className="exercise-chip" aria-pressed={exercise === e.exercise} onClick={() => setExercise(e.exercise)}>
                  {e.exercise}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="workout-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Field label="種目">
            <input value={exercise} onChange={(e) => setExercise(e.target.value)} required maxLength={60} />
          </Field>
          <Field label="重さ（kg）">
            <NumberInput value={weight} onChange={setWeight} />
          </Field>
          <Field label="回数">
            <NumberInput value={reps} onChange={setReps} step={1} />
          </Field>
          <Field label="セット数">
            <NumberInput value={sets} onChange={setSets} step={1} />
          </Field>
          <Field label="日付">
            <input type="date" value={doneAt} onChange={(e) => setDoneAt(e.target.value)} required />
          </Field>
          <ErrorNotice message={error} />
          <button type="submit" disabled={busy}>
            記録する
          </button>
        </form>
      </Section>
      <Section title="最近の記録">
        <ErrorNotice message={list.error ?? exercises.error} />
        {list.loading && !list.data && <Loading />}
        {list.data && list.data.length === 0 && <p className="empty">この30日間の記録はありません</p>}
        <ul className="workout-list">
          {list.data?.map((w) => (
            <li key={w.id} className="workout-item">
              <span className="workout-date">{w.done_at}</span>
              <span className="workout-exercise">{w.exercise}</span>
              <span className="workout-detail">
                {[w.weight_kg !== null ? `${num(w.weight_kg)}kg` : "", w.reps !== null ? `${w.reps}回` : "", w.sets !== null ? `${w.sets}セット` : ""].filter(Boolean).join(" ")}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`${w.done_at} の「${w.exercise}」を消しますか？`)) return;
                  try {
                    await api.deleteWorkout(w.id);
                    list.reload();
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                消す
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
