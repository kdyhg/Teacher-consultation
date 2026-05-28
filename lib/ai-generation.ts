import OpenAI from "openai";
import { AI_PROVIDER_LABELS, AI_PROVIDER_ORDER, isAiProvider, type AiProvider } from "@/lib/ai-types";

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

type AiProviderConfig = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type AiGenerationSettings = {
  provider?: unknown;
  apiKey?: unknown;
  model?: unknown;
  baseUrl?: unknown;
  legacyGeminiApiKey?: unknown;
};

export type AiGenerationResult = {
  text: string;
  provider: AiProvider;
  model: string;
};

export class AiGenerationError extends Error {
  provider: AiProvider;

  constructor(provider: AiProvider, message: string) {
    super(message);
    this.name = "AiGenerationError";
    this.provider = provider;
  }
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanApiKey(value: unknown): string {
  const trimmed = cleanString(value);
  return trimmed.length >= 8 ? trimmed : "";
}

function envApiKey(provider: AiProvider): string {
  if (provider === "gemini") {
    return cleanApiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY);
  }
  if (provider === "openai") return cleanApiKey(process.env.OPENAI_API_KEY);
  if (provider === "openrouter") return cleanApiKey(process.env.OPENROUTER_API_KEY);
  return cleanApiKey(process.env.OPENAI_COMPATIBLE_API_KEY || process.env.CUSTOM_AI_API_KEY);
}

function envModel(provider: AiProvider): string {
  if (provider === "gemini") return cleanString(process.env.GEMINI_MODEL) || "gemini-3.5-flash";
  if (provider === "openai") return cleanString(process.env.OPENAI_MODEL) || "gpt-5.4-mini";
  if (provider === "openrouter") return cleanString(process.env.OPENROUTER_MODEL) || "openai/gpt-4o-mini";
  return cleanString(process.env.OPENAI_COMPATIBLE_MODEL || process.env.CUSTOM_AI_MODEL);
}

function envBaseUrl(provider: AiProvider): string {
  if (provider === "openrouter") return OPENROUTER_BASE_URL;
  if (provider === "compatible") return cleanString(process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.CUSTOM_AI_BASE_URL);
  return "";
}

function requestedProvider(settings: AiGenerationSettings): AiProvider | null {
  return isAiProvider(settings.provider) ? settings.provider : null;
}

function providerList(settings: AiGenerationSettings): AiProvider[] {
  const requested = requestedProvider(settings);
  if (requested) return [requested];
  if (cleanApiKey(settings.legacyGeminiApiKey)) return ["gemini"];
  return AI_PROVIDER_ORDER;
}

function resolveProvider(settings: AiGenerationSettings): AiProviderConfig | null {
  const requested = requestedProvider(settings);

  for (const provider of providerList(settings)) {
    const requestApiKey = requested === provider ? cleanApiKey(settings.apiKey) : "";
    const legacyGeminiApiKey = provider === "gemini" ? cleanApiKey(settings.legacyGeminiApiKey) : "";
    const apiKey = requestApiKey || legacyGeminiApiKey || envApiKey(provider);

    if (!apiKey) {
      if (requested) throw new AiGenerationError(provider, `${AI_PROVIDER_LABELS[provider]} API 키가 없습니다.`);
      continue;
    }

    const model = (requested === provider ? cleanString(settings.model) : "") || envModel(provider);
    const baseUrl = provider === "openrouter"
      ? OPENROUTER_BASE_URL
      : provider === "compatible"
        ? (requested === provider ? cleanString(settings.baseUrl) : "") || envBaseUrl(provider)
        : undefined;

    if (!model) throw new AiGenerationError(provider, `${AI_PROVIDER_LABELS[provider]} 모델명이 필요합니다.`);
    if (provider === "compatible" && !baseUrl) {
      throw new AiGenerationError(provider, "OpenAI 호환 API의 Base URL이 필요합니다.");
    }

    return { provider, apiKey, model, baseUrl };
  }

  return null;
}

function geminiGenerationConfig(model: string, maxOutputTokens: number) {
  return {
    maxOutputTokens,
    ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "LOW" } } : {}),
  };
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

