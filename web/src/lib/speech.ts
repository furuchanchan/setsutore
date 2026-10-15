import { useCallback, useEffect, useRef, useState } from "react";

// 標準の型定義に無いので、使う分だけ宣言する
type RecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "マイクの使用が許可されていません。設定で許可するか、文字で入力してください",
  "service-not-allowed": "この端末では音声入力が使えません。文字で入力してください",
  "no-speech": "声が聞こえませんでした",
  "audio-capture": "マイクが見つかりません",
  network: "音声認識の通信に失敗しました",
};

/**
 * 音声入力のフック。supported が false の端末では、画面側で文字入力だけを出す。
 * onText は認識の途中結果ごとに、いまの全文で呼ばれる（final が true で確定）。
 */
export function useSpeech(onText: (text: string, final: boolean) => void) {
  const supported = getCtor() !== undefined;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      let final = true;
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]!;
        text += r[0].transcript;
        if (!r.isFinal) final = false;
      }
      cb.current(text, final);
    };
    rec.onerror = (e) => setError(ERRORS[e.error] ?? `音声認識でエラーが起きました（${e.error}）`);
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    setError(null);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, error, start, stop };
}
