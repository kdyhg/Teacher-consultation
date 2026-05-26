import { fiveGradeLabel, formatPercentile, formatSigned, type ClassSummary, type StudentReport, type SubjectScore } from "@/lib/grade-parser";

export type MessageMode = "individual" | "class";
export type Tone = "warm" | "formal" | "brief";

export type ClassContext = {
  year?: string | null;
  semester?: string | null;
  grade?: string | null;
  classNumber?: string | null;
  examName?: string | null;
};

export type GenerateRequest = {
  mode: MessageMode;
  tone: Tone;
  includeScores: boolean;
  teacherName?: string;
  teacherObservation?: string;
  student?: StudentReport;
  classSummary?: ClassSummary;
  classContext?: ClassContext;
};

export type CounselingRequest = {
  student?: StudentReport;
  teacherObservation?: string;
  classContext?: ClassContext;
};

export type CounselingFocusItem = {
  subject: string;
  evidence: string;
  issue: string;
  strategy: string;
  question: string;
};

export type CounselingGuide = {
  summary: string[];
  focusSubjects: CounselingFocusItem[];
  strengths: string[];
  questions: string[];
  actionPlan: string[];
  teacherObservation: string | null;
  closingNote: string;
};

type MessageStudentContext = {
  name: string;
  observation: string | null;
  strengthSubject: string | null;
  focusSubject: string | null;
  focusAdvice: string;
  averageScore?: number | null;
};

function toneLabel(tone: Tone): string {
  if (tone === "formal") return "정중하고 담백한";
  if (tone === "brief") return "짧고 자연스러운";
  return "따뜻하지만 과장하지 않는";
}

function compactSubjectName(subject: SubjectScore | null): string | null {
  return subject?.subject?.replace(/\(\d+\)/g, "").trim() || null;
}

function studyAdvice(subject: SubjectScore | null): string {
  if (!subject) {
    return "수업에서 다룬 내용을 그날 짧게 다시 보고, 틀린 문제는 풀이를 말로 설명해 보는 연습이 좋겠습니다.";
  }

  const name = compactSubjectName(subject) ?? "해당 과목";
  if (/문학|독서|국어|화법|작문/.test(name)) {
    return `${name}은 지문을 읽은 뒤 근거 문장을 표시하고, 오답 선지가 왜 맞지 않는지 한 줄로 정리해 보면 좋겠습니다.`;
  }
  if (/대수|수학|미적|확률|기하/.test(name)) {
    return `${name}은 풀이를 눈으로 확인하는 데서 멈추지 말고, 막힌 단계와 사용한 개념을 표시한 뒤 같은 유형을 다시 풀어 보면 좋겠습니다.`;
  }
  if (/영어/.test(name)) {
    return `${name}은 지문 흐름을 먼저 잡고, 모르는 어휘를 문장 속에서 다시 확인하는 짧은 복습이 도움이 되겠습니다.`;
  }
  if (/물리|화학|생명|지구|과학/.test(name)) {
    return `${name}은 개념과 그래프, 표, 조건을 함께 묶어 정리하고 계산 과정은 순서대로 다시 써 보는 연습이 필요합니다.`;
  }
  return `${name}은 핵심 개념을 먼저 정리하고, 틀린 이유를 개념 이해, 조건 해석, 시간 관리 중 하나로 나누어 복습하면 좋겠습니다.`;
}

function scoreValue(value: number | null): string {
  return value === null ? "-" : value.toFixed(1);
}

function rankValue(subject: SubjectScore): string {
  if (subject.rank === null || !subject.participants) return "-";
  return `${subject.rankLabel ?? subject.rank}/${subject.participants}`;
}

function subjectLine(subject: SubjectScore): string {
  return [
    `${compactSubjectName(subject) ?? subject.subject}`,
    `점수 ${scoreValue(subject.value)}`,
    `과목평균 ${scoreValue(subject.subjectAverage)}`,
    `평균 대비 ${formatSigned(subject.deltaFromAverage)}`,
    `석차 ${rankValue(subject)}`,
    formatPercentile(subject.percentile),
    fiveGradeLabel(subject.fiveGrade),
  ].join(" / ");
}

