import React, { useState } from 'react';
import {
  Brain, FileText, Globe, Database, Plug, Truck, Sparkles,
  Bot, Cpu, MessageSquare, Search, HardDrive, Zap,
  ChevronDown, ChevronRight, BookOpen, Settings, GraduationCap,
  Info, Layers, ArrowRight
} from '../../components/ui/Icon';

const SECTIONS = [
  {
    id: 'overview',
    icon: Sparkles,
    title: '시스템 개요',
    color: 'green',
    content: {
      summary: 'RAG AI는 멀티 에이전트 오케스트레이션 기반의 지능형 AI 시스템입니다.',
      details: [
        '사용자의 질문 의도를 자동으로 분석하여 최적의 전문 에이전트를 조합합니다.',
        '문서 검색(RAG), 웹 검색, SQL 조회, MCP 도구, 물류 처리 등 다양한 기능을 하나의 대화에서 사용할 수 있습니다.',
        '각 에이전트는 독립적인 모델과 프롬프트를 가지며, 감독 에이전트가 전체 흐름을 조율합니다.',
      ],
      flow: [
        { label: '사용자 질문', icon: MessageSquare },
        { label: '감독 에이전트 (의도 분석)', icon: Brain },
        { label: '전문 에이전트 실행', icon: Zap },
        { label: '결과 종합 및 답변', icon: Sparkles },
      ],
    },
  },
  {
    id: 'agents',
    icon: Bot,
    title: '에이전트 시스템',
    color: 'purple',
    content: {
      summary: '멀티 에이전트 오케스트레이션을 통해 질문에 맞는 전문 에이전트가 자동으로 협력합니다.',
      agents: [
        { name: '감독 에이전트', type: 'supervisor', icon: Brain, color: 'purple', desc: '사용자의 질문 의도를 분석하고 어떤 전문 에이전트를 사용할지 결정합니다. 복합 질문인 경우 여러 에이전트를 순차적으로 호출합니다.' },
        { name: 'RAG 검색 에이전트', type: 'rag', icon: FileText, color: 'blue', desc: '지식 베이스에서 관련 문서를 벡터 검색하고, 지식 그래프를 활용하여 맥락을 풍부하게 합니다.' },
        { name: '웹 검색 에이전트', type: 'web', icon: Globe, color: 'cyan', desc: '인터넷에서 최신 정보를 검색합니다. DuckDuckGo, Brave, Tavily, Serper 중 선택할 수 있습니다.' },
        { name: 'T2SQL 에이전트', type: 'sql', icon: Database, color: 'amber', desc: '자연어를 SQL로 변환하여 데이터베이스를 조회합니다. 비즈니스 메타데이터를 활용해 정확도를 높입니다.' },
        { name: 'MCP 도구 에이전트', type: 'mcp', icon: Plug, color: 'indigo', desc: '외부 MCP(Model Context Protocol) 서버에 연결하여 파일시스템, API 등 다양한 도구를 사용합니다.' },
        { name: '물류 에이전트', type: 'process', icon: Truck, color: 'orange', desc: '배차 최적화, 경로 계획 등 물류 업무를 xLAM 모델 기반으로 처리합니다.' },
        { name: '종합 에이전트', type: 'synthesizer', icon: Sparkles, color: 'green', desc: '전문 에이전트들의 결과를 종합하여 최종 답변을 생성합니다.' },
      ],
    },
  },
  {
    id: 'model',
    icon: Cpu,
    title: '모델 설정',
    color: 'gray',
    content: {
      summary: '모델은 에이전트 단위로 설정되며, 채팅에서 자동으로 적용됩니다.',
      rules: [
        { priority: 1, label: '에이전트 모델', desc: '채팅에서 에이전트를 선택하면 해당 에이전트에 설정된 모델이 사용됩니다.', where: '에이전트 관리 > 편집' },
        { priority: 2, label: '기본 모델', desc: '에이전트를 선택하지 않은 "기본 모드"에서는 설정의 기본 모델이 사용됩니다.', where: '설정 > 모델 관리' },
      ],
      tip: '채팅 중 모델을 변경할 필요 없이, 에이전트 관리에서 원하는 모델을 미리 설정해두세요.',
    },
  },
  {
    id: 'rag',
    icon: FileText,
    title: 'RAG (문서 검색)',
    color: 'blue',
    content: {
      summary: '업로드한 문서를 벡터화하여 저장하고, 질문과 관련된 문서를 자동으로 검색하여 답변에 활용합니다.',
      steps: [
        { step: '문서 업로드', desc: '지식 베이스에 PDF, DOCX, PPTX, TXT 등 문서를 업로드합니다.' },
        { step: '자동 처리', desc: 'Docling으로 문서를 파싱하고, BAAI/bge-m3 모델로 벡터 임베딩합니다.' },
        { step: '검색 모드', desc: 'Dense, Sparse, Hybrid 검색을 지원하며, Reranker로 정확도를 높입니다.' },
        { step: '지식 그래프', desc: 'Neo4j에 트리플을 저장하여 엔티티 간 관계를 파악합니다. (3개 이상 트리플 시 활성화)' },
      ],
    },
  },
  {
    id: 'web',
    icon: Globe,
    title: '웹 검색',
    color: 'cyan',
    content: {
      summary: '인터넷에서 최신 정보를 검색하여 답변에 반영합니다.',
      providers: [
        { name: 'DuckDuckGo', desc: '무료, API 키 불필요', free: true },
        { name: 'Brave Search', desc: '무료 2,000회/월', free: false },
        { name: 'Tavily AI', desc: 'AI 검색 특화, 1,000회/월 무료', free: false },
        { name: 'Google Serper', desc: 'Google 검색, 2,500회 무료', free: false },
      ],
      tip: '채팅 하단의 지구본 아이콘을 클릭하면 웹 검색이 활성화됩니다. 설정에서 검색 공급자를 변경할 수 있습니다.',
    },
  },
  {
    id: 'sql',
    icon: Database,
    title: 'Text-to-SQL',
    color: 'amber',
    content: {
      summary: '자연어 질문을 SQL로 자동 변환하여 데이터베이스를 조회합니다.',
      steps: [
        { step: 'DB 연결 등록', desc: '설정 > DB 연결에서 PostgreSQL, MySQL, SQLite 등을 등록합니다.' },
        { step: '메타데이터 설정', desc: '테이블/컬럼에 대한 비즈니스 설명을 추가하면 SQL 정확도가 향상됩니다.' },
        { step: 'SQL 모드 활성화', desc: '채팅 하단의 SQL 아이콘을 클릭하고 사용할 DB를 선택합니다.' },
        { step: '자연어 질문', desc: '"이번 달 매출 상위 10개 제품은?" 같이 자연어로 질문하면 SQL이 자동 생성/실행됩니다.' },
      ],
      tip: '안전을 위해 SELECT 쿼리만 실행됩니다. INSERT, UPDATE, DELETE는 차단됩니다.',
    },
  },
  {
    id: 'mcp',
    icon: Plug,
    title: 'MCP 도구',
    color: 'indigo',
    content: {
      summary: 'Model Context Protocol을 통해 외부 도구와 서비스를 AI에 연결합니다.',
      steps: [
        { step: 'MCP 서버 등록', desc: '설정 > MCP 서버에서 SSE 또는 Stdio 방식의 MCP 서버를 등록합니다.' },
        { step: '도구 활성화', desc: '채팅 하단의 플러그 아이콘에서 사용할 MCP 도구를 선택합니다.' },
        { step: '자동 사용', desc: '감독 에이전트가 질문에 적합한 MCP 도구를 자동으로 호출합니다.' },
      ],
    },
  },
  {
    id: 'deep-think',
    icon: Brain,
    title: 'Deep Think',
    color: 'purple',
    content: {
      summary: '더 깊이 생각하는 모드로, LLM이 의도 분석부터 자기 검증까지 수행합니다.',
      features: [
        '의도 분석: LLM이 질문을 분석하여 최적의 에이전트 조합을 결정합니다.',
        '멀티 도구 실행: 웹검색 + RAG 같은 복합 전략을 사용합니다.',
        '자기 검증: 답변 생성 후 정확성과 완전성을 자체 검증합니다.',
        '사고 과정 표시: 분석 과정을 실시간으로 보여줍니다.',
      ],
      tip: '채팅 하단의 뇌 아이콘으로 ON/OFF 할 수 있습니다. OFF 시 키워드 기반 빠른 라우팅을 사용합니다.',
    },
  },
  {
    id: 'training',
    icon: GraduationCap,
    title: '학습 & 파인튜닝',
    color: 'green',
    content: {
      summary: '대화 피드백을 수집하여 커스텀 모델을 학습시킬 수 있습니다.',
      steps: [
        { step: '피드백 수집', desc: '채팅에서 좋아요/싫어요를 남기면 학습 데이터로 수집됩니다.' },
        { step: '데이터셋 생성', desc: '학습 탭에서 수집된 피드백으로 데이터셋을 빌드합니다.' },
        { step: '파인튜닝', desc: 'Ollama Few-shot 또는 Unsloth QLoRA 방식으로 모델을 학습합니다.' },
        { step: '커스텀 모델 적용', desc: '학습된 모델을 기본 모델로 설정하면 모든 대화에 적용됩니다.' },
      ],
    },
  },
];

