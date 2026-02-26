import React from 'react';
import { createPortal } from 'react-dom';
import { X } from './ui/Icon';

const SHORTCUTS = [
  { category: '일반', shortcuts: [
    { keys: ['Ctrl', 'K'], desc: '커맨드 팔레트' },
    { keys: ['Ctrl', 'N'], desc: '새 대화' },
    { keys: ['?'], desc: '단축키 도움말' },
  ]},
  { category: '채팅', shortcuts: [
    { keys: ['Enter'], desc: '메시지 전송' },
    { keys: ['Shift', 'Enter'], desc: '줄바꿈' },
    { keys: ['Esc'], desc: '생성 중단 / 메뉴 닫기' },
  ]},
  { category: '기능 토글', shortcuts: [
    { keys: ['Ctrl', 'Shift', 'W'], desc: '웹 검색 ON/OFF' },
    { keys: ['Ctrl', 'Shift', 'D'], desc: 'Deep Think ON/OFF' },
    { keys: ['Ctrl', 'Shift', 'S'], desc: 'SQL 모드 ON/OFF' },
  ]},
  { category: '네비게이션', shortcuts: [
    { keys: ['Alt', '1'], desc: '홈' },
    { keys: ['Alt', '2'], desc: '채팅' },
    { keys: ['Alt', '3'], desc: '지식 베이스' },
    { keys: ['Alt', '4'], desc: '에이전트' },
    { keys: ['Alt', '5'], desc: '학습' },
    { keys: ['Alt', '6'], desc: '가이드' },
  ]},
];

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-[11px] font-mono font-medium text-gray-600 dark:text-gray-300 shadow-sm">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcuts({ isOpen, onClose }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center animate-fadeIn" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-scaleIn"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">키보드 단축키</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="p-5 grid grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {SHORTCUTS.map(group => (
            <div key={group.category}>
              <h3 className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider mb-3">{group.category}</h3>
              <div className="space-y-2.5">
                {group.shortcuts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{s.desc}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, ki) => (
                        <React.Fragment key={ki}>
                          {ki > 0 && <span className="text-[9px] text-gray-300 dark:text-gray-600">+</span>}
                          <Kbd>{k}</Kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 text-center">
          입력 중에는 일부 단축키가 비활성화됩니다
        </div>
      </div>
    </div>,
    document.body
  );
}