function focusReason(subject: SubjectScore): string {
  const reasons: string[] = [];
  if (subject.deltaFromAverage !== null && subject.deltaFromAverage <= -8) {
    reasons.push(`과목평균보다 ${Math.abs(subject.deltaFromAverage).toFixed(1)}점 낮아 기본 개념과 문제 적용 과정을 함께 점검할 필요가 있습니다`);
  } else if (subject.deltaFromAverage !== null && subject.deltaFromAverage < 0) {
    reasons.push(`과목평균보다 ${Math.abs(subject.deltaFromAverage).toFixed(1)}점 낮아 오답 원인을 세분화해 보는 상담이 필요합니다`);
  }
  if (subject.fiveGrade !== null && subject.fiveGrade >= 4) {
    reasons.push(`${fiveGradeLabel(subject.fiveGrade)} 구간이므로 다음 평가 전까지 우선 보완 과목으로 잡는 것이 좋습니다`);
  }
  if (subject.percentile !== null && subject.percentile >= 66) {
    reasons.push(`${formatPercentile(subject.percentile)}에 해당해 풀이 정확도와 시간 배분을 확인해 볼 필요가 있습니다`);
  }
  return reasons.length ? reasons.join("; ") : "상대적으로 가장 낮은 과목이므로 공부 방법과 준비 과정을 확인해 볼 필요가 있습니다";
}

function counselingQuestion(subject: SubjectScore): string {
  const name = compactSubjectName(subject) ?? subject.subject;
  if (/문학|독서|국어|화법|작문/.test(name)) {
    return `${name}: 지문을 읽을 때 근거 문장을 찾고 있는지, 오답 선지를 왜 틀렸는지 설명할 수 있는지 확인`;
  }
  if (/대수|수학|미적|확률|기하/.test(name)) {
    return `${name}: 개념을 몰라서 막히는지, 계산 실수인지, 풀이 순서가 끊기는지 학생이 직접 구분하게 하기`;
  }
  if (/영어/.test(name)) {
    return `${name}: 모르는 어휘 때문에 막히는지, 문장 구조나 글의 흐름 파악에서 흔들리는지 확인`;
  }
  if (/물리|화학|생명|지구|과학/.test(name)) {
    return `${name}: 개념, 자료 해석, 계산 과정 중 어디에서 실수가 반복되는지 문제를 보며 확인`;
  }
  return `${name}: 틀린 문제를 개념 이해, 조건 해석, 시간 관리 중 어디에 해당하는지 학생이 직접 분류하게 하기`;
}

function compareFocusPriority(a: SubjectScore, b: SubjectScore): number {
  const gradeGap = (b.fiveGrade ?? 0) - (a.fiveGrade ?? 0);
  if (gradeGap !== 0) return gradeGap;
  return (a.deltaFromAverage ?? 0) - (b.deltaFromAverage ?? 0);
}

function compareStrengthPriority(a: SubjectScore, b: SubjectScore): number {
  const gradeGap = (a.fiveGrade ?? 9) - (b.fiveGrade ?? 9);
  if (gradeGap !== 0) return gradeGap;
  return (b.deltaFromAverage ?? 0) - (a.deltaFromAverage ?? 0);
}

function classLabel(context?: ClassContext): string {
  const grade = context?.grade ? `${context.grade}학년` : "[학년]";
  const classNumber = context?.classNumber ? `${context.classNumber}반` : "[반]";
  return `${grade} ${classNumber}`;
}

