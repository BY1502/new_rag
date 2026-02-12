import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { healthAPI } from '../../api/client';
import {
  Bot, Database, MessageSquare, Zap, Plus,
  ChevronRight, BookOpen, ArrowRight, CheckCircle,
  Globe, Brain, HardDrive, Cpu, Sparkles,
} from '../../components/ui/Icon';

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agents, knowledgeBases, sessions, createNewSession, setCurrentSessionId, config } = useStore();
  const [serviceStatus, setServiceStatus] = useState({});
  const [serviceLoading, setServiceLoading] = useState(true);

  useEffect(() => {
    const checkServices = async () => {
      setServiceLoading(true);
      const services = ['neo4j', 'redis', 'qdrant', 'ollama'];
      const results = {};
      await Promise.all(services.map(async (svc) => {
        try {
          const res = await healthAPI.testService(svc);
          results[svc] = res.status === 'connected';
        } catch { results[svc] = false; }
      }));
      setServiceStatus(results);
      setServiceLoading(false);
    };
    checkServices();
  }, []);

  const totalFiles = knowledgeBases.reduce((sum, kb) => sum + (kb.files?.length || 0), 0);
  const connectedCount = Object.values(serviceStatus).filter(Boolean).length;

  const handleNewChat = () => {
    createNewSession();
    navigate('/chat');
  };

  // 시간대 인사말
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '좋은 저녁이에요';
  const userName = user?.name || 'User';

  return (
    <div className="h-full overflow-y-auto bg-gray-50 custom-scrollbar">
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">

        {/* 1. 인사 + 빠른 시작 */}
        <section className="animate-slideDown">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {greeting}, <span className="text-blue-600">{userName}</span>
              </h1>
              <p className="text-base text-gray-600 mt-2">
                RAG AI 워크스페이스에서 오늘도 좋은 하루 되세요.
              </p>
            </div>
            <button
              onClick={handleNewChat}
              className="ripple-container flex items-center gap-2.5 px-6 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
            >
              <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" /> 새 대화
            </button>
          </div>

          {/* 퀵 액션 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <button
              onClick={handleNewChat}
              className="group relative p-7 bg-white rounded-lg text-left border border-gray-200 hover:border-blue-400 hover-lift animate-slideUp animate-stagger-1"
            >
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <MessageSquare size={24} className="group-hover:rotate-6 transition-transform" />
              </div>
              <div className="font-bold text-lg text-gray-900">RAG 대화 시작</div>
              <div className="text-sm text-gray-600 mt-1.5 leading-relaxed">지식 베이스를 기반으로 AI와 대화하세요</div>
              <ArrowRight size={16} className="absolute bottom-6 right-6 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => navigate('/knowledge')}
              className="group relative p-7 bg-white rounded-lg text-left border border-gray-200 hover:border-purple-400 hover-lift animate-slideUp animate-stagger-2"
            >
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Database size={24} className="group-hover:rotate-6 transition-transform" />
              </div>
              <div className="font-bold text-lg text-gray-900">지식 베이스</div>
              <div className="text-sm text-gray-600 mt-1.5 leading-relaxed">문서 업로드 및 벡터 인덱싱 관리</div>
              <ArrowRight size={16} className="absolute bottom-6 right-6 text-gray-300 group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => navigate('/agent')}
              className="group relative p-7 bg-white rounded-lg text-left border border-gray-200 hover:border-blue-400 hover-lift animate-slideUp animate-stagger-3"
            >
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Bot size={24} className="group-hover:rotate-6 transition-transform" />
              </div>
              <div className="font-bold text-lg text-gray-900">에이전트 관리</div>
              <div className="text-sm text-gray-600 mt-1.5 leading-relaxed">AI 페르소나 생성 및 커스터마이즈</div>
              <ArrowRight size={16} className="absolute bottom-6 right-6 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        </section>

        {/* 2. 통계 + 서비스 상태 */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* 통계 카드 (왼쪽 2/3) */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: '에이전트', value: agents.length, icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: '지식 베이스', value: knowledgeBases.length, icon: Database, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: '문서', value: totalFiles, icon: BookOpen, color: 'text-green-600', bg: 'bg-green-50' },
              { label: '대화', value: sessions.length, icon: MessageSquare, color: 'text-orange-600', bg: 'bg-orange-50' },
            ].map((stat, idx) => (
              <div
                key={idx}
                className={`bg-white p-5 rounded-lg border border-gray-200 hover:border-gray-300 hover-lift cursor-pointer animate-scaleIn animate-stagger-${idx + 1}`}
              >
                <div className={`w-10 h-10 ${stat.bg} ${stat.color} rounded-lg flex items-center justify-center mb-3 hover:scale-110 transition-transform`}>
                  <stat.icon size={20} />
                </div>
                <div className="text-3xl font-bold text-gray-900 tracking-tight">{stat.value}</div>
                <div className="text-xs font-semibold text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* 서비스 상태 (오른쪽 1/3) */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 animate-scaleIn">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wider">시스템 상태</h4>
              {!serviceLoading && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full animate-scaleIn ${
                  connectedCount === 4 ? 'bg-green-50 text-green-700' :
                  connectedCount >= 2 ? 'bg-yellow-50 text-yellow-700' :
                  'bg-red-50 text-red-700'
                }`}>
                  {connectedCount}/4 연결
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              {[
                { key: 'ollama', label: 'Ollama', desc: 'LLM 추론', icon: Cpu },
                { key: 'qdrant', label: 'Qdrant', desc: '벡터 검색', icon: Database },
                { key: 'neo4j', label: 'Neo4j', desc: '지식 그래프', icon: Globe },
                { key: 'redis', label: 'Redis', desc: '캐시', icon: Zap },
              ].map((svc, idx) => (
                <div key={svc.key} className={`flex items-center gap-3.5 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-all cursor-pointer animate-slideUp animate-stagger-${idx + 1}`}>
                  <div className={`relative w-2.5 h-2.5 rounded-full shrink-0 ${
                    serviceLoading ? 'bg-gray-300 animate-pulse' :
                    serviceStatus[svc.key] ? 'bg-green-500' : 'bg-red-400'
                  }`}>
                    {!serviceLoading && serviceStatus[svc.key] && (
                      <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-30" />
                    )}
                  </div>
                  <svc.icon size={16} className="text-gray-500 shrink-0 hover:scale-110 transition-transform" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-800">{svc.label}</span>
                    <span className="text-xs text-gray-500 ml-2">{svc.desc}</span>
                  </div>
                  {!serviceLoading && (
                    <span className={`text-xs font-semibold transition-colors ${serviceStatus[svc.key] ? 'text-green-600' : 'text-red-500'}`}>
                      {serviceStatus[svc.key] ? 'ON' : 'OFF'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. 시작 가이드 (처음 사용자용) */}
        {(totalFiles === 0 || sessions.length <= 1) && (
          <section className="bg-blue-600 rounded-lg p-8 text-white animate-slideUp">
            <div className="flex items-center gap-2.5 mb-2">
              <BookOpen size={18} className="animate-float" />
              <span className="text-sm font-semibold text-blue-100 uppercase tracking-wider">시작 가이드</span>
            </div>
            <h3 className="text-xl font-bold mb-5">3단계로 RAG AI를 시작하세요</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { step: 1, title: '문서 업로드', desc: '지식 베이스에 PDF, DOCX 등을 올리세요', done: totalFiles > 0, path: '/knowledge' },
                { step: 2, title: '에이전트 설정', desc: 'AI 페르소나와 시스템 프롬프트를 설정하세요', done: agents.length > 1, path: '/agent' },
                { step: 3, title: '대화 시작', desc: '자연어로 질문하면 문서 기반 답변을 받습니다', done: sessions.length > 1, action: handleNewChat },
              ].map((item, idx) => (
                <button
                  key={item.step}
                  onClick={() => item.action ? item.action() : navigate(item.path)}
                  className={`bg-blue-500 hover:bg-blue-400 active:scale-95 rounded-lg p-5 text-left transition-all group hover-lift animate-scaleIn animate-stagger-${idx + 1}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center transition-all group-hover:scale-110 ${
                      item.done ? 'bg-green-400 text-green-900' : 'bg-blue-400 text-blue-900'
                    }`}>
                      {item.done ? <CheckCircle size={16} /> : item.step}
                    </span>
                    <ArrowRight size={16} className="text-blue-200 group-hover:translate-x-2 transition-transform" />
                  </div>
                  <div className="font-bold text-base">{item.title}</div>
                  <div className="text-sm text-blue-100 mt-1.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 4. 최근 대화 + 활성 에이전트 */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 animate-fadeIn">
          {/* 최근 대화 (왼쪽 3/5) */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2.5">
                <MessageSquare size={18} className="text-gray-500" /> 최근 대화
              </h3>
              {sessions.length > 5 && (
                <button onClick={() => navigate('/chat')} className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition-all hover:gap-2">
                  모두 보기 <ChevronRight size={14} />
                </button>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-scaleIn">
              {sessions.length === 0 ? (
                <div className="py-16 text-center">
                  <MessageSquare size={36} className="mx-auto mb-3 text-gray-300 animate-float" />
                  <p className="text-base text-gray-500">아직 대화가 없습니다</p>
                  <button onClick={handleNewChat} className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-semibold transition-all hover:scale-105">
                    첫 대화 시작하기 →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sessions.slice(0, 5).map((session, idx) => (
                    <button
                      key={session.id}
                      onClick={() => { setCurrentSessionId(session.id); navigate('/chat'); }}
                      className={`w-full px-5 py-4 hover:bg-gray-50 flex items-center gap-4 transition-all text-left group animate-slideUp animate-stagger-${Math.min(idx + 1, 4)}`}
                    >
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:scale-110 transition-all shrink-0">
                        <MessageSquare size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {session.title}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                          <span>{session.messages.length}개 메시지</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 활성 에이전트 (오른쪽 2/5) */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2.5">
                <Bot size={18} className="text-gray-500" /> 에이전트
              </h3>
              <button onClick={() => navigate('/agent')} className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition-all hover:gap-2">
                관리 <ChevronRight size={14} />
              </button>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-scaleIn">
              {agents.length === 0 ? (
                <div className="py-16 text-center">
                  <Bot size={36} className="mx-auto mb-3 text-gray-300 animate-float" />
                  <p className="text-base text-gray-500">에이전트가 없습니다</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {agents.slice(0, 4).map((agent, idx) => {
                    const colors = [
                      'bg-blue-600',
                      'bg-purple-600',
                      'bg-green-600',
                      'bg-orange-600',
                    ];
                    const colorIdx = agent.id.charCodeAt(agent.id.length - 1) % colors.length;
                    return (
                      <div
                        key={agent.id}
                        className={`px-5 py-4 flex items-center gap-3.5 hover:bg-gray-50 transition-all cursor-pointer animate-slideUp animate-stagger-${Math.min(idx + 1, 4)}`}
                      >
                        <div className={`w-10 h-10 rounded-lg ${colors[colorIdx]} flex items-center justify-center text-white text-sm font-bold shrink-0 hover:scale-110 transition-transform`}>
                          {agent.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-semibold text-gray-900 truncate">{agent.name}</div>
                          <div className="text-xs text-gray-500 truncate mt-1">
                            {agent.model || config.llm || 'default'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 5. 기능 하이라이트 */}
        <section className="pb-6 animate-fadeIn">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2.5">
            <Zap size={18} className="text-yellow-600 animate-pulse" /> 주요 기능
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Database, label: 'RAG 검색', desc: '벡터 + 그래프 하이브리드', color: 'text-purple-600', bg: 'bg-purple-50' },
              { icon: Globe, label: '웹 검색', desc: 'DuckDuckGo / Brave / Tavily', color: 'text-blue-600', bg: 'bg-blue-50' },
              { icon: HardDrive, label: 'Text-to-SQL', desc: '자연어로 DB 쿼리', color: 'text-orange-600', bg: 'bg-orange-50' },
              { icon: Brain, label: 'Deep Think', desc: '자기 검증 추론 모드', color: 'text-indigo-600', bg: 'bg-indigo-50' },
            ].map((feat, idx) => (
              <div
                key={idx}
                className={`bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover-lift cursor-pointer animate-scaleIn animate-stagger-${idx + 1}`}
              >
                <div className={`w-10 h-10 ${feat.bg} ${feat.color} rounded-lg flex items-center justify-center mb-3 hover:scale-110 hover:rotate-6 transition-all`}>
                  <feat.icon size={20} />
                </div>
                <div className="text-sm font-bold text-gray-900">{feat.label}</div>
                <div className="text-xs text-gray-600 mt-1">{feat.desc}</div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
