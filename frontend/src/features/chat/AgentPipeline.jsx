import React from 'react';
import {
  Brain, FileText, Globe, Database, Plug, Truck, Sparkles,
  CheckCircle, XCircle, Loader2
} from '../../components/ui/Icon';

const AGENT_MAP = {
  supervisor:  { icon: Brain,    color: 'purple', label: '감독' },
  rag:         { icon: FileText, color: 'blue',   label: 'RAG' },
  web_search:  { icon: Globe,    color: 'cyan',   label: '웹검색' },
  t2sql:       { icon: Database, color: 'amber',  label: 'SQL' },
  mcp:         { icon: Plug,     color: 'indigo',  label: 'MCP' },
  process:     { icon: Truck,    color: 'orange', label: '물류' },
  synthesizer: { icon: Sparkles, color: 'green',  label: '종합' },
};

const COLOR_CLASSES = {
  purple: { active: 'bg-purple-50 border-purple-400 text-purple-700', done: 'bg-purple-50 border-purple-300 text-purple-600', glow: 'rgba(168,85,247,0.35)' },
  blue:   { active: 'bg-blue-50 border-blue-400 text-blue-700',     done: 'bg-blue-50 border-blue-300 text-blue-600',     glow: 'rgba(59,130,246,0.35)' },
  cyan:   { active: 'bg-cyan-50 border-cyan-400 text-cyan-700',     done: 'bg-cyan-50 border-cyan-300 text-cyan-600',     glow: 'rgba(6,182,212,0.35)' },
  amber:  { active: 'bg-amber-50 border-amber-400 text-amber-700',  done: 'bg-amber-50 border-amber-300 text-amber-600',  glow: 'rgba(245,158,11,0.35)' },
  indigo: { active: 'bg-indigo-50 border-indigo-400 text-indigo-700', done: 'bg-indigo-50 border-indigo-300 text-indigo-600', glow: 'rgba(99,102,241,0.35)' },
  orange: { active: 'bg-orange-50 border-orange-400 text-orange-700', done: 'bg-orange-50 border-orange-300 text-orange-600', glow: 'rgba(249,115,22,0.35)' },
  green:  { active: 'bg-green-50 border-green-400 text-green-700',  done: 'bg-green-50 border-green-300 text-green-600',  glow: 'rgba(74,222,128,0.35)' },
};

function AgentNode({ agentKey, status, durationMs }) {
  const info = AGENT_MAP[agentKey] || { icon: Sparkles, color: 'green', label: agentKey };
  const Icon = info.icon;
  const colors = COLOR_CLASSES[info.color] || COLOR_CLASSES.green;

  const isPending = status === 'pending';
  const isActive = status === 'active';
  const isDone = status === 'done';

  const baseClass = isPending
    ? 'bg-gray-50 border-gray-200 text-gray-400 border-dashed'
    : isActive
    ? `${colors.active} border-solid`
    : `${colors.done} border-solid`;

  return (
    <div
      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border-2 min-w-[72px] transition-all duration-300 ${baseClass}`}
      style={isActive ? { '--glow-color': colors.glow } : undefined}
    >
      <div className={`relative ${isActive ? 'animate-pulseGlow' : ''}`} style={isActive ? { '--glow-color': colors.glow } : undefined}>
        {isActive ? (
          <Loader2 size={18} className="animate-spin" />
        ) : isDone ? (
          <CheckCircle size={18} />
        ) : (
          <Icon size={18} />
        )}
      </div>
      <span className="text-[10px] font-bold whitespace-nowrap">{info.label}</span>
      {isDone && durationMs > 0 && (
        <span className="text-[9px] opacity-60">{durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`}</span>
      )}
    </div>
  );
}

function Arrow({ active }) {
  return (
    <div className="flex items-center px-0.5 relative">
      <div className={`w-6 h-0.5 ${active ? 'bg-green-400' : 'bg-gray-300'} transition-colors duration-300 relative`}>
        {active && (
          <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-green-500 animate-travelDot" />
        )}
      </div>
      <div className={`w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[5px] ${active ? 'border-l-green-400' : 'border-l-gray-300'} transition-colors duration-300`} />
    </div>
  );
}

export default function AgentPipeline({ agents, activeAgent, completedMap }) {
  if (!agents || agents.length === 0) return null;

  const getStatus = (agent) => {
    if (completedMap?.[agent] !== undefined) return 'done';
    if (activeAgent === agent) return 'active';
    return 'pending';
  };

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2 px-1 mb-2 animate-fadeIn">
      {agents.map((agent, idx) => {
        const status = getStatus(agent);
        const nextAgent = agents[idx + 1];
        const arrowActive = status === 'done' && nextAgent && (getStatus(nextAgent) === 'active' || getStatus(nextAgent) === 'done');

        return (
          <React.Fragment key={agent}>
            <AgentNode
              agentKey={agent}
              status={status}
              durationMs={completedMap?.[agent] || 0}
            />
            {idx < agents.length - 1 && <Arrow active={arrowActive} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
