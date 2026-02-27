import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { settingsAPI, knowledgeAPI, agentsAPI, sessionsAPI, mcpAPI } from '../api/client';
import { generateUUID } from '../utils/uuid';

const StoreContext = createContext();

// localStorage 쓰기를 디바운스하기 위한 유틸리티
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// 백엔드 snake_case → 프론트엔드 camelCase 변환
const backendToFrontend = (b) => ({
  llm: b.llm_model,
  embeddingModel: b.embedding_model,
  vlm: b.vlm_model,
  enableMultimodal: b.enable_multimodal,
  retrieval: b.retrieval_mode,
  searchTopK: b.search_top_k,
  useRerank: b.use_rerank,
  searchMode: b.search_mode || 'hybrid',
  denseWeight: b.dense_weight ?? 0.5,
  useMultimodalSearch: b.use_multimodal_search || false,
  systemPrompt: b.system_prompt || "",
  theme: b.theme,
  activeSearchProviderId: b.active_search_provider_id,
  storageType: b.storage_type,
  bucketName: b.bucket_name,
});

// 프론트엔드 camelCase → 백엔드 snake_case 변환
const frontendToBackend = (f) => ({
  llm_model: f.llm,
  embedding_model: f.embeddingModel,
  vlm_model: f.vlm,
  enable_multimodal: f.enableMultimodal,
  retrieval_mode: f.retrieval,
  search_top_k: f.searchTopK,
  use_rerank: f.useRerank,
  search_mode: f.searchMode || 'hybrid',
  dense_weight: f.denseWeight ?? 0.5,
  use_multimodal_search: f.useMultimodalSearch || false,
  system_prompt: f.systemPrompt,
  theme: f.theme,
  active_search_provider_id: f.activeSearchProviderId,
  storage_type: f.storageType,
  bucket_name: f.bucketName,
});

const serializeDefaultTools = (tools) => {
  if (tools == null) return null;
  if (typeof tools === 'string') return tools;
  try {
    return JSON.stringify(tools);
  } catch {
    return null;
  }
};

const CONFIG_DEFAULTS = {
  llm: 'gemma3:12b',
  embeddingModel: 'bge-m3',
  enableMultimodal: true,
  vlm: 'llava:7b',
  storageType: 'minio',
  bucketName: 'rag-ai-bucket',
  retrieval: 'hybrid',
  useRerank: true,
  searchMode: 'hybrid',
  denseWeight: 0.5,
  useMultimodalSearch: false,
  systemPrompt: "당신은 정확한 근거를 바탕으로 답변하는 AI 어시스턴트입니다.",
  theme: 'Light',
  searchTopK: 5,
  activeSearchProviderId: 'ddg'
};

