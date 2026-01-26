import React, { createContext, useContext, useState, useEffect } from 'react';

const StoreContext = createContext();

export function StoreProvider({ children }) {
  // --- 설정 ---
  const [config, setConfig] = useState(() => JSON.parse(localStorage.getItem('weknora_config')) || { 
    llm: 'gemma3:12b', 
    embeddingModel: 'bge-m3',
    enableMultimodal: true, 
    vlm: 'llava:7b',
    storageType: 'minio',
    bucketName: 'rag-ai-bucket',
    
    // Graph DB (Neo4j)
    neo4jUri: 'neo4j://localhost:7687',
    neo4jUser: 'neo4j',
    neo4jPassword: '',

    // ✅ Redis 설정 추가
    redisHost: 'localhost',
    redisPort: '6379',
    redisPassword: '',
    
    retrieval: 'hybrid', 
    useRerank: true, 
    systemPrompt: "당신은 정확한 근거를 바탕으로 답변하는 AI 어시스턴트입니다.", 
    theme: 'Light',
    searchTopK: 5,
    activeSearchProviderId: 'ddg'
  });

  const [apiKeys, setApiKeys] = useState(() => JSON.parse(localStorage.getItem('weknora_api_keys')) || []);
  const [mcpServers, setMcpServers] = useState(() => JSON.parse(localStorage.getItem('weknora_mcp')) || [
    { id: 'mcp-1', name: 'Filesystem', type: 'stdio', status: 'connected', enabled: true },
    { id: 'mcp-2', name: 'Google Drive', type: 'sse', status: 'disconnected', enabled: false }
  ]);
  const [searchProviders, setSearchProviders] = useState(() => JSON.parse(localStorage.getItem('weknora_search_providers')) || [
    { id: 'ddg', name: 'DuckDuckGo', type: 'free', description: '무료, 설정 불필요' },
    { id: 'serper', name: 'Google Serper', type: 'api', description: 'API Key 필요 (빠름)' }
  ]);

  const [knowledgeBases, setKnowledgeBases] = useState(() => {
    const saved = localStorage.getItem('weknora_kbs');
    if (saved) {
      try { return JSON.parse(saved).map(kb => ({ ...kb, config: kb.config || { chunkSize: 512, chunkOverlap: 50 } })); } 
      catch (e) { console.error(e); }
    }
    return [{ id: 'default', name: '기본 지식 베이스', description: '기본 문서 저장소', files: [], config: { chunkSize: 512, chunkOverlap: 50 }, created_at: new Date().toLocaleDateString() }];
  });
  const [currentKbId, setCurrentKbId] = useState('default');

  const [agents, setAgents] = useState(() => {
    const saved = localStorage.getItem('weknora_agents');
    let loadedAgents = saved ? JSON.parse(saved) : [];
    if (loadedAgents.length <= 1) {
      return [
        { id: 'agent-general', name: '일반 대화 비서', description: '지식 베이스 없이 자유로운 주제로 대화하는 에이전트입니다.', model: 'gemma3:12b', published: true, updated_at: new Date().toLocaleDateString() },
        { id: 'agent-rag', name: '문서 분석 전문가', description: '업로드된 지식 베이스(문서)를 기반으로 정확하게 답변하는 RAG 에이전트입니다.', model: 'gemma3:12b', published: true, updated_at: new Date().toLocaleDateString() }
      ];
    }
    return loadedAgents;
  });
  const [currentAgentId, setCurrentAgentId] = useState('agent-general');

  const [sessions, setSessions] = useState(() => JSON.parse(localStorage.getItem('weknora_sessions')) || [{ id: 'new', title: '새로운 대화', messages: [] }]);
  const [currentSessionId, setCurrentSessionId] = useState('new');
  const [currentView, setCurrentView] = useState('home');

  useEffect(() => localStorage.setItem('weknora_config', JSON.stringify(config)), [config]);
  useEffect(() => localStorage.setItem('weknora_sessions', JSON.stringify(sessions)), [sessions]);
  useEffect(() => localStorage.setItem('weknora_kbs', JSON.stringify(knowledgeBases)), [knowledgeBases]);
  useEffect(() => localStorage.setItem('weknora_agents', JSON.stringify(agents)), [agents]);
  useEffect(() => localStorage.setItem('weknora_api_keys', JSON.stringify(apiKeys)), [apiKeys]);
  useEffect(() => localStorage.setItem('weknora_mcp', JSON.stringify(mcpServers)), [mcpServers]);
  useEffect(() => localStorage.setItem('weknora_search_providers', JSON.stringify(searchProviders)), [searchProviders]);

  const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];
  const currentKb = knowledgeBases.find(kb => kb.id === currentKbId);
  const currentFiles = currentKb?.files || [];
  const currentAgent = agents.find(a => a.id === currentAgentId) || agents[0];

  const updateKbConfig = (id, newConfig) => setKnowledgeBases(prev => prev.map(kb => kb.id === id ? { ...kb, config: { ...kb.config, ...newConfig } } : kb));
  const addFilesToKb = (newFiles) => setKnowledgeBases(prev => prev.map(kb => kb.id === currentKbId ? { ...kb, files: [...kb.files, ...newFiles] } : kb));
  const removeFileFromKb = (fileId) => setKnowledgeBases(prev => prev.map(kb => kb.id === currentKbId ? { ...kb, files: kb.files.filter(f => f.id !== fileId) } : kb));
  const updateFileStatusInKb = (fileId, status) => setKnowledgeBases(prev => prev.map(kb => kb.id === currentKbId ? { ...kb, files: kb.files.map(f => f.id === fileId ? { ...f, status } : f) } : kb));

  const addAgent = (agent) => setAgents(prev => [agent, ...prev]);
  const updateAgent = (id, updates) => setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates, updated_at: new Date().toLocaleDateString() } : a));
  const deleteAgent = (id) => setAgents(prev => prev.filter(a => a.id !== id));

  const addApiKey = (provider, key) => setApiKeys(prev => [...prev, { id: crypto.randomUUID(), provider, key, date: new Date().toLocaleDateString() }]);
  const deleteApiKey = (id) => setApiKeys(prev => prev.filter(k => k.id !== id));

  const addMcpServer = (server) => setMcpServers(prev => [...prev, { id: crypto.randomUUID(), status: 'connected', enabled: true, ...server }]);
  const deleteMcpServer = (id) => setMcpServers(prev => prev.filter(s => s.id !== id));
  const reorderMcpServer = (index, direction) => {
    setMcpServers(prev => {
      const newList = [...prev];
      if (direction === 'up' && index > 0) {
        [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
      } else if (direction === 'down' && index < newList.length - 1) {
        [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
      }
      return newList;
    });
  };
  const moveMcpServer = (fromIndex, toIndex) => {
    setMcpServers(prev => {
      const newList = [...prev];
      const [movedItem] = newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, movedItem);
      return newList;
    });
  };

  const addSearchProvider = (provider) => setSearchProviders(prev => [...prev, { id: crypto.randomUUID(), ...provider }]);
  const deleteSearchProvider = (id) => {
    setSearchProviders(prev => prev.filter(p => p.id !== id));
    if (config.activeSearchProviderId === id) setConfig(prev => ({ ...prev, activeSearchProviderId: 'ddg' }));
  };

  const addMessage = (msg) => {
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        const exists = session.messages.find(m => m.id === msg.id);
        if (exists) return { ...session, messages: session.messages.map(m => m.id === msg.id ? { ...m, ...msg } : m) };
        return { ...session, messages: [...session.messages, { ...msg, id: msg.id || crypto.randomUUID(), time: new Date().toLocaleTimeString() }] };
      }
      return session;
    }));
  };
  const createNewSession = () => {
    const newId = crypto.randomUUID();
    setSessions(prev => [{ id: newId, title: '새로운 대화', messages: [] }, ...prev]);
    setCurrentSessionId(newId);
    setCurrentView('chat');
  };
  const renameSession = (id, title) => setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  const deleteSession = (id) => {
      setSessions(prev => {
        const filtered = prev.filter(s => s.id !== id);
        if (id === currentSessionId) {
            if (filtered.length > 0) setCurrentSessionId(filtered[0].id);
            else createNewSession();
        }
        return filtered;
      });
  };

  return (
    <StoreContext.Provider value={{
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
      searchProviders, addSearchProvider, deleteSearchProvider
    }}>
      {children}
    </StoreContext.Provider>
  );
}
export const useStore = () => useContext(StoreContext);