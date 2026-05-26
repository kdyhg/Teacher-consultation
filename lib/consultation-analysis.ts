import {
  fiveGradeLabel,
  parseNeisRows,
  type FiveGrade,
  type GradeDistribution,
  type StudentReport,
  type SubjectScore,
  type SubjectStatus,
} from "@/lib/grade-parser";

export type SourceType = "notice" | "semester-summary" | "print-report";

export type ConsultationSubjectRecord = {
  sourceFile: string;
  subject: string;
  group: string;
  credits: number;
  score: number | null;
  subjectAverage: number | null;
  achievement: string | null;
  grade5: number | null;
  rank: number | null;
  rankLabel: string | null;
  participants: number | null;
  percentile: number | null;
  grade9: number | null;
};

export type ConsultationStudent = {
  id: string;
  name: string;
  grade: string | null;
  classNumber: string | null;
  studentNumber: string | null;
  sourceFiles: string[];
  records: ConsultationSubjectRecord[];
  weightedGrade5: number | null;
  weightedGrade9: number | null;
  averageScore: number | null;
  averageDelta: number | null;
  status: StudentReport["overallStatus"];
};

export type SubjectBrief = {
  subject: string;
  group: string;
  credits: number;
  count: number;
  averageScore: number | null;
  subjectAverage: number | null;
  averageGrade5: number | null;
  averageGrade9: number | null;
  strengthCount: number;
  watchCount: number;
};

export type GroupBrief = {
  group: string;
  count: number;
  averageGrade5: number | null;
  averageGrade9: number | null;
  subjects: string[];
};

export type ConsultationAnalysis = {
  files: string[];
  sourceTypes: SourceType[];
  students: ConsultationStudent[];
  subjects: SubjectBrief[];
  groups: GroupBrief[];
  studentCount: number;
  subjectCount: number;
  classAverageScore: number | null;
  classAverageGrade5: number | null;
  classAverageGrade9: number | null;
  gradeDistribution: GradeDistribution;
  nineGradeDistribution: Record<number, number>;
  hasRankData: boolean;
  warnings: string[];
};

export type ParsedWorkbook = {
  sourceFile: string;
  sourceType: SourceType;
  reports: StudentReport[];
  analysis: ConsultationAnalysis;
  warnings: string[];
};

export type MergedConsultationData = {
  reports: StudentReport[];
  analysis: ConsultationAnalysis;
  warnings: string[];
};

const SUBJECT_GROUPS: Array<{ group: string; keywords: string[] }> = [
  { group: "국어", keywords: ["국어", "화법", "독서", "문학", "언어", "작문", "매체"] },
  { group: "수학", keywords: ["수학", "대수", "미적분", "확률", "통계", "기하"] },
  { group: "영어", keywords: ["영어", "English"] },
  { group: "사회", keywords: ["사회", "역사", "지리", "윤리", "정치", "경제", "법", "세계사", "동아시아", "한국사", "시민"] },
  { group: "과학", keywords: ["과학", "물리", "화학", "생명", "지구", "탐구실험", "생물"] },
  { group: "예체능", keywords: ["체육", "음악", "미술", "예술"] },
  { group: "생활교양", keywords: ["정보", "기술", "가정", "보건", "진로", "한문", "외국어"] },
];

const GYEONGGI_REFERENCE = [
  [1.0, 1.39],
  [1.5, 2.31],
  [2.0, 3.16],
  [2.5, 3.95],
  [3.0, 4.75],
  [3.5, 5.47],
  [4.0, 6.25],
  [4.5, 6.94],
  [5.0, 8.97],
];

function emptyDistribution(): GradeDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function rowText(row: unknown[] | undefined): string {
  return (row ?? []).map(cellText).filter(Boolean).join(" | ");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellText(value).replace(/,/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellText(value).replace(/,/g, "");
  const parenMatches = [...text.matchAll(/\((\d+(?:\.\d+)?)\)/g)];
  const insideParentheses = parenMatches.at(-1)?.[1];
  if (insideParentheses) return Number(insideParentheses);
  return parseNumber(text);
}

function parseRank(value: unknown): { rank: number | null; label: string | null; tieCount: number | null } {
  const label = cellText(value) || null;
  const rank = parseNumber(value);
  const tie = label?.match(/\((\d+)\)/)?.[1];
  return {
    rank,
    label,
    tieCount: tie ? Number(tie) : null,
  };
}

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100;
}