export function StoreProvider({ children }) {
  const { isAuthenticated } = useAuth();

  // --- 설정 (민감한 정보 제외) ---
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('rag_ai_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        delete parsed.neo4jPassword;
        delete parsed.redisPassword;
        return { ...CONFIG_DEFAULTS, ...parsed };
      } catch (e) {
        console.error('Config parse error:', e);
      }
    }
    return CONFIG_DEFAULTS;
  });

  // 백엔드 동기화 상태 추적 (초기 로드 시 무한 루프 방지)
  const settingsSyncedRef = useRef(false);
  const skipNextBackendSync = useRef(false);

  const [apiKeys, setApiKeys] = useState(() => JSON.parse(localStorage.getItem('rag_ai_api_keys')) || []);
  const [mcpServers, setMcpServers] = useState(() => JSON.parse(localStorage.getItem('rag_ai_mcp')) || [
    { id: 'mcp-1', name: 'Filesystem', type: 'stdio', status: 'connected', enabled: true },
    { id: 'mcp-2', name: 'Google Drive', type: 'sse', status: 'disconnected', enabled: false }
  ]);
  const [searchProviders] = useState([
    { id: 'ddg', name: 'DuckDuckGo', type: 'free', description: '무료, API 키 불필요', needsKey: false },
    { id: 'brave', name: 'Brave Search', type: 'api', description: '무료 2,000회/월', needsKey: true },
    { id: 'tavily', name: 'Tavily AI', type: 'api', description: 'AI 검색 특화, 무료 1,000회/월', needsKey: true },
    { id: 'serper', name: 'Google Serper', type: 'api', description: 'Google 검색, 2,500회 무료', needsKey: true }
  ]);

  const [knowledgeBases, setKnowledgeBases] = useState(() => {
    const saved = localStorage.getItem('rag_ai_kbs');
    if (saved) {
      try {
        return JSON.parse(saved).map(kb => ({
          ...kb,
          config: kb.config || { chunkSize: 512, chunkOverlap: 50 }
        }));
      } catch (e) {
        console.error(e);
      }
    }
    return [{
      id: 'default',
      name: '기본 지식 베이스',
      description: '기본 문서 저장소',
      files: [],
      config: { chunkSize: 512, chunkOverlap: 50 },
      created_at: new Date().toLocaleDateString()
    }];
  });
  const [currentKbId, setCurrentKbId] = useState('default');

  // 도구 기본 프리셋 (sources만)
  const DEFAULT_TOOL_PRESET = {
    sources: { rag: true, web_search: false, mcp: false, sql: false },
  };

  // 구형식 → 신형식 마이그레이션 함수
  const migrateDefaultTools = (raw) => {
    if (!raw) return DEFAULT_TOOL_PRESET;
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return DEFAULT_TOOL_PRESET;
      }
    }
    // 이미 신형식 (sources만)
    if ('sources' in parsed && !('smartMode' in parsed)) return parsed;
    // smartMode가 있는 이전 형식 → sources만 추출
    if ('sources' in parsed) return { sources: parsed.sources };
    // 가장 구형식: { rag, web_search, mcp, sql, deep_think }
    const { deep_think, smartMode, ...sources } = parsed;
    return { sources };
  };

  const SYSTEM_AGENT_PROMPTS = {
    'agent-general': `당신은 "RAG AI 비서"입니다.

핵심 역할:
- 다양한 주제의 질문에 정확하고 실용적으로 답변합니다.
- 사용자의 목적(학습, 업무, 의사결정, 작성)을 우선 파악하고 맞춤형 답변을 제공합니다.
- 복잡한 주제는 단계적으로 분해하여 이해하기 쉽게 설명합니다.

응답 원칙:
1. 정확성 우선: 확실하지 않은 내용은 추정임을 명확히 표시합니다.
2. 구조화: 제목, 핵심 요약, 실행 단계, 예시를 활용해 읽기 쉽게 작성합니다.
3. 한국어 중심: 기술 용어는 필요 시 영어 원문을 병기합니다.
4. 실행 가능성: 사용자가 바로 행동할 수 있는 다음 단계/체크리스트를 제공합니다.
5. 안전성: 의료/법률/재무 등 고위험 주제는 일반 정보로 안내하고 전문 검토를 권고합니다.`,

    'agent-rag': `당신은 "RAG AI 문서 분석 전문가"입니다.

핵심 역할:
- 제공된 지식 베이스 문서 안에서 근거를 찾아 답변합니다.
- 문서 간 일치/충돌 사항을 비교하고 차이를 명확히 설명합니다.
- 문서에 없는 정보는 추측하지 않고 "근거 없음"으로 답합니다.

응답 원칙:
1. 근거 중심: 핵심 주장마다 관련 문서/문맥을 연결해 설명합니다.
2. 충실성: 원문 의미를 왜곡하지 않고 요약합니다.
3. 범위 통제: 지식 베이스 범위를 벗어난 질문은 별도 확인이 필요하다고 안내합니다.
4. 투명성: 불확실성, 누락 데이터, 상충되는 근거를 명시합니다.
5. 실무형 출력: 요청 시 요약표, 비교표, 체크리스트로 정리합니다.`,

    'system-supervisor': `당신은 "감독(Supervisor) 에이전트"입니다.

핵심 역할:
- 사용자 요청을 분석해 하위 전문 에이전트(RAG, Web, SQL, MCP, 물류)의 활용 우선순위를 결정합니다.
- 단일 소스로 충분하면 과도한 도구 사용을 피하고, 복합 요청일 때만 다중 소스를 결합합니다.
- 최종 응답은 사용자 관점의 하나의 결과물로 통합합니다.

판단 규칙:
1. 의도 분해: 정보 탐색, 데이터 조회, 실행 작업, 운영 계획으로 질의를 분류합니다.
2. 에이전트 라우팅:
   - 문서 기반 사실 확인 -> RAG 우선
   - 최신 외부 정보 필요 -> Web 우선
   - 정량 데이터 조회/집계 -> SQL 우선
   - 외부 도구 실행/조작 -> MCP 우선
   - 배차/경로/운영 시나리오 -> 물류 우선
3. 보수적 실행: 근거가 부족하면 먼저 확인 질문을 하거나 가정을 명시합니다.
4. 결과 통합: 중복 정보를 제거하고 결론, 근거, 한계, 다음 행동을 분리해 제시합니다.`,

    'system-rag': `당신은 "RAG 검색 에이전트"입니다.

핵심 역할:
- 지식 베이스에서 질의와 가장 관련된 근거를 찾고 핵심만 추려 전달합니다.
- 길고 복잡한 문서는 질문 목적에 맞춰 필요한 부분만 압축합니다.

응답 원칙:
1. 근거 우선: 근거 없는 일반론은 최소화합니다.
2. 관련성 우선: 질문과 직접 관련된 내용부터 제시합니다.
3. 모순 처리: 문서 간 충돌이 있으면 각각을 분리해 설명합니다.
4. 정직성: 근거가 불충분하면 "확인 불가"로 응답합니다.
5. 출력 형식: 결론 -> 근거 요약 -> 참고/제약 순서로 답합니다.`,

    'system-web': `당신은 "웹 검색 에이전트"입니다.

핵심 역할:
- 최신성, 공식성, 신뢰도를 고려해 웹 정보를 수집·요약합니다.
- 서로 다른 출처를 교차검증해 사실성과 편향 가능성을 함께 제시합니다.

응답 원칙:
1. 최신성 명시: 중요 정보에는 시점(발행/업데이트)을 함께 설명합니다.
2. 출처 품질: 1차 출처(공식 문서, 원문 발표)를 우선합니다.
3. 검증: 단일 출처 단정은 피하고 가능한 범위에서 교차 확인합니다.
4. 불확실성: 확인되지 않은 내용은 가설/추정으로 구분합니다.
5. 요약 방식: 핵심 사실, 영향, 사용자가 취할 행동 순으로 정리합니다.`,

    'system-sql': `당신은 "T2SQL 에이전트"입니다.

핵심 역할:
- 자연어 질문을 안전하고 정확한 SQL 조회로 변환합니다.
- 스키마와 비즈니스 메타데이터를 최대한 활용해 의도에 맞는 쿼리를 작성합니다.

안전/품질 규칙:
1. 읽기 전용 원칙: 기본적으로 SELECT 계열 조회를 우선합니다.
2. 명확성: 스키마가 불명확하면 임의 추정 대신 확인 질문을 제시합니다.
3. 정확성: 날짜 범위, 집계 기준, 단위/통화 조건을 명시적으로 처리합니다.
4. 성능: 불필요한 전체 스캔을 피하고 필요한 컬럼만 조회합니다.
5. 결과 설명: SQL 의도, 해석 주의점, 한계를 함께 안내합니다.`,

    'system-mcp': `당신은 "MCP 도구 에이전트"입니다.

핵심 역할:
- 연결된 MCP 도구를 활용해 외부 시스템 작업(조회/실행/자동화)을 수행합니다.
- 도구 호출 결과를 사용자에게 이해 가능한 형태로 정리합니다.

실행 원칙:
1. 계획 후 실행: 도구 호출 전 목표/입력/예상 결과를 짧게 정리합니다.
2. 최소 권한: 필요한 범위의 도구만 선택적으로 사용합니다.
3. 실패 복원: 실패 시 원인, 재시도 방법, 대체 경로를 안내합니다.
4. 검증: 도구 결과를 그대로 복붙하지 않고 의미를 검토해 요약합니다.
5. 투명성: 수행한 작업과 확인된 결과, 미확인 항목을 구분합니다.`,

    'system-process': `당신은 "물류/운영 프로세스 에이전트"입니다.

핵심 역할:
- 배차, 경로, 리소스 할당, 운영 SOP 관점에서 실행 가능한 계획을 제시합니다.
- 비용, 시간, 서비스 수준, 리스크 간 트레이드오프를 설명합니다.

분석 원칙:
1. 제약 우선: 차량/인력/시간창/우선순위 제약을 먼저 명시합니다.
2. 목표 함수: 비용 최소화, 리드타임 단축, SLA 준수 등 목표를 분리합니다.
3. 시나리오 비교: 기본안/대안과 예상 효과를 표 형태로 비교합니다.
4. 예외 처리: 지연, 결품, 교통 이슈 등 비정상 상황 대응안을 포함합니다.
5. 실행성: 즉시 적용 가능한 단계별 액션 플랜과 KPI를 제시합니다.`,
  };

  const LEGACY_SYSTEM_PROMPTS = new Set([
    "당신은 RAG AI 비서입니다.",
    "당신은 RAG 문서 분석 전문가입니다.",
    "사용자의 질의 의도를 분석하여 적절한 전문 에이전트(RAG, 웹검색, SQL, MCP, 물류)에게 작업을 위임하는 감독 에이전트입니다.",
  ]);

  const resolveSystemPrompt = (agentId, prompt) => {
    const fallback = SYSTEM_AGENT_PROMPTS[agentId];
    const normalized = (prompt || '').trim();
    if (!fallback) return normalized;
    if (!normalized) return fallback;
    if (LEGACY_SYSTEM_PROMPTS.has(normalized)) return fallback;
    return normalized;
  };

  // 시스템 전문 에이전트 정의
  const SYSTEM_AGENTS = [
    {
      id: 'agent-general',
      name: '일반 대화 비서',
      agentType: 'custom',
      description: '지식 베이스 없이 자유로운 주제로 대화하는 범용 AI 비서입니다.',
      model: 'gemma3:12b',
      systemPrompt: SYSTEM_AGENT_PROMPTS['agent-general'],
      icon: 'sparkles',
      published: true,
      defaultTools: { sources: { rag: false, web_search: false, mcp: false, sql: false } },
      updated_at: new Date().toLocaleDateString()
    },
    {
      id: 'agent-rag',
      name: '문서 분석 전문가',
      agentType: 'custom',
      description: '업로드된 지식 베이스를 기반으로 정확하게 답변하는 RAG 에이전트입니다.',
      model: 'gemma3:12b',
      systemPrompt: SYSTEM_AGENT_PROMPTS['agent-rag'],
      icon: 'file-text',
      published: true,
      defaultTools: { sources: { rag: true, web_search: false, mcp: false, sql: false } },
      updated_at: new Date().toLocaleDateString()
    },
    {
      id: 'system-supervisor',
      name: '감독 에이전트',
      agentType: 'supervisor',
      description: '사용자 질의를 분석하고 적절한 전문 에이전트에게 작업을 할당합니다.',
      model: 'gemma3:12b',
      systemPrompt: SYSTEM_AGENT_PROMPTS['system-supervisor'],
      icon: 'brain',
      published: true,
      defaultTools: { sources: { rag: true, web_search: true, mcp: false, sql: false } },
      updated_at: new Date().toLocaleDateString()
    },
    {
      id: 'system-rag',
      name: 'RAG 검색 에이전트',
      agentType: 'rag',
      description: '지식 베이스에서 관련 문서를 검색하고 분석합니다.',
      model: 'gemma3:12b',
      systemPrompt: SYSTEM_AGENT_PROMPTS['system-rag'],
      icon: 'file-text',
      published: true,
      defaultTools: { sources: { rag: true, web_search: false, mcp: false, sql: false } },
      updated_at: new Date().toLocaleDateString()
    },
    {
      id: 'system-web',
      name: '웹 검색 에이전트',
      agentType: 'web_search',
      description: '인터넷에서 최신 정보를 검색합니다.',
      model: 'gemma3:12b',
      systemPrompt: SYSTEM_AGENT_PROMPTS['system-web'],
      icon: 'globe',
      published: true,
      defaultTools: { sources: { rag: false, web_search: true, mcp: false, sql: false } },
      updated_at: new Date().toLocaleDateString()
    },
    {
      id: 'system-sql',
      name: 'T2SQL 에이전트',
      agentType: 't2sql',
      description: '자연어를 SQL로 변환하여 데이터베이스를 조회합니다.',
      model: 'gemma3:12b',
      systemPrompt: SYSTEM_AGENT_PROMPTS['system-sql'],
      icon: 'database',
      published: true,
      defaultTools: { sources: { rag: false, web_search: false, mcp: false, sql: true } },
      updated_at: new Date().toLocaleDateString()
    },
    {
      id: 'system-mcp',
      name: 'MCP 도구 에이전트',
      agentType: 'mcp',
      description: '외부 MCP 도구를 사용하여 작업을 수행합니다.',
      model: 'gemma3:12b',
      systemPrompt: SYSTEM_AGENT_PROMPTS['system-mcp'],
      icon: 'plug',
      published: true,
      defaultTools: { sources: { rag: false, web_search: false, mcp: true, sql: false } },
      updated_at: new Date().toLocaleDateString()
    },
    {
      id: 'system-process',
      name: '물류 에이전트',
      agentType: 'process',
      description: '배차, 경로 최적화 등 물류 업무를 처리합니다.',
      model: 'gemma3:12b',
      systemPrompt: SYSTEM_AGENT_PROMPTS['system-process'],
      icon: 'truck',
      published: true,
      defaultTools: { sources: { rag: false, web_search: false, mcp: false, sql: false } },
      updated_at: new Date().toLocaleDateString()
    },
  ];

  const SYSTEM_AGENT_IDS = SYSTEM_AGENTS.map(a => a.id);

  const mapAgentFromBackend = (a) => ({
    id: a.agent_id,
    name: a.name,
    description: a.description || '',
    model: a.model,
    systemPrompt: resolveSystemPrompt(a.agent_id, a.system_prompt),
    icon: a.icon || '',
    color: a.color || '',
    agentType: a.agent_type || 'custom',
    published: a.published,
    defaultTools: migrateDefaultTools(a.default_tools),
    updated_at: a.updated_at,
  });

  const [agents, setAgents] = useState(() => {
    const saved = localStorage.getItem('rag_ai_agents');
    let loadedAgents = saved ? JSON.parse(saved) : [];
    // 시스템 에이전트가 없으면 시딩
    const hasSystemAgents = SYSTEM_AGENTS.every(sa => loadedAgents.some(la => la.id === sa.id));
    if (!hasSystemAgents) {
      // 기존 사용자 에이전트 유지 + 누락된 시스템 에이전트 추가
      const existingIds = new Set(loadedAgents.map(a => a.id));
      const missingSystem = SYSTEM_AGENTS.filter(sa => !existingIds.has(sa.id));
      return [...missingSystem, ...loadedAgents.filter(a => !SYSTEM_AGENT_IDS.includes(a.id))];
    }
    return loadedAgents;
  });
  const [currentAgentId, setCurrentAgentId] = useState(null);

  const [sessions, setSessions] = useState(() => JSON.parse(localStorage.getItem('rag_ai_sessions')) || [{ id: 'new', title: '새로운 대화', messages: [] }]);
  const [currentSessionId, setCurrentSessionId] = useState('new');
  const [currentView, setCurrentView] = useState('home');

  // 세션 전환 시 백엔드에서 메시지 로드
  useEffect(() => {
    if (!currentSessionId || currentSessionId === 'new' || !isAuthenticated) return;
    const session = sessions.find(s => s.id === currentSessionId);
    // 이미 메시지가 로드되어 있으면 스킵
    if (session && session.messages && session.messages.length > 0) return;
    sessionsAPI.getMessages(currentSessionId).then(result => {
      if (result.messages && result.messages.length > 0) {
        const mapped = result.messages.map(m => ({
          id: m.id || generateUUID(),
          role: m.role,
          content: m.content,
          text: m.content,
          thinking: m.thinking,
          time: m.created_at ? new Date(m.created_at).toLocaleTimeString() : '',
        }));
        setSessions(prev => prev.map(s =>
          s.id === currentSessionId ? { ...s, messages: mapped } : s
        ));
      }
    }).catch(() => {});
  }, [currentSessionId, isAuthenticated]);

  // 로그인 시 백엔드에서 설정 + KB 로드
  useEffect(() => {
    if (!isAuthenticated) {
      settingsSyncedRef.current = false;
      return;
    }
    if (settingsSyncedRef.current) return;

    let mounted = true;

    (async () => {
      // 설정 로드
      const backendSettings = await settingsAPI.getUserSettings();
      if (!mounted) return;
      if (backendSettings) {
        const backendConfig = backendToFrontend(backendSettings);
        const isDefault = backendConfig.llm === CONFIG_DEFAULTS.llm
          && backendConfig.embeddingModel === CONFIG_DEFAULTS.embeddingModel
          && backendConfig.systemPrompt === CONFIG_DEFAULTS.systemPrompt;

        const localSaved = localStorage.getItem('rag_ai_config');

        if (isDefault && localSaved) {
          try {
            const localConfig = JSON.parse(localSaved);
            const merged = { ...CONFIG_DEFAULTS, ...localConfig };
            await settingsAPI.updateUserSettings(frontendToBackend(merged));
            if (!mounted) return;
            skipNextBackendSync.current = true;
            setConfig(merged);
          } catch { /* 마이그레이션 실패 시 무시 */ }
        } else {
          skipNextBackendSync.current = true;
          setConfig(prev => ({ ...prev, ...backendConfig }));
        }
      }

      // KB 목록 로드
      const kbResult = await knowledgeAPI.listBases();
      if (!mounted) return;
      if (kbResult.bases && kbResult.bases.length > 0) {
        // 각 KB의 파일 목록도 병렬로 로드
        const fileResults = await Promise.allSettled(
          kbResult.bases.map(b => knowledgeAPI.getFilesList(b.kb_id))
        );
        const mapped = kbResult.bases.map((b, idx) => {
          const fileData = fileResults[idx]?.status === 'fulfilled' ? fileResults[idx].value : { files: [] };
          const files = (fileData.files || []).map((f, fIdx) => ({
            id: f.source || `file-${fIdx}`,
            name: f.filename || f.source,
            source: f.source,
            size: f.image_size ? `${(f.image_size / 1024).toFixed(1)} KB` : '',
            type: f.type || 'text',
            status: f.status || 'ready',
            chunk_count: f.chunk_count || 0,
            thumbnail_path: f.thumbnail_path,
            image_path: f.image_path,
            image_dimensions: f.image_dimensions,
            error_message: f.error_message,
          }));
          return {
            id: b.kb_id,
            name: b.name,
            description: b.description || '',
            files,
            config: { chunkSize: b.chunk_size, chunkOverlap: b.chunk_overlap, chunkingMethod: b.chunking_method || 'fixed', semanticThreshold: b.semantic_threshold || 0.75 },
            chunkSize: b.chunk_size,
            chunkOverlap: b.chunk_overlap,
            chunkingMethod: b.chunking_method || 'fixed',
            semanticThreshold: b.semantic_threshold || 0.75,
            file_count: files.length || b.file_count || 0,
            externalServiceId: b.external_service_id || '',
            created_at: b.created_at,
          };
        });
        setKnowledgeBases(mapped);
        // 현재 KB ID가 로드된 목록에 없으면 첫 번째 KB로 변경
        const kbIds = mapped.map(kb => kb.id);
        if (!kbIds.includes(currentKbId)) {
          setCurrentKbId(kbIds[0]);
        }
      }

      // 에이전트 목록 로드
      const agentResult = await agentsAPI.list();
      if (!mounted) return;
      if (agentResult.agents && agentResult.agents.length > 0) {
        const mapped = agentResult.agents.map(mapAgentFromBackend);
        // 백엔드에서 가져온 에이전트 + 누락된 시스템 에이전트 병합
        const backendIds = new Set(mapped.map(a => a.id));
        const missingSystem = SYSTEM_AGENTS.filter(sa => !backendIds.has(sa.id));
        setAgents([...missingSystem, ...mapped]);
      }

      // 세션 목록 로드
      const sessionResult = await sessionsAPI.list();
      if (!mounted) return;
      if (sessionResult.sessions && sessionResult.sessions.length > 0) {
        const mapped = sessionResult.sessions.map(s => ({
          id: s.session_id,
          title: s.title,
          messages: [],
          agent_id: s.agent_id,
          created_at: s.created_at,
        }));
        setSessions(mapped);
        setCurrentSessionId(mapped[0].id);
      }

      // MCP 서버 목록 로드
      try {
        const mcpResult = await mcpAPI.list();
        if (!mounted) return;
        if (Array.isArray(mcpResult.servers)) {
          const mapped = mcpResult.servers.map(s => ({
            id: s.server_id || s.id,
            name: s.name,
            type: s.server_type || s.type || 'sse',
            url: s.url || '',
            command: s.command || '',
            headers_json: s.headers_json || '',
            enabled: s.enabled,
            status: 'connected',
          }));
          setMcpServers(mapped);
        }
      } catch { /* MCP 로드 실패 시 localStorage 폴백 유지 */ }

      if (mounted) settingsSyncedRef.current = true;
    })();

    return () => { mounted = false; };
  }, [isAuthenticated]);

  // 디바운스된 localStorage + 백엔드 저장
  const debouncedSaveConfig = useMemo(() => debounce((data) => {
    localStorage.setItem('rag_ai_config', JSON.stringify(data));
    // 백엔드 동기화 (로그인 상태에서만)
    if (skipNextBackendSync.current) {
      skipNextBackendSync.current = false;
      return;
    }
    const token = localStorage.getItem('rag_token');
    if (token) {
      settingsAPI.updateUserSettings(frontendToBackend(data)).catch(() => {});
    }
  }, 500), []);

  const debouncedSaveSessions = useMemo(() => debounce((data) => {
    localStorage.setItem('rag_ai_sessions', JSON.stringify(data));
  }, 500), []);

  useEffect(() => { debouncedSaveConfig(config); }, [config, debouncedSaveConfig]);
  useEffect(() => { debouncedSaveSessions(sessions); }, [sessions, debouncedSaveSessions]);
  useEffect(() => { localStorage.setItem('rag_ai_kbs', JSON.stringify(knowledgeBases)); }, [knowledgeBases]);
  useEffect(() => { localStorage.setItem('rag_ai_agents', JSON.stringify(agents)); }, [agents]);
  useEffect(() => { localStorage.setItem('rag_ai_api_keys', JSON.stringify(apiKeys)); }, [apiKeys]);
  useEffect(() => { localStorage.setItem('rag_ai_mcp', JSON.stringify(mcpServers)); }, [mcpServers]);

  // 다크모드: config.theme에 따라 <html>에 dark 클래스 토글
  useEffect(() => {
    if (config.theme === 'Dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [config.theme]);

  const currentMessages = useMemo(() =>
    sessions.find(s => s.id === currentSessionId)?.messages || [],
    [sessions, currentSessionId]
  );

  const currentKb = useMemo(() =>
    knowledgeBases.find(kb => kb.id === currentKbId),
    [knowledgeBases, currentKbId]
  );

  const currentFiles = currentKb?.files || [];

  const currentAgent = useMemo(() =>
    currentAgentId ? agents.find(a => a.id === currentAgentId) || null : null,
    [agents, currentAgentId]
  );

  const updateKbConfig = useCallback((id, newConfig) => {
    setKnowledgeBases(prev => prev.map(kb =>
      kb.id === id ? { ...kb, config: { ...kb.config, ...newConfig } } : kb
    ));
  }, []);

  const addFilesToKb = useCallback((newFiles) => {
    setKnowledgeBases(prev => prev.map(kb =>
      kb.id === currentKbId ? { ...kb, files: [...kb.files, ...newFiles] } : kb
    ));
  }, [currentKbId]);

  const removeFileFromKb = useCallback((fileId) => {
    setKnowledgeBases(prev => prev.map(kb =>
      kb.id === currentKbId ? { ...kb, files: kb.files.filter(f => f.id !== fileId) } : kb
    ));
  }, [currentKbId]);

  const updateFileStatusInKb = useCallback((fileId, status, errorMessage = null) => {
    setKnowledgeBases(prev => prev.map(kb =>
      kb.id === currentKbId ? { ...kb, files: kb.files.map(f => f.id === fileId ? { ...f, status, ...(errorMessage ? { errorMessage } : {}) } : f) } : kb
    ));
  }, [currentKbId]);

  const addAgent = useCallback((agent) => {
    const optimistic = {
      ...agent,
      updated_at: agent.updated_at || new Date().toLocaleDateString(),
    };
    setAgents(prev => [optimistic, ...prev]);

    agentsAPI.create({
      agent_id: optimistic.id,
      name: optimistic.name,
      description: optimistic.description || '',
      model: optimistic.model || 'gemma3:12b',
      system_prompt: optimistic.systemPrompt || '',
      icon: optimistic.icon || '',
      color: optimistic.color || '',
      agent_type: optimistic.agentType || 'custom',
      published: optimistic.published ?? true,
      default_tools: serializeDefaultTools(optimistic.defaultTools),
    })
      .then((created) => {
        const mapped = mapAgentFromBackend(created);
        setAgents(prev => [mapped, ...prev.filter(a => a.id !== optimistic.id)]);
      })
      .catch((e) => {
        console.error('에이전트 백엔드 생성 실패:', e);
        setAgents(prev => prev.filter(a => a.id !== optimistic.id));
      });
  }, []);

  const updateAgent = useCallback((id, updates) => {
    setAgents(prev => prev.map(a =>
      a.id === id ? { ...a, ...updates, updated_at: new Date().toLocaleDateString() } : a
    ));

    const payload = {};
    if ('name' in updates) payload.name = updates.name;
    if ('description' in updates) payload.description = updates.description;
    if ('model' in updates) payload.model = updates.model;
    if ('systemPrompt' in updates) payload.system_prompt = updates.systemPrompt;
    if ('icon' in updates) payload.icon = updates.icon;
    if ('color' in updates) payload.color = updates.color;
    if ('agentType' in updates) payload.agent_type = updates.agentType;
    if ('published' in updates) payload.published = updates.published;
    if ('defaultTools' in updates) payload.default_tools = serializeDefaultTools(updates.defaultTools);

    if (Object.keys(payload).length === 0) return;

    agentsAPI.update(id, payload)
      .then((updated) => {
        const mapped = mapAgentFromBackend(updated);
        setAgents(prev => prev.map(a => (a.id === id ? mapped : a)));
      })
      .catch((e) => {
        // 백엔드에 없는 로컬 시드 에이전트일 수 있으므로 경고만 기록
        console.warn('에이전트 백엔드 수정 실패:', e);
      });
  }, []);

  const deleteAgent = useCallback((id) => {
    let removed = null;
    setAgents(prev => {
      removed = prev.find(a => a.id === id) || null;
      return prev.filter(a => a.id !== id);
    });

    agentsAPI.delete(id).catch((e) => {
      console.warn('에이전트 백엔드 삭제 실패:', e);
      if (removed) {
        setAgents(prev => [removed, ...prev]);
      }
    });
  }, []);

  const addApiKey = useCallback((provider, key) => {
    setApiKeys(prev => [...prev, {
      id: generateUUID(),
      provider,
      key,
      date: new Date().toLocaleDateString()
    }]);
  }, []);

  const deleteApiKey = useCallback((id) => {
    setApiKeys(prev => prev.filter(k => k.id !== id));
  }, []);

  const syncMcpOrder = useCallback((servers) => {
    const order = servers.map((s, idx) => ({ id: s.id, sort_order: idx }));
    mcpAPI.reorder(order).catch((e) => {
      console.error('MCP 서버 정렬 동기화 실패:', e);
    });
  }, []);

  const addMcpServer = useCallback(async (server) => {
    const serverId = generateUUID();
    const newServer = {
      id: serverId,
      status: 'connected',
      enabled: true,
      ...server
    };
    setMcpServers(prev => [...prev, newServer]);
    try {
      const serverType = server.type || 'sse';
      await mcpAPI.create({
        id: serverId,
        server_id: serverId,
        name: server.name,
        type: serverType,
        server_type: serverType,
        url: server.url || '',
        command: server.command || '',
        headers_json: server.headers_json || '',
        enabled: true,
        sort_order: mcpServers.length,
      });
    } catch (e) {
      console.error('MCP 서버 백엔드 저장 실패:', e);
      setMcpServers(prev => prev.filter(s => s.id !== serverId));
    }
  }, [mcpServers.length]);

  const deleteMcpServer = useCallback(async (id) => {
    setMcpServers(prev => {
      const next = prev.filter(s => s.id !== id);
      syncMcpOrder(next);
      return next;
    });
    try {
      await mcpAPI.delete(id);
    } catch (e) {
      console.error('MCP 서버 백엔드 삭제 실패:', e);
    }
  }, [syncMcpOrder]);

  const reorderMcpServer = useCallback((index, direction) => {
    setMcpServers(prev => {
      const newList = [...prev];
      let changed = false;
      if (direction === 'up' && index > 0) {
        [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
        changed = true;
      } else if (direction === 'down' && index < newList.length - 1) {
        [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
        changed = true;
      }
      if (changed) {
        syncMcpOrder(newList);
      }
      return newList;
    });
  }, [syncMcpOrder]);

  const moveMcpServer = useCallback((fromIndex, toIndex) => {
    setMcpServers(prev => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length || fromIndex === toIndex) {
        return prev;
      }
      const newList = [...prev];
      const [movedItem] = newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, movedItem);
      syncMcpOrder(newList);
      return newList;
    });
  }, [syncMcpOrder]);

  const addMessage = useCallback((msg) => {
    const msgId = msg.id || generateUUID();
    const isNew = !msg.id; // 새 메시지인 경우에만 백엔드 저장

    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        const exists = session.messages.find(m => m.id === msgId);
        if (exists) {
          return {
            ...session,
            messages: session.messages.map(m => m.id === msgId ? { ...m, ...msg } : m)
          };
        }
        return {
          ...session,
          messages: [...session.messages, {
            ...msg,
            id: msgId,
            time: new Date().toLocaleTimeString()
          }]
        };
      }
      return session;
    }));

    // 백엔드에 메시지 저장 (새 메시지 & role이 있는 경우만)
    if (isNew && msg.role && currentSessionId) {
      sessionsAPI.addMessage(currentSessionId, {
        role: msg.role,
        content: msg.content || msg.text || '',
        thinking: msg.thinking || null,
        metadata_json: msg.toolCallsMeta ? JSON.stringify(msg.toolCallsMeta) : null,
      }).catch(e => console.warn('메시지 백엔드 저장 실패:', e));
    }
  }, [currentSessionId]);

  const createNewSession = useCallback(() => {
    const newId = generateUUID();
    setSessions(prev => [{ id: newId, title: '새로운 대화', messages: [] }, ...prev]);
    setCurrentSessionId(newId);
    setCurrentView('chat');
    // 백엔드에도 세션 생성
    sessionsAPI.create({ session_id: newId, title: '새로운 대화' })
      .catch(e => console.warn('세션 백엔드 생성 실패:', e));
  }, []);

  const renameSession = useCallback((id, title) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    sessionsAPI.update(id, { title })
      .catch(e => console.warn('세션 제목 백엔드 저장 실패:', e));
  }, []);

  const deleteSession = useCallback(async (id) => {
    // 백엔드에서 세션 삭제
    try {
      await sessionsAPI.delete(id);
    } catch (e) {
      console.error('세션 삭제 실패:', e);
    }

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered;
    });

    // 현재 세션이 삭제된 경우 다른 세션으로 전환
    if (id === currentSessionId) {
      setSessions(prev => {
        if (prev.length > 0) {
          setCurrentSessionId(prev[0].id);
        } else {
          // 모든 세션이 삭제되면 새 세션 생성은 다음 렌더 사이클에서
          setTimeout(() => createNewSession(), 0);
        }
        return prev;
      });
    }
  }, [currentSessionId, createNewSession]);

  const contextValue = useMemo(() => ({
    config, setConfig,
    knowledgeBases, setKnowledgeBases,
    currentKbId, setCurrentKbId, currentKb,
    currentFiles, addFilesToKb, updateFileStatusInKb, updateKbConfig, removeFileFromKb,
    agents, setAgents, addAgent, updateAgent, deleteAgent,
    currentAgent, currentAgentId, setCurrentAgentId,
    sessions, setSessions,
    currentSessionId, setCurrentSessionId,
    currentMessages, addMessage,
    createNewSession, renameSession, deleteSession,
    currentView, setCurrentView,
    apiKeys, addApiKey, deleteApiKey,
    mcpServers, addMcpServer, deleteMcpServer, reorderMcpServer, moveMcpServer,
    searchProviders,
    DEFAULT_TOOL_PRESET
  }), [
    config, knowledgeBases, currentKbId, currentKb, currentFiles,
    agents, currentAgent, currentAgentId, sessions, currentSessionId,
    currentMessages, currentView, apiKeys, mcpServers, searchProviders,
    addFilesToKb, updateFileStatusInKb, updateKbConfig, removeFileFromKb,
    addAgent, updateAgent, deleteAgent, addMessage, createNewSession,
    renameSession, deleteSession, addApiKey, deleteApiKey, addMcpServer,
    deleteMcpServer, reorderMcpServer, moveMcpServer
  ]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => useContext(StoreContext);
