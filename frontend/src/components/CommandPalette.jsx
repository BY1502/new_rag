import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Plus, Upload, Globe, Brain, MessageSquare,
  Database, Bot, Home, Settings, GraduationCap, BookOpen,
  ArrowUp, ArrowDown,
} from './ui/Icon';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function CommandPalette({ isOpen, onClose, sessions, knowledgeBases, agents, onAction }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const allItems = useMemo(() => {
    const items = [];

    // Quick Actions
    items.push({ category: '빠른 작업', icon: Plus, label: '새 대화 시작', action: 'new-chat' });
    items.push({ category: '빠른 작업', icon: Upload, label: '지식 베이스로 이동', action: 'navigate:/knowledge' });
    items.push({ category: '빠른 작업', icon: Globe, label: '웹 검색 토글', action: 'toggle-web' });
    items.push({ category: '빠른 작업', icon: Brain, label: 'Deep Think 토글', action: 'toggle-deep-think' });
    items.push({ category: '빠른 작업', icon: Database, label: 'SQL 모드 토글', action: 'toggle-sql' });

    // Sessions
    (sessions || []).forEach(s => {
      items.push({
        category: '최근 대화',
        icon: MessageSquare,
        label: s.title || '새 대화',
        sublabel: timeAgo(s.updatedAt || s.createdAt),
        action: `session:${s.id}`,
      });
    });

    // Knowledge Bases
    (knowledgeBases || []).forEach(kb => {
      items.push({
        category: '지식 베이스',
        icon: Database,
        label: kb.name,
        sublabel: `${kb.files?.length || 0}개 문서`,
        action: 'navigate:/knowledge',
      });
    });

    // Agents (custom only)
    (agents || []).filter(a => !a.agentType || a.agentType === 'custom').forEach(a => {
      items.push({
        category: '에이전트',
        icon: Bot,
        label: a.name,
        sublabel: a.model,
        action: `agent:${a.id}`,
      });
    });

    // Navigation
    items.push({ category: '페이지 이동', icon: Home, label: '홈 대시보드', action: 'navigate:/home' });
    items.push({ category: '페이지 이동', icon: MessageSquare, label: '채팅', action: 'navigate:/chat' });
    items.push({ category: '페이지 이동', icon: Database, label: '지식 베이스', action: 'navigate:/knowledge' });
    items.push({ category: '페이지 이동', icon: Bot, label: '에이전트 관리', action: 'navigate:/agent' });
    items.push({ category: '페이지 이동', icon: GraduationCap, label: '학습', action: 'navigate:/training' });
    items.push({ category: '페이지 이동', icon: BookOpen, label: '가이드', action: 'navigate:/guide' });
    items.push({ category: '페이지 이동', icon: Settings, label: '설정 열기', action: 'open-settings' });

    return items;
  }, [sessions, knowledgeBases, agents]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.sublabel && item.sublabel.toLowerCase().includes(q))
    );
  }, [query, allItems]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIdx]) {
        e.preventDefault();
        onAction(filtered[selectedIdx].action);
        onClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, filtered, selectedIdx, onAction, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`);
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx]);

  if (!isOpen) return null;

  // Group by category
  const grouped = [];
  let lastCategory = null;
  filtered.forEach((item, idx) => {
    if (item.category !== lastCategory) {
      grouped.push({ type: 'header', label: item.category });
      lastCategory = item.category;
    }
    grouped.push({ type: 'item', ...item, flatIdx: idx });
  });

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[18vh] animate-fadeIn" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-scaleIn"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="검색어를 입력하세요..."
            className="flex-1 bg-transparent text-base text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400"
          />
          <kbd className="hidden sm:inline text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto custom-scrollbar py-2">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              검색 결과가 없습니다
            </div>
          ) : (
            grouped.map((entry, i) => {
              if (entry.type === 'header') {
                return (
                  <div key={`h-${entry.label}`} className="px-4 pt-3 pb-1 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">
                    {entry.label}
                  </div>
                );
              }
              const Icon = entry.icon;
              const isSelected = entry.flatIdx === selectedIdx;
              return (
                <button
                  key={`${entry.action}-${entry.flatIdx}`}
                  data-idx={entry.flatIdx}
                  onClick={() => { onAction(entry.action); onClose(); }}
                  onMouseEnter={() => setSelectedIdx(entry.flatIdx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon size={16} className={isSelected ? 'text-green-500' : 'text-gray-400'} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{entry.label}</span>
                    {entry.sublabel && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{entry.sublabel}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><ArrowUp size={10} /><ArrowDown size={10} /> 이동</span>
          <span>↵ 선택</span>
          <span>esc 닫기</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