function observationSentence(name: string, observation: string | null): string {
  if (!observation) {
    return `${name}이는 수업과 과제 과정에서 자기 몫을 해내려는 모습을 보여 주었습니다.`;
  }

  const base = observation.trim().replace(/[.。]+$/, "");
  if (/모습이\s*보임$/.test(base)) {
    return `${name}이는 ${base.replace(/모습이\s*보임$/, "모습을 보여 주었습니다.")}`;
  }
  if (/보임$/.test(base)) {
    return `${name}이는 ${base.replace(/보임$/, "모습을 보여 주었습니다.")}`;
  }
  if (/함$/.test(base)) {
    return `${name}이는 ${base.replace(/함$/, "하는 모습을 보여 주었습니다.")}`;
  }
  if (/(습니다|다|요)$/.test(base)) {
    return `${name}이는 ${base}.`;
  }
  return `${name}이는 ${base} 모습을 보여 주었습니다.`;
}

function studentContext(input: GenerateRequest): MessageStudentContext | null {
  const student = input.student;
  if (!student) return null;
  return {
    name: student.name,
    observation: input.teacherObservation?.trim() || null,
    strengthSubject: compactSubjectName(student.strongestSubject),
    focusSubject: compactSubjectName(student.focusSubject),
    focusAdvice: studyAdvice(student.focusSubject),
    averageScore: input.includeScores ? student.averageScore : undefined,
  };
}

function classMessageContext(input: GenerateRequest) {
  return {
    classContext: input.classContext,
    studentCount: input.classSummary?.studentCount ?? null,
  };
}

function counselingContext(input: CounselingRequest) {
  const student = input.student;
  if (!student) return null;

  return {
    student: {
      name: student.name,
      grade: student.grade,
      classNumber: student.classNumber,
      studentNumber: student.studentNumber,
      examName: student.examName,
      averageScore: student.averageScore,
      averageDelta: student.averageDelta,
      averageFiveGrade: student.averageFiveGrade,
      strengthCount: student.strengthCount,
      watchCount: student.watchCount,
      overallStatus: student.overallStatus,
    },
    teacherObservation: input.teacherObservation?.trim() || null,
    subjects: student.subjects.map((subject) => ({
      subject: compactSubjectName(subject) ?? subject.subject,
      category: subject.category,
      score: subject.value,
      subjectAverage: subject.subjectAverage,
      deltaFromAverage: subject.deltaFromAverage,
      rank: subject.rankLabel ?? subject.rank,
      participants: subject.participants,
      percentile: subject.percentile,
      fiveGrade: subject.fiveGrade,
      status: subject.status,
    })),
  };
}

function localCounselingTargets(student: StudentReport) {
  const subjectsWithScores = student.subjects.filter((subject) => subject.value !== null);
  const focusSubjects =
    subjectsWithScores
      .filter((subject) => subject.status === "watch" || (subject.deltaFromAverage !== null && subject.deltaFromAverage < 0))
      .sort(compareFocusPriority)
      .slice(0, 3) || [];
  const fallbackFocus = subjectsWithScores.length ? [...subjectsWithScores].sort(compareFocusPriority).slice(0, 2) : [];
  const counselingTargets = focusSubjects.length ? focusSubjects : fallbackFocus;
  const strengths = subjectsWithScores
    .filter((subject) => subject.status === "strength" || (subject.deltaFromAverage !== null && subject.deltaFromAverage > 0))
    .sort(compareStrengthPriority)
    .slice(0, 2);

  return { counselingTargets, strengths };
}

