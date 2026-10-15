import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// 画面は別担当が作る。ここはビルドが通る最小の雛形
function App() {
  return <h1>セツトレ</h1>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
