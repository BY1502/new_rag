import React, { useState, useEffect } from 'react';
import { X, Bot, Save, Info, Cpu, FileText, Loader2, Globe, Plug, Brain, HardDrive, Sliders } from '../../components/ui/Icon';
import { settingsAPI } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export default function AgentEditorModal({ isOpen, onClose, onSave, initialData = null }) {
  const { toast } = useToast();
  const DEFAULT_TOOLS = { smartMode: false, sources: { rag: true, web_search: false, mcp: false, sql: false } };
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    model: 'llama3.1',
    systemPrompt: '',
    published: true,
    defaultTools: { smartMode: false, sources: { rag: true, web_search: false, mcp: false, sql: false } },
  });

  const [availableModels, setAvailableModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 사용 가능한 모든 모델 로드 (Ollama + 외부 API)
  useEffect(() => {
    if (!isOpen) return;

    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
        const result = await settingsAPI.getAvailableModels();
        if (result?.models && result.models.length > 0) {
          setAvailableModels(result.models);
        }
      } catch (error) {
        console.error('모델 목록 로드 실패:', error);
      } finally {
        setIsLoadingModels(false);
      }
    };

    loadModels();
  }, [isOpen]);

  const isSystemAgent = initialData && initialData.agentType && initialData.agentType !== 'custom';

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      // 구형식 마이그레이션
      let tools = initialData.defaultTools || { ...DEFAULT_TOOLS };
      if (!('smartMode' in tools) || !('sources' in tools)) {
        const { deep_think, ...sources } = tools;
        tools = { smartMode: !!deep_think, sources };
      }
      setFormData({
        name: initialData.name,
        description: initialData.description || '',
        model: initialData.model || 'llama3.1',
        systemPrompt: initialData.systemPrompt || '',
        published: initialData.published,
        defaultTools: tools,
      });
    } else {
      setFormData({ name: '', description: '', model: 'llama3.1', systemPrompt: '', published: true, defaultTools: { smartMode: false, sources: { rag: true, web_search: false, mcp: false, sql: false } } });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!formData.name.trim()) return toast.warning('에이전트 이름을 입력해주세요.');
    onSave(formData);
    onClose();
  };

  const providerLabels = {
    'ollama': '🏠 로컬 (Ollama)',
    'openai': '🤖 OpenAI',
    'anthropic': '🧠 Anthropic',
    'google': '🔍 Google AI',
    'groq': '⚡ Groq',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden m-4 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gray-100 text-gray-600 rounded-lg"><Bot size={20} /></div>
            <h3 className="text-lg font-bold text-gray-800">{initialData ? '에이전트 편집' : '새 에이전트 생성'}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2"><Info size={16} className="text-gray-500"/> 기본 정보</h4>
            {isSystemAgent && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
                <span className="font-bold">시스템 에이전트</span> — 역할: {
                  {supervisor: '감독', rag: 'RAG 검색', web_search: '웹 검색', t2sql: 'T2SQL', mcp: 'MCP 도구', process: '물류'}[initialData.agentType] || initialData.agentType
                }. 모델과 프롬프트를 수정할 수 있습니다.
              </div>
            )}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">이름 <span className="text-red-500">*</span></label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="예: 고객 상담 봇" className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-400 outline-none text-sm" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">설명</label>
                <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="이 에이전트의 역할과 기능을 설명하세요." className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-400 outline-none text-sm resize-none h-20" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2"><Cpu size={16} className="text-gray-500"/> 모델 설정</h4>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">LLM 모델</label>
              <div className="relative">
                {isLoadingModels ? (
                  <div className="w-full p-2.5 border rounded-lg bg-gray-50 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 size={16} className="animate-spin" />
                    <span>모델 목록 로딩 중...</span>
                  </div>
                ) : availableModels.length > 0 ? (
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({...formData, model: e.target.value})}
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-400 outline-none bg-white text-sm"
                  >
                    {/* Provider별로 그룹화 */}
                    {(() => {
                      const groupedModels = availableModels.reduce((acc, model) => {
                        const provider = model.provider || 'ollama';
                        if (!acc[provider]) acc[provider] = [];
                        acc[provider].push(model);
                        return acc;
                      }, {});

                      return Object.entries(groupedModels).map(([provider, models]) => (
                        <optgroup key={provider} label={providerLabels[provider] || provider}>
                          {models.map((model) => (
                            <option key={model.name} value={model.name}>
                              {model.display_name || model.name}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>
                ) : (
                  <div className="w-full p-2.5 border border-yellow-300 bg-yellow-50 rounded-lg text-sm text-gray-700">
                    ⚠️ Ollama 모델을 불러올 수 없습니다. Ollama 서버가 실행 중인지 확인하세요.
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                💡 외부 API 사용 시: 설정에서 API 키를 등록하면 모델이 자동으로 표시됩니다
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2"><FileText size={16} className="text-gray-500"/> 프롬프트 설정</h4>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">시스템 프롬프트</label>
              <textarea value={formData.systemPrompt} onChange={(e) => setFormData({...formData, systemPrompt: e.target.value})} placeholder="에이전트에게 부여할 페르소나나 지시사항을 입력하세요. (예: 당신은 친절한 여행 가이드입니다.)" className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-400 outline-none text-sm resize-none h-32" />
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2"><Sliders size={16} className="text-gray-500"/> 라우팅 모드</h4>
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition hover:shadow-sm ${
                formData.defaultTools?.smartMode ? 'bg-purple-50 border-purple-200' : 'border-gray-200'
              }`}
            >
              <input
                type="checkbox"
                checked={formData.defaultTools?.smartMode ?? false}
                onChange={() => setFormData({
                  ...formData,
                  defaultTools: { ...formData.defaultTools, smartMode: !formData.defaultTools?.smartMode }
                })}
                className="mt-0.5 accent-purple-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                  <Brain size={13} /> Smart Mode
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">AI가 활성 소스 중 최적 조합을 자동 선택합니다</div>
              </div>
            </label>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2"><Sliders size={16} className="text-gray-500"/> 기본 소스 설정</h4>
            <p className="text-xs text-gray-500">이 에이전트 선택 시 아래 소스가 자동 활성화됩니다.</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'rag', label: 'RAG', desc: '지식 베이스에서 문서 검색', icon: FileText, color: 'blue' },
                { key: 'web_search', label: '웹 검색', desc: '인터넷에서 실시간 정보', icon: Globe, color: 'green' },
                { key: 'mcp', label: 'MCP', desc: '외부 MCP 도구 연동', icon: Plug, color: 'indigo' },
                { key: 'sql', label: 'SQL', desc: '데이터베이스 자연어 조회', icon: HardDrive, color: 'amber' },
              ].map(tool => {
                const Icon = tool.icon;
                const isChecked = formData.defaultTools?.sources?.[tool.key] ?? false;
                const colorMap = {
                  blue: isChecked ? 'bg-blue-50 border-blue-200' : '',
                  green: isChecked ? 'bg-green-50 border-green-200' : '',
                  indigo: isChecked ? 'bg-indigo-50 border-indigo-200' : '',
                  amber: isChecked ? 'bg-amber-50 border-amber-200' : '',
                };
                return (
                  <label
                    key={tool.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition hover:shadow-sm ${
                      colorMap[tool.color] || 'border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => setFormData({
                        ...formData,
                        defaultTools: {
                          ...formData.defaultTools,
                          sources: { ...formData.defaultTools?.sources, [tool.key]: !isChecked }
                        }
                      })}
                      className="mt-0.5 accent-green-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                        <Icon size={13} /> {tool.label}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{tool.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200 bg-white border border-gray-300 rounded-xl transition">취소</button>
          <button onClick={handleSubmit} className="px-5 py-2.5 text-sm font-bold text-white bg-green-500 hover:bg-green-600 rounded-xl shadow-lg transition flex items-center gap-2"><Save size={16} /> 저장하기</button>
        </div>
      </div>
    </div>
  );
}