function weightedMean(items: Array<{ value: number | null; weight: number }>): number | null {
  let total = 0;
  let weight = 0;
  for (const item of items) {
    if (item.value === null || !Number.isFinite(item.value)) continue;
    const safeWeight = Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
    total += item.value * safeWeight;
    weight += safeWeight;
  }
  return weight > 0 ? Math.round((total / weight) * 100) / 100 : null;
}

function subjectGroup(subject: string, provided?: string | null): string {
  const hinted = cellText(provided);
  if (hinted) {
    const matched = SUBJECT_GROUPS.find((entry) => hinted.includes(entry.group));
    if (matched) return matched.group;
  }

  const normalized = subject.replace(/\s+/g, "");
  return SUBJECT_GROUPS.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)))?.group ?? "기타";
}

function grade5FromPercentile(percentile: number | null): FiveGrade | null {
  if (percentile === null) return null;
  if (percentile <= 10) return 1;
  if (percentile <= 34) return 2;
  if (percentile <= 66) return 3;
  if (percentile <= 90) return 4;
  return 5;
}

function grade9FromPercentile(percentile: number | null): number | null {
  if (percentile === null) return null;
  if (percentile <= 4) return 1;
  if (percentile <= 11) return 2;
  if (percentile <= 23) return 3;
  if (percentile <= 40) return 4;
  if (percentile <= 60) return 5;
  if (percentile <= 77) return 6;
  if (percentile <= 89) return 7;
  if (percentile <= 96) return 8;
  return 9;
}

function estimateNineGradeFromFiveAverage(grade5: number | null): number | null {
  if (grade5 === null) return null;
  if (grade5 <= GYEONGGI_REFERENCE[0][0]) return GYEONGGI_REFERENCE[0][1];
  const last = GYEONGGI_REFERENCE.at(-1);
  if (!last || grade5 >= last[0]) return last?.[1] ?? null;

  for (let index = 1; index < GYEONGGI_REFERENCE.length; index += 1) {
    const [leftFive, leftNine] = GYEONGGI_REFERENCE[index - 1];
    const [rightFive, rightNine] = GYEONGGI_REFERENCE[index];
    if (grade5 <= rightFive) {
      const ratio = (grade5 - leftFive) / (rightFive - leftFive);
      return Math.round((leftNine + (rightNine - leftNine) * ratio) * 100) / 100;
    }
  }

  return null;
}

function statusForRecord(score: number | null, delta: number | null, grade5: number | null): SubjectStatus {
  if (score === null && grade5 === null) return "missing";
  if ((delta !== null && delta >= 8) || (grade5 !== null && grade5 <= 2)) return "strength";
  if ((delta !== null && delta <= -8) || (grade5 !== null && grade5 >= 4)) return "watch";
  return "steady";
}

function recordToSubjectScore(record: ConsultationSubjectRecord): SubjectScore {
  const delta = record.score !== null && record.subjectAverage !== null ? Math.round((record.score - record.subjectAverage) * 10) / 10 : null;
  const roundedGrade = record.grade5 !== null ? Math.round(record.grade5) : null;
  const fiveGrade = roundedGrade && roundedGrade >= 1 && roundedGrade <= 5 ? (roundedGrade as FiveGrade) : grade5FromPercentile(record.percentile);

  return {
    subject: record.subject,
    category: record.group,
    examName: record.sourceFile,
    fullScore: null,
    score: record.score,
    totalScore: record.score,
    rawScore: record.score,
    achievement: record.achievement,
    rank: record.rank,
    rankTieCount: null,
    midRank: record.rank,
    rankLabel: record.rankLabel,
    participants: record.participants,
    subjectAverage: record.subjectAverage,
    value: record.score,
    deltaFromAverage: delta,
    percentile: record.percentile,
    fiveGrade,
    fiveGradeLabel: fiveGrade ? fiveGradeLabel(fiveGrade) : null,
    status: statusForRecord(record.score, delta, fiveGrade),
  };
}

