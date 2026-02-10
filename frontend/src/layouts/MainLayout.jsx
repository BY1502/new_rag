import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom'; // ✅ 라우터 훅 추가
import { useStore } from '../contexts/StoreContext';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Plus, Database, Settings, Trash2, FileText as EditIcon, X, CheckCircle, Upload, Bot, Home, LogOut } from '../components/ui/Icon';
import AdvancedSettings from '../features/settings/AdvancedSettings';
import { Modal } from '../components/ui/Modal';

export default function MainLayout() {
  const { user, logout, isAuthenticated } = useAuth();
  const { sessions, currentSessionId, setCurrentSessionId, createNewSession, renameSession, deleteSession } = useStore();
  const [modalType, setModalType] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  
  // ✅ 라우터 훅 사용
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ 비로그인 상태면 로그인 페이지로 리다이렉트
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const startEditing = (session) => { setEditingSessionId(session.id); setEditTitle(session.title); };
  const saveEditing = () => { if (editingSessionId && editTitle.trim()) renameSession(editingSessionId, editTitle); setEditingSessionId(null); };
  const cancelEditing = () => { setEditingSessionId(null); };

  // ✅ URL 경로에 따라 헤더 정보 결정 (기존 getHeaderInfo 로직 유지)
  const getHeaderInfo = () => {
    const path = location.pathname;
    if (path.includes('/home')) return { badge: 'Dashboard', badgeColor: 'bg-gray-100 text-gray-700 border-gray-200', status: 'Online', statusColor: 'bg-green-500' };
    if (path.includes('/knowledge')) return { badge: 'Knowledge OS', badgeColor: 'bg-purple-50 text-purple-700 border-purple-100', status: 'System Ready', statusColor: 'bg-purple-500' };
    if (path.includes('/agent')) return { badge: 'Agent Manager', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100', status: 'Managing', statusColor: 'bg-indigo-500' };
    return { badge: 'Agent Mode', badgeColor: 'bg-blue-50 text-blue-700 border-blue-100', status: 'Online', statusColor: 'bg-green-500' };
  };
  const headerInfo = getHeaderInfo();

  // ✅ 현재 활성화된 뷰 확인 (스타일링용)
  const isView = (path) => location.pathname.includes(path);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden font-sans relative">
      {/* 드래그 앤 드롭 오버레이 (기존 코드 유지) */}
      {isGlobalDragging && (
        <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-3xl animate-in fade-in duration-200 pointer-events-none">
          <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-4 animate-bounce"><Upload size={40} className="text-blue-600" /></div>
          <h2 className="text-2xl font-bold text-gray-800">파일을 여기에 놓으세요</h2><p className="text-gray-500 mt-2">지식 베이스 관리 페이지로 이동합니다</p>
        </div>
      )}

      {/* 사이드바 (기존 코드 100% 유지) */}
      <aside className="w-[260px] bg-gray-900 text-gray-300 flex flex-col shrink-0 transition-all duration-300">
        <div className="p-4">
          <button onClick={() => { createNewSession(); navigate('/chat'); }} className="w-full flex items-center gap-2 px-3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-md">
            <Plus size={18} /> <span className="text-sm font-semibold">새로운 대화</span>
          </button>
        </div>
        
        {/* 대화 목록 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1">
          <p className="px-3 py-2 text-xs font-bold text-gray-500 uppercase">대화 기록</p>
          {sessions.map(session => (
            <div key={session.id} className="relative group">
              {editingSessionId === session.id ? (
                <div className="flex items-center gap-1 px-2 py-2 bg-gray-800 rounded-lg border border-blue-500">
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="flex-1 bg-transparent text-white text-sm outline-none min-w-0" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEditing()} />
                  <button onClick={saveEditing} className="text-green-500 hover:text-green-400"><CheckCircle size={14}/></button>
                  <button onClick={cancelEditing} className="text-gray-400 hover:text-gray-200"><X size={14}/></button>
                </div>
              ) : (
                // ✅ setCurrentView 대신 navigate 사용
                <button onClick={() => { setCurrentSessionId(session.id); navigate('/chat'); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition pr-8 ${(isView('/chat') && currentSessionId === session.id) ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50'}`}>
                  <MessageSquare size={16} /> <span className="truncate">{session.title}</span>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-gray-800 shadow-md rounded p-1">
                    <div onClick={(e) => { e.stopPropagation(); startEditing(session); }} className="p-1 hover:text-blue-400 cursor-pointer"><EditIcon size={12} /></div>
                    <div onClick={(e) => { e.stopPropagation(); if(confirm('삭제하시겠습니까?')) deleteSession(session.id); }} className="p-1 hover:text-red-400 cursor-pointer"><Trash2 size={12} /></div>
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 네비게이션 (✅ navigate로 변경) */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <button onClick={() => navigate('/home')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${isView('/home') ? 'bg-gray-800 text-white border border-gray-700' : 'hover:bg-gray-800 text-gray-200'}`}><Home size={18} /> <span>홈 (Dashboard)</span></button>
          <button onClick={() => navigate('/agent')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${isView('/agent') ? 'bg-indigo-900/40 text-indigo-400 border border-indigo-800' : 'hover:bg-gray-800 text-gray-200'}`}><Bot size={18} /> <span>에이전트 관리</span></button>
          <button onClick={() => navigate('/knowledge')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${isView('/knowledge') ? 'bg-purple-900/40 text-purple-400 border border-purple-800' : 'hover:bg-gray-800 text-gray-200'}`}><Database size={18} /> <span>지식 베이스 관리</span></button>
          {/* 설정 모달은 그대로 유지 */}
          <button onClick={() => setModalType('settings')} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800 rounded-lg text-sm transition text-gray-200"><Settings size={18} /> <span>시스템 설정</span></button>
        </div>

        {/* 사용자 프로필 (로그아웃 유지) */}
        <div className="p-4 bg-gray-950 border-t border-gray-800">
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                {user?.name?.[0].toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">{user?.name || 'User'}</div>
                <div className="text-xs text-gray-500 truncate">{user?.email || 'user@example.com'}</div>
              </div>
            </div>
            <button onClick={logout} className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition" title="로그아웃">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-white dark:bg-gray-900 relative min-w-0">
        <header className="h-14 border-b dark:border-gray-800 flex items-center justify-between px-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition group" onClick={() => navigate('/home')} title="홈으로 이동">
            <span className="font-bold text-gray-800 dark:text-gray-100 text-lg group-hover:text-blue-600 transition-colors">RAG AI</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${headerInfo.badgeColor}`}>{headerInfo.badge}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <div className={`w-2 h-2 rounded-full ${headerInfo.statusColor}`}></div> {headerInfo.status}
          </div>
        </header>

        {/* ✅ 여기가 핵심: 조건부 렌더링 대신 라우터의 Outlet 사용 */}
        <Outlet />
      </main>

      {/* 설정 모달 (기존 유지) */}
      <Modal isOpen={modalType === 'settings'} onClose={() => setModalType(null)} title="시스템 및 에이전트 설정" size="3xl">
        <AdvancedSettings />
      </Modal>
    </div>
  );
}