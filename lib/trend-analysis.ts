import { GRADE_PERIOD_LABELS, GRADE_PERIOD_ORDER, type GradePeriod } from "@/lib/grade-period";

type TrendInputRecord = {
  period?: GradePeriod;
  subject: string;
  group?: string;
  category?: string;
  credits?: number | null;
  score?: number | null;
  value?: number | null;
  subjectAverage?: number | null;
  deltaFromAverage?: number | null;
  grade5?: number | null;
  fiveGrade?: number | null;
  percentile?: number | null;
};

export type TrendStatus = "growth" | "decline" | "steady" | "insufficient";

export type PeriodTrendMetric = {
  period: GradePeriod;
  label: string;
  subjectCount: number;
  averageScore: number | null;
  averageDelta: number | null;
  averageFiveGrade: number | null;
  averagePercentile: number | null;
};

export type GroupTrend = {
  group: string;
  points: Partial<Record<GradePeriod, PeriodTrendMetric>>;
  latestPeriod: GradePeriod | null;
  baselinePeriod: GradePeriod | null;
  scoreChange: number | null;
  deltaChange: number | null;
  gradeChange: number | null;
  status: TrendStatus;
  summary: string;
  advice: string;
};

export type StudentTrend = {
  periods: GradePeriod[];
  groupTrends: GroupTrend[];
  strongestGrowth: GroupTrend | null;
  needsAttention: GroupTrend | null;
  hasComparison: boolean;
  summary: string[];
  studyAdvice: string[];
};

export type ClassTrendSummary = GroupTrend & {
  studentCount: number;
};

function round(value: number | null | undefined, digits = 1): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return round(valid.reduce((sum, value) => sum + value, 0) / valid.length, 2);
}

function weightedMean(items: Array<{ value: number | null | undefined; weight: number | null | undefined }>): number | null {
  let total = 0;
  let weight = 0;
  for (const item of items) {
    if (item.value === null || item.value === undefined || !Number.isFinite(item.value)) continue;
    const safeWeight = item.weight && Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
    total += item.value * safeWeight;
    weight += safeWeight;
  }
  return weight ? round(total / weight, 2) : null;
}

function recordPeriod(record: { period?: GradePeriod }): GradePeriod {
  return record.period ?? "second";
}

function periodRank(period: GradePeriod): number {
  return GRADE_PERIOD_ORDER.indexOf(period);
}

function recordGroup(record: TrendInputRecord): string {
  return record.group ?? record.category ?? "기타";
}

function recordScore(record: TrendInputRecord): number | null {
  return record.score ?? record.value ?? null;
}

function recordDelta(record: TrendInputRecord): number | null {
  if (record.deltaFromAverage !== null && record.deltaFromAverage !== undefined) return record.deltaFromAverage;
  const score = recordScore(record);
  return score !== null && record.subjectAverage !== null && record.subjectAverage !== undefined
    ? round(score - record.subjectAverage, 2)
    : null;
}

function recordFiveGrade(record: TrendInputRecord): number | null {
  return record.grade5 ?? record.fiveGrade ?? null;
}

export function latestPeriodForRecords(records: Array<{ period?: GradePeriod }>): GradePeriod | null {
  if (!records.length) return null;
  return records
    .map(recordPeriod)
    .sort((left, right) => periodRank(right) - periodRank(left))[0] ?? null;
}

export function currentRecordsForPeriod<T extends { period?: GradePeriod }>(records: T[]): T[] {
  const latestPeriod = latestPeriodForRecords(records);
  return latestPeriod ? records.filter((record) => recordPeriod(record) === latestPeriod) : records;
}

function metricForPeriod(period: GradePeriod, records: TrendInputRecord[]): PeriodTrendMetric {
  return {
    period,
    label: GRADE_PERIOD_LABELS[period],
    subjectCount: records.length,
    averageScore: mean(records.map(recordScore)),
    averageDelta: mean(records.map(recordDelta)),
    averageFiveGrade: weightedMean(records.map((record) => ({ value: recordFiveGrade(record), weight: record.credits ?? 1 }))),
    averagePercentile: mean(records.map((record) => record.percentile)),
  };
}

function changeBetween(latest: number | null | undefined, baseline: number | null | undefined): number | null {
  if (latest === null || latest === undefined || baseline === null || baseline === undefined) return null;
  return round(latest - baseline, 2);
}