async function generateWithGemini(prompt: string, systemInstructions: string, config: AiProviderConfig, maxOutputTokens: number): Promise<string> {
  const modelPath = config.model.replace(/^models\//, "");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstructions }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: geminiGenerationConfig(config.model, maxOutputTokens),
    }),
  });

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) throw new Error(data.error?.message ?? "Gemini 요청 중 오류가 발생했습니다.");
  if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new Error("Gemini 응답이 토큰 제한에 걸려 중간에 끊겼습니다.");
  }

  return extractGeminiText(data);
}

async function generateWithOpenAI(prompt: string, systemInstructions: string, config: AiProviderConfig, maxOutputTokens: number): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey });
  const response = await client.responses.create({
    model: config.model,
    instructions: systemInstructions,
    input: prompt,
    max_output_tokens: maxOutputTokens,
  });

  return response.output_text?.trim() ?? "";
}

async function generateWithOpenAICompatible(
  prompt: string,
  systemInstructions: string,
  config: AiProviderConfig,
  maxOutputTokens: number,
): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: systemInstructions },
      { role: "user", content: prompt },
    ],
    max_tokens: maxOutputTokens,
  });
  const content: unknown = response.choices[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

export async function generateWithConfiguredAi({
  prompt,
  systemInstructions,
  settings,
  maxOutputTokens,
}: {
  prompt: string;
  systemInstructions: string;
  settings: AiGenerationSettings;
  maxOutputTokens: number;
}): Promise<AiGenerationResult | null> {
  const config = resolveProvider(settings);
  if (!config) return null;

  try {
    const text = config.provider === "gemini"
      ? await generateWithGemini(prompt, systemInstructions, config, maxOutputTokens)
      : config.provider === "openai"
        ? await generateWithOpenAI(prompt, systemInstructions, config, maxOutputTokens)
        : await generateWithOpenAICompatible(prompt, systemInstructions, config, maxOutputTokens);

    return { text, provider: config.provider, model: config.model };
  } catch (error) {
    throw new AiGenerationError(config.provider, error instanceof Error ? error.message : "AI 요청 중 오류가 발생했습니다.");
  }
}

export function getAiErrorProvider(error: unknown): AiProvider | undefined {
  return error instanceof AiGenerationError ? error.provider : undefined;
}

export function friendlyAiNotice(message: string, targetLabel: string, provider?: AiProvider): string {
  const lower = message.toLowerCase();
  const label = provider ? AI_PROVIDER_LABELS[provider] : "AI";

  if (
    lower.includes("denied access") ||
    lower.includes("permission_denied") ||
    lower.includes("permission denied") ||
    lower.includes("forbidden") ||
    lower.includes("403")
  ) {
    return `${label} 프로젝트 또는 API 키에 이 모델을 호출할 권한이 없어 로컬 ${targetLabel} 생성했습니다. 키가 차단되었는지, API 사용 권한과 결제/프로젝트 상태가 정상인지 확인해 주세요.`;
  }
  if (lower.includes("quota") || lower.includes("rate-limit") || lower.includes("rate limit") || lower.includes("429")) {
    return `${label} API 할당량 또는 사용 한도 문제로 로컬 ${targetLabel} 생성했습니다.`;
  }
  if (lower.includes("expired") || lower.includes("api key not valid") || lower.includes("invalid api key") || lower.includes("unauthorized")) {
    return `${label} API 키를 확인할 수 없어 로컬 ${targetLabel} 생성했습니다. 새 키를 발급하거나 입력값을 다시 확인해 주세요.`;
  }
  if (lower.includes("not found") || lower.includes("model")) {
    return `${label} 모델 이름 또는 접근 권한을 확인할 수 없어 로컬 ${targetLabel} 생성했습니다. 모델명을 비워 서버 기본값을 쓰거나, 제공자 콘솔에서 사용 가능한 모델명을 확인해 주세요.`;
  }
  if (lower.includes("high demand") || lower.includes("unavailable") || lower.includes("503")) {
    return `${label} 모델 사용량이 많아 로컬 ${targetLabel} 생성했습니다. 잠시 뒤 다시 시도해 주세요.`;
  }
  return message;
}
