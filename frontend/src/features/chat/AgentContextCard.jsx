import React, { useState, useCallback } from 'react';
import {
  Bot, Sparkles, FileText, Globe, Plug, Brain, HardDrive,
  ChevronDown, CheckCircle, Cpu, Info, Database, Zap
} from '../../components/ui/Icon';

// 소스 설정 (DT/deep_think 제거됨 — Smart Mode로 분리)
const SOURCE_CONFIG = {
  rag:        { label: 'RAG',  icon: FileText,  desc: '지식 베이스 검색' },
  web_search: { label: 'Web',  icon: Globe,     desc: '인터넷 실시간 검색' },
  sql:        { label: 'SQL',  icon: HardDrive, desc: '데이터베이스 조회' },
  mcp:        { label: 'MCP',  icon: Plug,      desc: '외부 도구 연동' },
};

// Tailwind purge-safe 정적 스타일 맵
const SOURCE_STYLES = {
  rag: {
    active:   'bg-blue-100 text-blue-700 border-blue-300',
    override: 'bg-blue-50 text-blue-600 border-blue-400 border-dashed',
    ghost:    'text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-500',
  },
  web_search: {
    active:   'bg-green-100 text-green-700 border-green-300',
    override: 'bg-green-50 text-green-600 border-green-400 border-dashed',
    ghost:    'text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-500',
  },
  sql: {
    active:   'bg-amber-100 text-amber-700 border-amber-300',
    override: 'bg-amber-50 text-amber-600 border-amber-400 border-dashed',
    ghost:    'text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-500',
  },
  mcp: {
    active:   'bg-indigo-100 text-indigo-700 border-indigo-300',
    override: 'bg-indigo-50 text-indigo-600 border-indigo-400 border-dashed',
    ghost:    'text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-500',
  },
};

const AgentIcon = ({ agentId, size = 14, className = '' }) => {
  switch (agentId) {
    case 'agent-general': return <Sparkles size={size} className={className} />;
    case 'agent-rag':     return <FileText size={size} className={className} />;
    default:              return <Bot size={size} className={className} />;
  }
};

