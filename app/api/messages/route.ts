import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { buildLocalDraft, buildPrompt, type GenerateRequest } from "@/lib/local-message";

export const runtime = "nodejs";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

const SYSTEM_INSTRUCTIONS =
  "너는 한국 학교 담임교사의 학부모 소통 문안을 돕는 조심스럽고 전문적인 보조자다. 개인정보를 새로 추정하지 말고, 제공된 데이터 범위 안에서만 작성한다. 성적 분석은 문안의 방향을 잡는 내부 참고로만 사용하고, 학부모에게는 따뜻하고 실천 가능한 지도 방향으로 풀어 쓴다. AI가 쓴 글처럼 과하게 매끈하거나 거창한 표현을 피하고, 담임이 직접 적은 짧고 담백한 문장으로 쓴다. 등급, 등급대, 석차, 백분위, 상위, 순위, 평균 등급 같은 표현은 절대 출력하지 않는다. 출력은 한국어 본문만 제공한다.";

const FORBIDDEN_GRADE_LANGUAGE = /등급|등급대|석차|백분위|상위\s*\d*|순위|평균\s*등급|rank|percentile/i;

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

function geminiGenerationConfig(maxOutputTokens: number) {
  return {
    maxOutputTokens,
    ...(GEMINI_MODEL.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "LOW" } } : {}),
  };
}

function isGenerateRequest(value: unknown): value is GenerateRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<GenerateRequest>;
  return (body.mode === "individual" || body.mode === "class") && (body.tone === "warm" || body.tone === "formal" || body.tone === "brief");
}

function extractGeminiText(data: GeminiResponse): string {
  return (
    data.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text)
      .filter((text): text is string => Boolean(text))
      .join("")
      .trim() ?? ""
  );
}

function friendlyAiNotice(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("quota") || lower.includes("rate-limit") || lower.includes("rate limit")) {
    return "Gemini API 할당량 또는 사용 한도 문제로 로컬 초안을 생성했습니다.";
  }
  if (lower.includes("expired") || lower.includes("api key not valid") || lower.includes("invalid api key")) {
    return "Gemini API 키를 확인할 수 없어 로컬 초안을 생성했습니다. 새 키를 발급해 환경 변수에 다시 등록해 주세요.";
  }
  if (lower.includes("high demand")) {
    return "Gemini 모델 사용량이 많아 로컬 초안을 생성했습니다. 잠시 뒤 다시 시도해 주세요.";
  }
  return message;
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
      notice: "AI 응답이 너무 짧게 생성되어 담임용 로컬 초안으로 바꿨습니다. 다시 생성하면 새 응답을 시도합니다.",
    };
  }
  if (FORBIDDEN_GRADE_LANGUAGE.test(message)) {
    return {
      message: fallback,
      usedFallback: true,
      notice: "AI 초안에 등급이나 석차 표현이 포함되어 담임용 로컬 초안으로 바꿨습니다.",
    };
  }
  return { message, usedFallback: false };
}

async function generateWithGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("Gemini API 키가 없습니다.");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTIONS }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: geminiGenerationConfig(4096),
    }),
  });

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) throw new Error(data.error?.message ?? "Gemini 요청 중 오류가 발생했습니다.");

  if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new Error("Gemini 응답이 토큰 제한에 걸려 중간에 끊겼습니다.");
  }

  return extractGeminiText(data);
}

async function generateWithOpenAI(prompt: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API 키가 없습니다.");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: OPENAI_MODEL,
    instructions: SYSTEM_INSTRUCTIONS,
    input: prompt,
    max_output_tokens: 900,
  });

  return response.output_text?.trim() ?? "";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!isGenerateRequest(body)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const fallback = buildLocalDraft(body);
  const prompt = buildPrompt(body);

  try {
    if (GEMINI_API_KEY) {
      const generated = finalizeAiMessage(await generateWithGemini(prompt), fallback);
      return NextResponse.json({
        message: generated.message,
        source: generated.usedFallback ? "local" : "gemini",
        model: GEMINI_MODEL,
        notice: generated.notice,
      });
    }

    if (process.env.OPENAI_API_KEY) {
      const generated = finalizeAiMessage(await generateWithOpenAI(prompt), fallback);
      return NextResponse.json({
        message: generated.message,
        source: generated.usedFallback ? "local" : "openai",
        model: OPENAI_MODEL,
        notice: generated.notice,
      });
    }

    return NextResponse.json({
      message: fallback,
      source: "local",
      notice: "API 키가 없어 로컬 초안을 생성했습니다.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 요청 중 오류가 발생했습니다.";
    return NextResponse.json({
      message: fallback,
      source: "local",
      notice: friendlyAiNotice(message),
    });
  }
}
