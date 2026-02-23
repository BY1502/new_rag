import React, { useState, useEffect } from 'react';
import { useStore } from '../../contexts/StoreContext';
import AgentEditorModal from './AgentEditorModal';
import { generateUUID } from '../../utils/uuid';
import { Plus, Search, Bot, MoreHorizontal, Edit, Trash2, CheckCircle, XCircle, Clock, Lock, Sparkles, FileText } from '../../components/ui/Icon'; // ✅ 아이콘 추가

export default function AgentList() {
  const { agents, addAgent, updateAgent, deleteAgent } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);

  const DEFAULT_AGENT_IDS = ['agent-general', 'agent-rag'];

  useEffect(() => {
    const handleClickOutside = () => setMenuOpenId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const filteredAgents = agents.filter(agent => 
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    if (DEFAULT_AGENT_IDS.includes(id)) {
      alert("기본 에이전트는 삭제할 수 없습니다.");
      return;
    }
    if (confirm("정말 이 에이전트를 삭제하시겠습니까?")) {
      deleteAgent(id);
    }
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
        ...formData,
        updated_at: new Date().toLocaleDateString()
      });
    }
  };

  // ✅ 에이전트별 아이콘 결정 함수
  const getAgentIcon = (id) => {
    switch(id) {
      case 'agent-general': return Sparkles;
      case 'agent-rag': return FileText;
      default: return Bot;
    }
  };

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50/50">
      
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">에이전트 목록</h2>
          <p className="text-sm text-gray-500 mt-1">다양한 AI 에이전트를 생성하고 관리할 수 있습니다.</p>
        </div>
        <button onClick={handleCreate} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 font-bold text-sm">
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
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm transition"
        />
      </div>

      {filteredAgents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center"><Bot size={40} className="text-gray-300"/></div>
          <p>등록된 에이전트가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 overflow-y-auto custom-scrollbar pb-4">
          {filteredAgents.map(agent => {
            const isDefault = DEFAULT_AGENT_IDS.includes(agent.id);
            const AgentIcon = getAgentIcon(agent.id); // ✅ 아이콘 동적 할당
            
            return (
            <div key={agent.id} className="group bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-xl hover:border-blue-200 transition-all duration-300 relative flex flex-col">
              
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shadow-sm ${isDefault ? 'bg-purple-50 border-purple-100 text-purple-600' : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 text-blue-600'}`}>
                    {/* ✅ 선택된 아이콘 렌더링 */}
                    <AgentIcon size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 line-clamp-1 flex items-center gap-1" title={agent.name}>
                      {agent.name}
                      {isDefault && <Lock size={12} className="text-gray-400" title="기본 에이전트"/>}
                    </h3>
                    <span className="inline-block bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded mt-1 border border-blue-100">
                      {agent.model}
                    </span>
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
                      {!isDefault && (
                        <button onClick={(e) => handleDelete(e, agent.id)} className="w-full text-left px-4 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-50"><Trash2 size={14}/> 삭제</button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ✅ 설명 부분 수정: h-8 -> h-10 (높이 확보) */}
              <div className="flex-1 mb-4">
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed h-10">
                  {agent.description || '설명이 없습니다.'}
                </p>
              </div>

              <div className="pt-4 border-t border-gray-50 flex items-center justify-between text-xs">
                <div className="text-gray-400 flex items-center gap-1">
                  <Clock size={12}/> {agent.updated_at}
                </div>
                <div>
                  {agent.published ? (
                    <span className="flex items-center gap-1 text-green-600 font-bold bg-green-50 px-2 py-1 rounded-full"><CheckCircle size={10}/> 게시됨</span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded-full">초안</span>
                  )}
                </div>
              </div>

            </div>
          )})}
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