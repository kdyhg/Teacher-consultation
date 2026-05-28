# 담임 상담 워크벤치

나이스 성적 자료를 담임 상담 흐름에 맞게 정리하는 Next.js 앱입니다. 성적통지표, 학기말성적종합일람표, 인쇄용 성적표 데이터를 브라우저에서 읽고 학생별 상담 자료와 가정 메시지 초안을 생성합니다.

## 주요 기능

- 여러 성적 파일 동시 업로드 및 통합 분석
- 성적통지표 반복 블록, 학기말 종합일람표, 인쇄용 성적표 자동 감지
- 학생별 평균점수, 평균 5등급, 추정 9등급, 과목별 석차/백분위 요약
- 교과군별·과목별 학급 흐름 브리핑
- 순위 표시/숨김 토글
- 개인정보 제외 CSV, 정적 HTML 브리핑 내보내기
- Gemini 또는 OpenAI API 기반 가정 메시지·성적 상담 자료 생성
- API 키가 없을 때도 로컬 규칙 기반 초안 생성

## 개인정보

- 파일 파싱과 기본 성적 분석은 브라우저에서 수행됩니다.
- AI 생성 버튼을 누를 때만 선택된 학생 요약 또는 학급 요약이 API Route로 전달됩니다.
- CSV와 HTML 내보내기는 기본적으로 개인정보를 제외합니다.
- `.env.local`, 업로드 파일, 로그 파일은 Git에 포함하지 않도록 제외했습니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## AI 생성 설정

공유 사이트에서 각 사용자가 자신의 AI API 키를 쓰게 하려면 웹 화면의 **상담·문안 > 개인 AI API 설정** 영역에서 Gemini, OpenAI/ChatGPT, OpenRouter, OpenAI 호환 API 중 하나를 선택하고 키를 입력하면 됩니다. 키는 생성 요청 때만 서버 API Route로 전달되며, "이 브라우저에 제공자 설정과 키 저장"을 켠 경우에만 해당 브라우저 localStorage에 저장됩니다.

사이트 운영자 공용 키를 쓰려면 `.env.local` 또는 Vercel 환경 변수에 다음 값을 설정합니다.

```bash
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash
```

OpenAI/ChatGPT, OpenRouter, OpenAI 호환 API를 공용 공급자로 쓰려면 다음 값도 사용할 수 있습니다.

```bash
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-5.4-mini

OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openai/gpt-4o-mini

OPENAI_COMPATIBLE_API_KEY=your-compatible-api-key
OPENAI_COMPATIBLE_BASE_URL=https://api.example.com/v1
OPENAI_COMPATIBLE_MODEL=your-model-name
```

## 주의

앱의 등급 및 9등급 환산은 상담용 참고값입니다. 학교별 학업성적관리규정, 동점자 처리 방식, 지역별 환산 기준과 다를 수 있으므로 공식 산출값으로 사용하지 마세요.
