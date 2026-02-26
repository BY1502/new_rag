import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Bot, Sparkles, FileText, Globe, Plug, HardDrive,
  X, Plus, CheckCircle, Cpu, Database, ChevronDown,
} from '../../components/ui/Icon';

// --- 칩 색상 스타일 (Tailwind purge-safe) ---
const CHIP_STYLES = {
  agent:  'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  kb:     'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  rag:    'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  web:    'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  sql:    'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  mcp:    'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
};

// --- 소스 설정 ---
const SOURCE_CONFIG = {
  rag:        { label: 'RAG',  icon: FileText,  desc: '지식 베이스 검색' },
  web_search: { label: 'Web',  icon: Globe,     desc: '인터넷 실시간 검색' },
  sql:        { label: 'SQL',  icon: HardDrive, desc: '데이터베이스 조회' },
  mcp:        { label: 'MCP',  icon: Plug,      desc: '외부 도구 연동' },
};

// --- 에이전트 아이콘 ---
const AgentIcon = ({ agentId, size = 11, className = '' }) => {
  switch (agentId) {
    case 'agent-general': return <Sparkles size={size} className={className} />;
    case 'agent-rag':     return <FileText size={size} className={className} />;
    default:              return <Bot size={size} className={className} />;
  }
};

// --- 공통 Chip ---
function Chip({ icon: Icon, label, colorKey, onRemove }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${CHIP_STYLES[colorKey] || CHIP_STYLES.agent}`}>
      <Icon size={11} />
      <span className="max-w-[80px] truncate">{label}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
        >
          <X size={9} />
        </button>
      )}
    </span>
  );
}

// --- Unified Picker ---
function UnifiedPicker({
  isOpen, onClose, pickerRef,
  // 에이전트
  agents, currentAgent, config, onAgentChange,
  // 소스
  effectiveSources, onToggleSource,
  // KB
  knowledgeBases, selectedKbIds, onToggleKb,
  // MCP/SQL
  mcpServers, activeMcpIds, onToggleMcp,
  dbConnections, selectedDbConnectionId, onSelectDb,
}) {
  if (!isOpen) return null;

  const sourceKeys = ['rag', 'web_search', 'sql', 'mcp'];
  const customAgents = agents.filter(a => !a.agentType || a.agentType === 'custom');

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 mb-2 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-40 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 에이전트 섹션 */}
      <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
        <Bot size={10} /> 에이전트
      </div>
      <div className="max-h-32 overflow-y-auto custom-scrollbar p-1">
        {/* 기본 모드 */}
        <button
          onClick={() => { onAgentChange(null); }}
          className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition text-xs ${
            !currentAgent ? 'bg-gray-50 font-bold' : 'hover:bg-gray-50'
          }`}
        >
          <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
            !currentAgent ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'
          }`}>
            <Bot size={11} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="truncate">없음 (기본 모드)</span>
          </div>
          {!currentAgent && <CheckCircle size={11} className="text-green-500 shrink-0" />}
        </button>

        {customAgents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => { onAgentChange(agent.id); }}
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition text-xs ${
              currentAgent?.id === agent.id ? 'bg-green-50 font-bold' : 'hover:bg-gray-50'
            }`}
          >
            <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
              currentAgent?.id === agent.id ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
            }`}>
              <AgentIcon agentId={agent.id} size={11} />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="truncate">{agent.name}</span>
              <span className="text-[9px] text-gray-400 font-mono">{agent.model || config.llm}</span>
            </div>
            {currentAgent?.id === agent.id && <CheckCircle size={11} className="text-green-500 shrink-0" />}
          </button>
        ))}
      </div>

      {/* 소스 섹션 */}
      <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-t border-b border-gray-100 flex items-center gap-1.5">
        <FileText size={10} /> 탐색 소스
      </div>
      <div className="p-1">
        {sourceKeys.map((key) => {
          const cfg = SOURCE_CONFIG[key];
          const Icon = cfg.icon;
          const isOn = effectiveSources[key];
          return (
            <button
              key={key}
              onClick={() => onToggleSource(key)}
              className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 hover:bg-gray-50 transition text-xs"
            >
              <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition ${
                isOn ? 'bg-green-400 border-green-400' : 'border-gray-300'
              }`}>
                {isOn && <CheckCircle size={10} className="text-white" />}
              </div>
              <Icon size={12} className={isOn ? 'text-gray-700' : 'text-gray-400'} />
              <div className="flex-1 min-w-0">
                <span className={isOn ? 'font-bold text-gray-800' : 'text-gray-500'}>{cfg.label}</span>
                <span className="text-[10px] text-gray-400 ml-1.5">— {cfg.desc}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* KB 섹션 */}
      {knowledgeBases.length > 0 && (
        <>
          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-t border-b border-gray-100 flex items-center gap-1.5">
            <Database size={10} /> 지식 베이스
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar p-1">
            {knowledgeBases.map((kb) => {
              const isSelected = selectedKbIds.includes(kb.id);
              return (
                <button
                  key={kb.id}
                  onClick={() => onToggleKb(kb.id)}
                  className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 hover:bg-gray-50 transition text-xs"
                >
                  <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition ${
                    isSelected ? 'bg-green-400 border-green-400' : 'border-gray-300'
                  }`}>
                    {isSelected && <CheckCircle size={10} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={isSelected ? 'font-bold text-gray-800' : 'text-gray-500'}>{kb.name}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">({kb.files?.length || 0}개 문서)</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* DB 섹션 (SQL ON일 때만) */}
      {effectiveSources.sql && dbConnections.length > 0 && (
        <>
          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-t border-b border-gray-100 flex items-center gap-1.5">
            <HardDrive size={10} /> 데이터베이스
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar p-1">
            {dbConnections.map((conn) => (
              <button
                key={conn.id}
                onClick={() => onSelectDb(conn.id === selectedDbConnectionId ? null : conn.id)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 hover:bg-gray-50 transition text-xs ${
                  selectedDbConnectionId === conn.id ? 'bg-amber-50' : ''
                }`}
              >
                <div className={`w-4 h-4 border-2 rounded-full flex items-center justify-center transition ${
                  selectedDbConnectionId === conn.id ? 'bg-amber-400 border-amber-400' : 'border-gray-300'
                }`}>
                  {selectedDbConnectionId === conn.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={selectedDbConnectionId === conn.id ? 'font-bold text-gray-800' : 'text-gray-500'}>{conn.name}</span>
                  <span className="text-[10px] text-gray-400 ml-1.5">
                    {conn.db_type}{conn.db_type !== 'sqlite' ? ` · ${conn.host}:${conn.port}` : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* MCP 섹션 (MCP ON일 때만) */}
      {effectiveSources.mcp && mcpServers.length > 0 && (
        <>
          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-t border-b border-gray-100 flex items-center gap-1.5">
            <Plug size={10} /> MCP 도구
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar p-1">
            {mcpServers.map((server) => {
              const isActive = activeMcpIds.includes(server.id);
              return (
                <button
                  key={server.id}
                  onClick={() => onToggleMcp(server.id)}
                  className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 hover:bg-gray-50 transition text-xs"
                >
                  <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition ${
                    isActive ? 'bg-green-400 border-green-400' : 'border-gray-300'
                  }`}>
                    {isActive && <CheckCircle size={10} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={isActive ? 'font-bold text-gray-800' : 'text-gray-500'}>{server.name}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">{server.status}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// --- 메인 ContextChips 컴포넌트 ---
export default function ContextChips({
  // 에이전트
  agents, currentAgent, config, onAgentChange,
  // 소스
  effectiveSources, agentDefaults, sourceOverrides,
  onToggleSource,
  // KB
  knowledgeBases, selectedKbIds, onToggleKb,
  // MCP/SQL
  mcpServers, activeMcpIds, onToggleMcp,
  dbConnections, selectedDbConnectionId, onSelectDb,
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const buttonRef = useRef(null);

  // 외부 클릭으로 피커 닫기
  useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (e) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setIsPickerOpen(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [isPickerOpen]);

  const sourceKeys = ['rag', 'web_search', 'sql', 'mcp'];

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {/* 1. 에이전트 칩 (커스텀 에이전트일 때만) */}
      {currentAgent && (
        <Chip
          icon={({ size, className }) => <AgentIcon agentId={currentAgent.id} size={size} className={className} />}
          label={currentAgent.name}
          colorKey="agent"
          onRemove={() => onAgentChange(null)}
        />
      )}

      {/* 2. KB 칩들 (선택된 것만) */}
      {selectedKbIds.map((kbId) => {
        const kb = knowledgeBases.find(k => k.id === kbId);
        if (!kb) return null;
        return (
          <Chip
            key={`kb-${kbId}`}
            icon={Database}
            label={kb.name}
            colorKey="kb"
            onRemove={() => onToggleKb(kbId)}
          />
        );
      })}

      {/* 3. 소스 칩들 (활성화된 것만) */}
      {sourceKeys.map((key) => {
        if (!effectiveSources[key]) return null;
        const cfg = SOURCE_CONFIG[key];
        const colorMap = { rag: 'rag', web_search: 'web', sql: 'sql', mcp: 'mcp' };
        return (
          <Chip
            key={`src-${key}`}
            icon={cfg.icon}
            label={cfg.label}
            colorKey={colorMap[key]}
            onRemove={() => {
              onToggleSource(key);
              // SQL/MCP 해제 시 하위 선택도 초기화
              if (key === 'sql') onSelectDb(null);
            }}
          />
        );
      })}

      {/* 4. [+] 버튼 */}
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setIsPickerOpen(!isPickerOpen); }}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all ${
          isPickerOpen
            ? 'bg-green-50 border-green-300 text-green-600'
            : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 hover:bg-gray-100'
        }`}
        title="설정 변경"
      >
        <Plus size={14} />
      </button>

      {/* Unified Picker */}
      <UnifiedPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        pickerRef={pickerRef}
        agents={agents}
        currentAgent={currentAgent}
        config={config}
        onAgentChange={onAgentChange}
        effectiveSources={effectiveSources}
        onToggleSource={onToggleSource}
        knowledgeBases={knowledgeBases}
        selectedKbIds={selectedKbIds}
        onToggleKb={onToggleKb}
        mcpServers={mcpServers}
        activeMcpIds={activeMcpIds}
        onToggleMcp={onToggleMcp}
        dbConnections={dbConnections}
        selectedDbConnectionId={selectedDbConnectionId}
        onSelectDb={onSelectDb}
      />
    </div>
  );
}
