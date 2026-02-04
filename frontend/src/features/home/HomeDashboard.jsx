import React from 'react';
import { useNavigate } from 'react-router-dom'; // ✅ useNavigate 추가
import { useStore } from '../../contexts/StoreContext';
import { Bot, Database, MessageSquare, Zap, BarChart3, Plus, ArrowUp, Activity, LayoutDashboard, Search, ChevronRight, BookOpen, ArrowRight, CheckCircle } from '../../components/ui/Icon';

export default function HomeDashboard() {
  const navigate = useNavigate(); // ✅ 네비게이션 훅 사용
  const { agents, knowledgeBases, sessions, createNewSession, setCurrentSessionId } = useStore();

  const stats = [
    { label: '활성 에이전트', value: agents.length, icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '지식 베이스', value: knowledgeBases.length, icon: Database, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: '총 대화 세션', value: sessions.length, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  // ✅ 새 대화 시작 후 채팅방으로 이동하는 함수
  const handleNewChat = () => {
    createNewSession();
    navigate('/chat');
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50/50 p-8 custom-scrollbar">
      
      {/* 1. 히어로 섹션 */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to RAG AI</h1>
        <p className="text-gray-500">강력한 RAG 엔진과 멀티모달 기능을 갖춘 AI 워크스페이스입니다.</p>
      </div>

      {/* 2. 시작 가이드 */}
      <div className="mb-10 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-10 -translate-y-10 group-hover:scale-110 transition-transform duration-700">
          <BookOpen size={180} fill="white" />
        </div>
        
        <div className="relative z-10">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BookOpen size={20}/> RAG AI 시작 가이드
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Step 1: 지식 베이스 이동 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/20 transition cursor-pointer" onClick={() => navigate('/knowledge')}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded text-blue-100">Step 1</span>
                <ArrowRight size={16} className="text-blue-200"/>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg"><Database size={20}/></div>
                <div>
                  <div className="font-bold text-sm">지식 베이스 구축</div>
                  <div className="text-xs text-blue-100 mt-0.5">문서를 업로드하세요.</div>
                </div>
              </div>
            </div>

            {/* Step 2: 에이전트 이동 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/20 transition cursor-pointer" onClick={() => navigate('/agent')}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded text-blue-100">Step 2</span>
                <ArrowRight size={16} className="text-blue-200"/>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg"><Bot size={20}/></div>
                <div>
                  <div className="font-bold text-sm">에이전트 설정</div>
                  <div className="text-xs text-blue-100 mt-0.5">페르소나를 만드세요.</div>
                </div>
              </div>
            </div>

            {/* Step 3: 새 대화 시작 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/20 transition cursor-pointer" onClick={handleNewChat}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded text-blue-100">Step 3</span>
                <CheckCircle size={16} className="text-green-300"/>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg"><MessageSquare size={20}/></div>
                <div>
                  <div className="font-bold text-sm">RAG 대화 시작</div>
                  <div className="text-xs text-blue-100 mt-0.5">질문하고 답변받으세요.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between hover:shadow-md transition">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">{stat.label}</p>
              <h2 className="text-3xl font-bold text-gray-800">{stat.value}</h2>
            </div>
            <div className={`p-4 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon size={28} />
            </div>
          </div>
        ))}
      </div>

      {/* 4. 빠른 실행 (버튼 클릭 시 navigate 적용) */}
      <div className="mb-10">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Zap size={20} className="text-yellow-500"/> 빠른 실행</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={handleNewChat} 
            className="group p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-400 hover:shadow-md transition text-left"
          >
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Plus size={24} />
            </div>
            <div className="font-bold text-gray-800">새 대화 시작</div>
            <div className="text-xs text-gray-500 mt-1">새로운 주제로 채팅을 시작합니다.</div>
          </button>

          <button 
            onClick={() => navigate('/agent')} 
            className="group p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-indigo-400 hover:shadow-md transition text-left"
          >
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Bot size={24} />
            </div>
            <div className="font-bold text-gray-800">에이전트 생성</div>
            <div className="text-xs text-gray-500 mt-1">새로운 페르소나를 만듭니다.</div>
          </button>

          <button 
            onClick={() => navigate('/knowledge')} 
            className="group p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-purple-400 hover:shadow-md transition text-left"
          >
            <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Database size={24} />
            </div>
            <div className="font-bold text-gray-800">지식 베이스 관리</div>
            <div className="text-xs text-gray-500 mt-1">문서를 업로드하고 관리합니다.</div>
          </button>
        </div>
      </div>

      {/* 5. 최근 활동 (클릭 시 채팅방 이동) */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Activity size={20} className="text-gray-500"/> 최근 활동</h3>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-gray-400">최근 활동이 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sessions.slice(0, 5).map(session => (
                <div 
                  key={session.id} 
                  onClick={() => { setCurrentSessionId(session.id); navigate('/chat'); }} 
                  className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                      <MessageSquare size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-gray-800 text-sm">{session.title}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>{session.messages.length} messages</span>
                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                        <span>Last active recently</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}