export function buildLocalCounselingGuide(input: CounselingRequest): CounselingGuide | null {
  const student = input.student;
  if (!student) return null;

  const { counselingTargets, strengths } = localCounselingTargets(student);
  const teacherObservation = input.teacherObservation?.trim() || null;

  return {
    summary: [
      `전체 평균 ${scoreValue(student.averageScore)}, 과목평균 대비 ${formatSigned(student.averageDelta)}`,
      `5등급제 평균 ${fiveGradeLabel(student.averageFiveGrade)}, 점검 과목 ${student.watchCount}개`,
      `상담은 보완 과목을 1~2개로 좁히고, 학생이 원인을 직접 말하게 하는 흐름이 좋습니다.`,
    ],
    focusSubjects: counselingTargets.length
      ? counselingTargets.map((subject) => ({
          subject: compactSubjectName(subject) ?? subject.subject,
          evidence: subjectLine(subject),
          issue: focusReason(subject),
          strategy: studyAdvice(subject),
          question: counselingQuestion(subject),
        }))
      : [
          {
            subject: "자료 확인",
            evidence: "점수 자료가 부족합니다.",
            issue: "과목별 보완 지점을 자동으로 정하기 어렵습니다.",
            strategy: "학생이 어렵게 느낀 과목과 실제 준비 과정을 먼저 확인해 주세요.",
            question: "이번 평가에서 가장 준비가 어려웠던 과목과 이유를 물어보기",
          },
        ],
    strengths: strengths.length
      ? strengths.map((subject) => `${subjectLine(subject)}: 이 과목의 준비 방식 중 다른 과목에 옮겨 볼 습관을 물어보기`)
      : ["뚜렷한 강점 과목이 보이지 않으면, 과제 수행이나 수업 참여처럼 지속 가능한 장점을 먼저 확인해 주세요."],
    questions: [
      "이번 평가에서 준비한 시간과 실제 효과가 맞았는지 확인하기",
      "틀린 이유가 개념 부족, 문제 해석, 계산/실수, 시간 부족 중 어디에 가까운지 학생 스스로 고르게 하기",
      ...(counselingTargets.length
        ? counselingTargets.map((subject) => `${compactSubjectName(subject) ?? subject.subject}에서 틀린 문제 2개를 골라 왜 틀렸는지 말로 설명하게 하기`)
        : ["가장 시간이 많이 걸린 과목과 실제 점수가 잘 나오지 않은 이유를 구분해 보기"]),
    ],
    actionPlan: [
      "보완 과목은 한 번에 많이 잡기보다 1~2개로 정하기",
      "매일 10분 개념 정리, 오답 2문제 재풀이, 풀이 과정 말로 설명하기 중 하나를 학생이 직접 선택하게 하기",
      "2주 뒤 확인할 증거 정하기: 오답노트 사진, 다시 푼 문제, 개념 요약 한 장 등",
    ],
    teacherObservation,
    closingNote: "결과를 평가하는 상담보다, 다음 평가 전 무엇을 바꿀지 학생이 직접 정하게 하는 상담으로 마무리합니다.",
  };
}

export function counselingGuideToMemo(guide: CounselingGuide, studentName = "학생"): string {
  return [
    `[${studentName} 성적 상담 참고 자료]`,
    "",
    "1. 핵심 요약",
    ...guide.summary.map((item) => `- ${item}`),
    "",
    "2. 우선 상담할 보완 과목",
    ...guide.focusSubjects.flatMap((item, index) => [
      `${index + 1}) ${item.subject}`,
      `   - 근거: ${item.evidence}`,
      `   - 확인할 지점: ${item.issue}`,
      `   - 보완 방법: ${item.strategy}`,
      `   - 질문: ${item.question}`,
    ]),
    "",
    "3. 강점으로 연결할 부분",
    ...guide.strengths.map((item) => `- ${item}`),
    "",
    "4. 상담 중 질문",
    ...guide.questions.map((item) => `- ${item}`),
    "",
    "5. 다음 평가 전 실천 계획",
    ...guide.actionPlan.map((item) => `- ${item}`),
    "",
    "6. 담임 관찰내용",
    guide.teacherObservation ? `- ${guide.teacherObservation}` : "- 입력된 관찰내용이 없습니다.",
    "",
    "7. 마무리",
    `- ${guide.closingNote}`,
  ].join("\n");
}

