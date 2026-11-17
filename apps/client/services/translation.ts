import { localRequest } from "./localService";

export function translatePracticeStep(text: string, context?: string) {
  return localRequest<{ chinese: string }>("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      ...(context ? { context } : {}),
      translationProvider: "index-translate",
    }),
  });
}
