export type Period = "day" | "week" | "month" | "year" | "custom";

export function todayInBrazil(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export function periodRange(period: Exclude<Period, "custom">, reference: string) {
  const date = new Date(`${reference}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reference) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== reference) throw new Error("Escolha uma data válida.");
  const start = new Date(date), end = new Date(date);
  if (period === "week") {
    start.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    end.setTime(start.getTime()); end.setUTCDate(start.getUTCDate() + 6);
  } else if (period === "month") {
    start.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  } else if (period === "year") {
    start.setUTCMonth(0, 1); end.setUTCMonth(11, 31);
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function validateRange(start: string, end: string) {
  periodRange("day", start); periodRange("day", end);
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (days < 0 || days > 365) throw new Error("Escolha um período de até 366 dias, com fim igual ou posterior ao início.");
}