function SourcePill({ sourceKey, isOn, isOverride, smartMode, onToggle, onSubMenuToggle }) {
  const cfg = SOURCE_CONFIG[sourceKey];
  const styles = SOURCE_STYLES[sourceKey];
  const Icon = cfg.icon;

  let styleClass;
  if (isOn && isOverride) {
    styleClass = styles.override;
  } else if (isOn) {
    styleClass = styles.active;
  } else {
    styleClass = styles.ghost;
  }

  const handleClick = (e) => {
    e.stopPropagation();
    if ((sourceKey === 'mcp' || sourceKey === 'sql') && onSubMenuToggle) {
      if (!isOn) {
        onToggle(sourceKey);
        onSubMenuToggle(sourceKey);
      } else {
        onToggle(sourceKey);
        onSubMenuToggle(null);
      }
    } else {
      onToggle(sourceKey);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-all duration-200 ${styleClass}`}
      title={`${cfg.desc} ${isOn ? '(켜짐)' : '(꺼짐)'}${isOverride ? ' — 수동 변경됨' : ''}${isOn && smartMode ? ' — Smart Mode 자동 활용 가능' : ''}`}
    >
      <Icon size={11} />
      <span>{cfg.label}</span>
      {isOn && smartMode && (
        <Zap size={8} className="opacity-60" />
      )}
      {isOn && isOverride && !smartMode && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      )}
    </button>
  );
}

export default function AgentContextCard({
  agents,
  currentAgent,
  config,
  effectiveSources,
  agentDefaults,
  sourceOverrides,
  smartMode,
  isModeOverride,
  onToggleSource,
  onToggleSmartMode,
  onAgentChange,
  // MCP/SQL 서브메뉴 관련
  mcpServers,
  activeMcpIds,
  onToggleMcp,
  dbConnections,
  selectedDbConnectionId,
  onSelectDb,
}) {
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [subMenu, setSubMenu] = useState(null); // 'mcp' | 'sql' | null

  const handleSubMenuToggle = useCallback((sourceKey) => {
    if (sourceKey === null) {
      setSubMenu(null);
    } else {
      setSubMenu(prev => prev === sourceKey ? null : sourceKey);
    }
  }, []);

  // 외부 클릭으로 닫기
  const handleOutsideClick = useCallback(() => {
    setIsAgentMenuOpen(false);
    setSubMenu(null);
  }, []);

  React.useEffect(() => {
    if (isAgentMenuOpen || subMenu) {
      window.addEventListener('click', handleOutsideClick);
      return () => window.removeEventListener('click', handleOutsideClick);
    }
  }, [isAgentMenuOpen, subMenu, handleOutsideClick]);

  const sourceKeys = ['rag', 'web_search', 'sql', 'mcp'];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* 에이전트 선택 버튼 */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const opening = !isAgentMenuOpen;
            setIsAgentMenuOpen(opening);
            if (opening) setSubMenu(null);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
            currentAgent
              ? 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
              : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200'
          }`}
        >
          {currentAgent ? (
            <AgentIcon agentId={currentAgent.id} size={12} />
          ) : (
            <Bot size={12} />
          )}
          <span className="max-w-[100px] truncate">
            {currentAgent?.name || '기본 모드'}
          </span>
          <span className="text-[9px] opacity-60 font-mono">
            {currentAgent?.model || config.llm}
          </span>
          <ChevronDown size={10} className={`transition-transform ${isAgentMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* 에이전트 드롭다운 */}
        {isAgentMenuOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
            <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
              에이전트 선택
            </div>
            <div className="max-h-52 overflow-y-auto custom-scrollbar p-1">
              {/* 기본 모드 */}
              <button
                onClick={() => { onAgentChange(null); setIsAgentMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition ${
                  !currentAgent ? 'bg-gray-50 text-gray-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  !currentAgent ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  <Bot size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">기본 모드</div>
                  <div className="text-[10px] text-gray-400 truncate">설정의 기본 모델({config.llm})로 대화</div>
                </div>
                {!currentAgent && <CheckCircle size={12} className="text-green-500 shrink-0" />}
              </button>
              <div className="h-px bg-gray-100 mx-2 my-1" />
              {agents.filter(a => !a.agentType || a.agentType === 'custom').map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => { onAgentChange(agent.id); setIsAgentMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition ${
                    currentAgent?.id === agent.id
                      ? 'bg-green-50 text-gray-700 border border-green-200'
                      : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    currentAgent?.id === agent.id
                      ? 'bg-green-100 text-green-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    <AgentIcon agentId={agent.id} size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{agent.name}</div>
                    <div className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                      <Cpu size={9} /> {agent.model || config.llm}
                    </div>
                  </div>
                  {currentAgent?.id === agent.id && <CheckCircle size={12} className="text-green-500 shrink-0" />}
                </button>
              ))}
            </div>
            <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100">
              <div className="text-[10px] text-gray-500 flex items-start gap-1.5">
                <Info size={10} className="shrink-0 mt-0.5 text-gray-400" />
                <span>에이전트 선택 시 기본 소스와 Smart Mode가 자동 설정됩니다.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Smart Mode 토글 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsAgentMenuOpen(false);
          setSubMenu(null);
          onToggleSmartMode();
        }}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all duration-200 ${
          smartMode
            ? 'bg-purple-100 text-purple-700 border-purple-300'
            : 'text-gray-400 border-gray-200 hover:border-purple-300 hover:text-purple-500'
        }${isModeOverride ? ' border-dashed' : ''}`}
        title={`Smart Mode: AI가 활성 소스 중 최적 조합을 자동 선택${smartMode ? ' (켜짐)' : ' (꺼짐)'}${isModeOverride ? ' — 수동 변경됨' : ''}`}
      >
        <Brain size={12} />
        <span>Smart</span>
        {smartMode && <Sparkles size={9} className="animate-pulse opacity-70" />}
      </button>

      {/* 구분선 */}
      <div className="w-px h-5 bg-gray-200" />

      {/* 소스 Pill들 */}
      <div className="relative flex flex-wrap items-center gap-1">
        {sourceKeys.map((key) => (
          <SourcePill
            key={key}
            sourceKey={key}
            isOn={effectiveSources[key]}
            isOverride={sourceOverrides[key] !== undefined}
            smartMode={smartMode}
            onToggle={(sk) => { setIsAgentMenuOpen(false); onToggleSource(sk); }}
            onSubMenuToggle={(key === 'mcp' || key === 'sql') ? (v) => { setIsAgentMenuOpen(false); handleSubMenuToggle(v); } : null}
          />
        ))}

        {/* MCP 서브메뉴 */}
        {subMenu === 'mcp' && (
          <div
            className="absolute bottom-full left-0 mb-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
              MCP 도구
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
              {mcpServers.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  연결된 MCP 서버가 없습니다.<br />설정에서 추가해주세요.
                </div>
              ) : (
                mcpServers.map((server) => {
                  const isActive = activeMcpIds.includes(server.id);
                  return (
                    <button
                      key={server.id}
                      onClick={(e) => { e.stopPropagation(); onToggleMcp(server.id); }}
                      className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 transition"
                    >
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition ${
                        isActive ? 'bg-green-400 border-green-400' : 'border-gray-300'
                      }`}>
                        {isActive && <CheckCircle size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-800 truncate">{server.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{server.status}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* SQL DB 서브메뉴 */}
        {subMenu === 'sql' && (
          <div
            className="absolute bottom-full left-0 mb-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
              데이터베이스 선택
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {dbConnections.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  등록된 DB가 없습니다.<br />설정에서 추가해주세요.
                </div>
              ) : (
                dbConnections.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={(e) => { e.stopPropagation(); onSelectDb(conn.id); setSubMenu(null); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 transition ${
                      selectedDbConnectionId === conn.id ? 'bg-amber-50 text-amber-700' : ''
                    }`}
                  >
                    <Database size={14} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{conn.name}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {conn.db_type}{conn.db_type !== 'sqlite' && ` · ${conn.host}:${conn.port}`}
                      </div>
                    </div>
                    {selectedDbConnectionId === conn.id && (
                      <CheckCircle size={12} className="text-amber-600 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
