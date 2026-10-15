import { useState } from "react";
import { api } from "../api";
import { ErrorNotice, Field } from "../components/common";
import { errorMessage } from "../lib/useLoad";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="page page-login">
      <h1 className="page-title">セツトレ</h1>
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.login(passcode);
            onLoggedIn();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="合言葉">
          <input type="password" autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} required />
        </Field>
        <ErrorNotice message={error} />
        <button type="submit" disabled={busy}>
          ログイン
        </button>
      </form>
    </main>
  );
}
