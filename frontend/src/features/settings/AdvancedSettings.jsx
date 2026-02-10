import React, { useState, useEffect } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { Settings, Cpu, Globe, Key, Info, Save, Layout, Database, Plug, Plus, Trash2, Link, Server, ArrowUp, ArrowDown, GripVertical, BookOpen, CheckCircle, Image, HardDrive, RefreshCw, Share2, Network, Zap, Moon, Sun } from '../../components/ui/Icon';
import { healthAPI, settingsAPI } from '../../api/client';

export default function AdvancedSettings() {
  const { config, setConfig, apiKeys, addApiKey, deleteApiKey, mcpServers, addMcpServer, deleteMcpServer, reorderMcpServer, moveMcpServer, searchProviders } = useStore();
  const [activeTab, setActiveTab] = useState('general');
  const [activeModelTab, setActiveModelTab] = useState('llm');
  const [localConfig, setLocalConfig] = useState({ ...config });

  const [newKeyProvider, setNewKeyProvider] = useState('OpenAI');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newMcpType, setNewMcpType] = useState('sse');
  const [newMcpCommand, setNewMcpCommand] = useState('');
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [activeApiSection, setActiveApiSection] = useState(null);

  // 백엔드 설정 및 API 키
  const [backendConfig, setBackendConfig] = useState(null);
  const [backendApiKeys, setBackendApiKeys] = useState([]);
  const [backendLoading, setBackendLoading] = useState(false);

  // Ollama 모델 목록
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState('');

  // 연결 테스트 상태: 'idle' | 'testing' | 'success' | 'error'
  const [testStatus, setTestStatus] = useState({});
  const [testDetail, setTestDetail] = useState({});

  // DB 연결 관리 (T2SQL)
  const [dbConnections, setDbConnections] = useState([]);
  const [newDbConn, setNewDbConn] = useState({
    name: '', db_type: 'postgresql', host: 'localhost', port: 5432,
    database: '', username: '', password: ''
  });
  const [dbTestStatus, setDbTestStatus] = useState({});
  const [dbTestDetail, setDbTestDetail] = useState({});

  const loadOllamaModels = async () => {
    setOllamaModelsLoading(true);
    setOllamaModelsError('');
    try {
      const data = await settingsAPI.getOllamaModels();
      if (data?.models) setOllamaModels(data.models);
      if (data?.error) setOllamaModelsError(data.error);
    } catch (e) {
      setOllamaModelsError('모델 목록을 불러올 수 없습니다.');
    } finally {
      setOllamaModelsLoading(false);
    }
  };

  // 백엔드 설정 로드
  useEffect(() => {
    const loadBackendData = async () => {
      setBackendLoading(true);
      try {
        const [cfg, keys] = await Promise.all([
          settingsAPI.getConfig(),
          settingsAPI.getApiKeys()
        ]);
        if (cfg) setBackendConfig(cfg);
        if (keys?.keys) setBackendApiKeys(keys.keys);
        const conns = await settingsAPI.getDbConnections();
        if (conns?.connections) setDbConnections(conns.connections);
      } catch (e) {
        console.error('Failed to load backend config:', e);
      } finally {
        setBackendLoading(false);
      }
    };
    loadBackendData();
    loadOllamaModels();
  }, []);

  const handleTestConnection = async (serviceName) => {
    setTestStatus(prev => ({ ...prev, [serviceName]: 'testing' }));
    setTestDetail(prev => ({ ...prev, [serviceName]: '' }));

    const result = await healthAPI.testService(serviceName);

    if (result.status === 'connected') {
      setTestStatus(prev => ({ ...prev, [serviceName]: 'success' }));
      setTestDetail(prev => ({ ...prev, [serviceName]: result.detail }));
    } else {
      setTestStatus(prev => ({ ...prev, [serviceName]: 'error' }));
      setTestDetail(prev => ({ ...prev, [serviceName]: result.detail }));
    }

    setTimeout(() => {
      setTestStatus(prev => ({ ...prev, [serviceName]: 'idle' }));
    }, 5000);
  };

  const handleSave = () => { setConfig(localConfig); alert('설정이 저장되었습니다.'); };
  const handleAddKey = async () => {
    if(!newKeyValue.trim()) return;
    // 로컬 저장
    addApiKey(newKeyProvider, newKeyValue);
    // 백엔드에도 저장
    try {
      await settingsAPI.saveApiKey(newKeyProvider, newKeyValue);
      const keys = await settingsAPI.getApiKeys();
      if (keys?.keys) setBackendApiKeys(keys.keys);
    } catch (e) {
      console.error('Failed to save API key to backend:', e);
    }
    setNewKeyValue('');
  };
  const handleDeleteKey = async (id, provider) => {
    deleteApiKey(id);
    try {
      await settingsAPI.deleteApiKey(provider);
      const keys = await settingsAPI.getApiKeys();
      if (keys?.keys) setBackendApiKeys(keys.keys);
    } catch (e) {
      console.error('Failed to delete API key from backend:', e);
    }
  };
  const handleAddMcp = () => {
    if (!newMcpName.trim()) return;
    if (newMcpType === 'stdio' && !newMcpCommand.trim()) return;
    if (newMcpType !== 'stdio' && !newMcpUrl.trim()) return;
    addMcpServer({
      name: newMcpName,
      url: newMcpType === 'stdio' ? '' : newMcpUrl,
      type: newMcpType,
      command: newMcpType === 'stdio' ? newMcpCommand : '',
    });
    setNewMcpName('');
    setNewMcpUrl('');
    setNewMcpCommand('');
  };
  const handleAddDbConnection = async () => {
    if (!newDbConn.name.trim() || !newDbConn.database.trim()) return;
    try {
      await settingsAPI.addDbConnection(newDbConn);
      const conns = await settingsAPI.getDbConnections();
      if (conns?.connections) setDbConnections(conns.connections);
      setNewDbConn({ name: '', db_type: 'postgresql', host: 'localhost', port: 5432, database: '', username: '', password: '' });
    } catch (e) {
      console.error('Failed to add DB connection:', e);
    }
  };

  const handleDeleteDbConnection = async (connId) => {
    try {
      await settingsAPI.deleteDbConnection(connId);
      setDbConnections(prev => prev.filter(c => c.id !== connId));
    } catch (e) {
      console.error('Failed to delete DB connection:', e);
    }
  };

  const handleTestDbConnection = async (connId) => {
    setDbTestStatus(prev => ({ ...prev, [connId]: 'testing' }));
    const result = await settingsAPI.testDbConnection(connId);
    setDbTestStatus(prev => ({ ...prev, [connId]: result.status === 'connected' ? 'success' : 'error' }));
    setDbTestDetail(prev => ({ ...prev, [connId]: result.detail }));
    setTimeout(() => setDbTestStatus(prev => ({ ...prev, [connId]: 'idle' })), 5000);
  };

  const handleDragStart = (e, index) => { setDraggedItemIndex(index); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e, index) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e, targetIndex) => { e.preventDefault(); if (draggedItemIndex === null || draggedItemIndex === targetIndex) return; moveMcpServer(draggedItemIndex, targetIndex); setDraggedItemIndex(null); };

  const tabs = [
    { id: 'general', label: '일반 설정', icon: Layout },
    { id: 'model', label: '모델 관리', icon: Cpu },
    { id: 'graph', label: 'Graph DB', icon: Share2 },
    { id: 'cache', label: '메모리 / 캐시', icon: Zap }, // ✅ Redis 탭 추가
    { id: 'search', label: '웹 검색', icon: Globe },
    { id: 'api', label: 'API 키 관리', icon: Key },
    { id: 'database', label: '데이터베이스', icon: Database },
    { id: 'mcp', label: 'MCP 서버', icon: Plug },
    { id: 'system', label: '시스템 정보', icon: Info },
  ];

  return (
    <div className="flex h-[700px] w-full bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <aside className="w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col p-4 shrink-0">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 px-2 tracking-wider">Settings</h3>
        <nav className="space-y-1">
          {tabs.map(tab => (
            <div key={tab.id}>
              <button onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === tab.id ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm border border-gray-100 dark:border-gray-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                <tab.icon size={18} className={activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'} /> {tab.label}
              </button>
              {tab.id === 'model' && activeTab === 'model' && (
                <div className="ml-9 mt-1 space-y-1 border-l-2 border-gray-200 pl-2">
                  {[{ id: 'llm', label: 'LLM 모델' }, { id: 'embedding', label: '임베딩 모델' }, { id: 'multimodal', label: '멀티모달 모델' }].map(sub => (
                    <button key={sub.id} onClick={() => setActiveModelTab(sub.id)} className={`block w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${activeModelTab === sub.id ? 'text-blue-600 font-bold bg-blue-50' : 'text-gray-500 hover:text-gray-800'}`}>{sub.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-8 py-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-900 shrink-0">
          <div><h2 className="text-xl font-bold text-gray-900 dark:text-white">{tabs.find(t => t.id === activeTab)?.label}</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">시스템의 전반적인 환경을 설정합니다.</p></div>
          <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2 bg-black dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition shadow-sm"><Save size={16}/> 저장하기</button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'general' && <div className="space-y-8 max-w-2xl">
            <section>
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">테마 설정</label>
              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  {localConfig.theme === 'Dark' ? <Moon size={20} className="text-indigo-400"/> : <Sun size={20} className="text-yellow-500"/>}
                  <div>
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{localConfig.theme === 'Dark' ? '다크 모드' : '라이트 모드'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{localConfig.theme === 'Dark' ? '어두운 배경으로 눈의 피로를 줄입니다.' : '밝은 배경으로 기본 테마입니다.'}</div>
                  </div>
                </div>
                <button onClick={() => setLocalConfig({...localConfig, theme: localConfig.theme === 'Dark' ? 'Light' : 'Dark'})} className={`w-12 h-6 rounded-full transition-colors relative ${localConfig.theme === 'Dark' ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${localConfig.theme === 'Dark' ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>
            </section>
            <section><label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">시스템 언어</label><div className="w-full p-2.5 border rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium cursor-not-allowed flex items-center justify-between border-gray-200 dark:border-gray-700"><span>한국어 (Korean)</span><span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">고정됨</span></div><p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">이 프로젝트는 한국어 환경에 최적화되어 있습니다.</p></section>
          </div>}
          
          {activeTab === 'model' && <div className="space-y-8 max-w-2xl">
            {activeModelTab === 'llm' && (() => {
              const externalProviders = [
                { id: 'openai', name: 'OpenAI', color: 'green', models: [
                  { name: 'gpt-4o', desc: '최신 멀티모달, 가장 강력' },
                  { name: 'gpt-4o-mini', desc: '빠르고 저렴한 경량 모델' },
                  { name: 'gpt-4-turbo', desc: '128K 컨텍스트' },
                  { name: 'gpt-3.5-turbo', desc: '빠른 응답, 최저 비용' },
                ]},
                { id: 'anthropic', name: 'Anthropic', color: 'orange', models: [
                  { name: 'claude-sonnet-4-5-20250929', desc: 'Claude 4.5 Sonnet' },
                  { name: 'claude-opus-4-6', desc: 'Claude Opus 4.6, 최강 추론' },
                  { name: 'claude-haiku-4-5-20251001', desc: 'Claude 4.5 Haiku, 빠르고 경제적' },
                ]},
                { id: 'google gemini', name: 'Google Gemini', color: 'blue', models: [
                  { name: 'gemini-2.0-flash', desc: '최신 Gemini, 빠른 응답' },
                  { name: 'gemini-2.0-pro', desc: '최고 성능 Gemini' },
                  { name: 'gemini-1.5-flash', desc: '100만 토큰 컨텍스트' },
                ]},
                { id: 'groq', name: 'Groq', color: 'red', models: [
                  { name: 'llama-3.3-70b-versatile', desc: 'Llama 3.3 70B, 초고속' },
                  { name: 'llama-3.1-8b-instant', desc: 'Llama 3.1 8B, 즉시 응답' },
                  { name: 'mixtral-8x7b-32768', desc: 'Mixtral MoE, 32K 컨텍스트' },
                ]},
              ];
              const registeredProviders = externalProviders.filter(p =>
                apiKeys.some(k => k.provider.toLowerCase() === p.id) ||
                backendApiKeys.some(bk => bk.provider === p.id)
              );
              return <><div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 flex gap-3 text-sm text-blue-800 dark:text-blue-300 mb-6"><Info size={20} className="shrink-0"/><div>Ollama 로컬 모델 또는 API 키가 등록된 외부 모델 중 선택하여 대화에 사용할 수 있습니다.</div></div>
              {/* Ollama 로컬 모델 */}
              <section>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Server size={14}/> Ollama 로컬 모델</label>
                  <button onClick={loadOllamaModels} disabled={ollamaModelsLoading} className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold flex items-center gap-1">
                    <RefreshCw size={12} className={ollamaModelsLoading ? 'animate-spin' : ''}/> {ollamaModelsLoading ? '불러오는 중...' : '새로고침'}
                  </button>
                </div>
                {ollamaModelsError && <div className="text-xs text-red-500 mb-2 flex items-center gap-1"><Info size={12}/> {ollamaModelsError}</div>}
                {ollamaModels.length > 0 ? (
                  <div className="space-y-2">
                    {ollamaModels.map(m => (
                      <div key={m.name} onClick={() => setLocalConfig({...localConfig, llm: m.name})} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${localConfig.llm === m.name ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${localConfig.llm === m.name ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                            <Cpu size={16}/>
                          </div>
                          <div>
                            <div className={`font-bold text-sm ${localConfig.llm === m.name ? 'text-blue-900 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>{m.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 font-medium">로컬</span>
                              {m.parameter_size && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">{m.parameter_size}</span>}
                              {m.family && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">{m.family}</span>}
                              {m.quantization && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">{m.quantization}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{m.size_gb} GB</span>
                          {localConfig.llm === m.name && <CheckCircle size={18} className="text-blue-600"/>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-center">
                    {ollamaModelsLoading ? (
                      <div className="flex flex-col items-center gap-2"><RefreshCw size={20} className="animate-spin text-gray-400"/><span className="text-sm text-gray-500 dark:text-gray-400">Ollama 모델 불러오는 중...</span></div>
                    ) : (
                      <div className="flex flex-col items-center gap-2"><Cpu size={20} className="text-gray-400"/><span className="text-sm text-gray-500 dark:text-gray-400">Ollama 모델 없음</span><span className="text-xs text-gray-400 dark:text-gray-500">Ollama 서버가 실행 중인지 확인하세요</span></div>
                    )}
                  </div>
                )}
              </section>

              {/* 외부 LLM 모델 */}
              <section className="mt-6">
                <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2"><Globe size={14}/> 외부 모델 (API)</label>
                {registeredProviders.length > 0 ? (
                  <div className="space-y-4">
                    {registeredProviders.map(provider => (
                      <div key={provider.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">{provider.name}</span>
                          <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle size={8}/> 키 등록됨</span>
                        </div>
                        <div className="space-y-1.5">
                          {provider.models.map(m => (
                            <div key={m.name} onClick={() => setLocalConfig({...localConfig, llm: m.name})} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${localConfig.llm === m.name ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-900/30 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${localConfig.llm === m.name ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                                  <Globe size={14}/>
                                </div>
                                <div>
                                  <div className={`font-bold text-sm ${localConfig.llm === m.name ? 'text-purple-900 dark:text-purple-300' : 'text-gray-800 dark:text-gray-200'}`}>{m.name}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${provider.color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : provider.color === 'orange' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : provider.color === 'red' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>{provider.name}</span>
                                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{m.desc}</span>
                                  </div>
                                </div>
                              </div>
                              {localConfig.llm === m.name && <CheckCircle size={18} className="text-purple-600"/>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">등록된 외부 API 키가 없습니다</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">API 키 관리 탭에서 OpenAI, Anthropic 등의 키를 등록하면 해당 모델을 선택할 수 있습니다.</p>
                  </div>
                )}
              </section>

              <section className="mt-4"><label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Ollama 서버 URL</label><div className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-400">{backendConfig?.ollama_base_url || (backendLoading ? '로딩 중...' : 'http://localhost:11434')}</div><p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1"><Info size={12}/> 변경하려면 백엔드 .env의 OLLAMA_BASE_URL을 수정하세요.</p></section></>;
            })()}
            {activeModelTab === 'embedding' && <><div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-4 flex gap-3 text-sm text-green-800 dark:text-green-300 mb-6"><Info size={20} className="shrink-0"/><div>임베딩 모델은 백엔드에서 초기화됩니다. 변경하려면 백엔드 .env의 EMBEDDING_MODEL 값을 수정하세요.</div></div><section><label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">현재 임베딩 모델</label><div className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-400">{backendConfig?.embedding_model || (backendLoading ? '로딩 중...' : 'BAAI/bge-m3')}</div></section><section><label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Rerank 모델 사용</label><div className="flex items-center gap-3"><button onClick={() => setLocalConfig({...localConfig, useRerank: !localConfig.useRerank})} className={`w-12 h-6 rounded-full transition-colors relative ${localConfig.useRerank ? 'bg-blue-600' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${localConfig.useRerank ? 'left-7' : 'left-1'}`}></div></button><span className="text-sm text-gray-600 dark:text-gray-400">{localConfig.useRerank ? '사용함 (검색 정확도 향상)' : '사용 안 함 (속도 향상)'}</span></div><p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Rerank는 검색된 문서를 임베딩 유사도로 재정렬하여 더 관련성 높은 결과를 반환합니다.</p></section></>}
            {activeModelTab === 'multimodal' && (() => {
              const visionKeywords = ['llava', 'bakllava', 'minicpm-v', 'moondream', 'llama3.2-vision', 'granite3.2-vision'];
              const visionModels = ollamaModels.filter(m => visionKeywords.some(k => m.name.toLowerCase().includes(k)));
              return <><div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Image size={18}/> 멀티모달 기능</h3><p className="text-xs text-gray-500 dark:text-gray-400 mt-1">이미지 이해가 가능한 Vision 모델을 활성화합니다.</p></div><button onClick={() => setLocalConfig({...localConfig, enableMultimodal: !localConfig.enableMultimodal})} className={`w-12 h-6 rounded-full transition-colors relative ${localConfig.enableMultimodal ? 'bg-blue-600' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${localConfig.enableMultimodal ? 'left-7' : 'left-1'}`}></div></button></div>
              <section className={`space-y-6 transition-all ${localConfig.enableMultimodal ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-gray-800 dark:text-gray-200">Vision 모델 선택</label>
                    <button onClick={loadOllamaModels} disabled={ollamaModelsLoading} className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold flex items-center gap-1">
                      <RefreshCw size={12} className={ollamaModelsLoading ? 'animate-spin' : ''}/> 새로고침
                    </button>
                  </div>
                  {visionModels.length > 0 ? (
                    <div className="space-y-2">
                      {visionModels.map(m => (
                        <div key={m.name} onClick={() => setLocalConfig({...localConfig, vlm: m.name})} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${localConfig.vlm === m.name ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-900/30 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${localConfig.vlm === m.name ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}><Image size={16}/></div>
                            <div>
                              <div className={`font-bold text-sm ${localConfig.vlm === m.name ? 'text-purple-900 dark:text-purple-300' : 'text-gray-800 dark:text-gray-200'}`}>{m.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {m.parameter_size && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">{m.parameter_size}</span>}
                                {m.family && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">{m.family}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">{m.size_gb} GB</span>
                            {localConfig.vlm === m.name && <CheckCircle size={18} className="text-purple-600"/>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-center">
                      <div className="flex flex-col items-center gap-2"><Image size={20} className="text-gray-400"/><span className="text-sm text-gray-500 dark:text-gray-400">Vision 모델이 없습니다</span><span className="text-xs text-gray-400 dark:text-gray-500">Ollama에서 vision 모델을 다운로드하세요</span><code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono text-gray-600 dark:text-gray-400 mt-1">ollama pull llava</code></div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1"><Info size={12}/> llava, bakllava, minicpm-v, moondream 등 vision 지원 모델만 표시됩니다.</p>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1"><HardDrive size={14}/> 파일 스토리지</label>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { id: 'local', label: '로컬 저장소', desc: '서버 디스크에 직접 저장' },
                      { id: 'minio', label: 'MinIO', desc: 'S3 호환 오브젝트 스토리지' },
                      { id: 's3', label: 'AWS S3', desc: 'Amazon 클라우드 스토리지' },
                    ].map(opt => (
                      <div key={opt.id} onClick={() => setLocalConfig({...localConfig, storageType: opt.id})} className={`p-3 rounded-xl border-2 cursor-pointer transition-all text-center ${localConfig.storageType === opt.id ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                        <div className={`text-sm font-bold ${localConfig.storageType === opt.id ? 'text-blue-900 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</div>
                      </div>
                    ))}
                  </div>
                  {localConfig.storageType === 'local' && (
                    <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">저장 경로</label><input type="text" value={localConfig.storagePath || './uploads'} onChange={(e) => setLocalConfig({...localConfig, storagePath: e.target.value})} className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-200 font-mono"/><p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">멀티모달 파일이 저장될 서버 경로</p></div>
                  )}
                  {(localConfig.storageType === 'minio' || localConfig.storageType === 's3') && (
                    <div className="space-y-3">
                      <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{localConfig.storageType === 'minio' ? 'MinIO Endpoint' : 'S3 Region'}</label><input type="text" value={localConfig.storageType === 'minio' ? (localConfig.minioEndpoint || '') : (localConfig.s3Region || 'ap-northeast-2')} onChange={(e) => setLocalConfig({...localConfig, ...(localConfig.storageType === 'minio' ? {minioEndpoint: e.target.value} : {s3Region: e.target.value})})} placeholder={localConfig.storageType === 'minio' ? 'http://localhost:9000' : 'ap-northeast-2'} className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-200 font-mono"/></div>
                      <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Bucket 이름</label><input type="text" value={localConfig.bucketName || ''} onChange={(e) => setLocalConfig({...localConfig, bucketName: e.target.value})} placeholder="my-rag-bucket" className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-200 font-mono"/></div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{localConfig.storageType === 'minio' ? 'MinIO Access/Secret Key는 API 키 관리 탭에서 설정하세요.' : 'AWS 인증 정보는 API 키 관리 탭에서 설정하세요.'}</p>
                    </div>
                  )}
                </div>
              </section></>;
            })()}
          </div>}

          {/* ✅ Graph DB */}
          {activeTab === 'graph' && (
            <div className="space-y-8 max-w-2xl">
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm text-purple-900 flex gap-3"><Network size={24} className="shrink-0 text-purple-600 mt-1"/><div><h4 className="font-bold">Graph RAG (Neo4j)</h4><p className="text-xs text-purple-800/80 mt-1 leading-relaxed">지식 베이스를 그래프 구조로 연결하여 더 깊이 있는 추론을 가능하게 합니다.<br/>연결 정보는 백엔드 환경변수(.env)에서 관리됩니다.</p></div></div>
              <section className="space-y-4">
                <div><label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Connection URI</label><div className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-400">{backendConfig?.neo4j_url || (backendLoading ? '로딩 중...' : '백엔드 연결 필요')}</div></div>
                <div><label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Username</label><div className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-400">{backendConfig?.neo4j_username || '-'}</div></div>
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Info size={12}/> 연결 정보를 변경하려면 백엔드 .env 파일의 NEO4J_URL, NEO4J_USERNAME, NEO4J_PASSWORD를 수정하세요.</p>
              </section>
              <div className="flex items-center justify-end gap-3">
                {testStatus.neo4j === 'success' && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14}/> {testDetail.neo4j}</span>}
                {testStatus.neo4j === 'error' && <span className="text-sm text-red-600 flex items-center gap-1 max-w-xs truncate">{testDetail.neo4j}</span>}
                <button onClick={() => handleTestConnection('neo4j')} disabled={testStatus.neo4j === 'testing'} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${testStatus.neo4j === 'success' ? 'bg-green-100 text-green-700' : testStatus.neo4j === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  <RefreshCw size={14} className={testStatus.neo4j === 'testing' ? 'animate-spin' : ''}/> {testStatus.neo4j === 'testing' ? '테스트 중...' : '연결 테스트'}
                </button>
              </div>
            </div>
          )}

          {/* ✅ Redis (Memory/Cache) 탭 추가 */}
          {activeTab === 'cache' && (
            <div className="space-y-8 max-w-2xl">
              <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-sm text-yellow-900 flex gap-3">
                <Zap size={24} className="shrink-0 text-yellow-600 mt-1"/>
                <div>
                  <h4 className="font-bold">Redis (Memory & Cache)</h4>
                  <p className="text-xs text-yellow-800/80 mt-1 leading-relaxed">
                    대화 내용을 기억(Memory)하고, 반복되는 질문에 빠르게 답변(Cache)하기 위해 Redis를 사용합니다.
                  </p>
                </div>
              </div>

              <section className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Connection URL</label>
                  <div className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-400">{backendConfig?.redis_url || (backendLoading ? '로딩 중...' : '백엔드 연결 필요')}</div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">캐시 설정</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">캐시 활성화</div>
                      <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{backendConfig?.cache_enabled ? '활성' : '비활성'}</div>
                    </div>
                    <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">캐시 TTL</div>
                      <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{backendConfig?.cache_ttl_seconds || '-'}초</div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Info size={12}/> 연결 정보를 변경하려면 백엔드 .env 파일의 REDIS_URL을 수정하세요.</p>
              </section>
              
              <div className="flex items-center justify-end gap-3">
                {testStatus.redis === 'success' && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14}/> {testDetail.redis}</span>}
                {testStatus.redis === 'error' && <span className="text-sm text-red-600 flex items-center gap-1 max-w-xs truncate">{testDetail.redis}</span>}
                <button onClick={() => handleTestConnection('redis')} disabled={testStatus.redis === 'testing'} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${testStatus.redis === 'success' ? 'bg-green-100 text-green-700' : testStatus.redis === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  <RefreshCw size={14} className={testStatus.redis === 'testing' ? 'animate-spin' : ''}/> {testStatus.redis === 'testing' ? '테스트 중...' : '연결 테스트'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'search' && <div className="space-y-8 max-w-2xl">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-900 dark:text-blue-300 flex gap-3">
              <BookOpen size={24} className="shrink-0 text-blue-600 dark:text-blue-400 mt-1"/>
              <div><h4 className="font-bold">웹 검색 공급자</h4><p className="text-xs text-blue-800/80 dark:text-blue-400/80 mt-1 leading-relaxed">채팅에서 웹 검색 사용 시 적용됩니다. DuckDuckGo는 바로 사용 가능하며,<br/>나머지는 API 키 등록 후 사용할 수 있습니다 (모두 무료 티어 제공).</p></div>
            </div>
            <section>
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">검색 공급자 선택</label>
              <div className="grid grid-cols-2 gap-3">
                {searchProviders.map(p => {
                  const hasKey = !p.needsKey || backendApiKeys.some(bk => bk.provider === p.id);
                  const isActive = localConfig.activeSearchProviderId === p.id;
                  return (
                    <div key={p.id} onClick={() => setLocalConfig({...localConfig, activeSearchProviderId: p.id})} className={`relative p-4 rounded-xl cursor-pointer border-2 transition-all ${isActive ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <div className="flex items-center gap-3">
                        <Globe className={isActive ? "text-blue-600 shrink-0" : "text-gray-400 shrink-0"} size={20}/>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm ${isActive ? 'text-blue-900 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>{p.name}</span>
                            {!p.needsKey && <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-bold">FREE</span>}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.description}</div>
                          {p.needsKey && (
                            <div className="mt-1.5">
                              {hasKey
                                ? <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle size={10}/> API 키 등록됨</span>
                                : <span className="text-[10px] text-orange-500 dark:text-orange-400 flex items-center gap-1"><Key size={10}/> API 키 필요 (API 키 관리 탭)</span>
                              }
                            </div>
                          )}
                        </div>
                        {isActive && <CheckCircle size={18} className="text-blue-600 shrink-0"/>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-gray-800 dark:text-gray-200">검색 결과 개수 (Top K)</label>
                <span className="text-sm font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">{localConfig.searchTopK || 5}개</span>
              </div>
              <input type="range" min="3" max="10" value={localConfig.searchTopK || 5} onChange={(e) => setLocalConfig({...localConfig, searchTopK: Number(e.target.value)})} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg accent-blue-600 cursor-pointer"/>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">이 값은 채팅 시 벡터 검색 결과 개수에도 적용됩니다.</p>
            </section>
            <section>
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Vector DB (Qdrant)</label>
              <div className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-400">{backendConfig?.qdrant_url || (backendLoading ? '로딩 중...' : 'http://localhost:6333')}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1"><Info size={12}/> 변경하려면 백엔드 .env의 QDRANT_URL을 수정하세요.</p>
            </section>
          </div>}

          {activeTab === 'api' && <div className="space-y-8 max-w-2xl">
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-xl p-4 text-sm text-orange-800 dark:text-orange-300 flex gap-2">
              <Info size={18} className="shrink-0 mt-0.5"/>
              <span>각 기능에 필요한 API 키를 등록하세요. 키는 로컬 + 백엔드에 동기화됩니다.</span>
            </div>

            {/* 웹 검색 API 키 */}
            <section>
              <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                <Globe size={16} className="text-blue-500"/> 웹 검색 공급자
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">채팅에서 웹 검색 시 사용됩니다. DuckDuckGo는 키 없이 무료로 사용 가능합니다.</p>
              <div className="space-y-2">
                {[
                  { id: 'brave', name: 'Brave Search', free: '무료 2,000회/월', url: 'https://brave.com/search/api/', desc: 'Brave 웹 검색 API' },
                  { id: 'tavily', name: 'Tavily AI', free: '무료 1,000회/월', url: 'https://tavily.com/', desc: 'AI 특화 검색 엔진' },
                  { id: 'serper', name: 'Google Serper', free: '무료 2,500회', url: 'https://serper.dev/', desc: 'Google 검색 결과 API' },
                ].map(provider => {
                  const existingKey = apiKeys.find(k => k.provider.toLowerCase() === provider.id);
                  const backendSynced = backendApiKeys.some(bk => bk.provider === provider.id);
                  const isActiveProvider = localConfig.activeSearchProviderId === provider.id;
                  return (
                    <div key={provider.id} className={`p-4 border-2 rounded-xl transition-all ${isActiveProvider ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{provider.name}</span>
                          <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">{provider.free}</span>
                          {isActiveProvider && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">현재 사용 중</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {existingKey && backendSynced && <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle size={10}/> 등록됨</span>}
                          <a href={provider.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"><Link size={10}/> 키 발급</a>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{provider.desc}</p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder={existingKey ? '••••••••••' : `${provider.name} API 키를 입력하세요`}
                          value={newKeyProvider === provider.name ? newKeyValue : ''}
                          onFocus={() => setNewKeyProvider(provider.name)}
                          onChange={(e) => { setNewKeyProvider(provider.name); setNewKeyValue(e.target.value); }}
                          className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                        {existingKey ? (
                          <div className="flex gap-1">
                            <button onClick={() => { setNewKeyProvider(provider.name); if (newKeyProvider === provider.name && newKeyValue.trim()) handleAddKey(); }} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition" title="키 업데이트">변경</button>
                            <button onClick={() => handleDeleteKey(existingKey.id, existingKey.provider)} className="px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg text-xs font-bold transition">삭제</button>
                          </div>
                        ) : (
                          <button onClick={() => { setNewKeyProvider(provider.name); if (newKeyProvider === provider.name && newKeyValue.trim()) handleAddKey(); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition">등록</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="p-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><Globe size={16} className="text-green-600 dark:text-green-400"/></div>
                  <div><span className="text-sm font-bold text-gray-700 dark:text-gray-300">DuckDuckGo</span><span className="ml-2 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-bold">FREE</span><p className="text-xs text-gray-500 dark:text-gray-400">API 키 없이 바로 사용 가능합니다.</p></div>
                </div>
              </div>
            </section>

            {/* LLM 공급자 API 키 */}
            <section>
              <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                <Cpu size={16} className="text-purple-500"/> LLM 공급자 (외부 모델)
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Ollama 로컬 모델 외에 외부 LLM을 사용하려면 해당 공급자의 API 키가 필요합니다.</p>
              <div className="space-y-2">
                {[
                  { id: 'openai', name: 'OpenAI', desc: 'GPT-4o, GPT-4, GPT-3.5 등', url: 'https://platform.openai.com/api-keys' },
                  { id: 'anthropic', name: 'Anthropic', desc: 'Claude 4.5, Claude 4 등', url: 'https://console.anthropic.com/settings/keys' },
                  { id: 'google gemini', name: 'Google Gemini', desc: 'Gemini Pro, Gemini Ultra 등', url: 'https://aistudio.google.com/app/apikey' },
                  { id: 'groq', name: 'Groq', desc: '초고속 추론 (Llama, Mixtral 등)', url: 'https://console.groq.com/keys' },
                ].map(provider => {
                  const existingKey = apiKeys.find(k => k.provider.toLowerCase() === provider.id);
                  const backendSynced = backendApiKeys.some(bk => bk.provider === provider.id);
                  return (
                    <div key={provider.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                        <Cpu size={14} className="text-purple-600 dark:text-purple-400"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{provider.name}</span>
                          {existingKey && backendSynced && <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle size={10}/> 등록됨</span>}
                          {existingKey && !backendSynced && <span className="text-[10px] text-orange-500 flex items-center gap-1"><Info size={10}/> 로컬만</span>}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{provider.desc}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={provider.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline"><Link size={12}/></a>
                        {existingKey ? (
                          <button onClick={() => handleDeleteKey(existingKey.id, existingKey.provider)} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={14}/></button>
                        ) : (
                          <button onClick={() => { setNewKeyProvider(provider.name); setActiveApiSection(provider.id); }} className="text-xs px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-bold transition">+ 등록</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* LLM 키 입력 폼 */}
              {activeApiSection && ['openai', 'anthropic', 'google gemini', 'groq'].includes(activeApiSection) && (
                <div className="mt-3 p-4 border border-blue-200 dark:border-blue-800 rounded-xl bg-blue-50/50 dark:bg-blue-900/10">
                  <div className="flex gap-2 items-center mb-2">
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                      {activeApiSection === 'openai' ? 'OpenAI' : activeApiSection === 'anthropic' ? 'Anthropic' : activeApiSection === 'google gemini' ? 'Google Gemini' : 'Groq'} API 키 등록
                    </span>
                    <button onClick={() => setActiveApiSection(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">취소</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="API 키를 입력하세요"
                      value={newKeyValue}
                      onChange={(e) => { setNewKeyProvider(activeApiSection === 'openai' ? 'OpenAI' : activeApiSection === 'anthropic' ? 'Anthropic' : activeApiSection === 'google gemini' ? 'Google Gemini' : 'Groq'); setNewKeyValue(e.target.value); }}
                      className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <button onClick={() => { handleAddKey(); setActiveApiSection(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition">저장</button>
                  </div>
                </div>
              )}
            </section>

            {/* 스토리지 API 키 */}
            <section>
              <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                <HardDrive size={16} className="text-teal-500"/> 스토리지 인증
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">MinIO 또는 AWS S3 스토리지 사용 시 인증 정보가 필요합니다.</p>
              <div className="space-y-2">
                {[
                  { id: 'minio', name: 'MinIO', desc: 'Access Key / Secret Key', fields: ['Access Key', 'Secret Key'] },
                  { id: 'aws', name: 'AWS S3', desc: 'Access Key ID / Secret Access Key', fields: ['Access Key ID', 'Secret Access Key'] },
                ].map(provider => {
                  const existingKey = apiKeys.find(k => k.provider.toLowerCase() === provider.id);
                  const backendSynced = backendApiKeys.some(bk => bk.provider === provider.id);
                  const isActiveStorage = localConfig.storageType === (provider.id === 'aws' ? 's3' : provider.id);
                  return (
                    <div key={provider.id} className={`p-3 border-2 rounded-xl transition-all ${isActiveStorage ? 'border-teal-300 dark:border-teal-700 bg-teal-50/30 dark:bg-teal-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HardDrive size={14} className="text-teal-600 dark:text-teal-400"/>
                          <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{provider.name}</span>
                          {isActiveStorage && <span className="text-[10px] bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-1.5 py-0.5 rounded font-bold">현재 사용 중</span>}
                          {existingKey && backendSynced && <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle size={10}/> 등록됨</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {existingKey ? (
                            <button onClick={() => handleDeleteKey(existingKey.id, existingKey.provider)} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={14}/></button>
                          ) : (
                            <button onClick={() => { setNewKeyProvider(provider.name); setActiveApiSection(provider.id); }} className="text-xs px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-bold transition">+ 등록</button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{provider.desc}</p>
                    </div>
                  );
                })}
              </div>
              {/* 스토리지 키 입력 폼 */}
              {activeApiSection && ['minio', 'aws'].includes(activeApiSection) && (
                <div className="mt-3 p-4 border border-teal-200 dark:border-teal-800 rounded-xl bg-teal-50/50 dark:bg-teal-900/10">
                  <div className="flex gap-2 items-center mb-2">
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{activeApiSection === 'minio' ? 'MinIO' : 'AWS S3'} 인증 등록</span>
                    <button onClick={() => setActiveApiSection(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">취소</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder={activeApiSection === 'minio' ? 'Access Key:Secret Key 형식' : 'Access Key ID:Secret Access Key 형식'}
                      value={newKeyValue}
                      onChange={(e) => { setNewKeyProvider(activeApiSection === 'minio' ? 'MinIO' : 'AWS'); setNewKeyValue(e.target.value); }}
                      className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                    <button onClick={() => { handleAddKey(); setActiveApiSection(null); }} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition">저장</button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Access Key와 Secret Key를 콜론(:)으로 구분하여 입력하세요.</p>
                </div>
              )}
            </section>
          </div>}

          {activeTab === 'database' && (
            <div className="space-y-8 max-w-2xl">
              {/* 안내 배너 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-900 dark:text-blue-200 flex gap-3">
                <Database size={24} className="shrink-0 text-blue-600 dark:text-blue-400 mt-1"/>
                <div>
                  <h4 className="font-bold">외부 데이터베이스 연결 (Text-to-SQL)</h4>
                  <p className="text-xs text-blue-800/80 dark:text-blue-300/80 mt-1 leading-relaxed">
                    외부 데이터베이스를 연결하면 채팅에서 자연어로 SQL 쿼리를 실행할 수 있습니다.
                    안전을 위해 <span className="font-bold">SELECT 쿼리만 허용</span>되며, 데이터 변경(INSERT/UPDATE/DELETE)은 차단됩니다.
                  </p>
                </div>
              </div>

              {/* 새 연결 추가 */}
              <section className="space-y-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <Plus size={14} /> 새 연결 추가
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="연결 이름 (예: 운영 DB)"
                    value={newDbConn.name}
                    onChange={e => setNewDbConn({...newDbConn, name: e.target.value})}
                    className="p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <select
                    value={newDbConn.db_type}
                    onChange={e => setNewDbConn({...newDbConn, db_type: e.target.value, port: e.target.value === 'mysql' ? 3306 : 5432})}
                    className="p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                  {newDbConn.db_type !== 'sqlite' && (
                    <>
                      <input
                        placeholder="호스트 (예: localhost)"
                        value={newDbConn.host}
                        onChange={e => setNewDbConn({...newDbConn, host: e.target.value})}
                        className="p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <input
                        placeholder="포트"
                        type="number"
                        value={newDbConn.port}
                        onChange={e => setNewDbConn({...newDbConn, port: parseInt(e.target.value) || 0})}
                        className="p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <input
                        placeholder="사용자명"
                        value={newDbConn.username}
                        onChange={e => setNewDbConn({...newDbConn, username: e.target.value})}
                        className="p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <input
                        placeholder="비밀번호"
                        type="password"
                        value={newDbConn.password}
                        onChange={e => setNewDbConn({...newDbConn, password: e.target.value})}
                        className="p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </>
                  )}
                  <input
                    placeholder={newDbConn.db_type === 'sqlite' ? '파일 경로 (예: /data/mydb.sqlite)' : '데이터베이스명'}
                    value={newDbConn.database}
                    onChange={e => setNewDbConn({...newDbConn, database: e.target.value})}
                    className="col-span-2 p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleAddDbConnection}
                  disabled={!newDbConn.name.trim() || !newDbConn.database.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
                >
                  <Plus size={14}/> 연결 추가
                </button>
              </section>

              {/* 등록된 연결 목록 */}
              <section className="space-y-3">
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <Server size={14} /> 등록된 연결
                </h4>
                {dbConnections.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Database size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">등록된 데이터베이스 연결이 없습니다.</p>
                    <p className="text-xs mt-1">위 폼에서 외부 DB를 추가해보세요.</p>
                  </div>
                ) : (
                  dbConnections.map(conn => (
                    <div key={conn.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 hover:border-blue-300 transition">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            dbTestStatus[conn.id] === 'success' ? 'bg-green-500' :
                            dbTestStatus[conn.id] === 'error' ? 'bg-red-500' : 'bg-gray-300'
                          }`} />
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{conn.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            conn.db_type === 'postgresql' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                            conn.db_type === 'mysql' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                            'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          }`}>{conn.db_type}</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 truncate">
                          {conn.db_type === 'sqlite' ? conn.database : `${conn.host}:${conn.port}/${conn.database}`}
                        </div>
                        {dbTestStatus[conn.id] === 'success' && (
                          <div className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle size={10}/> 연결 성공</div>
                        )}
                        {dbTestStatus[conn.id] === 'error' && (
                          <div className="text-xs text-red-600 mt-1 truncate max-w-[300px]">{dbTestDetail[conn.id]}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <button
                          onClick={() => handleTestDbConnection(conn.id)}
                          className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-1.5 transition"
                        >
                          <RefreshCw size={12} className={dbTestStatus[conn.id] === 'testing' ? 'animate-spin' : ''}/> 테스트
                        </button>
                        <button
                          onClick={() => handleDeleteDbConnection(conn.id)}
                          className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-100 dark:border-red-800 rounded-lg text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center gap-1.5 transition"
                        >
                          <Trash2 size={12}/> 삭제
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>

              {/* 사용 안내 */}
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">사용 방법</h5>
                <ol className="text-xs text-gray-500 dark:text-gray-400 space-y-1 list-decimal list-inside">
                  <li>위에서 외부 데이터베이스 연결을 등록합니다.</li>
                  <li><span className="font-bold">테스트</span> 버튼으로 연결을 확인합니다.</li>
                  <li>채팅 화면에서 <span className="inline-flex items-center gap-1 font-bold"><Database size={10}/>SQL</span> 버튼을 켜고 DB를 선택합니다.</li>
                  <li>자연어로 질문하면 AI가 SQL을 생성하고 실행합니다.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'mcp' && <div className="space-y-6 max-w-2xl">
            {/* 안내 배너 */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4 text-sm text-indigo-800 dark:text-indigo-300 flex gap-3">
              <Plug size={20} className="shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5"/>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold">MCP (Model Context Protocol)</h4>
                  <span className="px-2 py-0.5 bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded-full">Beta</span>
                </div>
                <p className="text-xs text-indigo-700/80 dark:text-indigo-400/80 leading-relaxed">
                  MCP 서버를 연결하면 AI가 외부 도구(파일 시스템, 데이터베이스, API 등)에 접근할 수 있습니다.<br/>
                  SSE/Streamable HTTP는 원격 서버, stdio는 로컬 프로세스 실행 방식입니다.
                </p>
              </div>
            </div>

            {/* 서버 추가 폼 */}
            <section>
              <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Plus size={14}/> 새 MCP 서버 연결
              </h4>
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/50 space-y-3">
                {/* 연결 타입 선택 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">연결 방식</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'sse', label: 'SSE', desc: 'Server-Sent Events' },
                      { id: 'streamable-http', label: 'Streamable HTTP', desc: 'HTTP 스트리밍' },
                      { id: 'stdio', label: 'stdio', desc: '로컬 프로세스' },
                    ].map(t => (
                      <div key={t.id} onClick={() => setNewMcpType(t.id)} className={`p-2.5 rounded-lg border-2 cursor-pointer transition-all text-center ${newMcpType === t.id ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                        <div className={`text-xs font-bold ${newMcpType === t.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{t.label}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 이름 + URL/Command */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">서버 이름</label>
                    <input type="text" value={newMcpName} onChange={(e) => setNewMcpName(e.target.value)} placeholder="예: Filesystem" className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div>
                    {newMcpType === 'stdio' ? (
                      <>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">실행 명령어</label>
                        <input type="text" value={newMcpCommand} onChange={(e) => setNewMcpCommand(e.target.value)} placeholder="예: npx -y @modelcontextprotocol/server-filesystem" className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"/>
                      </>
                    ) : (
                      <>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Endpoint URL</label>
                        <input type="text" value={newMcpUrl} onChange={(e) => setNewMcpUrl(e.target.value)} placeholder="http://localhost:3001/mcp" className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"/>
                      </>
                    )}
                  </div>
                </div>

                <button onClick={handleAddMcp} disabled={!newMcpName.trim() || (newMcpType === 'stdio' ? !newMcpCommand.trim() : !newMcpUrl.trim())} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2">
                  <Plug size={14}/> 서버 연결
                </button>
              </div>
            </section>

            {/* 연결된 서버 목록 */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <Server size={14}/> 연결된 서버 ({mcpServers.length})
                </h4>
                {mcpServers.length > 1 && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                    <GripVertical size={10}/> 드래그 또는 화살표로 우선순위 변경
                  </span>
                )}
              </div>
              {mcpServers.length > 0 ? (
                <div className="space-y-2">
                  {mcpServers.map((s, i) => (
                    <div key={s.id} draggable onDragStart={(e) => handleDragStart(e, i)} onDragOver={(e) => handleDragOver(e, i)} onDrop={(e) => handleDrop(e, i)} className={`p-3 rounded-xl group hover:border-gray-300 dark:hover:border-gray-600 transition-colors ${i === 0 ? 'border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50/30 dark:bg-indigo-900/10' : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex gap-2 items-start flex-1 min-w-0">
                          {/* 우선순위 번호 */}
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${i === 0 ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                            {i + 1}
                          </div>
                          <div className="cursor-move text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 mt-0.5"><GripVertical size={16}/></div>
                          <div className={`p-2 rounded-lg shrink-0 ${s.status === 'connected' ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>
                            <Server size={18}/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2 flex-wrap">
                              {s.name}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${s.type === 'stdio' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'}`}>{s.type}</span>
                              {i === 0 && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold">기본</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{s.status === 'connected' ? '연결됨' : '연결 안 됨'}</span>
                            </div>
                            {s.url && <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-1 truncate">{s.url}</div>}
                            {s.command && <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-1 truncate">$ {s.command}</div>}
                          </div>
                        </div>
                        {/* 우선순위 조절 + 삭제 */}
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => reorderMcpServer(i, 'up')} disabled={i === 0} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" title="우선순위 올리기">
                              <ArrowUp size={12}/>
                            </button>
                            <button onClick={() => reorderMcpServer(i, 'down')} disabled={i === mcpServers.length - 1} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" title="우선순위 내리기">
                              <ArrowDown size={12}/>
                            </button>
                          </div>
                          <button onClick={() => deleteMcpServer(s.id)} className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition p-1 opacity-0 group-hover:opacity-100"><Trash2 size={15}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-center">
                  <Plug size={24} className="text-gray-300 dark:text-gray-600 mx-auto mb-2"/>
                  <p className="text-sm text-gray-500 dark:text-gray-400">연결된 MCP 서버가 없습니다</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">위 폼에서 MCP 서버를 추가하세요.</p>
                </div>
              )}
              {mcpServers.length > 0 && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 flex items-center gap-1">
                  <Info size={10}/> 1번 서버가 기본으로 사용됩니다. 순서를 변경하여 우선순위를 조정하세요.
                </p>
              )}
            </section>

            {/* MCP 도움말 */}
            <section className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <details className="group">
                <summary className="text-xs font-bold text-gray-500 dark:text-gray-400 cursor-pointer flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
                  <Info size={12}/> MCP 서버 예시
                </summary>
                <div className="mt-3 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="font-bold text-gray-700 dark:text-gray-300 mb-1">Filesystem (stdio)</div>
                    <code className="text-[10px] font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded block">npx -y @modelcontextprotocol/server-filesystem /path/to/dir</code>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="font-bold text-gray-700 dark:text-gray-300 mb-1">GitHub (stdio)</div>
                    <code className="text-[10px] font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded block">npx -y @modelcontextprotocol/server-github</code>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="font-bold text-gray-700 dark:text-gray-300 mb-1">Custom API (SSE)</div>
                    <code className="text-[10px] font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded block">http://localhost:3001/mcp/sse</code>
                  </div>
                </div>
              </details>
            </section>
          </div>}

          {/* ✅ 시스템 정보에 실시간 서비스 상태 */}
          {activeTab === 'system' && (
            <SystemInfoTab testStatus={testStatus} handleTestConnection={handleTestConnection} testDetail={testDetail} />
          )}

        </div>
      </main>
    </div>
  );
}


function ServiceStatusRow({ icon: Icon, label, serviceName, testStatus, testDetail, onTest }) {
  const status = testStatus[serviceName] || 'idle';
  const detail = testDetail[serviceName] || '';

  const statusBadge = () => {
    if (status === 'testing') return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded flex items-center gap-1"><RefreshCw size={12} className="animate-spin"/> 확인 중...</span>;
    if (status === 'success') return <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Connected</span>;
    if (status === 'error') return <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded" title={detail}>Disconnected</span>;
    return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded cursor-pointer hover:bg-gray-200" onClick={() => onTest(serviceName)}>확인하기</span>;
  };

  return (
    <div className="flex justify-between items-center p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
      <span className="text-sm font-medium flex items-center gap-2"><Icon size={14}/> {label}</span>
      {statusBadge()}
    </div>
  );
}

function SystemInfoTab({ testStatus, handleTestConnection, testDetail }) {
  const services = [
    { icon: Database, label: 'Qdrant Vector DB', serviceName: 'qdrant' },
    { icon: Cpu, label: 'Ollama Inference', serviceName: 'ollama' },
    { icon: Network, label: 'Neo4j Graph DB', serviceName: 'neo4j' },
    { icon: Zap, label: 'Redis Cache', serviceName: 'redis' },
  ];

  const handleTestAll = () => {
    services.forEach(s => handleTestConnection(s.serviceName));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-gray-900 text-white rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl">R</div><div><h3 className="font-bold text-lg">RAG AI</h3><p className="text-xs text-gray-400">Enterprise RAG Solution</p></div></div>
        <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-700 pt-4"><div><span className="text-gray-500 block text-xs mb-1">Version</span><span className="font-mono">v1.0.0 (Beta)</span></div><div><span className="text-gray-500 block text-xs mb-1">Status</span><span className="text-green-400 flex items-center gap-1"><div className="w-2 h-2 bg-green-400 rounded-full"/> Online</span></div></div>
      </div>
      <section>
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-bold text-gray-800 text-sm">연결된 서비스</h4>
          <button onClick={handleTestAll} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"><RefreshCw size={12}/> 전체 테스트</button>
        </div>
        <div className="space-y-2">
          {services.map(s => (
            <ServiceStatusRow key={s.serviceName} icon={s.icon} label={s.label} serviceName={s.serviceName} testStatus={testStatus} testDetail={testDetail} onTest={handleTestConnection} />
          ))}
        </div>
      </section>
    </div>
  );
}