import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from '../../components/ui/Icon';

export default function CitationPopover({ source, anchorRect, onClose }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!source || !anchorRect) return null;

  // 위치 계산: 배지 아래에 표시, 화면 밖으로 넘치면 조정
  const top = anchorRect.bottom + 8;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 340));

  return createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top, left, zIndex: 200 }}
      className="w-80 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-scaleIn"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg shrink-0">
            <FileText size={14} className="text-blue-500" />
          </div>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {source.filename}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* 본문 */}
      <div className="px-4 py-3">
        <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-32 overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-700 leading-relaxed italic">
          "{source.chunk_text}"
        </div>
      </div>

      {/* 하단 메타 */}
      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 text-[10px] text-gray-400">
        {source.score > 0 && (
          <span className="flex items-center gap-1">
            <span className="font-bold">유사도:</span> {(source.score * 100).toFixed(0)}%
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="font-bold">출처:</span> [{source.id}]
        </span>
      </div>
    </div>,
    document.body
  );
}

/**
 * 인라인 인용 배지 컴포넌트
 * ReactMarkdown 텍스트 안에서 [N] 패턴을 대체하여 렌더링
 */
export function CitationBadge({ num, source, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 mx-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer align-baseline leading-none"
      title={source?.filename || `출처 ${num}`}
    >
      {num}
    </button>
  );
}
