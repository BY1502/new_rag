import React, { useState, useEffect } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import AgentEditorModal from './AgentEditorModal';
import { generateUUID } from '../../utils/uuid';
import { Plus, Search, Bot, MoreHorizontal, Edit, Trash2, CheckCircle, XCircle, Clock, Lock, Sparkles, FileText, Cpu, MessageSquare, Brain, Globe, Database, Plug, Truck, HardDrive } from '../../components/ui/Icon';

// 에이전트 타입별 아이콘 매핑
const AGENT_TYPE_ICONS = {
  supervisor: Brain,
  rag: FileText,
  web_search: Globe,
  t2sql: Database,
  mcp: Plug,
  process: Truck,
  custom: Bot,
};

// 에이전트 타입별 라벨
const AGENT_TYPE_LABELS = {
  supervisor: '감독',
  rag: 'RAG',
  web_search: '웹검색',
  t2sql: 'SQL',
  mcp: 'MCP',
  process: '물류',
  custom: '사용자',
};

// 에이전트 타입별 컬러
const AGENT_TYPE_COLORS = {
  supervisor: 'bg-purple-50 border-purple-100 text-purple-600',
  rag: 'bg-blue-50 border-blue-100 text-blue-600',
  web_search: 'bg-cyan-50 border-cyan-100 text-cyan-600',
  t2sql: 'bg-amber-50 border-amber-100 text-amber-600',
  mcp: 'bg-indigo-50 border-indigo-100 text-indigo-600',
  process: 'bg-orange-50 border-orange-100 text-orange-600',
  custom: 'bg-green-50 border-green-100 text-green-600',
};

const AGENT_TYPE_BADGE_COLORS = {
  supervisor: 'bg-purple-100 text-purple-700 border-purple-200',
  rag: 'bg-blue-100 text-blue-700 border-blue-200',
  web_search: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  t2sql: 'bg-amber-100 text-amber-700 border-amber-200',
  mcp: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  process: 'bg-orange-100 text-orange-700 border-orange-200',
  custom: 'bg-green-100 text-green-700 border-green-200',
};

