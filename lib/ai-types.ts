export type AiProvider = "gemini" | "openai" | "openrouter" | "compatible";
export type AiSource = AiProvider | "local";

export type AiProviderOption = {
  value: AiProvider;
  label: string;
  keyLabel: string;
  modelPlaceholder: string;
  help: string;
  requiresBaseUrl?: boolean;
};

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    value: "gemini",
    label: "Gemini",
    keyLabel: "Gemini API 키",
    modelPlaceholder: "비워두면 서버 기본 Gemini 모델 사용",
    help: "Google AI Studio에서 발급한 Gemini API 키를 사용합니다.",
  },
  {
    value: "openai",
    label: "OpenAI / ChatGPT",
    keyLabel: "OpenAI API 키",
    modelPlaceholder: "비워두면 서버 기본 OpenAI 모델 사용",
    help: "OpenAI API 키로 ChatGPT 계열 모델을 사용합니다.",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    keyLabel: "OpenRouter API 키",
    modelPlaceholder: "예: openai/gpt-4o-mini",
    help: "OpenRouter의 OpenAI 호환 API를 통해 여러 모델을 선택해 사용할 수 있습니다.",
  },
  {
    value: "compatible",
    label: "OpenAI 호환 API",
    keyLabel: "API 키",
    modelPlaceholder: "예: llama-3.3-70b-versatile",
    help: "Groq, Together, 사내 프록시처럼 OpenAI Chat Completions 형식을 지원하는 API에 연결합니다.",
    requiresBaseUrl: true,
  },
];

export const AI_PROVIDER_ORDER: AiProvider[] = AI_PROVIDER_OPTIONS.map((option) => option.value);

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = AI_PROVIDER_OPTIONS.reduce(
  (labels, option) => ({ ...labels, [option.value]: option.label }),
  {} as Record<AiProvider, string>,
);

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && AI_PROVIDER_ORDER.includes(value as AiProvider);
}

export function aiProviderLabel(value: AiSource | "idle" | null | undefined): string {
  if (!value || value === "idle") return "대기";
  if (value === "local") return "로컬";
  return AI_PROVIDER_LABELS[value];
}
