import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { UNAUTHORIZED_EVENT } from "./api";
import { History } from "./pages/History";
import { Login } from "./pages/Login";
import { Meals } from "./pages/Meals";
import { Pantry } from "./pages/Pantry";
import { Receipts } from "./pages/Receipts";
import { Settings } from "./pages/Settings";
import { Talk } from "./pages/Talk";
import { Today } from "./pages/Today";
import { Workouts } from "./pages/Workouts";

const NAV: [string, string][] = [
  ["/", "きょう"],
  ["/pantry", "在庫"],
  ["/talk", "話す"],
  ["/receipts", "レシート"],
  ["/meals", "ごはん"],
  ["/workouts", "筋トレ"],
  ["/history", "記録"],
  ["/settings", "設定"],
];

export function App() {
  // 最初はログイン済みとみなし、API が 401 を返したらログイン画面へ切り替える
  const [authed, setAuthed] = useState(true);
  const [location] = useLocation();

  useEffect(() => {
    const onUnauthorized = () => setAuthed(false);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;

  return (
    <div className="app">
      <nav className="app-nav" aria-label="メニュー">
        <ul>
          {NAV.map(([href, label]) => (
            <li key={href}>
              <Link href={href} aria-current={location === href ? "page" : undefined}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Switch>
        <Route path="/" component={Today} />
        <Route path="/pantry" component={Pantry} />
        <Route path="/talk" component={Talk} />
        <Route path="/receipts" component={Receipts} />
        <Route path="/meals" component={Meals} />
        <Route path="/workouts" component={Workouts} />
        <Route path="/history" component={History} />
        <Route path="/settings">{() => <Settings onLoggedOut={() => setAuthed(false)} />}</Route>
        <Route>
          <main className="page">
            <h1 className="page-title">ページが見つかりません</h1>
          </main>
        </Route>
      </Switch>
    </div>
  );
}