export default function AgentList() {
  const { agents, addAgent, updateAgent, deleteAgent } = useStore();
  const { toast, confirm } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);

  const SYSTEM_AGENT_IDS = ['agent-general', 'agent-rag', 'system-supervisor', 'system-rag', 'system-web', 'system-sql', 'system-mcp', 'system-process'];

  useEffect(() => {
    const handleClickOutside = () => setMenuOpenId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 시스템 에이전트와 사용자 에이전트 분리
  const systemAgents = filteredAgents.filter(a => SYSTEM_AGENT_IDS.includes(a.id) || (a.agentType && a.agentType !== 'custom'));
  const customAgents = filteredAgents.filter(a => !SYSTEM_AGENT_IDS.includes(a.id) && (!a.agentType || a.agentType === 'custom'));

  const handleCreate = () => {
    setEditingAgent(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (e, agent) => {
    e.stopPropagation();
    setEditingAgent(agent);
    setIsEditorOpen(true);
    setMenuOpenId(null);
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (SYSTEM_AGENT_IDS.includes(id)) {
      toast.warning("시스템 에이전트는 삭제할 수 없습니다.");
      return;
    }
    confirm("정말 이 에이전트를 삭제하시겠습니까?", () => deleteAgent(id), { confirmLabel: '삭제' });
  };

  const handleTogglePublish = (e, agent) => {
    e.stopPropagation();
    updateAgent(agent.id, { published: !agent.published });
    setMenuOpenId(null);
  };

  const handleSaveAgent = (formData) => {
    if (editingAgent) {
      updateAgent(editingAgent.id, formData);
    } else {
      addAgent({
        id: generateUUID(),
        agentType: 'custom',
        ...formData,
        updated_at: new Date().toLocaleDateString()
      });
    }
  };

  const getAgentIcon = (agent) => {
    // agentType 기반 아이콘
    if (agent.agentType && AGENT_TYPE_ICONS[agent.agentType]) {
      return AGENT_TYPE_ICONS[agent.agentType];
    }
    // ID 기반 폴백
    switch(agent.id) {
      case 'agent-general': return Sparkles;
      case 'agent-rag': return FileText;
      default: return Bot;
    }
  };

  const getIconColor = (agent) => {
    if (agent.agentType && AGENT_TYPE_COLORS[agent.agentType]) {
      return AGENT_TYPE_COLORS[agent.agentType];
    }
    if (SYSTEM_AGENT_IDS.includes(agent.id)) {
      return 'bg-green-50 border-green-100 text-green-600';
    }
    return 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200 text-gray-600';
  };

  // 에이전트 카드 컴포넌트
  const AgentCard = ({ agent, isSystem }) => {
    const AgentIcon = getAgentIcon(agent);
    const iconColor = getIconColor(agent);
    const agentType = agent.agentType || 'custom';
    const badgeColor = AGENT_TYPE_BADGE_COLORS[agentType] || AGENT_TYPE_BADGE_COLORS.custom;
    const typeLabel = AGENT_TYPE_LABELS[agentType] || agentType;

    return (
      <div className="group bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-xl hover:border-gray-300 transition-all duration-300 relative flex flex-col">
        {/* 헤더: 아이콘 + 이름 + 메뉴 */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shadow-sm ${iconColor}`}>
              <AgentIcon size={24} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 line-clamp-1 flex items-center gap-1.5" title={agent.name}>
                {agent.name}
                {isSystem && <Lock size={12} className="text-gray-400" title="시스템 에이전트"/>}
              </h3>
              <div className="flex items-center gap-1.5 mt-1">
                {/* 역할 배지 */}
                {agentType !== 'custom' && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${badgeColor}`}>
                    {typeLabel}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-200">
                  <Cpu size={10} /> {agent.model || '미설정'}
                </span>
              </div>
            </div>
          </div>

          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === agent.id ? null : agent.id); }} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
              <MoreHorizontal size={20} />
            </button>

            {menuOpenId === agent.id && (
              <div className="absolute right-0 top-8 w-32 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <button onClick={(e) => handleEdit(e, agent)} className="w-full text-left px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Edit size={14}/> 편집</button>
                <button onClick={(e) => handleTogglePublish(e, agent)} className="w-full text-left px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  {agent.published ? <><XCircle size={14}/> 게시 취소</> : <><CheckCircle size={14}/> 게시</>}
                </button>
                {!isSystem && (
                  <button onClick={(e) => handleDelete(e, agent.id)} className="w-full text-left px-4 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-50"><Trash2 size={14}/> 삭제</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 설명 */}
        <div className="mb-3">
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
            {agent.description || '설명이 없습니다.'}
          </p>
        </div>

        {/* 도구 뱃지 */}
        {agent.defaultTools && (agent.defaultTools.smartMode || (agent.defaultTools.sources && Object.values(agent.defaultTools.sources).some(v => v))) && (
          <div className="flex flex-wrap items-center gap-1 mb-3">
            {agent.defaultTools.smartMode && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-600 border border-purple-200"><Brain size={9} /> Smart</span>
            )}
            {agent.defaultTools.sources?.rag && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200"><FileText size={9} /> RAG</span>
            )}
            {agent.defaultTools.sources?.web_search && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-600 border border-green-200"><Globe size={9} /> Web</span>
            )}
            {agent.defaultTools.sources?.mcp && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200"><Plug size={9} /> MCP</span>
            )}
            {agent.defaultTools.sources?.sql && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-200"><HardDrive size={9} /> SQL</span>
            )}
          </div>
        )}

        {/* 시스템 프롬프트 미리보기 */}
        {agent.systemPrompt ? (
          <div className="mb-3 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
            <div className="flex items-center gap-1 mb-1">
              <MessageSquare size={10} className="text-gray-400" />
              <span className="text-[10px] font-bold text-gray-400 uppercase">시스템 프롬프트</span>
            </div>
            <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed italic">
              "{agent.systemPrompt}"
            </p>
          </div>
        ) : (
          <div className="mb-3 bg-gray-50 rounded-lg p-2.5 border border-dashed border-gray-200">
            <p className="text-[11px] text-gray-400 text-center">시스템 프롬프트 미설정</p>
          </div>
        )}

        {/* 하단: 날짜 + 상태 */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs mt-auto">
          <div className="text-gray-400 flex items-center gap-1">
            <Clock size={12}/> {agent.updated_at}
          </div>
          <div>
            {agent.published ? (
              <span className="flex items-center gap-1 text-green-500 font-bold bg-green-50 px-2 py-1 rounded-full"><CheckCircle size={10}/> 게시됨</span>
            ) : (
              <span className="flex items-center gap-1 text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded-full">초안</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50/50">

      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">에이전트 목록</h2>
          <p className="text-sm text-gray-500 mt-1">멀티 에이전트 오케스트레이션 시스템을 관리합니다.</p>
        </div>
        <button onClick={handleCreate} className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition shadow-lg shadow-green-100 font-bold text-sm">
          <Plus size={18} /> <span>에이전트 생성</span>
        </button>
      </div>

      <div className="mb-6 relative max-w-md">
        <Search size={18} className="absolute left-3 top-3 text-gray-400" />
        <input
          type="text"
          placeholder="에이전트 이름 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-400 outline-none bg-white shadow-sm transition"
        />
      </div>

      {filteredAgents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center"><Bot size={40} className="text-gray-300"/></div>
          <p>등록된 에이전트가 없습니다.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-4 space-y-8">
          {/* 시스템 에이전트 섹션 */}
          {systemAgents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Brain size={16} className="text-purple-500" />
                <h3 className="text-sm font-bold text-gray-700">시스템 에이전트</h3>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">{systemAgents.length}개</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {systemAgents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} isSystem={true} />
                ))}
              </div>
            </div>
          )}

          {/* 사용자 에이전트 섹션 */}
          {customAgents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Bot size={16} className="text-green-500" />
                <h3 className="text-sm font-bold text-gray-700">사용자 에이전트</h3>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">{customAgents.length}개</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {customAgents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} isSystem={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <AgentEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSaveAgent}
        initialData={editingAgent}
      />
    </div>
  );
}
