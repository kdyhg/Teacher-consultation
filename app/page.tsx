"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertCircle,
  Archive,
  BarChart3,
  CheckCircle2,
  Clipboard,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  csvSafe,
  mergeConsultationWorkbooks,
  parseConsultationRows,
  type ConsultationAnalysis,
  type SourceType,
} from "@/lib/consultation-analysis";
import { nineGradeRangeLabel } from "@/lib/grade-conversion";
import {
  fiveGradeLabel,
  formatPercentile,
  formatSigned,
  summarizeClass,
  type ClassSummary,
  type StudentReport,
  type SubjectScore,
} from "@/lib/grade-parser";
import type { CounselingGuide, MessageMode, Tone } from "@/lib/local-message";

type MessageSource = "idle" | "openai" | "gemini" | "local";
type WorkspaceTab = "briefing" | "student" | "consulting" | "exports";
type AnalysisSection = "subjects" | "grade-distribution" | "students";
const GEMINI_KEY_STORAGE = "teacher-consultation-gemini-key";
const NINE_GRADE_SOURCE_NOTE = "9등급 변환은 부산광역시교육청학력개발원에서 개발한 내신변환서비스를 이용했습니다.";

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "warm", label: "따뜻하게" },
  { value: "formal", label: "정중하게" },
  { value: "brief", label: "간결하게" },
];

const sourceLabels: Record<SourceType, string> = {
  "all-subjects": "성적일람표 전과목",
  "semester-summary": "학기말성적종합일람표",
  "subject-list": "교과목별일람표",
  notice: "성적통지표",
  "print-report": "인쇄용 성적표",
};

const sourceRoles: Record<SourceType, string> = {
  "all-subjects": "담임교사용",
  "semester-summary": "담임교사용",
  "subject-list": "교과담당교사용",
  notice: "담임교사용",
  "print-report": "담임교사용",
};

const uploadSourceGuides: Array<{ type: SourceType; title: string; role: string; route: string; description: string }> = [
  {
    type: "all-subjects",
    title: "성적일람표 전과목",
    role: "담임교사 관점",
    route: "나이스 > 학급담임 > 성적조회 > 학기말성적조회 > 성적일람표전과목 > 조회 > XLS data로 저장",
    description: "한 반 학생의 전과목 성적 흐름을 묶어서 분석할 때 사용합니다.",
  },
  {
    type: "semester-summary",
    title: "학기말성적종합일람표",
    role: "담임교사 관점",
    route: "나이스 > 학급담임 > 성적조회 > 학기말성적조회 > 학기말성적조회일람표 > 조회 > XLS data로 저장",
    description: "학기말 종합 결과를 학생별 상담 자료와 학급 분포로 정리할 때 사용합니다.",
  },
  {
    type: "subject-list",
    title: "교과목별일람표",
    role: "교과담당교사 관점",
    route: "나이스 > 교과담임 > 지필평가조회/통계 > 지필평가조회 > 교과목별일람표조회-전체학급 > 조회 > XLS data로 저장",
    description: "특정 교과목을 맡은 교사가 반별 점수 분포와 학생별 위치를 볼 때 사용합니다.",
  },
];

const statusLabels: Record<StudentReport["overallStatus"], string> = {
  growth: "강점",
  steady: "안정",
  support: "점검",
  missing: "자료없음",
};

function scoreText(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : value.toFixed(1);
}

function gradeText(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : value.toFixed(2);
}

function nineGradeText(fiveGrade: number | null | undefined): string {
  return nineGradeRangeLabel(fiveGrade);
}

function gradePercent(value: number | null | undefined, maxGrade: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, ((value - 1) / Math.max(1, maxGrade - 1)) * 100));
}

function rankText(subject: SubjectScore): string {
  if (subject.rank === null || !subject.participants) return "-";
  return `${subject.rankLabel ?? subject.rank}/${subject.participants}`;
}

function subjectStatusLabel(status: SubjectScore["status"]): string {
  if (status === "strength") return "강점";
  if (status === "watch") return "점검";
  if (status === "missing") return "자료없음";
  return "보통";
}

function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));
}

function fileListLabel(files: File[]): string {
  if (!files.length) return "";
  if (files.length === 1) return files[0].name;
  return `${files[0].name} 외 ${files.length - 1}개`;
}

function buildCsv(analysis: ConsultationAnalysis, includePrivateInfo: boolean): string {
  const header = [
    ...(includePrivateInfo ? ["학년", "반", "번호", "이름"] : ["익명ID"]),
    "평균5등급",
    "9등급 기준",
    "교과군",
    "과목",
    "학점",
    "점수",
    "과목평균",
    "성취도",
    "석차등급",
    "석차",
    "수강자수",
    "백분위",
    "9등급",
    "출처",
  ];

  const rows = analysis.students.flatMap((student, studentIndex) =>
    student.records.map((record) => [
      ...(includePrivateInfo
        ? [student.grade ?? "", student.classNumber ?? "", student.studentNumber ?? "", student.name]
        : [`S${String(studentIndex + 1).padStart(3, "0")}`]),
      student.weightedGrade5 ?? "",
      nineGradeText(student.weightedGrade5),
      record.group,
      record.subject,
      record.credits,
      record.score ?? "",
      record.subjectAverage ?? "",
      record.achievement ?? "",
      record.grade5 ?? "",
      record.rankLabel ?? record.rank ?? "",
      record.participants ?? "",
      record.percentile ?? "",
      record.grade9 ?? "",
      record.sourceFile,
    ]),
  );

  return [header, ...rows].map((row) => row.map(csvSafe).join(",")).join("\n");
}