export function buildLocalDraft(input: GenerateRequest): string {
  if (input.mode === "class") {
    const klass = classLabel(input.classContext);
    return [
      "학부모님, 안녕하십니까?",
      `한 학기의 흐름 속에서 ${klass} 학생들의 성적 통지표를 보내드립니다. 그동안 아이들이 건강하게 학교생활을 이어갈 수 있도록 관심과 격려로 함께해 주신 학부모님들께 감사드립니다.`,
      "이번 성적표는 단순한 숫자의 결과라기보다, 학생들이 수업 속에서 고민하고 질문하며 자신의 속도로 쌓아 온 과정의 기록입니다. 기대한 만큼 기뻐하는 학생도 있고 아쉬움을 느끼는 학생도 있겠지만, 중요한 것은 이 결과를 다음 배움의 출발점으로 삼는 일이라 생각합니다.",
      "가정에서도 성적을 먼저 묻기보다 아이가 어떤 부분을 성실히 해냈는지 들어주시고, 다음에는 어떤 습관을 조금 더 보완하면 좋을지 차분히 이야기해 주시면 좋겠습니다. 학교에서도 학생들이 스스로 해낼 수 있다는 마음을 잃지 않도록 꾸준히 살피겠습니다.",
      "가정에 건강과 평안이 함께하시기를 바랍니다. 감사합니다.",
    ].join("\n\n");
  }

  const context = studentContext(input);
  if (!context) return "학생을 먼저 선택해 주세요.";

  const teacher = input.teacherName ? `\n\n${input.teacherName} 드림` : "";
  const observation = observationSentence(context.name, context.observation);
  const strength = context.strengthSubject
    ? `${context.strengthSubject}에서 보여 준 꾸준함도 계속 살려 가면 좋겠습니다.`
    : "지금처럼 수업에서 보이는 성실한 태도를 이어가면 좋겠습니다.";
  const focusSentence = context.focusSubject
    ? `앞으로는 ${context.focusSubject}에서 한 가지 습관을 조금 더 연습해 보면 좋겠습니다.`
    : "앞으로는 배운 내용을 스스로 정리하는 습관을 조금 더 연습해 보면 좋겠습니다.";
  const scorePrefix = context.averageScore !== undefined && context.averageScore !== null ? "이번 평가 결과를 함께 확인했습니다. " : "";

  return [
    `${context.name} 학부모님께.`,
    `${scorePrefix}${observation} ${strength}`,
    `${focusSentence} ${context.focusAdvice}`,
    "가정에서는 결과를 바로 평가하기보다 공부한 방법을 먼저 물어봐 주세요. 매일 10분 복습하기, 읽은 내용을 말로 설명해 보기, 과제 계획을 함께 확인하기처럼 작게 지킬 수 있는 약속을 정해 주시면 도움이 되겠습니다.",
    "학교에서도 수업 참여와 학습 습관을 꾸준히 살피며 가정과 함께 지도하겠습니다.",
  ].join("\n\n") + teacher;
}

export function buildCounselingMemo(student: StudentReport | null, observation: string): string {
  if (!student) return "학생을 먼저 선택해 주세요.";

  const guide = buildLocalCounselingGuide({ student, teacherObservation: observation });
  return guide ? counselingGuideToMemo(guide, student.name) : "학생을 먼저 선택해 주세요.";
}

