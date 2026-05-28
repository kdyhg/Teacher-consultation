import { NextRequest, NextResponse } from "next/server";
import {
  friendlyAiNotice,
  generateWithConfiguredAi,
  getAiErrorProvider,
} from "@/lib/ai-generation";
import {
  buildCounselingMemo,
  buildCounselingPrompt,
  buildLocalCounselingGuide,
  counselingGuideToMemo,
  type CounselingFocusItem,
  type CounselingGuide,
  type CounselingRequest,
} from "@/lib/local-message";

export const runtime = "nodejs";

const SYSTEM_INSTRUCTIONS =
  "너는 한국 중고등 담임교사의 학생 성적 상담 자료를 돕는 전문적인 보조자다. 제공된 성적자료만 근거로 삼고, 학생을 낙인찍지 않는다. 출력은 교사의 내부 참고자료이며, 학생과 상담하며 확인할 지점과 보완 방법을 구체적으로 제안한다. 반드시 JSON 객체만 출력한다.";

function isCounselingRequest(value: unknown): value is CounselingRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<CounselingRequest>;
  return Boolean(body.student && typeof body.student === "object");
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI 상담 자료 형식을 읽지 못했습니다.");
  }
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return items.length ? items : fallback;
}

function focusItems(value: unknown, fallback: CounselingFocusItem[]): CounselingFocusItem[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<CounselingFocusItem>;
      return {
        subject: typeof record.subject === "string" && record.subject.trim() ? record.subject.trim() : "보완 과목",
        evidence: typeof record.evidence === "string" && record.evidence.trim() ? record.evidence.trim() : "근거 수치 확인 필요",
        issue: typeof record.issue === "string" && record.issue.trim() ? record.issue.trim() : "상담 중 확인할 지점이 필요합니다.",
        strategy: typeof record.strategy === "string" && record.strategy.trim() ? record.strategy.trim() : "학습 방법을 함께 정합니다.",
        question: typeof record.question === "string" && record.question.trim() ? record.question.trim() : "어디에서 막혔는지 학생 말로 설명하게 합니다.",
      };
    })
    .filter((item): item is CounselingFocusItem => Boolean(item));
  return items.length ? items.slice(0, 3) : fallback;
}

function normalizeGuide(value: unknown, fallback: CounselingGuide): CounselingGuide {
  const record = value && typeof value === "object" ? (value as Partial<CounselingGuide>) : {};
  return {
    summary: stringArray(record.summary, fallback.summary).slice(0, 4),
    focusSubjects: focusItems(record.focusSubjects, fallback.focusSubjects),
    strengths: stringArray(record.strengths, fallback.strengths).slice(0, 3),
    questions: stringArray(record.questions, fallback.questions).slice(0, 6),
    actionPlan: stringArray(record.actionPlan, fallback.actionPlan).slice(0, 5),
    teacherObservation:
      typeof record.teacherObservation === "string" && record.teacherObservation.trim()
        ? record.teacherObservation.trim()
        : fallback.teacherObservation,
    closingNote:
      typeof record.closingNote === "string" && record.closingNote.trim() ? record.closingNote.trim() : fallback.closingNote,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!isCounselingRequest(body)) {
    return NextResponse.json({ error: "학생 성적자료가 필요합니다." }, { status: 400 });
  }

  const fallbackGuide = buildLocalCounselingGuide(body);
  const fallback = fallbackGuide
    ? counselingGuideToMemo(fallbackGuide, body.student?.name)
    : buildCounselingMemo(body.student ?? null, body.teacherObservation ?? "");
  const prompt = buildCounselingPrompt(body);

  try {
    const aiResponse = await generateWithConfiguredAi({
      prompt,
      systemInstructions: SYSTEM_INSTRUCTIONS,
      settings: {
        provider: body.aiProvider,
        apiKey: body.apiKey,
        model: body.model,
        baseUrl: body.baseUrl,
        legacyGeminiApiKey: body.geminiApiKey,
      },
      maxOutputTokens: 1500,
    });

    if (!aiResponse) {
      return NextResponse.json({
        memo: fallback,
        guide: fallbackGuide,
        source: "local",
        notice: "API 키가 없어 로컬 상담 자료를 생성했습니다.",
      });
    }

    const guide = fallbackGuide ? normalizeGuide(parseJsonObject(aiResponse.text), fallbackGuide) : null;
    return NextResponse.json({
      memo: guide ? counselingGuideToMemo(guide, body.student?.name) : aiResponse.text || fallback,
      guide,
      source: aiResponse.provider,
      model: aiResponse.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 요청 중 오류가 발생했습니다.";
    return NextResponse.json({
      memo: fallback,
      guide: fallbackGuide,
      source: "local",
      notice: friendlyAiNotice(message, "상담 자료를", getAiErrorProvider(error)),
    });
  }
}
