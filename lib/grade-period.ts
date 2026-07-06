export type GradePeriod = "previous" | "first" | "second";

export const GRADE_PERIOD_LABELS: Record<GradePeriod, string> = {
  previous: "이전 학년",
  first: "1차고사",
  second: "2차고사",
};

export const GRADE_PERIOD_OPTIONS: Array<{ value: GradePeriod; label: string }> = [
  { value: "previous", label: GRADE_PERIOD_LABELS.previous },
  { value: "first", label: GRADE_PERIOD_LABELS.first },
  { value: "second", label: GRADE_PERIOD_LABELS.second },
];

export const GRADE_PERIOD_ORDER: GradePeriod[] = ["previous", "first", "second"];

export function isGradePeriod(value: unknown): value is GradePeriod {
  return typeof value === "string" && GRADE_PERIOD_ORDER.includes(value as GradePeriod);
}

export function gradePeriodLabel(period: GradePeriod | null | undefined): string {
  return period ? GRADE_PERIOD_LABELS[period] : "-";
}