const COLORS = {
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', badge: 'bg-green-100 text-green-700', dot: 'bg-green-400' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-600', badge: 'bg-cyan-100 text-cyan-700', dot: 'bg-cyan-400' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-400' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  gray: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', badge: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
};

function SectionCard({ section, isOpen, onToggle }) {
  const Icon = section.icon;
  const c = COLORS[section.color];
  const content = section.content;

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${isOpen ? c.border : 'border-gray-200'}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${isOpen ? `${c.bg}` : 'bg-white hover:bg-gray-50'}`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} ${c.text} border ${c.border}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">{section.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{content.summary}</p>
        </div>
        {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-2 bg-white space-y-4">
          {/* 상세 설명 리스트 */}
          {content.details && (
            <ul className="space-y-2">
              {content.details.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <div className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0 mt-2`} />
                  {d}
                </li>
              ))}
            </ul>
          )}

          {/* 흐름도 */}
          {content.flow && (
            <div className="flex items-center gap-2 flex-wrap">
              {content.flow.map((step, i) => {
                const StepIcon = step.icon;
                return (
                  <React.Fragment key={i}>
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <StepIcon size={14} className={c.text} />
                      <span className="text-xs font-medium text-gray-700">{step.label}</span>
                    </div>
                    {i < content.flow.length - 1 && <ArrowRight size={14} className="text-gray-300 shrink-0" />}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* 에이전트 목록 */}
          {content.agents && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {content.agents.map((agent) => {
                const AgentIcon = agent.icon;
                const ac = COLORS[agent.color];
                return (
                  <div key={agent.type} className={`flex items-start gap-3 p-3 rounded-xl border ${ac.border} ${ac.bg}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ac.text} bg-white border ${ac.border}`}>
                      <AgentIcon size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-800">{agent.name}</div>
                      <div className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{agent.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 모델 우선순위 */}
          {content.rules && (
            <div className="space-y-3">
              {content.rules.map((rule) => (
                <div key={rule.priority} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="w-7 h-7 rounded-lg bg-green-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {rule.priority}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-800">{rule.label}</div>
                    <div className="text-[11px] text-gray-600 mt-0.5">{rule.desc}</div>
                    <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                      <Settings size={9} /> {rule.where}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 단계별 가이드 */}
          {content.steps && (
            <div className="space-y-2">
              {content.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${c.badge}`}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-800">{s.step}</div>
                    <div className="text-[11px] text-gray-600 mt-0.5">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 기능 리스트 */}
          {content.features && (
            <ul className="space-y-2">
              {content.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <div className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0 mt-2`} />
                  {f}
                </li>
              ))}
            </ul>
          )}

          {/* 검색 공급자 */}
          {content.providers && (
            <div className="grid grid-cols-2 gap-2">
              {content.providers.map((p) => (
                <div key={p.name} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1">
                    <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      {p.name}
                      {p.free && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">FREE</span>}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 팁 */}
          {content.tip && (
            <div className={`flex items-start gap-2 p-3 rounded-xl ${c.bg} border ${c.border}`}>
              <Info size={14} className={`${c.text} shrink-0 mt-0.5`} />
              <span className="text-xs text-gray-700">{content.tip}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ServiceGuide() {
  const [openSection, setOpenSection] = useState('overview');

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50/50 overflow-hidden">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
            <BookOpen size={20} className="text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">서비스 가이드</h2>
            <p className="text-sm text-gray-500 mt-0.5">RAG AI 시스템의 기능과 사용법을 확인하세요.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-4">
        {SECTIONS.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            isOpen={openSection === section.id}
            onToggle={() => setOpenSection(openSection === section.id ? null : section.id)}
          />
        ))}
      </div>
    </div>
  );
}
