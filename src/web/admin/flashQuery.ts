// Builds the "flash=...&flashKind=..." query-string suffix used by every
// admin route's post-action redirect, so severity (error/warning vs. the
// default success styling) is easy to attach without repeating encodeURIComponent
// calls at every call site.
export function flashQuery(message: string, kind?: "error" | "warning"): string {
  const base = `flash=${encodeURIComponent(message)}`;
  return kind ? `${base}&flashKind=${kind}` : base;
}

export function parseFlashKind(value: unknown): "error" | "warning" | undefined {
  return value === "error" || value === "warning" ? value : undefined;
}
