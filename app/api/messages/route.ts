import { NextRequest, NextResponse } from "next/server";
import {
  friendlyAiNotice,
  generateWithConfiguredAi,
  getAiErrorProvider,
} from "@/lib/ai-generation";
import { buildLocalDraft, buildPrompt, type GenerateRequest } from "@/lib/local-message";

export const runtime = "nodejs";

const SYSTEM_INSTRUCTIONS =
  "너는 한국 중고등 담임교사의 학부모 소통 문안을 돕는 조심스럽고 전문적인 보조자다. 개인정보를 새로 추정하지 말고, 제공된 데이터 범위 안에서만 작성한다. 성적 분석은 문안의 방향을 잡는 내부 참고로만 사용하고, 학부모에게는 따뜻하고 실천 가능한 지원 방향으로 말한다. AI가 쓴 글처럼 과하게 매끈하거나 거창한 표현은 피하고, 담임이 직접 쓴 듯한 자연스러운 문장으로 쓴다. 등급, 등급대, 석차, 백분위, 상위, 하위, 평균 등급 같은 표현은 출력하지 않는다. 출력은 한국어 본문만 제공한다.";

const FORBIDDEN_GRADE_LANGUAGE = /등급|등급대|석차|백분위|상위\s*\d*|하위|평균\s*등급|rank|percentile/i;

function isGenerateRequest(value: unknown): value is GenerateRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<GenerateRequest>;
  return (body.mode === "individual" || body.mode === "class") && (body.tone === "warm" || body.tone === "formal" || body.tone === "brief");
}

function finalizeAiMessage(generated: string, fallback: string) {
  const message = generated.trim();
  if (!message) {
    return { message: fallback, usedFallback: true };
  }
  if (fallback.length > 120 && message.length < 120) {
    return {
      message: fallback,
      usedFallback: true,
      notice: "AI 응답이 너무 짧게 생성되어 담임용 로컬 초안으로 바꾸었습니다. 다시 생성하면 새 응답을 시도합니다.",
    };
  }
  if (FORBIDDEN_GRADE_LANGUAGE.test(message)) {
    return {
      message: fallback,
      usedFallback: true,
      notice: "AI 초안에 등급이나 석차 표현이 포함되어 담임용 로컬 초안으로 바꾸었습니다.",
    };
  }
  return { message, usedFallback: false };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!isGenerateRequest(body)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const fallback = buildLocalDraft(body);
  const prompt = buildPrompt(body);

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
      maxOutputTokens: 900,
    });

    if (!aiResponse) {
      return NextResponse.json({
        message: fallback,
        source: "local",
        notice: "API 키가 없어 로컬 초안을 생성했습니다.",
      });
    }

    const generated = finalizeAiMessage(aiResponse.text, fallback);
    return NextResponse.json({
      message: generated.message,
      source: generated.usedFallback ? "local" : aiResponse.provider,
      model: aiResponse.model,
      notice: generated.notice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 요청 중 오류가 발생했습니다.";
    return NextResponse.json({
      message: fallback,
      source: "local",
      notice: friendlyAiNotice(message, "초안을", getAiErrorProvider(error)),
    });
  }
}
