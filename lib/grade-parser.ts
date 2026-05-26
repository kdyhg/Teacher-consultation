export type SubjectStatus = "strength" | "steady" | "watch" | "missing";
export type FiveGrade = 1 | 2 | 3 | 4 | 5;

export type Attendance = {
  schoolDays: number | null;
  absences: { illness: number; unauthorized: number; other: number };
  lates: { illness: number; unauthorized: number; other: number };
  earlyLeaves: { illness: number; unauthorized: number; other: number };
  results: { illness: number; unauthorized: number; other: number };
  note: string | null;
};

export type GradeDistribution = Record<FiveGrade, number>;

export type SubjectScore = {
  subject: string;
  category: string;
  examName: string;
  fullScore: number | null;
  score: number | null;
  totalScore: number | null;
  rawScore: number | null;
  achievement: string | null;
  rank: number | null;
  rankTieCount: number | null;
  midRank: number | null;
  rankLabel: string | null;
  participants: number | null;
  subjectAverage: number | null;
  value: number | null;
  deltaFromAverage: number | null;
  percentile: number | null;
  fiveGrade: FiveGrade | null;
  fiveGradeLabel: string | null;
  status: SubjectStatus;
};

export type StudentReport = {
  id: string;
  name: string;
  year: string | null;
  semester: string | null;
  track: string | null;
  grade: string | null;
  examName: string | null;
  classNumber: string | null;
  studentNumber: string | null;
  homeroomTeacher: string | null;
  sourceRows: { start: number; end: number };
  subjects: SubjectScore[];
  attendance: Attendance | null;
  averageScore: number | null;
  averageDelta: number | null;
  averageFiveGrade: number | null;
  strengthCount: number;
  watchCount: number;
  highGradeCount: number;
  lowGradeCount: number;
  gradeDistribution: GradeDistribution;
  overallStatus: "growth" | "steady" | "support" | "missing";
  strongestSubject: SubjectScore | null;
  focusSubject: SubjectScore | null;
};

export type SubjectSummary = {
  subject: string;
  count: number;
  averageScore: number | null;
  schoolAverage: number | null;
  gap: number | null;
  averageFiveGrade: number | null;
  gradeDistribution: GradeDistribution;
  watchCount: number;
  strengthCount: number;
  minScore: number | null;
  maxScore: number | null;
};

export type ClassSummary = {
  studentCount: number;
  subjectCount: number;
  classAverage: number | null;
  averageGap: number | null;
  averageFiveGrade: number | null;
  gradeDistribution: GradeDistribution;
  supportCount: number;
  missingScoreCount: number;
  subjectSummaries: SubjectSummary[];
  topSubjects: SubjectSummary[];
  focusSubjects: SubjectSummary[];
};

const TITLE = "성적 통지표";

export const FIVE_GRADE_BANDS: Array<{ grade: FiveGrade; maxPercentile: number; label: string }> = [
  { grade: 1, maxPercentile: 10, label: "1등급(상위 10% 이내)" },
  { grade: 2, maxPercentile: 34, label: "2등급(상위 34% 이내)" },
  { grade: 3, maxPercentile: 66, label: "3등급(상위 66% 이내)" },
  { grade: 4, maxPercentile: 90, label: "4등급(상위 90% 이내)" },
  { grade: 5, maxPercentile: 100, label: "5등급(상위 90% 초과)" },
];