export function buildCounselingPrompt(input: CounselingRequest): string {
  const localGuide = buildLocalCounselingGuide(input);

  return [
    "한국 고등학교 담임교사가 학생과 성적 상담을 하기 전에 보는 내부 참고자료를 작성한다.",
    "학부모에게 보내는 문안이 아니라 교사용 상담 자료다. 따라서 성적, 석차, 백분위, 5등급제 정보는 필요한 경우 근거로 사용해도 된다.",
    "단, 학생을 단정하거나 낙인찍는 표현은 피하고, 부족한 부분은 '확인할 지점'과 '보완할 방법'으로 쓴다.",
    "제공된 데이터 밖의 사실을 추정하지 않는다. 과목별 수치가 부족하면 부족하다고 말한다.",
    "상담 중 한눈에 볼 수 있도록 아래 JSON 형식만 출력한다. 마크다운 코드블록이나 설명 문장은 쓰지 않는다.",
    "summary는 2~3개, focusSubjects는 1~3개, strengths는 1~2개, questions는 3~5개, actionPlan은 2~4개로 작성한다.",
    "focusSubjects 각 항목에는 subject, evidence, issue, strategy, question을 모두 채운다.",
    "closingNote는 상담 마무리 방향을 한 문장으로 쓴다.",
    "JSON 스키마:",
    JSON.stringify(
      {
        summary: ["핵심 요약 문장"],
        focusSubjects: [
          {
            subject: "과목명",
            evidence: "근거 수치",
            issue: "확인할 지점",
            strategy: "보완 방법",
            question: "학생에게 물어볼 질문",
          },
        ],
        strengths: ["강점으로 연결할 부분"],
        questions: ["상담 중 질문"],
        actionPlan: ["다음 평가 전 실천 계획"],
        teacherObservation: "담임 관찰내용 또는 null",
        closingNote: "마무리 방향",
      },
      null,
      2,
    ),
    "로컬 분석 참고 JSON:",
    JSON.stringify(localGuide, null, 2),
    "성적 상담 맥락 JSON:",
    JSON.stringify(counselingContext(input), null, 2),
  ].join("\n\n");
}

export function buildPrompt(input: GenerateRequest): string {
  const sharedRules = [
    "한국 고등학교 담임교사가 학부모에게 보내는 문안으로 작성한다.",
    "AI가 쓴 글처럼 거창하거나 과하게 매끄러운 표현을 피한다.",
    "담임이 실제로 쓰는 짧고 자연스러운 문장으로 쓴다.",
    "친구와 비교하는 말, 성격을 단정하는 말, 막연한 지적, 성적만 강조하는 문장을 피한다.",
    "등급, 석차, 백분위, 상위, 순위, 등급대, 평균 등급이라는 표현은 절대 쓰지 않는다.",
    `문체는 ${toneLabel(input.tone)} 톤으로 한다.`,
  ];

  if (input.mode === "class") {
    return [
      sharedRules.join("\n"),
      "단체 메시지는 학급 전체에 공통으로 들어가는 가정통신문이다.",
      "특정 학생, 특정 과목, 평균 점수, 등급, 석차, 백분위, 우수/부진 학생 수를 직접 언급하지 않는다.",
      "학급 전체의 분위기, 학생들이 한 학기 동안 노력한 과정, 가정에서의 격려 요청을 중심으로 쓴다.",
      "상투적인 문구는 줄이고 담임이 직접 전하는 말처럼 쓴다.",
      "학년과 반 정보가 있으면 자연스럽게 포함한다.",
      "550자에서 800자 사이로 쓴다.",
      "학급 맥락 JSON:",
      JSON.stringify(classMessageContext(input), null, 2),
    ].join("\n\n");
  }

  return [
    sharedRules.join("\n"),
    "개별 메시지는 성적 해설이 아니라 성장 안내에 둔다.",
    "핵심은 가정에 '담임이 이 아이를 잘 보고 있다'는 느낌이 전달되게 하는 것이다.",
    "담임 관찰내용이 있으면 가장 우선해 반영한다. 성격을 단정하지 말고 관찰된 행동과 태도로 표현한다.",
    "보완점은 한 가지 정도만 언급하고, '부족하다'가 아니라 '앞으로는 ~을 조금 더 연습하면 좋겠습니다'처럼 표현한다.",
    "가정에서 도울 방법은 매일 10분 복습하기, 읽은 내용을 말로 설명해 보기, 과제 계획 함께 확인하기처럼 실천 가능한 제안으로 쓴다.",
    "마무리는 학교와 가정이 함께 살피겠다는 협력 메시지로 쓴다.",
    "280자에서 430자 사이로 쓴다.",
    "학생 메시지 맥락 JSON:",
    JSON.stringify(studentContext(input), null, 2),
  ].join("\n\n");
}
