import { THINKING_TEXT } from '../lib/geminiErrors';

/** Indicador enquanto o Gemini responde (pode levar até ~1 minuto). */
export function Thinking() {
  return (
    <p className="thinking" role="status" aria-live="polite">
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {THINKING_TEXT}
    </p>
  );
}