function decideStatus(scoreChange: number | null, deltaChange: number | null, gradeChange: number | null): TrendStatus {
  if (scoreChange === null && deltaChange === null && gradeChange === null) return "insufficient";
  if ((gradeChange !== null && gradeChange <= -0.3) || (deltaChange !== null && deltaChange >= 3) || (scoreChange !== null && scoreChange >= 5)) {
    return "growth";
  }
  if ((gradeChange !== null && gradeChange >= 0.3) || (deltaChange !== null && deltaChange <= -3) || (scoreChange !== null && scoreChange <= -5)) {
    return "decline";
  }
  return "steady";
}

function signed(value: number | null, unit = ""): string {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${unit}`;
}

function buildSummary(group: string, baseline: PeriodTrendMetric | null, latest: PeriodTrendMetric | null, status: TrendStatus, gradeChange: number | null, deltaChange: number | null): string {
  if (!baseline || !latest) return `${group}은 비교 가능한 시점 자료가 더 필요합니다.`;
  const direction = status === "growth" ? "좋아졌습니다" : status === "decline" ? "하락했습니다" : "큰 변화 없이 유지되고 있습니다";
  const gradeText = gradeChange !== null ? `5등급 평균 ${signed(gradeChange)}` : "5등급 평균 변화 자료 부족";
  const deltaText = deltaChange !== null ? `평균 대비 ${signed(deltaChange, "점")}` : "평균 대비 변화 자료 부족";
  return `${group}: ${baseline.label} → ${latest.label} 흐름에서 ${direction}. ${gradeText}, ${deltaText}`;
}

function buildAdvice(group: string, status: TrendStatus): string {
  if (status === "growth") {
    return `${group}은 최근 좋아진 준비 방식을 다른 교과군으로 옮겨 보는 것이 좋습니다. 효과가 있었던 복습 시간, 문제 풀이 순서, 오답 정리 방식을 학생이 직접 설명하게 해 주세요.`;
  }
  if (status === "decline") {
    return `${group}은 다음 평가 전 우선 점검 교과군으로 두고, 오답을 개념 부족·조건 해석·시간 배분으로 나눈 뒤 매일 10분 단위의 짧은 복습 루틴을 정하는 것이 좋습니다.`;
  }
  if (status === "steady") {
    return `${group}은 현재 흐름을 유지하되, 같은 점수대에서 반복되는 실수를 1~2개만 골라 다음 평가 전까지 줄이는 방식이 좋습니다.`;
  }
  return `${group}은 비교 자료가 부족하므로 현재 시점의 평균 대비 차이와 오답 유형을 먼저 확인해 주세요.`;
}

function buildGroupTrend(group: string, records: TrendInputRecord[]): GroupTrend {
  const periodEntries = GRADE_PERIOD_ORDER
    .map((period) => [period, records.filter((record) => recordPeriod(record) === period)] as const)
    .filter(([, periodRecords]) => periodRecords.length > 0);
  const points = Object.fromEntries(periodEntries.map(([period, periodRecords]) => [period, metricForPeriod(period, periodRecords)])) as Partial<Record<GradePeriod, PeriodTrendMetric>>;
  const periods = periodEntries.map(([period]) => period).sort((left, right) => periodRank(left) - periodRank(right));
  const latestPeriod = periods.at(-1) ?? null;
  const baselinePeriod = periods.length >= 2 ? periods[0] : null;
  const latest = latestPeriod ? points[latestPeriod] ?? null : null;
  const baseline = baselinePeriod ? points[baselinePeriod] ?? null : null;
  const scoreChange = latest && baseline ? changeBetween(latest.averageScore, baseline.averageScore) : null;
  const deltaChange = latest && baseline ? changeBetween(latest.averageDelta, baseline.averageDelta) : null;
  const gradeChange = latest && baseline ? changeBetween(latest.averageFiveGrade, baseline.averageFiveGrade) : null;
  const status = baseline && latest ? decideStatus(scoreChange, deltaChange, gradeChange) : "insufficient";

  return {
    group,
    points,
    latestPeriod,
    baselinePeriod,
    scoreChange,
    deltaChange,
    gradeChange,
    status,
    summary: buildSummary(group, baseline, latest, status, gradeChange, deltaChange),
    advice: buildAdvice(group, status),
  };
}

function compareGrowth(left: GroupTrend, right: GroupTrend): number {
  const leftSignal = (left.gradeChange !== null ? -left.gradeChange * 10 : 0) + (left.deltaChange ?? 0) + ((left.scoreChange ?? 0) / 2);
  const rightSignal = (right.gradeChange !== null ? -right.gradeChange * 10 : 0) + (right.deltaChange ?? 0) + ((right.scoreChange ?? 0) / 2);
  return rightSignal - leftSignal;
}

function compareConcern(left: GroupTrend, right: GroupTrend): number {
  const leftSignal = (left.gradeChange !== null ? left.gradeChange * 10 : 0) - (left.deltaChange ?? 0) - ((left.scoreChange ?? 0) / 2);
  const rightSignal = (right.gradeChange !== null ? right.gradeChange * 10 : 0) - (right.deltaChange ?? 0) - ((right.scoreChange ?? 0) / 2);
  return rightSignal - leftSignal;
}

export function buildStudentTrend(records: TrendInputRecord[]): StudentTrend | null {
  if (!records.length) return null;

  const periods = [...new Set(records.map(recordPeriod))].sort((left, right) => periodRank(left) - periodRank(right));
  const groupTrends = [...new Set(records.map(recordGroup))]
    .map((group) => buildGroupTrend(group, records.filter((record) => recordGroup(record) === group)))
    .sort((left, right) => left.group.localeCompare(right.group, "ko"));
  const comparable = groupTrends.filter((trend) => trend.status !== "insufficient");
  const growths = comparable.filter((trend) => trend.status === "growth").sort(compareGrowth);
  const declines = comparable.filter((trend) => trend.status === "decline").sort(compareConcern);
  const strongestGrowth = growths[0] ?? null;
  const needsAttention = declines[0] ?? comparable.sort(compareConcern)[0] ?? null;
  const hasComparison = periods.length >= 2 && comparable.length > 0;

  const summary = hasComparison
    ? [
        strongestGrowth ? `가장 좋아진 교과군은 ${strongestGrowth.group}입니다. ${strongestGrowth.summary}` : "뚜렷한 상승 교과군은 아직 보이지 않습니다.",
        needsAttention ? `점검이 필요한 교과군은 ${needsAttention.group}입니다. ${needsAttention.summary}` : "큰 하락 교과군은 확인되지 않습니다.",
      ]
    : ["비교 가능한 성적 시점이 부족합니다. 이전 학년, 1차고사, 2차고사 중 2개 이상을 함께 넣으면 변화 흐름이 생성됩니다."];
  const studyAdvice = [
    ...(needsAttention ? [needsAttention.advice] : []),
    ...(strongestGrowth && strongestGrowth.group !== needsAttention?.group ? [strongestGrowth.advice] : []),
  ];

  return {
    periods,
    groupTrends,
    strongestGrowth,
    needsAttention,
    hasComparison,
    summary,
    studyAdvice: studyAdvice.length ? studyAdvice : ["현재 가장 낮은 교과군의 오답 원인을 먼저 나누고, 다음 평가 전 확인 가능한 작은 실천 항목을 정해 주세요."],
  };
}

export function buildClassTrendSummaries(students: Array<{ records: TrendInputRecord[] }>): ClassTrendSummary[] {
  const groups = new Map<string, { records: TrendInputRecord[]; studentIndexes: Set<number> }>();

  students.forEach((student, studentIndex) => {
    for (const record of student.records) {
      const group = recordGroup(record);
      if (!groups.has(group)) groups.set(group, { records: [], studentIndexes: new Set() });
      const entry = groups.get(group);
      if (!entry) continue;
      entry.records.push(record);
      entry.studentIndexes.add(studentIndex);
    }
  });

  return [...groups.entries()]
    .map(([group, entry]) => ({
      ...buildGroupTrend(group, entry.records),
      studentCount: entry.studentIndexes.size,
    }))
    .sort((left, right) => {
      const statusOrder: Record<TrendStatus, number> = { decline: 0, growth: 1, steady: 2, insufficient: 3 };
      const statusDiff = statusOrder[left.status] - statusOrder[right.status];
      return statusDiff || left.group.localeCompare(right.group, "ko");
    });
}