function buildReportFromStudent(student: ConsultationStudent): StudentReport {
  const subjects = student.records.map(recordToSubjectScore);
  const subjectsWithValues = subjects.filter((subject) => subject.value !== null);
  const gradeDistribution = emptyDistribution();
  for (const subject of subjects) {
    if (subject.fiveGrade) gradeDistribution[subject.fiveGrade] += 1;
  }

  const strengthCount = subjects.filter((subject) => subject.status === "strength").length;
  const watchCount = subjects.filter((subject) => subject.status === "watch").length;
  const highGradeCount = subjects.filter((subject) => subject.fiveGrade !== null && subject.fiveGrade <= 2).length;
  const lowGradeCount = subjects.filter((subject) => subject.fiveGrade !== null && subject.fiveGrade >= 4).length;
  const strongestSubject = subjectsWithValues
    .filter((subject) => subject.status === "strength" || subject.deltaFromAverage !== null)
    .sort((a, b) => (b.deltaFromAverage ?? -999) - (a.deltaFromAverage ?? -999))[0] ?? null;
  const focusSubject = subjectsWithValues
    .filter((subject) => subject.status === "watch" || subject.deltaFromAverage !== null)
    .sort((a, b) => (a.deltaFromAverage ?? 999) - (b.deltaFromAverage ?? 999))[0] ?? null;

  let overallStatus: StudentReport["overallStatus"] = "steady";
  if (!subjectsWithValues.length && student.weightedGrade5 === null) overallStatus = "missing";
  else if ((student.averageDelta !== null && student.averageDelta >= 5) || highGradeCount > lowGradeCount) overallStatus = "growth";
  else if ((student.averageDelta !== null && student.averageDelta <= -8) || lowGradeCount >= Math.max(2, highGradeCount + 1)) overallStatus = "support";

  return {
    id: student.id,
    name: student.name,
    year: null,
    semester: null,
    track: null,
    grade: student.grade,
    examName: student.sourceFiles.join(", "),
    classNumber: student.classNumber,
    studentNumber: student.studentNumber,
    homeroomTeacher: null,
    sourceRows: { start: 0, end: 0 },
    subjects,
    attendance: null,
    averageScore: student.averageScore,
    averageDelta: student.averageDelta,
    averageFiveGrade: student.weightedGrade5,
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

function normalizeStudent(student: Omit<ConsultationStudent, "weightedGrade5" | "weightedGrade9" | "averageScore" | "averageDelta" | "status">): ConsultationStudent {
  const weightedGrade5 = weightedMean(student.records.map((record) => ({ value: record.grade5, weight: record.credits })));
  const exactNineGrade = weightedMean(student.records.map((record) => ({ value: record.grade9, weight: record.credits })));
  const weightedGrade9 = exactNineGrade ?? estimateNineGradeFromFiveAverage(weightedGrade5);
  const averageScore = mean(student.records.map((record) => record.score));
  const averageDelta = mean(student.records.map((record) => (
    record.score !== null && record.subjectAverage !== null ? record.score - record.subjectAverage : null
  )));
  const report = buildReportFromStudent({
    ...student,
    weightedGrade5,
    weightedGrade9,
    averageScore,
    averageDelta,
    status: "steady",
  });

  return {
    ...student,
    weightedGrade5,
    weightedGrade9,
    averageScore,
    averageDelta,
    status: report.overallStatus,
  };
}

function analysisFromStudents(students: ConsultationStudent[], files: string[], sourceTypes: SourceType[], warnings: string[]): ConsultationAnalysis {
  const gradeDistribution = emptyDistribution();
  const nineGradeDistribution = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, 0])) as Record<number, number>;

  for (const student of students) {
    if (student.weightedGrade5 !== null) {
      const grade = Math.min(5, Math.max(1, Math.round(student.weightedGrade5))) as FiveGrade;
      gradeDistribution[grade] += 1;
    }
    if (student.weightedGrade9 !== null) {
      const grade = Math.min(9, Math.max(1, Math.round(student.weightedGrade9)));
      nineGradeDistribution[grade] += 1;
    }
  }

  const records = students.flatMap((student) => student.records);
  const subjectEntries = new Map<string, ConsultationSubjectRecord[]>();
  for (const record of records) {
    const key = `${record.group}::${record.subject}`;
    if (!subjectEntries.has(key)) subjectEntries.set(key, []);
    subjectEntries.get(key)?.push(record);
  }

  const subjects = [...subjectEntries.entries()]
    .map(([, subjectRecords]) => {
      const sample = subjectRecords[0];
      const deltas = subjectRecords.map((record) => (
        record.score !== null && record.subjectAverage !== null ? record.score - record.subjectAverage : null
      ));
      return {
        subject: sample.subject,
        group: sample.group,
        credits: sample.credits,
        count: subjectRecords.length,
        averageScore: mean(subjectRecords.map((record) => record.score)),
        subjectAverage: mean(subjectRecords.map((record) => record.subjectAverage)),
        averageGrade5: mean(subjectRecords.map((record) => record.grade5)),
        averageGrade9: mean(subjectRecords.map((record) => record.grade9)),
        strengthCount: subjectRecords.filter((record, index) => statusForRecord(record.score, deltas[index] ?? null, record.grade5) === "strength").length,
        watchCount: subjectRecords.filter((record, index) => statusForRecord(record.score, deltas[index] ?? null, record.grade5) === "watch").length,
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group, "ko") || a.subject.localeCompare(b.subject, "ko"));

  const groupEntries = new Map<string, ConsultationSubjectRecord[]>();
  for (const record of records) {
    if (!groupEntries.has(record.group)) groupEntries.set(record.group, []);
    groupEntries.get(record.group)?.push(record);
  }

  const groups = [...groupEntries.entries()]
    .map(([group, groupRecords]) => ({
      group,
      count: groupRecords.length,
      averageGrade5: mean(groupRecords.map((record) => record.grade5)),
      averageGrade9: mean(groupRecords.map((record) => record.grade9)),
      subjects: [...new Set(groupRecords.map((record) => record.subject))].sort((a, b) => a.localeCompare(b, "ko")),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, "ko"));

  return {
    files,
    sourceTypes: [...new Set(sourceTypes)],
    students,
    subjects,
    groups,
    studentCount: students.length,
    subjectCount: subjects.length,
    classAverageScore: mean(students.map((student) => student.averageScore)),
    classAverageGrade5: mean(students.map((student) => student.weightedGrade5)),
    classAverageGrade9: mean(students.map((student) => student.weightedGrade9)),
    gradeDistribution,
    nineGradeDistribution,
    hasRankData: records.some((record) => record.rank !== null && record.participants !== null),
    warnings,
  };
}

function buildStudentsFromReports(reports: StudentReport[], sourceFile: string): ConsultationStudent[] {
  return reports.map((report, index) => {
    const records = report.subjects.map((subject) => {
      const percentile = subject.percentile;
      const grade5 = subject.fiveGrade ?? grade5FromPercentile(percentile);
      return {
        sourceFile,
        subject: subject.subject,
        group: subjectGroup(subject.subject, subject.category),
        credits: 1,
        score: subject.value,
        subjectAverage: subject.subjectAverage,
        achievement: subject.achievement,
        grade5,
        rank: subject.rank,
        rankLabel: subject.rankLabel,
        participants: subject.participants,
        percentile,
        grade9: grade9FromPercentile(percentile),
      };
    });

    return normalizeStudent({
      id: report.id || `${sourceFile}-${index}`,
      name: report.name,
      grade: report.grade,
      classNumber: report.classNumber,
      studentNumber: report.studentNumber,
      sourceFiles: [sourceFile],
      records,
    });
  });
}

function isSemesterSummary(rows: unknown[][]): boolean {
  const subjectRow = rows[3] ?? [];
  return subjectRow.slice(3).some((cell) => /^.+\(\d+\)$/.test(cellText(cell)));
}

function isPrintReport(rows: unknown[][]): boolean {
  const header = rows[3] ?? [];
  const known = ["번호", "성명", "학년", "학기", "교과", "과목", "학점", "석차등급", "수강자수", "원점수"];
  const matches = header
    .slice(0, 24)
    .map((cell) => cellText(cell).replace(/\s+/g, ""))
    .filter((cell) => known.some((key) => cell.includes(key))).length;
  return matches >= 4;
}

function parseMetaFromInfo(info: string) {
  const grade = info.match(/(\d+)\s*학년/)?.[1] ?? null;
  const classNumber = info.match(/(\d+)\s*반/)?.[1] ?? null;
  return { grade, classNumber };
}

function parseDistribution(text: unknown): Record<string, number> {
  const distribution: Record<string, number> = {};
  const matches = cellText(text).match(/[ABCDE]\s*\(\s*\d+(?:\.\d+)?\s*\)/g) ?? [];
  for (const match of matches) {
    const parsed = match.match(/([ABCDE])\s*\(\s*(\d+(?:\.\d+)?)\s*\)/);
    if (parsed) distribution[parsed[1]] = Number(parsed[2]);
  }
  return distribution;
}

function parseSemesterSummary(rows: unknown[][], sourceFile: string): ConsultationStudent[] {
  const { grade, classNumber } = parseMetaFromInfo(rowText(rows[2]));
  const subjectRow = rows[3] ?? [];
  const averageRow = rows[4] ?? [];
  const distributionRow = rows[5] ?? [];
  const subjects = subjectRow
    .map((cell, columnIndex) => {
      if (columnIndex < 3) return null;
      const match = cellText(cell).match(/^(.+)\((\d+)\)$/);
      if (!match) return null;
      return {
        subject: match[1].trim(),
        credits: Number(match[2]),
        columnIndex,
        average: parseNumber(averageRow[columnIndex]),
        distribution: parseDistribution(distributionRow[columnIndex]),
      };
    })
    .filter((subject): subject is NonNullable<typeof subject> => subject !== null);

  const students: ConsultationStudent[] = [];
  for (let rowIndex = 6; rowIndex < rows.length; rowIndex += 5) {
    const scoreRow = rows[rowIndex] ?? [];
    const achievementRow = rows[rowIndex + 1] ?? [];
    const gradeRow = rows[rowIndex + 2] ?? [];
    const rankRow = rows[rowIndex + 3] ?? [];
    const participantRow = rows[rowIndex + 4] ?? [];
    const number = parseNumber(scoreRow[0]);
    if (number === null) continue;

    const name = cellText(scoreRow[1]) || `학생${number}`;
    const records = subjects.map((subject) => {
      const score = parseScore(scoreRow[subject.columnIndex]);
      const rank = parseRank(rankRow[subject.columnIndex]);
      const participants = parseNumber(participantRow[subject.columnIndex]);
      const percentile = rank.rank !== null && participants ? Math.round(((rank.rank / participants) * 100) * 10) / 10 : null;
      const grade5 = parseNumber(gradeRow[subject.columnIndex]) ?? grade5FromPercentile(percentile);
      return {
        sourceFile,
        subject: subject.subject,
        group: subjectGroup(subject.subject),
        credits: subject.credits || 1,
        score,
        subjectAverage: subject.average,
        achievement: cellText(achievementRow[subject.columnIndex]) || null,
        grade5,
        rank: rank.rank,
        rankLabel: rank.label,
        participants,
        percentile,
        grade9: grade9FromPercentile(percentile),
      };
    });

    students.push(normalizeStudent({
      id: `${sourceFile}-${grade ?? "g"}-${classNumber ?? "c"}-${number}-${name}`,
      name,
      grade,
      classNumber,
      studentNumber: String(number),
      sourceFiles: [sourceFile],
      records,
    }));
  }

  return students;
}

type ColumnMap = Partial<Record<"number" | "name" | "schoolYear" | "semester" | "subjectGroup" | "subject" | "credits" | "rawScore" | "subjectAverage" | "achievement" | "grade" | "participants" | "rank" | "distribution", number>>;

function buildPrintColumnMap(header: unknown[]): ColumnMap {
  const mappings: Array<{ field: keyof ColumnMap; keys: string[] }> = [
    { field: "number", keys: ["번호"] },
    { field: "name", keys: ["성명", "이름"] },
    { field: "schoolYear", keys: ["학년"] },
    { field: "semester", keys: ["학기"] },
    { field: "subjectGroup", keys: ["교과"] },
    { field: "subject", keys: ["과목명", "과목"] },
    { field: "credits", keys: ["학점", "단위수", "단위"] },
    { field: "rawScore", keys: ["원점수"] },
    { field: "subjectAverage", keys: ["과목평균", "평균"] },
    { field: "achievement", keys: ["성취도"] },
    { field: "grade", keys: ["석차등급"] },
    { field: "participants", keys: ["수강자수"] },
    { field: "rank", keys: ["석차"] },
    { field: "distribution", keys: ["성취도별분포비율", "분포비율"] },
  ];

  const map: ColumnMap = {};
  for (const exact of [true, false]) {
    header.forEach((cell, index) => {
      const text = cellText(cell).replace(/\s+/g, "");
      if (!text) return;
      for (const mapping of mappings) {
        if (map[mapping.field] !== undefined) continue;
        if (mapping.keys.some((key) => exact ? text === key.replace(/\s+/g, "") : text.includes(key.replace(/\s+/g, "")))) {
          map[mapping.field] = index;
        }
      }
    });
  }
  if (map.rawScore === undefined && map.credits !== undefined) map.rawScore = map.credits + 1;
  return map;
}

function read(row: unknown[], map: ColumnMap, field: keyof ColumnMap): unknown {
  const column = map[field];
  return column === undefined ? undefined : row[column];
}

function parsePrintReport(rows: unknown[][], sourceFile: string): ConsultationStudent[] {
  const { grade, classNumber } = parseMetaFromInfo(rowText(rows[2]));
  const map = buildPrintColumnMap(rows[3] ?? []);
  const students = new Map<string, Omit<ConsultationStudent, "weightedGrade5" | "weightedGrade9" | "averageScore" | "averageDelta" | "status">>();

  let currentNumber: string | null = null;
  let currentName: string | null = null;
  let sectionGroup: string | null = null;

  for (let rowIndex = 4; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const firstCell = cellText(row[0]);
    if (firstCell.startsWith("<")) {
      sectionGroup = firstCell;
      continue;
    }

    const subject = cellText(read(row, map, "subject"));
    const credits = parseNumber(read(row, map, "credits"));
    if (!subject || credits === null) continue;

    const maybeNumber = parseNumber(read(row, map, "number"));
    if (maybeNumber !== null) currentNumber = String(maybeNumber);
    const maybeName = cellText(read(row, map, "name"));
    if (maybeName) currentName = maybeName;
    if (!currentNumber) continue;

    const key = `${sourceFile}-${grade ?? "g"}-${classNumber ?? "c"}-${currentNumber}-${currentName ?? ""}`;
    if (!students.has(key)) {
      students.set(key, {
        id: key,
        name: currentName || `학생${currentNumber}`,
        grade,
        classNumber,
        studentNumber: currentNumber,
        sourceFiles: [sourceFile],
        records: [],
      });
    }

    const scoreCell = read(row, map, "rawScore");
    const scoreText = cellText(scoreCell);
    const score = parseScore(scoreCell);
    const embeddedAverage = scoreText.includes("/") ? parseNumber(scoreText.split("/")[1]) : null;
    const subjectAverage = parseNumber(read(row, map, "subjectAverage")) ?? embeddedAverage;
    const gradeNumber = parseNumber(read(row, map, "grade"));
    const participants = parseNumber(read(row, map, "participants"));
    const rank = parseRank(read(row, map, "rank"));
    const percentile = rank.rank !== null && participants ? Math.round(((rank.rank / participants) * 100) * 10) / 10 : null;
    const grade5 = gradeNumber !== null && gradeNumber <= 5 ? gradeNumber : grade5FromPercentile(percentile);

    students.get(key)?.records.push({
      sourceFile,
      subject,
      group: subjectGroup(subject, cellText(read(row, map, "subjectGroup")) || sectionGroup),
      credits: credits || 1,
      score,
      subjectAverage,
      achievement: cellText(read(row, map, "achievement")) || null,
      grade5,
      rank: rank.rank,
      rankLabel: rank.label,
      participants,
      percentile,
      grade9: gradeNumber !== null && gradeNumber > 5 ? gradeNumber : grade9FromPercentile(percentile),
    });
  }

  return [...students.values()].map(normalizeStudent);
}

export function parseConsultationRows(rows: unknown[][], sourceFile: string): ParsedWorkbook {
  const noticeReports = parseNeisRows(rows);
  if (noticeReports.length > 0) {
    const students = buildStudentsFromReports(noticeReports, sourceFile);
    const analysis = analysisFromStudents(students, [sourceFile], ["notice"], []);
    return { sourceFile, sourceType: "notice", reports: noticeReports, analysis, warnings: [] };
  }

  const looksLikePrintReport = isPrintReport(rows);
  const looksLikeSemesterSummary = isSemesterSummary(rows);
  const sourceType: SourceType = looksLikePrintReport ? "print-report" : "semester-summary";
  const students = sourceType === "print-report" ? parsePrintReport(rows, sourceFile) : parseSemesterSummary(rows, sourceFile);
  const warnings = students.length
    ? []
    : [`${sourceFile}: ${looksLikeSemesterSummary ? "학기말 종합일람표" : "인식 가능한 성적"} 데이터를 찾지 못했습니다.`];
  const reports = students.map(buildReportFromStudent);
  const analysis = analysisFromStudents(students, [sourceFile], [sourceType], warnings);

  return { sourceFile, sourceType, reports, analysis, warnings };
}

function mergeStudents(workbooks: ParsedWorkbook[]): ConsultationStudent[] {
  const merged = new Map<string, Omit<ConsultationStudent, "weightedGrade5" | "weightedGrade9" | "averageScore" | "averageDelta" | "status">>();

  for (const workbook of workbooks) {
    for (const student of workbook.analysis.students) {
      const key = [student.grade ?? "g", student.classNumber ?? "c", student.studentNumber ?? student.name, student.name].join("-");
      if (!merged.has(key)) {
        merged.set(key, {
          id: key,
          name: student.name,
          grade: student.grade,
          classNumber: student.classNumber,
          studentNumber: student.studentNumber,
          sourceFiles: [],
          records: [],
        });
      }
      const target = merged.get(key);
      if (!target) continue;
      target.sourceFiles = [...new Set([...target.sourceFiles, ...student.sourceFiles])];
      target.records.push(...student.records);
    }
  }

  return [...merged.values()].map(normalizeStudent).sort((a, b) => {
    const classDiff = Number(a.classNumber ?? 0) - Number(b.classNumber ?? 0);
    if (classDiff !== 0) return classDiff;
    return Number(a.studentNumber ?? 0) - Number(b.studentNumber ?? 0) || a.name.localeCompare(b.name, "ko");
  });
}

export function mergeConsultationWorkbooks(workbooks: ParsedWorkbook[]): MergedConsultationData {
  const students = mergeStudents(workbooks);
  const reports = students.map(buildReportFromStudent);
  const files = workbooks.map((workbook) => workbook.sourceFile);
  const sourceTypes = workbooks.map((workbook) => workbook.sourceType);
  const warnings = workbooks.flatMap((workbook) => workbook.warnings);

  return {
    reports,
    analysis: analysisFromStudents(students, files, sourceTypes, warnings),
    warnings,
  };
}

export function csvSafe(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}
