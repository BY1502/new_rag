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
  use_multimodal_search: f.useMultimodalSearch || false,
  system_prompt: f.systemPrompt,
  theme: f.theme,
  active_search_provider_id: f.activeSearchProviderId,
  storage_type: f.storageType,
  bucket_name: f.bucketName,
});

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

  const [agents, setAgents] = useState(() => {
    const saved = localStorage.getItem('rag_ai_agents');
    let loadedAgents = saved ? JSON.parse(saved) : [];
    if (loadedAgents.length <= 1) {
      return [
        {
          id: 'agent-general',
          name: '일반 대화 비서',
          description: '지식 베이스 없이 자유로운 주제로 대화하는 범용 AI 비서입니다. 질문 답변, 글쓰기, 번역, 코딩, 브레인스토밍 등 다양한 작업을 수행합니다.',
          model: 'gemma3:12b',
          systemPrompt: `당신은 "RAG AI 비서"입니다. 사용자의 다양한 질문과 요청에 전문적이고 친절하게 응답하는 범용 AI 어시스턴트입니다.

## 핵심 역할
- 사용자의 질문에 정확하고 상세하게 답변합니다.
- 복잡한 주제도 이해하기 쉽게 설명합니다.
- 글쓰기, 번역, 요약, 코딩, 분석 등 다양한 작업을 수행합니다.

## 응답 원칙
1. **정확성 우선**: 확실하지 않은 정보는 솔직하게 "확실하지 않다"고 말합니다. 추측으로 답변하지 않습니다.
2. **구조화된 답변**: 복잡한 답변은 제목, 소제목, 번호 리스트, 표 등을 활용하여 가독성을 높입니다.
3. **한국어 우선**: 사용자가 한국어로 질문하면 한국어로 답변합니다. 기술 용어는 영어 원문을 병기합니다. (예: 벡터 데이터베이스(Vector Database))
4. **맥락 유지**: 이전 대화 내용을 기억하고 맥락에 맞게 답변합니다.
5. **적극적 제안**: 사용자의 질문 의도를 파악하여, 추가로 도움이 될 수 있는 정보나 후속 질문을 제안합니다.

## 전문 분야
- 프로그래밍 및 소프트웨어 개발 (Python, JavaScript, 데이터베이스 등)
- 데이터 분석 및 시각화
- 문서 작성, 보고서 요약, 번역
- 비즈니스 전략 및 기획
- 학술 연구 및 논문 분석
- 일반 상식 및 교양

## 금지 사항
- 허위 정보 생성 금지
- 유해하거나 비윤리적인 콘텐츠 생성 금지
- 개인정보 수집 또는 저장 금지`,
          published: true,
          updated_at: new Date().toLocaleDateString()
        },
        {
          id: 'agent-rag',
          name: '문서 분석 전문가',
          description: '업로드된 지식 베이스(문서)를 기반으로 정확하게 답변하는 RAG 에이전트입니다. 문서 내용을 분석, 요약, 비교하고 근거 기반 답변을 제공합니다.',
          model: 'gemma3:12b',
          systemPrompt: `당신은 "RAG AI 문서 분석 전문가"입니다. 사용자가 업로드한 문서(지식 베이스)를 기반으로 정확한 답변을 제공하는 RAG(Retrieval-Augmented Generation) 전문 에이전트입니다.

## 핵심 역할
- 지식 베이스에 저장된 문서를 검색하고 분석하여 근거 기반 답변을 제공합니다.
- 문서 내용을 요약, 비교, 분석하는 전문 능력을 갖추고 있습니다.
- 문서에 없는 내용은 솔직하게 "해당 문서에서 관련 정보를 찾을 수 없습니다"라고 답합니다.

## 응답 원칙
1. **근거 기반 답변**: 모든 답변은 검색된 문서 내용에 기반합니다. 답변 시 출처 문서명이나 관련 섹션을 언급합니다.
2. **정확한 인용**: 가능하면 원문을 직접 인용하거나 요약하여 신뢰성을 높입니다.
3. **포괄적 검색**: 하나의 문서뿐 아니라 관련된 여러 문서를 종합하여 답변합니다.
4. **문서 범위 명시**: 답변 가능한 범위와 문서에서 다루지 않는 범위를 명확히 구분합니다.
5. **구조화된 출력**: 분석 결과는 표, 리스트, 비교표 등 구조화된 형태로 제공합니다.

## 전문 기능
- **문서 요약**: "이 문서를 요약해줘" → 핵심 내용을 계층적으로 요약
- **정보 추출**: "이 문서에서 날짜/금액/인물 정보를 찾아줘" → 정확한 정보 추출
- **비교 분석**: "A 문서와 B 문서의 차이점은?" → 체계적 비교표 생성
- **Q&A**: "~에 대해 설명해줘" → 문서 근거 기반 상세 설명
- **핵심 키워드 추출**: 문서의 주요 주제와 키워드를 식별

## 응답 형식
- 답변 시작: 검색된 문서와의 관련성을 간략히 언급
- 본문: 구조화된 답변 제공 (제목, 소제목, 번호 리스트 활용)
- 답변 종료: 추가 질문 유도 또는 관련 분석 제안

## 금지 사항
- 문서에 없는 내용을 창작하거나 추측하지 않습니다
- 검색 결과가 없을 때 일반 지식으로 대체하지 않습니다 (명시적으로 구분)
- 문서 내용을 왜곡하거나 과장하지 않습니다`,
          published: true,
          updated_at: new Date().toLocaleDateString()
        }
      ];
    }
    return loadedAgents;
  });
  const [currentAgentId, setCurrentAgentId] = useState(null);

  const [sessions, setSessions] = useState(() => JSON.parse(localStorage.getItem('rag_ai_sessions')) || [{ id: 'new', title: '새로운 대화', messages: [] }]);
  const [currentSessionId, setCurrentSessionId] = useState('new');
  const [currentView, setCurrentView] = useState('home');

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
        const mapped = kbResult.bases.map(b => ({
          id: b.kb_id,
          name: b.name,
          description: b.description || '',
          files: [],
          config: { chunkSize: b.chunk_size, chunkOverlap: b.chunk_overlap, chunkingMethod: b.chunking_method || 'fixed', semanticThreshold: b.semantic_threshold || 0.75 },
          chunkSize: b.chunk_size,
          chunkOverlap: b.chunk_overlap,
          chunkingMethod: b.chunking_method || 'fixed',
          semanticThreshold: b.semantic_threshold || 0.75,
          file_count: b.file_count || 0,
          externalServiceId: b.external_service_id || '',
          created_at: b.created_at,
        }));
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
        const mapped = agentResult.agents.map(a => ({
          id: a.agent_id,
          name: a.name,
          description: a.description || '',
          model: a.model,
          systemPrompt: a.system_prompt || '',
          icon: a.icon || '',
          color: a.color || '',
          published: a.published,
          updated_at: a.updated_at,
        }));
        setAgents(mapped);
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
        if (mcpResult.servers && mcpResult.servers.length > 0) {
          const mapped = mcpResult.servers.map(s => ({
            id: s.server_id,
            name: s.name,
            type: s.server_type,
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
    setAgents(prev => [agent, ...prev]);
  }, []);

  const updateAgent = useCallback((id, updates) => {
    setAgents(prev => prev.map(a =>
      a.id === id ? { ...a, ...updates, updated_at: new Date().toLocaleDateString() } : a
    ));
  }, []);

  const deleteAgent = useCallback((id) => {
    setAgents(prev => prev.filter(a => a.id !== id));
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
      await mcpAPI.create({
        server_id: serverId,
        name: server.name,
        server_type: server.type || 'sse',
        url: server.url || '',
        command: server.command || '',
        headers_json: server.headers_json || '',
        enabled: true,
      });
    } catch (e) {
      console.error('MCP 서버 백엔드 저장 실패:', e);
    }
  }, []);

  const deleteMcpServer = useCallback(async (id) => {
    setMcpServers(prev => prev.filter(s => s.id !== id));
    try {
      await mcpAPI.delete(id);
    } catch (e) {
      console.error('MCP 서버 백엔드 삭제 실패:', e);
    }
  }, []);

  const reorderMcpServer = useCallback((index, direction) => {
    setMcpServers(prev => {
      const newList = [...prev];
      if (direction === 'up' && index > 0) {
        [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
      } else if (direction === 'down' && index < newList.length - 1) {
        [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
      }
      return newList;
    });
  }, []);

  const moveMcpServer = useCallback((fromIndex, toIndex) => {
    setMcpServers(prev => {
      const newList = [...prev];
      const [movedItem] = newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, movedItem);
      return newList;
    });
  }, []);

  const addMessage = useCallback((msg) => {
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        const exists = session.messages.find(m => m.id === msg.id);
        if (exists) {
          return {
            ...session,
            messages: session.messages.map(m => m.id === msg.id ? { ...m, ...msg } : m)
          };
        }
        return {
          ...session,
          messages: [...session.messages, {
            ...msg,
            id: msg.id || generateUUID(),
            time: new Date().toLocaleTimeString()
          }]
        };
      }
      return session;
    }));
  }, [currentSessionId]);

  const createNewSession = useCallback(() => {
    const newId = generateUUID();
    setSessions(prev => [{ id: newId, title: '새로운 대화', messages: [] }, ...prev]);
    setCurrentSessionId(newId);
    setCurrentView('chat');
  }, []);

  const renameSession = useCallback((id, title) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
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
    searchProviders
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
