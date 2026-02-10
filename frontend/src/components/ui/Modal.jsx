import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const modalRef = useRef(null);

  // 사이즈별 클래스 정의
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
    '3xl': 'max-w-7xl', // ✅ 설정 화면용 초대형 사이즈
    full: 'max-w-[95vw] h-[95vh]'
  };

  useEffect(() => {
    const handleEscape = (e) => e.key === 'Escape' && onClose();
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" 
        onClick={onClose}
      />
      
      {/* 모달 본문 */}
      <div 
        ref={modalRef}
        className={`relative w-full ${sizeClasses[size] || sizeClasses.md} bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700 overflow-hidden`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* 컨텐츠 (스크롤 가능) */}
        <div className="flex-1 overflow-auto relative bg-white dark:bg-gray-900">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}