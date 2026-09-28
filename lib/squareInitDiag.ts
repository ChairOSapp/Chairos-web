// Temporary init diagnostics for the Square Web Payments SDK card form.
// Each init site tracks which step it reached; on failure the UI error
// text carries the step plus Square's own error detail so a screenshot
// is enough to identify the rejection. Remove the UI surfacing once the
// production card-form failure is resolved (keep the console logging).

export type SquareInitStep =
  | 'config-fetch'
  | 'sdk-import'
  | 'payments-init'
  | 'card-create'
  | 'card-attach';

export function describeSquareInitError(step: SquareInitStep, e: unknown): string {
  const err = e as any;
  const parts: string[] = [`step=${step}`];
  if (err?.name) parts.push(`name=${String(err.name).slice(0, 60)}`);
  parts.push(`message=${String(err?.message ?? err ?? 'unknown').slice(0, 220)}`);
  try {
    const arr = err?.errors;
    if (Array.isArray(arr) && arr.length) {
      parts.push(
        `sdk_errors=${JSON.stringify(
          arr.map((x: any) => ({ code: x?.code, detail: x?.detail, category: x?.category }))
        ).slice(0, 300)}`
      );
    }
  } catch {
    /* ignore serialization failures */
  }
  return parts.join(' | ');
}

/** Append the diagnostic to a user-facing message (temporary). */
export function withSquareDiagnostic(userMessage: string, step: SquareInitStep, e: unknown): string {
  return `${userMessage} [diag: ${describeSquareInitError(step, e)}]`;
}
