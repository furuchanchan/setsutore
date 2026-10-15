import { useRef, type ChangeEvent, type ReactNode } from "react";
import { toNumber } from "../lib/format";

export function Loading() {
  return <p className="status-loading">読み込み中…</p>;
}

export function ErrorNotice({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="status-error" role="alert">
      {message}
    </p>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  step,
  min = 0,
  required,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number | "any";
  min?: number;
  required?: boolean;
}) {
  return (
    <input
      className="number-input"
      type="number"
      inputMode="decimal"
      min={min}
      step={step ?? "any"}
      required={required}
      value={value ?? ""}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(toNumber(e.target.value))}
    />
  );
}

/** カメラを起動する（対応していない端末では写真の選択になる） */
export function PhotoPicker({ label, disabled, onPick }: { label: string; disabled?: boolean; onPick: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="photo-picker">
      <span className="photo-picker-label">{label}</span>
      <input
        ref={ref}
        className="photo-picker-input"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          if (ref.current) ref.current.value = "";
        }}
      />
    </label>
  );
}