function emptyDistribution(): GradeDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function rowText(row: unknown[]): string {
  return row.map(cellText).filter(Boolean).join(" | ");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  const parsed = Number(cleaned[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRank(value: unknown): { rank: number | null; tieCount: number | null; label: string | null } {
  const label = cellText(value) || null;
  const rank = parseNumber(value);
  const tieMatch = label?.match(/\((\d+)\)/);
  const tieCount = tieMatch ? Number(tieMatch[1]) : null;
  return { rank, tieCount: Number.isFinite(tieCount) ? tieCount : null, label };
}

function round1(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return round1(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function fiveGradeForPercentile(percentile: number | null): FiveGrade | null {
  if (percentile === null) return null;
  return FIVE_GRADE_BANDS.find((band) => percentile <= band.maxPercentile)?.grade ?? 5;
}

export function fiveGradeLabel(grade: FiveGrade | number | null): string {
  if (grade === null || grade === undefined || !Number.isFinite(grade)) return "-";
  const rounded = Math.round(grade);
  if (rounded < 1 || rounded > 5) return "-";
  return `${rounded}등급`;
}

function fiveGradeBandLabel(grade: FiveGrade | null): string | null {
  if (!grade) return null;
  return FIVE_GRADE_BANDS.find((band) => band.grade === grade)?.label ?? `${grade}등급`;
}

function statusFor(value: number | null, delta: number | null, fiveGrade: FiveGrade | null): SubjectStatus {
  if (value === null) return "missing";
  if ((delta !== null && delta >= 8) || (fiveGrade !== null && fiveGrade <= 2)) return "strength";
  if ((delta !== null && delta <= -8) || (fiveGrade !== null && fiveGrade >= 4)) return "watch";
  return "steady";
}

function parseMeta(block: unknown[][]) {
  const metaText = block.map(rowText).find((text) => text.includes("학년도") && text.includes("학기")) ?? "";
  const meta = metaText.match(
    /(\d{4})학년도\s+(.+?)\s+(.+?)\s+(\d+)학년\s+(.+?)\s+(\d+)반\s+(\d+)번/,
  );

  if (!meta) {
    return {
      year: null,
      semester: null,
      track: null,
      grade: null,
      examName: null,
      classNumber: null,
      studentNumber: null,
    };
  }

  return {
    year: meta[1],
    semester: meta[2].trim(),
    track: meta[3].trim(),
    grade: meta[4],
    examName: meta[5].trim(),
    classNumber: meta[6],
    studentNumber: meta[7],
  };
}

function parseName(block: unknown[][]): string {
  for (const row of block.slice(0, 10)) {
    const text = rowText(row);
    const match = text.match(/성명\s*:\s*([^|]+?)(?:\s*담임|\s*\||$)/);
    if (match?.[1]) return match[1].trim();
  }
  return "이름 미상";
}

function parseTeacher(block: unknown[][]): string | null {
  const text = block.slice(0, 10).map(rowText).join(" | ");
  const match = text.match(/담임교사\s*\(\s*([^)]+?)\s*\)/);
  return match?.[1]?.trim() ?? null;
}

function parseAttendance(block: unknown[][]): Attendance | null {
  const titleIndex = block.findIndex((row) => rowText(row).includes("출석상황"));
  if (titleIndex < 0) return null;

  for (let offset = titleIndex + 1; offset < Math.min(block.length, titleIndex + 8); offset += 1) {
    const row = block[offset];
    if (parseNumber(row?.[0]) !== null) {
      return {
        schoolDays: parseNumber(row[0]),
        absences: {
          illness: parseNumber(row[1]) ?? 0,
          unauthorized: parseNumber(row[2]) ?? 0,
          other: parseNumber(row[3]) ?? 0,
        },
        lates: {
          illness: parseNumber(row[4]) ?? 0,
          unauthorized: parseNumber(row[5]) ?? 0,
          other: parseNumber(row[6]) ?? 0,
        },
        earlyLeaves: {
          illness: parseNumber(row[7]) ?? 0,
          unauthorized: parseNumber(row[8]) ?? 0,
          other: parseNumber(row[9]) ?? 0,
        },
        results: {
          illness: parseNumber(row[10]) ?? 0,
          unauthorized: parseNumber(row[11]) ?? 0,
          other: parseNumber(row[12]) ?? 0,
        },
        note: cellText(row[13]) || null,
      };
    }
  }

  return null;
}

function parseSubject(row: unknown[]): SubjectScore | null {
  const subject = cellText(row[0]);
  const category = cellText(row[1]);

  if (!subject || subject.includes("조회된 데이터") || !["지필", "수행"].some((type) => category.includes(type))) {
    return null;
  }

  const fullScore = parseNumber(row[3]);
  const score = parseNumber(row[4]);
  const totalScore = parseNumber(row[5]);
  const rawScore = parseNumber(row[6]);
  const subjectAverage = parseNumber(row[12]);
  const value = rawScore ?? totalScore ?? score;
  const deltaFromAverage = value !== null && subjectAverage !== null ? round1(value - subjectAverage) : null;
  const { rank, tieCount, label } = parseRank(row[10]);
  const participants = parseNumber(row[11]);
  const midRank = rank !== null ? round1(rank + ((tieCount ?? 1) - 1) / 2) : null;
  const percentile = midRank !== null && participants ? round1((midRank / participants) * 100) : null;
  const fiveGrade = fiveGradeForPercentile(percentile);

  return {
    subject,
    category,
    examName: cellText(row[2]),
    fullScore,
    score,
    totalScore,
    rawScore,
    achievement: cellText(row[7]) || null,
    rank,
    rankTieCount: tieCount,
    midRank,
    rankLabel: label,
    participants,
    subjectAverage,
    value,
    deltaFromAverage,
    percentile,
    fiveGrade,
    fiveGradeLabel: fiveGradeBandLabel(fiveGrade),
    status: statusFor(value, deltaFromAverage, fiveGrade),
  };
}

function compareByGradeThenDelta(a: SubjectScore, b: SubjectScore): number {
  const leftGrade = a.fiveGrade ?? 9;
  const rightGrade = b.fiveGrade ?? 9;
  if (leftGrade !== rightGrade) return rightGrade - leftGrade;
  const leftDelta = a.deltaFromAverage ?? a.value ?? -Infinity;
  const rightDelta = b.deltaFromAverage ?? b.value ?? -Infinity;
  return leftDelta - rightDelta;
}

function enrichStudent(
  report: Omit<
    StudentReport,
    | "averageScore"
    | "averageDelta"
    | "averageFiveGrade"
    | "strengthCount"
    | "watchCount"
    | "highGradeCount"
    | "lowGradeCount"
    | "gradeDistribution"
    | "overallStatus"
    | "strongestSubject"
    | "focusSubject"
  >,
): StudentReport {
  const subjectsWithValues = report.subjects.filter((subject) => subject.value !== null);
  const averageScore = mean(subjectsWithValues.map((subject) => subject.value));
  const averageDelta = mean(subjectsWithValues.map((subject) => subject.deltaFromAverage));
  const averageFiveGrade = mean(report.subjects.map((subject) => subject.fiveGrade));
  const strengthCount = report.subjects.filter((subject) => subject.status === "strength").length;
  const watchCount = report.subjects.filter((subject) => subject.status === "watch").length;
  const highGradeCount = report.subjects.filter((subject) => subject.fiveGrade !== null && subject.fiveGrade <= 2).length;
  const lowGradeCount = report.subjects.filter((subject) => subject.fiveGrade !== null && subject.fiveGrade >= 4).length;
  const gradeDistribution = emptyDistribution();
  report.subjects.forEach((subject) => {
    if (subject.fiveGrade) gradeDistribution[subject.fiveGrade] += 1;
  });
  const strongestSubject = subjectsWithValues.length ? [...subjectsWithValues].sort(compareByGradeThenDelta).at(-1) ?? null : null;
  const focusSubject = subjectsWithValues.length ? [...subjectsWithValues].sort(compareByGradeThenDelta)[0] ?? null : null;
  let overallStatus: StudentReport["overallStatus"] = "steady";

  if (!subjectsWithValues.length) overallStatus = "missing";
  else if ((averageDelta !== null && averageDelta >= 5) || highGradeCount >= Math.max(2, lowGradeCount + 1)) overallStatus = "growth";
  else if ((averageDelta !== null && averageDelta <= -8) || lowGradeCount >= Math.ceil(subjectsWithValues.length / 2)) overallStatus = "support";

  return {
    ...report,
    averageScore,
    averageDelta,
    averageFiveGrade,
    strengthCount,
    watchCount,
    highGradeCount,
    lowGradeCount,
    gradeDistribution,
    overallStatus,
    strongestSubject,
    focusSubject,
  };
}

export function parseNeisRows(rows: unknown[][]): StudentReport[] {
  const titleStarts = rows
    .map((row, index) => ({ text: rowText(row), index }))
    .filter(({ text }) => text.includes(TITLE))
    .map(({ index }) => index);

  return titleStarts
    .map((start, order) => {
      const end = titleStarts[order + 1] ?? rows.length;
      const block = rows.slice(start, end);
      const hasName = block.slice(0, 10).some((row) => /성명\s*:/.test(rowText(row)));
      if (!hasName) return null;

      const meta = parseMeta(block);
      const name = parseName(block);
      const subjects = block.map(parseSubject).filter((subject): subject is SubjectScore => subject !== null);
      const id = [meta.classNumber, meta.studentNumber, name, start].filter(Boolean).join("-");

      return enrichStudent({
        id,
        name,
        ...meta,
        homeroomTeacher: parseTeacher(block),
        sourceRows: { start: start + 1, end },
        subjects,
        attendance: parseAttendance(block),
      });
    })
    .filter((report): report is StudentReport => report !== null);
}

export function summarizeClass(reports: StudentReport[]): ClassSummary {
  const subjectMap = new Map<string, SubjectScore[]>();
  const gradeDistribution = emptyDistribution();

  for (const report of reports) {
    for (const subject of report.subjects) {
      if (!subjectMap.has(subject.subject)) subjectMap.set(subject.subject, []);
      subjectMap.get(subject.subject)?.push(subject);
      if (subject.fiveGrade) gradeDistribution[subject.fiveGrade] += 1;
    }
  }

  const subjectSummaries = [...subjectMap.entries()]
    .map(([subject, scores]) => {
      const values = scores.map((score) => score.value);
      const averageScore = mean(values);
      const schoolAverage = mean(scores.map((score) => score.subjectAverage));
      const gap = averageScore !== null && schoolAverage !== null ? round1(averageScore - schoolAverage) : null;
      const numericValues = values.filter((value): value is number => typeof value === "number");
      const subjectDistribution = emptyDistribution();
      scores.forEach((score) => {
        if (score.fiveGrade) subjectDistribution[score.fiveGrade] += 1;
      });

      return {
        subject,
        count: scores.length,
        averageScore,
        schoolAverage,
        gap,
        averageFiveGrade: mean(scores.map((score) => score.fiveGrade)),
        gradeDistribution: subjectDistribution,
        watchCount: scores.filter((score) => score.status === "watch").length,
        strengthCount: scores.filter((score) => score.status === "strength").length,
        minScore: numericValues.length ? Math.min(...numericValues) : null,
        maxScore: numericValues.length ? Math.max(...numericValues) : null,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject, "ko"));

  const byGap = (a: SubjectSummary, b: SubjectSummary) => (a.gap ?? 0) - (b.gap ?? 0);

  return {
    studentCount: reports.length,
    subjectCount: subjectSummaries.length,
    classAverage: mean(reports.map((report) => report.averageScore)),
    averageGap: mean(reports.map((report) => report.averageDelta)),
    averageFiveGrade: mean(reports.map((report) => report.averageFiveGrade)),
    gradeDistribution,
    supportCount: reports.filter((report) => report.overallStatus === "support").length,
    missingScoreCount: reports.filter((report) => report.overallStatus === "missing").length,
    subjectSummaries,
    topSubjects: [...subjectSummaries].filter((subject) => subject.gap !== null).sort(byGap).slice(-3).reverse(),
    focusSubjects: [...subjectSummaries].filter((subject) => subject.gap !== null).sort(byGap).slice(0, 3),
  };
}

export function formatSigned(value: number | null): string {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export function formatPercentile(value: number | null): string {
  if (value === null) return "-";
  return `상위 ${value.toFixed(1)}%`;
}
