import React, { useState, useEffect } from 'react';
import {
  Bot, Sparkles, FileText, Globe, Plug, HardDrive,
  ChevronDown, CheckCircle, Cpu, Database, Brain, Truck,
} from '../../components/ui/Icon';

// 소스 뱃지 스타일
const SOURCE_BADGE = {
  rag:        { label: 'RAG', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  web_search: { label: 'Web', cls: 'bg-green-50 text-green-600 border-green-200' },
  sql:        { label: 'SQL', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  mcp:        { label: 'MCP', cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
};

// 에이전트 타입→아이콘 매핑
const TYPE_ICONS = {
  supervisor: Brain, rag: FileText, web_search: Globe,
  t2sql: Database, mcp: Plug, process: Truck,
};
const ID_ICONS = { 'agent-general': Sparkles, 'agent-rag': FileText };

function getAgentIcon(agent) {
  return ID_ICONS[agent.id] || TYPE_ICONS[agent.agentType] || Bot;
}

// 에이전트 뱃지 — 활성 소스를 작은 뱃지로 표시
function SourceBadges({ sources }) {
  if (!sources) return null;
  const active = Object.entries(sources).filter(([, v]) => v);
  if (active.length === 0) return null;
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {active.map(([key]) => {
        const b = SOURCE_BADGE[key];
        if (!b) return null;
        return (
          <span key={key} className={`px-1 py-0 rounded text-[8px] font-bold border ${b.cls}`}>
            {b.label}
          </span>
        );
      })}
    </div>
  );
}

export default function ContextChips({
  agents, currentAgent, config, onAgentChange,
  effectiveSources,
  knowledgeBases, selectedKbIds, onToggleKb,
  mcpServers, activeMcpIds, onToggleMcp,
  dbConnections, selectedDbConnectionId, onSelectDb,
}) {
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [subMenu, setSubMenu] = useState(null); // 'kb' | 'db' | 'mcp' | null

  // 외부 클릭으로 닫기
  useEffect(() => {
    if (!isAgentMenuOpen && !subMenu) return;
    const handler = () => { setIsAgentMenuOpen(false); setSubMenu(null); };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [isAgentMenuOpen, subMenu]);

  // 에이전트 분류
  const customAgents = agents.filter(a => !a.agentType || a.agentType === 'custom');
  const systemAgents = agents.filter(a => a.agentType && a.agentType !== 'custom');

  // 라벨 계산
  const kbLabel = selectedKbIds.length === 0 ? 'KB 없음'
    : selectedKbIds.length === 1
      ? knowledgeBases.find(kb => kb.id === selectedKbIds[0])?.name || 'KB'
      : `${selectedKbIds.length}개 KB`;

  const dbLabel = selectedDbConnectionId
    ? dbConnections.find(c => c.id === selectedDbConnectionId)?.name || 'DB'
    : 'DB 선택';

  const mcpActiveCount = activeMcpIds.length;
  const mcpLabel = mcpActiveCount === 0 ? 'MCP 선택'
    : mcpActiveCount === 1
      ? mcpServers.find(s => s.id === activeMcpIds[0])?.name || 'MCP'
      : `${mcpActiveCount}개 MCP`;

  // 에이전트 아이콘
  const AgentIconEl = currentAgent ? getAgentIcon(currentAgent) : Bot;

  return (
    <div className="flex flex-wrap items-center gap-1.5">

      {/* ── 에이전트 선택 버튼 ── */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setIsAgentMenuOpen(!isAgentMenuOpen); setSubMenu(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
            currentAgent
              ? 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
              : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200'
          }`}
        >
          <AgentIconEl size={12} />
          <span className="max-w-[120px] truncate">
            {currentAgent?.name || '기본 모드'}
          </span>
          <span className="text-[9px] opacity-60 font-mono">
            {currentAgent?.model || config.llm}
          </span>
          <ChevronDown size={10} className={`transition-transform ${isAgentMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* 에이전트 드롭다운 */}
        {isAgentMenuOpen && (
          <div
            className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
              에이전트 선택
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">

              {/* 기본 모드 */}
              <button
                onClick={() => { onAgentChange(null); setIsAgentMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition ${
                  !currentAgent ? 'bg-gray-50 text-gray-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  !currentAgent ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  <Bot size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">기본 모드</div>
                  <div className="text-[10px] text-gray-400 truncate">설정의 기본 모델({config.llm})로 대화</div>
                </div>
                <SourceBadges sources={{ rag: true }} />
                {!currentAgent && <CheckCircle size={12} className="text-green-500 shrink-0" />}
              </button>

              {/* 커스텀 에이전트 */}
              {customAgents.length > 0 && (
                <>
                  <div className="h-px bg-gray-100 mx-2 my-1" />
                  {customAgents.map((agent) => {
                    const Icon = getAgentIcon(agent);
                    const isSelected = currentAgent?.id === agent.id;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => { onAgentChange(agent.id); setIsAgentMenuOpen(false); }}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition ${
                          isSelected
                            ? 'bg-green-50 text-gray-700 border border-green-200'
                            : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{agent.name}</div>
                          <div className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                            <Cpu size={9} /> {agent.model || config.llm}
                          </div>
                        </div>
                        <SourceBadges sources={agent.defaultTools?.sources} />
                        {isSelected && <CheckCircle size={12} className="text-green-500 shrink-0" />}
                      </button>
                    );
                  })}
                </>
              )}

              {/* 시스템 에이전트 */}
              {systemAgents.length > 0 && (
                <>
                  <div className="h-px bg-gray-100 mx-2 my-1" />
                  <div className="px-3 py-1 text-[9px] text-gray-400 font-bold uppercase tracking-wider">시스템 에이전트</div>
                  {systemAgents.map((agent) => {
                    const Icon = getAgentIcon(agent);
                    const isSelected = currentAgent?.id === agent.id;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => { onAgentChange(agent.id); setIsAgentMenuOpen(false); }}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition ${
                          isSelected
                            ? 'bg-green-50 text-gray-700 border border-green-200'
                            : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{agent.name}</div>
                          <div className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                            <Cpu size={9} /> {agent.model || config.llm}
                          </div>
                        </div>
                        <SourceBadges sources={agent.defaultTools?.sources} />
                        {isSelected && <CheckCircle size={12} className="text-green-500 shrink-0" />}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── KB 선택 (RAG 활성일 때만) ── */}
      {effectiveSources.rag && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setSubMenu(subMenu === 'kb' ? null : 'kb'); setIsAgentMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              selectedKbIds.length > 0
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200'
                : 'bg-gray-50 hover:bg-gray-100 text-gray-400 border border-gray-200'
            }`}
          >
            <Database size={12} />
            <span className="max-w-[120px] truncate">{kbLabel}</span>
            <ChevronDown size={10} className={`transition-transform ${subMenu === 'kb' ? 'rotate-180' : ''}`} />
          </button>

          {subMenu === 'kb' && (
            <div
              className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
                지식 베이스 (다중 선택)
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                {knowledgeBases.map((kb) => {
                  const isSelected = selectedKbIds.includes(kb.id);
                  return (
                    <button
                      key={kb.id}
                      onClick={() => onToggleKb(kb.id)}
                      className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 transition"
                    >
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition ${
                        isSelected ? 'bg-green-400 border-green-400' : 'border-gray-300'
                      }`}>
                        {isSelected && <CheckCircle size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-800 truncate">{kb.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{kb.files?.length || 0}개 문서</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DB 선택 (SQL 활성일 때만) ── */}
      {effectiveSources.sql && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setSubMenu(subMenu === 'db' ? null : 'db'); setIsAgentMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              selectedDbConnectionId
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200'
                : 'bg-gray-50 hover:bg-gray-100 text-gray-400 border border-gray-200'
            }`}
          >
            <HardDrive size={12} />
            <span className="max-w-[120px] truncate">{dbLabel}</span>
            <ChevronDown size={10} className={`transition-transform ${subMenu === 'db' ? 'rotate-180' : ''}`} />
          </button>

          {subMenu === 'db' && (
            <div
              className="absolute bottom-full left-0 mb-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden"
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
                      onClick={() => { onSelectDb(conn.id); setSubMenu(null); }}
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
      )}

      {/* ── MCP 선택 (MCP 활성일 때만) ── */}
      {effectiveSources.mcp && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setSubMenu(subMenu === 'mcp' ? null : 'mcp'); setIsAgentMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              activeMcpIds.length > 0
                ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200'
                : 'bg-gray-50 hover:bg-gray-100 text-gray-400 border border-gray-200'
            }`}
          >
            <Plug size={12} />
            <span className="max-w-[120px] truncate">{mcpLabel}</span>
            <ChevronDown size={10} className={`transition-transform ${subMenu === 'mcp' ? 'rotate-180' : ''}`} />
          </button>

          {subMenu === 'mcp' && (
            <div
              className="absolute bottom-full left-0 mb-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden"
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
        </div>
      )}
    </div>
  );
}
