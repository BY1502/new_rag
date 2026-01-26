import React, { useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { Settings, Cpu, Globe, Key, Info, Save, Layout, Database, Plug, Plus, Trash2, Link, Server, ArrowUp, ArrowDown, GripVertical, BookOpen, CheckCircle, Image, HardDrive, RefreshCw, Share2, Network, Zap } from '../../components/ui/Icon';

export default function AdvancedSettings() {
  const { config, setConfig, apiKeys, addApiKey, deleteApiKey, mcpServers, addMcpServer, deleteMcpServer, reorderMcpServer, moveMcpServer, searchProviders, addSearchProvider, deleteSearchProvider } = useStore();
  const [activeTab, setActiveTab] = useState('general');
  const [activeModelTab, setActiveModelTab] = useState('llm'); 
  const [localConfig, setLocalConfig] = useState({ ...config });

  const [newKeyProvider, setNewKeyProvider] = useState('OpenAI');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newSearchName, setNewSearchName] = useState('');
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);

  const handleSave = () => { setConfig(localConfig); alert('설정이 저장되었습니다.'); };
  const handleAddKey = () => { if(!newKeyValue.trim()) return; addApiKey(newKeyProvider, newKeyValue); setNewKeyValue(''); };
  const handleAddMcp = () => { if(!newMcpName.trim()) return; addMcpServer({ name: newMcpName, url: newMcpUrl, type: 'sse' }); setNewMcpName(''); setNewMcpUrl(''); };
  const handleAddSearch = () => { if(!newSearchName.trim()) return; addSearchProvider({ name: newSearchName, type: 'api', description: 'Custom API Provider' }); setNewSearchName(''); };
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
    { id: 'mcp', label: 'MCP 서버', icon: Plug },
    { id: 'system', label: '시스템 정보', icon: Info },
  ];

  return (
    <div className="flex h-[700px] w-full bg-white text-gray-800">
      <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col p-4 shrink-0">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 px-2 tracking-wider">Settings</h3>
        <nav className="space-y-1">
          {tabs.map(tab => (
            <div key={tab.id}>
              <button onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
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
        <header className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
          <div><h2 className="text-xl font-bold text-gray-900">{tabs.find(t => t.id === activeTab)?.label}</h2><p className="text-sm text-gray-500 mt-1">시스템의 전반적인 환경을 설정합니다.</p></div>
          <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-sm font-bold transition shadow-sm"><Save size={16}/> 저장하기</button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'general' && <div className="space-y-8 max-w-2xl"><section><label className="block text-sm font-bold text-gray-800 mb-2">시스템 언어</label><div className="w-full p-2.5 border rounded-lg text-sm bg-gray-100 text-gray-500 font-medium cursor-not-allowed flex items-center justify-between"><span>한국어 (Korean)</span><span className="text-xs px-2 py-0.5 bg-gray-200 rounded text-gray-600">고정됨</span></div><p className="text-xs text-gray-500 mt-1.5">이 프로젝트는 한국어 환경에 최적화되어 있습니다.</p></section></div>}
          
          {activeTab === 'model' && <div className="space-y-8 max-w-2xl">
            {activeModelTab === 'llm' && <><div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-sm text-blue-800 mb-6"><Info size={20} className="shrink-0"/><div>기본 대화 및 추론에 사용되는 대규모 언어 모델을 설정합니다.</div></div><section><label className="block text-sm font-bold text-gray-800 mb-2">기본 LLM 모델</label><select value={localConfig.llm} onChange={(e) => setLocalConfig({...localConfig, llm: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="gemma3:12b">Gemma 3 (12B)</option><option value="llama3:8b">Llama 3 (8B)</option><option value="mistral:7b">Mistral (7B)</option><option value="gpt-4o">GPT-4o (OpenAI)</option></select></section></>}
            {activeModelTab === 'embedding' && <><section><label className="block text-sm font-bold text-gray-800 mb-2">임베딩 모델 (Vector)</label><select value={localConfig.embeddingModel} onChange={(e) => setLocalConfig({...localConfig, embeddingModel: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="bge-m3">BAAI/bge-m3 (Recommended)</option><option value="text-embedding-3-small">OpenAI/text-embedding-3-small</option></select></section><section><label className="block text-sm font-bold text-gray-800 mb-2">Rerank 모델 사용</label><div className="flex items-center gap-3"><button onClick={() => setLocalConfig({...localConfig, useRerank: !localConfig.useRerank})} className={`w-12 h-6 rounded-full transition-colors relative ${localConfig.useRerank ? 'bg-blue-600' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${localConfig.useRerank ? 'left-7' : 'left-1'}`}></div></button><span className="text-sm text-gray-600">{localConfig.useRerank ? '사용함 (검색 정확도 향상)' : '사용 안 함 (속도 향상)'}</span></div></section></>}
            {activeModelTab === 'multimodal' && <><div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-gray-800 flex items-center gap-2"><Image size={18}/> 멀티모달 기능</h3><p className="text-xs text-gray-500 mt-1">이미지, 비디오 등 멀티모달 콘텐츠 이해 능력을 활성화합니다.</p></div><button onClick={() => setLocalConfig({...localConfig, enableMultimodal: !localConfig.enableMultimodal})} className={`w-12 h-6 rounded-full transition-colors relative ${localConfig.enableMultimodal ? 'bg-blue-600' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${localConfig.enableMultimodal ? 'left-7' : 'left-1'}`}></div></button></div><section className={`p-6 border border-gray-200 rounded-xl space-y-6 transition-all bg-gray-50 ${localConfig.enableMultimodal ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}><div><label className="block text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1">VLLM 시각 모델 <span className="text-red-500">*</span></label><select value={localConfig.vlm} onChange={(e) => setLocalConfig({...localConfig, vlm: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="llava:7b">LLaVA (7B) - 로컬</option><option value="bakllava">BakLLaVA - 로컬</option><option value="gpt-4-vision">GPT-4 Vision (API)</option></select><p className="text-[10px] text-gray-500 mt-1">멀티모달 이해를 위한 시각 언어 모델 (필수)</p></div><div className="border-t border-gray-200 pt-4"><label className="block text-xs font-bold text-gray-600 mb-3 flex items-center gap-1"><HardDrive size={14}/> 스토리지 구성 <span className="text-red-500">*</span></label><div className="flex gap-6 mb-4"><label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="storage" checked={localConfig.storageType === 'minio'} onChange={() => setLocalConfig({...localConfig, storageType: 'minio'})} className="accent-blue-600"/><span className="text-sm font-medium text-gray-700">MinIO</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="storage" checked={localConfig.storageType === 'cos'} onChange={() => setLocalConfig({...localConfig, storageType: 'cos'})} className="accent-blue-600"/><span className="text-sm font-medium text-gray-700">Tencent Cloud COS</span></label></div><div className="flex gap-2"><div className="flex-1"><label className="block text-[10px] font-bold text-gray-500 mb-1">Bucket 이름 <span className="text-red-500">*</span></label><input type="text" value={localConfig.bucketName || ''} onChange={(e) => setLocalConfig({...localConfig, bucketName: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"/></div><div className="flex items-end"><button className="p-2.5 bg-white hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-300 transition" title="새로고침"><RefreshCw size={18}/></button></div></div><p className="text-[10px] text-gray-400 mt-1">이미 존재하는 공개 읽기 권한 Bucket 선택</p></div></section></>}
          </div>}

          {/* ✅ Graph DB */}
          {activeTab === 'graph' && (
            <div className="space-y-8 max-w-2xl">
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm text-purple-900 flex gap-3"><Network size={24} className="shrink-0 text-purple-600 mt-1"/><div><h4 className="font-bold">Graph RAG (Neo4j)</h4><p className="text-xs text-purple-800/80 mt-1 leading-relaxed">지식 베이스를 그래프 구조로 연결하여 더 깊이 있는 추론을 가능하게 합니다.<br/>Neo4j 데이터베이스 연결 정보가 필요합니다.</p></div></div>
              <section className="space-y-4"><div><label className="block text-sm font-bold text-gray-800 mb-2">Connection URI</label><input type="text" value={localConfig.neo4jUri || ''} onChange={(e) => setLocalConfig({...localConfig, neo4jUri: e.target.value})} placeholder="bolt://localhost:7687" className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white font-mono"/></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-gray-800 mb-2">Username</label><input type="text" value={localConfig.neo4jUser || ''} onChange={(e) => setLocalConfig({...localConfig, neo4jUser: e.target.value})} placeholder="neo4j" className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"/></div><div><label className="block text-sm font-bold text-gray-800 mb-2">Password</label><input type="password" value={localConfig.neo4jPassword || ''} onChange={(e) => setLocalConfig({...localConfig, neo4jPassword: e.target.value})} placeholder="********" className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"/></div></div></section>
              <div className="flex justify-end"><button className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-bold transition flex items-center gap-2"><RefreshCw size={14}/> 연결 테스트</button></div>
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-gray-800 mb-2">Redis Host</label>
                    <input type="text" value={localConfig.redisHost || 'localhost'} onChange={(e) => setLocalConfig({...localConfig, redisHost: e.target.value})} placeholder="localhost" className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-yellow-500 bg-white font-mono"/>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">Port</label>
                    <input type="text" value={localConfig.redisPort || '6379'} onChange={(e) => setLocalConfig({...localConfig, redisPort: e.target.value})} placeholder="6379" className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-yellow-500 bg-white font-mono"/>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2">Password (Optional)</label>
                  <input type="password" value={localConfig.redisPassword || ''} onChange={(e) => setLocalConfig({...localConfig, redisPassword: e.target.value})} placeholder="********" className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-yellow-500 bg-white"/>
                </div>
              </section>
              
              <div className="flex justify-end">
                <button className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-bold transition flex items-center gap-2">
                  <RefreshCw size={14}/> 연결 테스트
                </button>
              </div>
            </div>
          )}

          {activeTab === 'search' && <div className="space-y-8 max-w-2xl"><div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 flex gap-3"><BookOpen size={24} className="shrink-0 text-blue-600 mt-1"/><div><h4 className="font-bold">웹 검색 가이드</h4><p className="text-xs text-blue-800/80 mt-1 leading-relaxed">AI가 최신 정보를 검색하여 답변할 수 있도록 검색 공급자를 설정합니다.<br/>DuckDuckGo는 무료이며, Serper는 API Key가 필요하지만 더 정확합니다.</p></div></div><section><label className="block text-sm font-bold text-gray-800 mb-2">검색 공급자 선택 (Active Provider)</label><div className="grid grid-cols-2 gap-4">{searchProviders.map(p => (<div key={p.id} onClick={() => setLocalConfig({...localConfig, activeSearchProviderId: p.id})} className={`relative p-4 rounded-xl flex items-center gap-3 cursor-pointer border-2 transition-all ${localConfig.activeSearchProviderId === p.id ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}><Globe className={localConfig.activeSearchProviderId === p.id ? "text-blue-600" : "text-gray-400"}/><div className="flex-1"><div className={`font-bold text-sm ${localConfig.activeSearchProviderId === p.id ? 'text-blue-900' : 'text-gray-700'}`}>{p.name}</div><div className="text-xs text-gray-500">{p.description}</div></div>{localConfig.activeSearchProviderId === p.id && <CheckCircle size={18} className="text-blue-600"/>}{p.id !== 'ddg' && (<button onClick={(e) => { e.stopPropagation(); if(confirm('이 검색 공급자를 삭제하시겠습니까?')) deleteSearchProvider(p.id); }} className="absolute right-2 top-2 p-1.5 text-gray-300 hover:text-red-500 hover:bg-white rounded-full transition z-10"><Trash2 size={14}/></button>)}</div>))}</div></section><section><label className="block text-sm font-bold text-gray-800 mb-2">새 공급자 추가</label><div className="flex gap-2 h-[42px]"><input type="text" value={newSearchName} onChange={(e) => setNewSearchName(e.target.value)} placeholder="공급자 이름 (예: Bing Search)" className="flex-1 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"/><button onClick={handleAddSearch} className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition flex items-center gap-2 shadow-sm whitespace-nowrap"><Plus size={16}/> 추가</button></div></section><section><div className="flex justify-between items-center mb-2"><label className="text-sm font-bold text-gray-800">검색 결과 개수 (Top K)</label><span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{localConfig.searchTopK || 5}개</span></div><input type="range" min="3" max="10" value={localConfig.searchTopK || 5} onChange={(e) => setLocalConfig({...localConfig, searchTopK: Number(e.target.value)})} className="w-full h-2 bg-gray-200 rounded-lg accent-blue-600 cursor-pointer"/></section></div>}

          {activeTab === 'api' && <div className="space-y-6 max-w-2xl"><div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-sm text-orange-800 mb-6 flex gap-2"><Info size={18} className="shrink-0 mt-0.5"/><span>외부 모델(OpenAI, Anthropic 등)을 사용하려면 API 키가 필요합니다. 키는 로컬에만 저장됩니다.</span></div><div className="flex gap-3 items-end p-4 border border-gray-200 rounded-xl bg-gray-50/50"><div className="w-1/3"><label className="block text-xs font-bold text-gray-500 mb-1">Provider</label><select value={newKeyProvider} onChange={(e) => setNewKeyProvider(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-white"><option>OpenAI</option><option>Anthropic</option><option>Google Gemini</option><option>Groq</option><option>Custom</option></select></div><div className="flex-1"><label className="block text-xs font-bold text-gray-500 mb-1">API Key</label><input type="password" value={newKeyValue} onChange={(e) => setNewKeyValue(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-white"/></div><button onClick={handleAddKey} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold"><Plus size={16}/> 추가</button></div><div className="space-y-2">{apiKeys.map(k => <div key={k.id} className="flex justify-between p-3 border rounded-lg bg-white"><span>{k.provider}</span><button onClick={() => deleteApiKey(k.id)}><Trash2 size={16}/></button></div>)}</div></div>}

          {activeTab === 'mcp' && <div className="space-y-6 max-w-2xl"><div className="flex justify-between items-center mb-4"><div><h3 className="font-bold text-gray-800">MCP (Model Context Protocol)</h3><p className="text-xs text-gray-500">AI 모델과 외부 데이터 연결 표준 프로토콜</p></div><span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Beta</span></div><div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3"><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-gray-500 mb-1">Server Name</label><input type="text" value={newMcpName} onChange={(e) => setNewMcpName(e.target.value)} placeholder="Name" className="w-full p-2 border rounded-lg text-sm bg-white"/></div><div><label className="block text-xs font-bold text-gray-500 mb-1">Endpoint URL</label><input type="text" value={newMcpUrl} onChange={(e) => setNewMcpUrl(e.target.value)} placeholder="URL" className="w-full p-2 border rounded-lg text-sm bg-white"/></div></div><button onClick={handleAddMcp} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">연결</button></div><div className="space-y-3">{mcpServers.map((s, i) => <div key={s.id} draggable onDragStart={(e) => handleDragStart(e, i)} onDragOver={(e) => handleDragOver(e, i)} onDrop={(e) => handleDrop(e, i)} className="flex justify-between p-3 border rounded-lg bg-white group"><div className="flex gap-3 items-center"><div className="cursor-move text-gray-300 hover:text-gray-500 p-1"><GripVertical size={16}/></div><div className="p-2 rounded-lg bg-green-50 text-green-600"><Server size={18}/></div><div><div className="font-bold text-sm text-gray-800 flex items-center gap-2">{s.name}<span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 uppercase">{s.type}</span></div><div className="flex items-center gap-1.5 mt-0.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div><span className="text-xs text-gray-500 capitalize">{s.status}</span></div></div></div><button onClick={() => deleteMcpServer(s.id)}><Trash2 size={16}/></button></div>)}</div></div>}

          {/* ✅ 시스템 정보에 Redis 상태 추가 */}
          {activeTab === 'system' && (
            <div className="space-y-6 max-w-2xl">
              <div className="bg-gray-900 text-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl">R</div><div><h3 className="font-bold text-lg">RAG AI</h3><p className="text-xs text-gray-400">Enterprise RAG Solution</p></div></div>
                <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-700 pt-4"><div><span className="text-gray-500 block text-xs mb-1">Version</span><span className="font-mono">v1.0.0 (Beta)</span></div><div><span className="text-gray-500 block text-xs mb-1">Status</span><span className="text-green-400 flex items-center gap-1"><div className="w-2 h-2 bg-green-400 rounded-full"/> Online</span></div></div>
              </div>
              <section>
                <h4 className="font-bold text-gray-800 mb-3 text-sm">연결된 서비스</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 border rounded-lg bg-gray-50"><span className="text-sm font-medium flex items-center gap-2"><Database size={14}/> Qdrant Vector DB</span><span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Connected</span></div>
                  <div className="flex justify-between items-center p-3 border rounded-lg bg-gray-50"><span className="text-sm font-medium flex items-center gap-2"><Cpu size={14}/> Ollama Inference</span><span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Connected</span></div>
                  {/* Redis 추가됨 */}
                  <div className="flex justify-between items-center p-3 border rounded-lg bg-gray-50"><span className="text-sm font-medium flex items-center gap-2"><Zap size={14}/> Redis Cache</span><span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Connected</span></div>
                </div>
              </section>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}