import { useEffect, useRef, useState } from "react";
import { api, type Change, type ChatMessage } from "../api";
import { ErrorNotice, Loading } from "../components/common";
import { LEVEL_LABEL, num } from "../lib/format";
import { useSpeech } from "../lib/speech";
import { errorMessage, useLoad } from "../lib/useLoad";

type Snap = { quantity: number | null; unit: string | null; level: keyof typeof LEVEL_LABEL | null } | null;

function snapText(s: Snap): string {
  if (!s) return "なし";
  if (s.level) return LEVEL_LABEL[s.level];
  return s.quantity === null ? "数量なし" : `${num(s.quantity)}${s.unit ?? ""}`;
}

function changeText(c: Change): string {
  if (c.op === "log_workout") {
    const a = c.after as { weight_kg: number | null; reps: number | null; sets: number | null };
    const detail = [a.weight_kg !== null ? `${a.weight_kg}kg` : "", a.reps !== null ? `${a.reps}回` : "", a.sets !== null ? `${a.sets}セット` : ""]
      .filter(Boolean)
      .join(" ");
    return `筋トレを記録: ${c.name} ${detail}`.trim();
  }
  if (c.op === "remove_pantry") return `${c.name}: 在庫から消しました`;
  return `${c.name}: ${snapText(c.before as Snap)} → ${snapText(c.after as Snap)}`;
}

export function Talk() {
  const history = useLoad(() => api.talkMessages(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const speech = useSpeech((t) => setText(t));

  useEffect(() => {
    if (history.data) setMessages(history.data);
  }, [history.data]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, changes]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    speech.stop();
    setBusy(true);
    setError(null);
    try {
      const res = await api.talk(t);
      const now = new Date().toISOString();
      setMessages((m) => [
        ...m,
        { id: -Date.now(), role: "user", content: t, created_at: now },
        { id: -Date.now() - 1, role: "assistant", content: res.reply, created_at: now },
      ]);
      setChanges(res.changes);
      setText("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page-talk">
      <h1 className="page-title">話す</h1>
      {history.loading && !history.data && <Loading />}
      <ErrorNotice message={history.error} />
      <ul className="chat-log">
        {messages.map((m) => (
          <li key={m.id} className={`chat-message chat-message-${m.role}`}>
            {m.content}
          </li>
        ))}
      </ul>
      {changes && changes.length > 0 && (
        <section className="chat-changes">
          <h2 className="section-title">直したところ</h2>
          <ul className="change-list">
            {changes.map((c, i) => (
              <li key={i} className={`change-item change-item-${c.op}`}>
                {changeText(c)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div ref={bottom} />
      <ErrorNotice message={error ?? speech.error} />
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例: 卵あと3個、醤油もうすぐ切れそう"
          maxLength={1000}
          disabled={busy}
        />
        {speech.supported && (
          <button type="button" className="mic-button" aria-pressed={speech.listening} onClick={speech.listening ? speech.stop : speech.start} disabled={busy}>
            {speech.listening ? "止める" : "マイク"}
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()}>
          送る
        </button>
      </form>
    </main>
  );
}