function htmlSafe(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildStaticHtml(analysis: ConsultationAnalysis, includePrivateInfo: boolean): string {
  const rows = analysis.students
    .map((student, index) => {
      const label = includePrivateInfo
        ? `${student.grade ?? "-"}학년 ${student.classNumber ?? "-"}반 ${student.studentNumber ?? "-"}번 ${student.name}`
        : `학생 ${String(index + 1).padStart(3, "0")}`;
      return `<tr><td>${htmlSafe(label)}</td><td>${gradeText(student.weightedGrade5)}</td><td>${nineGradeText(student.weightedGrade5)}</td><td>${scoreText(student.averageScore)}</td><td>${student.records.length}</td></tr>`;
    })
    .join("");
  const subjectRows = analysis.subjects
    .map((subject) => `<tr><td>${htmlSafe(subject.group)}</td><td>${htmlSafe(subject.subject)}</td><td>${subject.count}</td><td>${scoreText(subject.averageScore)}</td><td>${gradeText(subject.averageGrade5)}</td><td>${nineGradeText(subject.averageGrade5)}</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>담임 상담 성적 브리핑</title>
  <style>
    body{font-family:Arial,"Malgun Gothic",sans-serif;margin:28px;color:#1f2933;background:#f6f7f4}
    h1{font-size:26px;margin:0 0 8px} h2{font-size:18px;margin:26px 0 10px}
    .meta{color:#5f6b76;margin-bottom:10px}.conversion-note{color:#0b5f59;font-size:13px;font-weight:700;margin:0 0 18px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .card{background:white;border:1px solid #d8ded8;border-radius:8px;padding:14px}.card strong{display:block;font-size:24px;margin-top:5px}
    table{width:100%;border-collapse:collapse;background:white;border:1px solid #d8ded8} th,td{padding:9px;border-bottom:1px solid #e7ebe7;text-align:left;font-size:13px}
    th{background:#eef3ef;color:#415047}
  </style>
</head>
<body>
  <h1>담임 상담 성적 브리핑</h1>
  <p class="meta">생성 시각: ${new Date().toLocaleString("ko-KR")} · 파일 ${analysis.files.length}개 · ${includePrivateInfo ? "개인정보 포함" : "익명화"}</p>
  <p class="conversion-note">${htmlSafe(NINE_GRADE_SOURCE_NOTE)}</p>
  <section class="cards">
    <div class="card">학생<strong>${analysis.studentCount}</strong></div>
    <div class="card">과목<strong>${analysis.subjectCount}</strong></div>
    <div class="card">평균 5등급<strong>${gradeText(analysis.classAverageGrade5)}</strong></div>
    <div class="card">9등급 기준<strong>${nineGradeText(analysis.classAverageGrade5)}</strong></div>
  </section>
  <h2>학생 요약</h2>
  <table><thead><tr><th>학생</th><th>평균5등급</th><th>9등급 기준</th><th>평균점수</th><th>과목수</th></tr></thead><tbody>${rows}</tbody></table>
  <h2>과목 요약</h2>
  <table><thead><tr><th>교과군</th><th>과목</th><th>인원</th><th>평균점수</th><th>평균5등급</th><th>9등급 기준</th></tr></thead><tbody>${subjectRows}</tbody></table>
</body>
</html>`;
}

function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [fileName, setFileName] = useState("");
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [analysis, setAnalysis] = useState<ConsultationAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [parseError, setParseError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("briefing");
  const [analysisSection, setAnalysisSection] = useState<AnalysisSection>("subjects");
  const [showRanks, setShowRanks] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(GEMINI_KEY_STORAGE) ?? "",
  );
  const [rememberGeminiKey, setRememberGeminiKey] = useState(() =>
    typeof window === "undefined" ? false : Boolean(window.localStorage.getItem(GEMINI_KEY_STORAGE)),
  );
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [includePrivateCsv, setIncludePrivateCsv] = useState(false);
  const [includePrivateHtml, setIncludePrivateHtml] = useState(false);
  const [mode, setMode] = useState<MessageMode>("individual");
  const [tone, setTone] = useState<Tone>("warm");
  const [includeScores, setIncludeScores] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  const [classGrade, setClassGrade] = useState("");
  const [classNumberInput, setClassNumberInput] = useState("");
  const [observations, setObservations] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [counselingMemo, setCounselingMemo] = useState("");
  const [counselingGuide, setCounselingGuide] = useState<CounselingGuide | null>(null);
  const [notice, setNotice] = useState("");
  const [messageSource, setMessageSource] = useState<MessageSource>("idle");
  const [counselingSource, setCounselingSource] = useState<MessageSource>("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCounseling, setIsGeneratingCounseling] = useState(false);

  const summary = useMemo<ClassSummary | null>(() => (reports.length ? summarizeClass(reports) : null), [reports]);
  const selectedStudent = reports.find((report) => report.id === selectedId) ?? reports[0] ?? null;
  const selectedAnalysisStudent = analysis?.students.find((student) => student.id === selectedStudent?.id || student.name === selectedStudent?.name) ?? analysis?.students[0] ?? null;
  const selectedObservation = selectedStudent ? observations[selectedStudent.id] ?? "" : "";
  const activeSource = counselingMemo ? counselingSource : messageSource;
  const activeGeminiApiKey = geminiApiKey.trim();
  const sortedAnalysisStudents = useMemo(
    () =>
      analysis
        ? [...analysis.students].sort((left, right) => (left.weightedGrade5 ?? 99) - (right.weightedGrade5 ?? 99))
        : [],
    [analysis],
  );

  const parseUploadedFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setIsParsing(true);
    setParseError("");
    setWarnings([]);
    setMessage("");
    setNotice("");
    setMessageSource("idle");
    setCounselingSource("idle");
    setObservations({});
    setCounselingMemo("");
    setCounselingGuide(null);

    try {
      const XLSX = await import("xlsx");
      const parsed = [];
      const nextWarnings: string[] = [];

      for (const file of files) {
        try {
          const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error("첫 번째 시트를 찾지 못했습니다.");
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }) as unknown[][];
          parsed.push(parseConsultationRows(rows, file.name));
        } catch (error) {
          nextWarnings.push(`${file.name}: ${error instanceof Error ? error.message : "파일을 읽지 못했습니다."}`);
        }
      }

      if (!parsed.length) {
        throw new Error(nextWarnings[0] ?? "성적 자료를 찾지 못했습니다.");
      }

      const merged = mergeConsultationWorkbooks(parsed);
      if (!merged.reports.length) {
        throw new Error("학생 성적 블록을 찾지 못했습니다.");
      }

      setFileName(fileListLabel(files));
      setReports(merged.reports);
      setAnalysis(merged.analysis);
      setWarnings([...nextWarnings, ...merged.warnings]);
      setSelectedId(merged.reports[0]?.id ?? null);
      setClassGrade(merged.reports[0]?.grade ?? "");
      setClassNumberInput(merged.reports[0]?.classNumber ?? "");
      setActiveTab("briefing");
      setAnalysisSection("subjects");
    } catch (error) {
      setReports([]);
      setAnalysis(null);
      setSelectedId(null);
      setFileName("");
      setParseError(error instanceof Error ? error.message : "엑셀 파일을 읽지 못했습니다.");
    } finally {
      setIsParsing(false);
      setIsDragging(false);
    }
  }, []);

  useEffect(() => {
    if (rememberGeminiKey && activeGeminiApiKey) {
      window.localStorage.setItem(GEMINI_KEY_STORAGE, activeGeminiApiKey);
      return;
    }
    window.localStorage.removeItem(GEMINI_KEY_STORAGE);
  }, [activeGeminiApiKey, rememberGeminiKey]);

  useEffect(() => {
    function handleDragOver(event: DragEvent) {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      setIsDragging(true);
    }

    function handleDragLeave(event: DragEvent) {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (event.relatedTarget) return;
      setIsDragging(false);
    }

    function handleDrop(event: DragEvent) {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => /\.(xlsx?|xlsm)$/i.test(file.name));
      void parseUploadedFiles(files);
    }

    window.addEventListener("dragenter", handleDragOver);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragOver);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [parseUploadedFiles]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    await parseUploadedFiles(files);
    event.target.value = "";
  }

  function downloadCsv() {
    if (!analysis) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
    downloadText(`\uFEFF${buildCsv(analysis, includePrivateCsv)}`, `teacher-consultation-${stamp}.csv`, "text/csv;charset=utf-8");
  }

  function downloadHtml() {
    if (!analysis) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
    downloadText(`\uFEFF${buildStaticHtml(analysis, includePrivateHtml)}`, `teacher-consultation-briefing-${stamp}.html`, "text/html;charset=utf-8");
  }

  async function generateMessage() {
    if (!summary || (mode === "individual" && !selectedStudent)) return;
    setIsGenerating(true);
    setNotice("");
    setMessageSource("idle");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          tone,
          includeScores,
          geminiApiKey: activeGeminiApiKey || undefined,
          teacherName,
          teacherObservation: mode === "individual" ? selectedObservation : undefined,
          student: mode === "individual" ? selectedStudent : undefined,
          classSummary: mode === "class" ? summary : undefined,
          classContext:
            mode === "class"
              ? {
                  year: reports[0]?.year,
                  semester: reports[0]?.semester,
                  grade: classGrade || reports[0]?.grade,
                  classNumber: classNumberInput || reports[0]?.classNumber,
                  examName: reports[0]?.examName,
                }
              : undefined,
        }),
      });
      const data = (await response.json()) as { message?: string; source?: MessageSource; notice?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "문안 생성에 실패했습니다.");
      setMessage(data.message ?? "");
      setMessageSource(data.source ?? "local");
      setNotice(data.notice ?? "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "문안 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateCounselingMemo() {
    if (!selectedStudent) return;
    setIsGeneratingCounseling(true);
    setNotice("");
    setCounselingSource("idle");

    try {
      const response = await fetch("/api/counseling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherObservation: selectedObservation,
          geminiApiKey: activeGeminiApiKey || undefined,
          student: selectedStudent,
          classContext: {
            year: reports[0]?.year,
            semester: reports[0]?.semester,
            grade: classGrade || reports[0]?.grade,
            classNumber: classNumberInput || reports[0]?.classNumber,
            examName: reports[0]?.examName,
          },
        }),
      });
      const data = (await response.json()) as { memo?: string; guide?: CounselingGuide | null; source?: MessageSource; notice?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "상담 자료 생성에 실패했습니다.");
      setCounselingMemo(data.memo ?? "");
      setCounselingGuide(data.guide ?? null);
      setCounselingSource(data.source ?? "local");
      setNotice(data.notice ?? "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "상담 자료 생성에 실패했습니다.");
    } finally {
      setIsGeneratingCounseling(false);
    }
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setNotice(`${label} 클립보드에 복사했습니다.`);
  }

  const tabButton = (tab: WorkspaceTab, label: string, icon: ReactNode) => (
    <button className={activeTab === tab ? "active" : ""} type="button" onClick={() => setActiveTab(tab)}>
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <main className={`consultation-shell ${isDragging ? "dragging-page" : ""}`}>
      {isDragging && (
        <div className="drop-curtain" aria-hidden="true">
          <FileSpreadsheet size={44} />
          <strong>나이스 XLS data 성적자료를 놓으면 자동으로 분류합니다</strong>
          <span>성적일람표 전과목, 학기말성적종합일람표, 교과목별일람표를 지원합니다.</span>
        </div>
      )}

      <header className="hero-bar">
        <div>
          <p className="eyebrow">Teacher Consultation</p>
          <h1>담임 상담 워크벤치</h1>
          <p className="hero-copy">나이스에서 조회 후 XLS data로 저장한 성적자료를 자동 분류하고, 담임교사와 교과담당교사 관점에 맞춰 분석합니다.</p>
        </div>
        <div className="hero-actions">
          <label className="action-button primary">
            <Upload size={18} />
            <span>XLS DATA 업로드</span>
            <input type="file" accept=".xlsx,.xls,.xlsm" multiple onChange={handleFile} />
          </label>
          <button className="action-button" type="button" onClick={() => setShowRanks((value) => !value)} disabled={!analysis}>
            {showRanks ? <Eye size={18} /> : <EyeOff size={18} />}
            <span>{showRanks ? "순위 표시" : "순위 숨김"}</span>
          </button>
        </div>
      </header>

      <section className="ingest-card">
        <div className="file-state">
          <FileSpreadsheet size={24} />
          <div>
            <strong>{fileName || "나이스 XLS data 성적자료를 올려 주세요"}</strong>
            <span>
              {isParsing
                ? "파일을 읽고 있습니다"
                : analysis
                  ? `${analysis.studentCount}명 · ${analysis.subjectCount}개 과목 · ${analysis.files.length}개 파일`
                  : "반드시 조회 후 XLS data로 저장한 파일을 첨부해 주세요"}
            </span>
          </div>
        </div>
        {isParsing ? <Loader2 className="spin" size={22} /> : <ShieldCheck size={22} />}
      </section>

      <section className="panel upload-guide-panel">
        <div className="panel-title split">
          <div>
            <ClipboardList size={18} />
            <h2>첨부 성적자료 분류</h2>
          </div>
          <span className="soft-pill">XLS data 저장 필수</span>
        </div>
        <div className="source-guide-grid">
          {uploadSourceGuides.map((guide, index) => (
            <article className="source-guide-card" key={guide.type}>
              <span className="guide-index">{index + 1}</span>
              <div>
                <div className="source-guide-head">
                  <strong>{guide.title}</strong>
                  <em>{guide.role}</em>
                </div>
                <p>{guide.description}</p>
                <p className="download-route">{guide.route}</p>
                <span className="xls-emphasis">조회 후 반드시 XLS data로 저장한 파일을 첨부하세요.</span>
              </div>
            </article>
          ))}
        </div>
        <p className="conversion-source-note">{NINE_GRADE_SOURCE_NOTE}</p>
        {analysis?.fileSummaries.length ? (
          <div className="detected-source-list" aria-label="자동 판별 결과">
            {analysis.fileSummaries.map((file) => (
              <span key={`${file.sourceFile}-${file.sourceType}`}>
                <strong>{sourceLabels[file.sourceType]}</strong>
                <em>{sourceRoles[file.sourceType]}</em>
                {file.sourceFile}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {parseError && (
        <p className="notice error">
          <AlertCircle size={16} />
          {parseError}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="warning-stack">
          {warnings.map((warning) => (
            <p className="notice warning" key={warning}>
              <AlertCircle size={16} />
              {warning}
            </p>
          ))}
        </div>
      )}

      {analysis ? (
        <>
          <nav className="workspace-tabs" aria-label="작업 메뉴">
            {tabButton("briefing", "학급 브리핑", <BarChart3 size={18} />)}
            {tabButton("student", "학생 프로파일", <UserRound size={18} />)}
            {tabButton("consulting", "상담·문안", <MessageSquareText size={18} />)}
            {tabButton("exports", "내보내기", <Archive size={18} />)}
          </nav>

          {activeTab === "briefing" && (
            <section className="workspace-grid">
              <div className="metric-strip">
                <article>
                  <span>학생</span>
                  <strong>{analysis.studentCount}</strong>
                </article>
                <article>
                  <span>과목</span>
                  <strong>{analysis.subjectCount}</strong>
                </article>
                <article>
                  <span>평균점수</span>
                  <strong>{scoreText(analysis.classAverageScore)}</strong>
                </article>
                <article className="accent">
                  <span>평균 5등급</span>
                  <strong>{gradeText(analysis.classAverageGrade5)}</strong>
                </article>
                <article className="accent">
                  <span>9등급 기준</span>
                  <strong>{nineGradeText(analysis.classAverageGrade5)}</strong>
                </article>
                <article>
                  <span>자료 유형</span>
                  <strong>{analysis.sourceTypes.map((type) => sourceLabels[type]).join(" · ")}</strong>
                </article>
              </div>

              <section className="panel grade-analysis-panel">
                <div className="panel-title split">
                  <div>
                    <BarChart3 size={18} />
                    <h2>성적 분석</h2>
                  </div>
                  <span className="soft-pill">3개 섹션</span>
                </div>

                <div className="analysis-section-tabs" role="tablist" aria-label="성적 분석 섹션">
                  <button className={analysisSection === "subjects" ? "active" : ""} type="button" onClick={() => setAnalysisSection("subjects")}>
                    <FileText size={18} />
                    <span>과목별 분석</span>
                  </button>
                  <button className={analysisSection === "grade-distribution" ? "active" : ""} type="button" onClick={() => setAnalysisSection("grade-distribution")}>
                    <BarChart3 size={18} />
                    <span>평균등급 분포</span>
                  </button>
                  <button className={analysisSection === "students" ? "active" : ""} type="button" onClick={() => setAnalysisSection("students")}>
                    <UsersRound size={18} />
                    <span>학생별 분석</span>
                  </button>
                </div>

                {analysisSection === "subjects" && (
                  <div className="analysis-section">
                    <div className="section-heading">
                      <div>
                        <h3>과목별 분석</h3>
                        <p>과목 평균, 평균 5등급, 점검 학생 수를 함께 보며 상담 우선순위를 잡습니다.</p>
                      </div>
                    </div>

                    <div className="subject-analysis-grid">
                      {analysis.subjects.map((subject) => (
                        <article className="subject-analysis-card" key={`${subject.group}-${subject.subject}`}>
                          <div className="subject-analysis-head">
                            <div>
                              <strong title={subject.subject}>{subject.subject}</strong>
                              <span>{subject.group} · {subject.count}명 · {subject.credits}학점</span>
                            </div>
                            <em>{gradeText(subject.averageGrade5)}</em>
                          </div>
                          <div className="subject-score-visual">
                            <div className="bar-track">
                              <div style={{ width: `${Math.min(100, Math.max(4, ((subject.averageScore ?? 0) / 100) * 100))}%` }} />
                            </div>
                            <span>{scoreText(subject.averageScore)}점</span>
                          </div>
                          <div className="subject-mini-stats">
                            <span>과목평균 {scoreText(subject.subjectAverage)}</span>
                            <span>9등급 {nineGradeText(subject.averageGrade5)}</span>
                            <span>강점 {subject.strengthCount}</span>
                            <span>점검 {subject.watchCount}</span>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="group-grid">
                      {analysis.groups.map((group) => (
                        <article className="group-card" key={group.group}>
                          <span>{group.group}</span>
                          <strong>{gradeText(group.averageGrade5)}</strong>
                          <em>9등급 {nineGradeText(group.averageGrade5)} · {group.subjects.slice(0, 4).join(", ")}</em>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {analysisSection === "grade-distribution" && (
                  <div className="analysis-section">
                    <div className="section-heading">
                      <div>
                        <h3>평균등급 분포</h3>
                        <p>학생 평균등급의 밀집 구간과 상담이 필요한 학생군을 한눈에 확인합니다.</p>
                      </div>
                    </div>

                    <div className="distribution-layout">
                      <section>
                        <h3>5등급 분포</h3>
                        <div className="distribution-bars">
                          {Object.entries(analysis.gradeDistribution).map(([grade, count]) => (
                            <div className="dist-row" key={grade}>
                              <span>{grade}등급</span>
                              <div className="bar-track">
                                <div style={{ width: `${analysis.studentCount ? Math.max(4, (count / analysis.studentCount) * 100) : 0}%` }} />
                              </div>
                              <strong>{count}</strong>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3>9등급 기준 분포</h3>
                        <div className="nine-grid">
                          {Object.entries(analysis.nineGradeDistribution).map(([grade, count]) => (
                            <span key={grade} className={count ? "filled" : ""}>
                              <em>{grade}</em>
                              <strong>{count}</strong>
                            </span>
                          ))}
                        </div>
                      </section>
                    </div>

                    <div className="grade-ruler" aria-label="학생 평균등급 위치">
                      <div className="ruler-track">
                        {sortedAnalysisStudents.map((student, index) => (
                          <button
                            key={`${student.id}-${index}`}
                            className={`grade-dot ${student.status}`}
                            type="button"
                            style={{ left: `${gradePercent(student.weightedGrade5, 5)}%` }}
                            title={`${student.name}: 평균 5등급 ${gradeText(student.weightedGrade5)}, 9등급 기준 ${nineGradeText(student.weightedGrade5)}`}
                            onClick={() => {
                              const target = reports.find((report) => report.name === student.name && report.studentNumber === student.studentNumber);
                              if (target) setSelectedId(target.id);
                              setActiveTab("student");
                            }}
                          >
                            <span>{index + 1}</span>
                          </button>
                        ))}
                      </div>
                      <div className="ruler-labels">
                        <span>1등급</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                        <span>5등급</span>
                      </div>
                    </div>
                  </div>
                )}

                {analysisSection === "students" && (
                  <div className="analysis-section">
                    <div className="section-heading">
                      <div>
                        <h3>학생별 분석</h3>
                        <p>평균등급순으로 학생을 정렬해 강점·점검 상태와 상담용 핵심 지표를 확인합니다.</p>
                      </div>
                    </div>

                    <div className="student-analysis-table-wrap">
                      <table className={`student-analysis-table ${showRanks ? "" : "ranks-hidden"}`}>
                        <thead>
                          <tr>
                            <th>학생</th>
                            <th>평균점수</th>
                            <th>평균 5등급</th>
                            <th>9등급 기준</th>
                            <th>과목 수</th>
                            <th>상태</th>
                            <th>주요 과목</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedAnalysisStudents.map((student) => {
                            const target = reports.find((report) => report.name === student.name && report.studentNumber === student.studentNumber);
                            const focus = target?.focusSubject?.subject ?? student.records.find((record) => record.grade5 !== null && record.grade5 >= 4)?.subject ?? "-";
                            return (
                              <tr key={student.id}>
                                <td>
                                  <button
                                    className="student-link"
                                    type="button"
                                    onClick={() => {
                                      if (target) setSelectedId(target.id);
                                      setActiveTab("student");
                                    }}
                                  >
                                    <strong>{student.name}</strong>
                                    <span>{student.grade ?? "-"}학년 {student.classNumber ?? "-"}반 {student.studentNumber ?? "-"}번</span>
                                  </button>
                                </td>
                                <td>{scoreText(student.averageScore)}</td>
                                <td>
                                  <div className="grade-cell-visual">
                                    <span>{gradeText(student.weightedGrade5)}</span>
                                    <div className="bar-track">
                                      <div style={{ width: `${gradePercent(student.weightedGrade5, 5)}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td>{nineGradeText(student.weightedGrade5)}</td>
                                <td>{student.records.length}</td>
                                <td><span className={`status ${student.status}`}>{statusLabels[student.status]}</span></td>
                                <td>{focus}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "student" && (
            <section className="student-workspace">
              <aside className="panel student-list">
                <div className="panel-title">
                  <UsersRound size={18} />
                  <h2>학생</h2>
                </div>
                <div className="student-scroll">
                  {reports.map((report) => (
                    <button
                      className={selectedStudent?.id === report.id ? "selected" : ""}
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedId(report.id)}
                    >
                      <span>{report.studentNumber ?? "-"}</span>
                      <strong>{report.name}</strong>
                      <em className={report.overallStatus}>{statusLabels[report.overallStatus]}</em>
                    </button>
                  ))}
                </div>
              </aside>

              <section className={`panel student-profile ${showRanks ? "" : "ranks-hidden"}`}>
                <div className="panel-title split">
                  <div>
                    <UserRound size={18} />
                    <h2>{selectedStudent?.name ?? "학생"}</h2>
                  </div>
                  <span className="soft-pill">
                    {selectedStudent?.grade ?? "-"}학년 {selectedStudent?.classNumber ?? "-"}반 {selectedStudent?.studentNumber ?? "-"}번
                  </span>
                </div>

                <div className="student-metrics">
                  <article>
                    <span>평균점수</span>
                    <strong>{scoreText(selectedStudent?.averageScore)}</strong>
                  </article>
                  <article>
                    <span>평균 대비</span>
                    <strong>{formatSigned(selectedStudent?.averageDelta ?? null)}</strong>
                  </article>
                  <article>
                    <span>5등급 평균</span>
                    <strong>{gradeText(selectedAnalysisStudent?.weightedGrade5 ?? selectedStudent?.averageFiveGrade ?? null)}</strong>
                  </article>
                  <article>
                    <span>9등급 기준</span>
                    <strong>{nineGradeText(selectedAnalysisStudent?.weightedGrade5 ?? selectedStudent?.averageFiveGrade ?? null)}</strong>
                  </article>
                  <article>
                    <span>점검 과목</span>
                    <strong>{selectedStudent?.watchCount ?? 0}</strong>
                  </article>
                </div>

                <div className="subject-table-wrap">
                  <table className="subject-table">
                    <thead>
                      <tr>
                        <th>과목</th>
                        <th>점수</th>
                        <th>평균</th>
                        <th>차이</th>
                        <th className="rank-column">석차</th>
                        <th className="rank-column">백분위</th>
                        <th>5등급</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudent?.subjects.map((subject) => (
                        <tr key={`${selectedStudent.id}-${subject.subject}-${subject.examName}`}>
                          <td>{subject.subject}</td>
                          <td>{scoreText(subject.value)}</td>
                          <td>{scoreText(subject.subjectAverage)}</td>
                          <td>{formatSigned(subject.deltaFromAverage)}</td>
                          <td className="rank-column">{rankText(subject)}</td>
                          <td className="rank-column">{formatPercentile(subject.percentile)}</td>
                          <td>{fiveGradeLabel(subject.fiveGrade)}</td>
                          <td>
                            <span className={`status ${subject.status}`}>{subjectStatusLabel(subject.status)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          )}

          {activeTab === "consulting" && (
            <section className="consult-grid">
              <section className="panel api-key-panel">
                <div className="panel-title split">
                  <div>
                    <KeyRound size={18} />
                    <h2>개인 Gemini API 키</h2>
                  </div>
                  <span className="soft-pill">{activeGeminiApiKey ? "개인 키 사용" : "서버 키 또는 로컬 초안"}</span>
                </div>
                <p className="api-key-help">
                  공유 사이트에서는 각 사용자가 자신의 Gemini API 키를 넣어 AI 기능을 실행할 수 있습니다. 키는 생성 요청 때만 서버 API Route로 전달되며, 저장 체크를 켜지 않으면 브라우저에도 남기지 않습니다.
                </p>
                <div className="api-key-row">
                  <label className="field">
                    <span>Gemini API 키</span>
                    <input
                      type={showGeminiKey ? "text" : "password"}
                      value={geminiApiKey}
                      onChange={(event) => setGeminiApiKey(event.target.value)}
                      placeholder="AIza..."
                      autoComplete="off"
                    />
                  </label>
                  <button className="action-button" type="button" onClick={() => setShowGeminiKey((value) => !value)}>
                    {showGeminiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    <span>{showGeminiKey ? "숨기기" : "보기"}</span>
                  </button>
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => {
                      setGeminiApiKey("");
                      setRememberGeminiKey(false);
                    }}
                    disabled={!geminiApiKey}
                  >
                    지우기
                  </button>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={rememberGeminiKey} onChange={(event) => setRememberGeminiKey(event.target.checked)} />
                  <span>이 브라우저에 키 저장</span>
                </label>
              </section>

              <section className="panel">
                <div className="panel-title split">
                  <div>
                    <MessageSquareText size={18} />
                    <h2>문안 생성</h2>
                  </div>
                  {activeSource !== "idle" && <span className="soft-pill">{activeSource === "gemini" ? "Gemini" : activeSource === "openai" ? "OpenAI" : "로컬"}</span>}
                </div>

                <div className="segmented">
                  <button className={mode === "individual" ? "active" : ""} type="button" onClick={() => setMode("individual")}>개별</button>
                  <button className={mode === "class" ? "active" : ""} type="button" onClick={() => setMode("class")}>단체</button>
                </div>

                <div className="field-row">
                  <label className="field">
                    <span>문체</span>
                    <select value={tone} onChange={(event) => setTone(event.target.value as Tone)}>
                      {toneOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>담임명</span>
                    <input value={teacherName} onChange={(event) => setTeacherName(event.target.value)} placeholder="선택" />
                  </label>
                </div>

                <div className="field-row">
                  <label className="field">
                    <span>학년</span>
                    <input value={classGrade} onChange={(event) => setClassGrade(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>반</span>
                    <input value={classNumberInput} onChange={(event) => setClassNumberInput(event.target.value)} />
                  </label>
                </div>

                {mode === "individual" && (
                  <label className="field">
                    <span>담임 관찰내용</span>
                    <textarea
                      value={selectedObservation}
                      onChange={(event) => {
                        if (!selectedStudent) return;
                        setObservations((current) => ({ ...current, [selectedStudent.id]: event.target.value }));
                      }}
                      placeholder="수업 참여, 과제 수행, 질문 태도 등"
                    />
                  </label>
                )}

                <label className="check-row">
                  <input type="checkbox" checked={includeScores} onChange={(event) => setIncludeScores(event.target.checked)} />
                  <span>내부 검토용 점수 포함</span>
                </label>

                <button className="generate-button" type="button" onClick={generateMessage} disabled={isGenerating || !summary}>
                  {isGenerating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                  <span>{isGenerating ? "생성 중" : "가정 메시지 생성"}</span>
                </button>

                <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="생성된 메시지" />
                <button className="action-button" type="button" onClick={() => copyText(message, "문안을")} disabled={!message}>
                  <Clipboard size={18} />
                  <span>문안 복사</span>
                </button>
              </section>

              <section className="panel">
                <div className="panel-title">
                  <ClipboardList size={18} />
                  <h2>상담 자료</h2>
                </div>
                <label className="field">
                  <span>상담에서 확인할 관찰내용</span>
                  <textarea
                    value={selectedObservation}
                    onChange={(event) => {
                      if (!selectedStudent) return;
                      setObservations((current) => ({ ...current, [selectedStudent.id]: event.target.value }));
                    }}
                    placeholder="학습 습관, 정서, 수업 태도 등"
                  />
                </label>
                <button className="generate-button" type="button" onClick={generateCounselingMemo} disabled={isGeneratingCounseling || !selectedStudent}>
                  {isGeneratingCounseling ? <Loader2 className="spin" size={18} /> : <ClipboardList size={18} />}
                  <span>{isGeneratingCounseling ? "생성 중" : "상담 자료 생성"}</span>
                </button>

                {counselingGuide ? (
                  <div className="counseling-board">
                    <section>
                      <h3>핵심 요약</h3>
                      {counselingGuide.summary.map((item) => <p key={item}>{item}</p>)}
                    </section>
                    <section>
                      <h3>우선 보완</h3>
                      {counselingGuide.focusSubjects.map((item) => (
                        <article className="focus-card" key={`${item.subject}-${item.issue}`}>
                          <strong>{item.subject}</strong>
                          <span>{item.evidence}</span>
                          <p>{item.strategy}</p>
                          <em>{item.question}</em>
                        </article>
                      ))}
                    </section>
                    <section>
                      <h3>2주 실천 계획</h3>
                      <ol>
                        {counselingGuide.actionPlan.map((item) => <li key={item}>{item}</li>)}
                      </ol>
                    </section>
                  </div>
                ) : (
                  <div className="empty-box">상담 자료를 생성하면 핵심 요약, 보완 과목, 질문, 실천 계획이 정리됩니다.</div>
                )}

                <textarea value={counselingMemo} onChange={(event) => setCounselingMemo(event.target.value)} placeholder="상담 자료 원문" />
                <button className="action-button" type="button" onClick={() => copyText(counselingMemo, "상담 자료를")} disabled={!counselingMemo}>
                  <Clipboard size={18} />
                  <span>자료 복사</span>
                </button>
              </section>

              {notice && (
                <p className="notice">
                  <CheckCircle2 size={16} />
                  {notice}
                </p>
              )}
            </section>
          )}

          {activeTab === "exports" && (
            <section className="export-grid">
              <article className="panel export-card">
                <Download size={24} />
                <h2>상담 DB CSV</h2>
                <p>성적 분석 결과를 취합용 CSV로 저장합니다. 기본값은 학생 이름과 번호를 익명화합니다.</p>
                <label className="check-row">
                  <input type="checkbox" checked={includePrivateCsv} onChange={(event) => setIncludePrivateCsv(event.target.checked)} />
                  <span>CSV에 개인정보 포함</span>
                </label>
                <button className="generate-button" type="button" onClick={downloadCsv}>
                  <Download size={18} />
                  <span>CSV 다운로드</span>
                </button>
              </article>

              <article className="panel export-card">
                <FileText size={24} />
                <h2>정적 HTML 브리핑</h2>
                <p>현재 분석 결과를 스크립트 없는 HTML 요약으로 저장합니다. 공유 전 개인정보 포함 여부를 확인하세요.</p>
                <label className="check-row">
                  <input type="checkbox" checked={includePrivateHtml} onChange={(event) => setIncludePrivateHtml(event.target.checked)} />
                  <span>HTML에 개인정보 포함</span>
                </label>
                <button className="generate-button" type="button" onClick={downloadHtml}>
                  <FileText size={18} />
                  <span>HTML 저장</span>
                </button>
              </article>

              <article className="panel export-card">
                <ShieldCheck size={24} />
                <h2>개인정보 안내</h2>
                <p>파일 파싱과 기본 분석은 브라우저에서 수행됩니다. AI 문안/상담 생성 버튼을 누를 때만 선택된 요약 데이터가 서버 API로 전달됩니다.</p>
              </article>
            </section>
          )}
        </>
      ) : (
        <section className="empty-state">
          <FileSpreadsheet size={44} />
          <h2>3가지 나이스 XLS data 성적자료를 자동 분류합니다</h2>
          <p>성적일람표 전과목과 학기말성적종합일람표는 담임교사용 분석으로, 교과목별일람표는 교과담당교사용 분석으로 정리합니다.</p>
        </section>
      )}
    </main>
  );
}
