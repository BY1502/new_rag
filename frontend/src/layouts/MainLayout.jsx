import React, { useState, useEffect } from 'react';
import { useStore } from '../contexts/StoreContext';
import { AuthProvider, useAuth } from '../contexts/AuthContext'; // ✅ AuthProvider import
import { MessageSquare, Plus, Database, Settings, Video, MoreHorizontal, Trash2, FileText as EditIcon, X, CheckCircle, Upload, Bot, Home, LayoutDashboard, UserCircle, LogOut } from '../components/ui/Icon';
import KnowledgeManager from '../features/knowledge/KnowledgeManager';
import AdvancedSettings from '../features/settings/AdvancedSettings';
import ChatInterface from '../features/chat/ChatInterface';
import VideoAnalysis from '../features/video/VideoAnalysis';
import AgentList from '../features/agent/AgentList';
import HomeDashboard from '../features/home/HomeDashboard';
import AuthPage from '../features/auth/AuthPage'; // ✅ AuthPage import
import { Modal } from '../components/ui/Modal';

// 내부 컨텐츠 컴포넌트 (AuthContext 내부에서 사용)
function AppContent() {
  const { user, logout, isAuthenticated } = useAuth(); // ✅ Auth Hook 사용
  const { sessions, currentSessionId, setCurrentSessionId, createNewSession, renameSession, deleteSession, currentView, setCurrentView } = useStore();
  const [modalType, setModalType] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  // ✅ 로그인이 안되어 있으면 로그인 페이지 렌더링
  if (!isAuthenticated) {
    return <AuthPage />;
  }

  const startEditing = (session) => { setEditingSessionId(session.id); setEditTitle(session.title); };
  const saveEditing = () => { if (editingSessionId && editTitle.trim()) renameSession(editingSessionId, editTitle); setEditingSessionId(null); };
  const cancelEditing = () => { setEditingSessionId(null); };

  const getHeaderInfo = () => {
    switch (currentView) {
      case 'home': return { badge: 'Dashboard', badgeColor: 'bg-gray-100 text-gray-700 border-gray-200', status: 'Online', statusColor: 'bg-green-500' };
      case 'knowledge': return { badge: 'Knowledge OS', badgeColor: 'bg-purple-50 text-purple-700 border-purple-100', status: 'System Ready', statusColor: 'bg-purple-500' };
      case 'video': return { badge: 'Live Vision Mode', badgeColor: 'bg-red-50 text-red-700 border-red-100', status: 'Recording', statusColor: 'bg-red-500 animate-pulse' };
      case 'agent': return { badge: 'Agent Manager', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100', status: 'Managing', statusColor: 'bg-indigo-500' };
      default: return { badge: 'Agent Mode', badgeColor: 'bg-blue-50 text-blue-700 border-blue-100', status: 'Online', statusColor: 'bg-green-500' };
    }
  };
  const headerInfo = getHeaderInfo();

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans relative">
      {isGlobalDragging && (
        <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-3xl animate-in fade-in duration-200 pointer-events-none">
          <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-4 animate-bounce"><Upload size={40} className="text-blue-600" /></div>
          <h2 className="text-2xl font-bold text-gray-800">파일을 여기에 놓으세요</h2><p className="text-gray-500 mt-2">지식 베이스 관리 페이지로 이동합니다</p>
        </div>
      )}

      <aside className="w-[260px] bg-gray-900 text-gray-300 flex flex-col shrink-0 transition-all duration-300">
        <div className="p-4">
          <button onClick={createNewSession} className="w-full flex items-center gap-2 px-3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-md">
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
                <button onClick={() => { setCurrentSessionId(session.id); setCurrentView('chat'); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition pr-8 ${(currentView === 'chat' && currentSessionId === session.id) ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50'}`}>
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

        {/* 네비게이션 */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <button onClick={() => setCurrentView('home')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${currentView === 'home' ? 'bg-gray-800 text-white border border-gray-700' : 'hover:bg-gray-800 text-gray-200'}`}><Home size={18} /> <span>홈 (Dashboard)</span></button>
          <button onClick={() => setCurrentView('agent')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${currentView === 'agent' ? 'bg-indigo-900/40 text-indigo-400 border border-indigo-800' : 'hover:bg-gray-800 text-gray-200'}`}><Bot size={18} /> <span>에이전트 관리</span></button>
          <button onClick={() => setCurrentView('video')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${currentView === 'video' ? 'bg-blue-900/40 text-blue-400 border border-blue-800' : 'hover:bg-gray-800 text-gray-200'}`}><Video size={18} /> <span>실시간 영상 분석</span></button>
          <button onClick={() => setCurrentView('knowledge')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${currentView === 'knowledge' ? 'bg-purple-900/40 text-purple-400 border border-purple-800' : 'hover:bg-gray-800 text-gray-200'}`}><Database size={18} /> <span>지식 베이스 관리</span></button>
          <button onClick={() => setModalType('settings')} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800 rounded-lg text-sm transition text-gray-200"><Settings size={18} /> <span>시스템 설정</span></button>
        </div>

        {/* ✅ 사용자 프로필 (로그아웃 포함) */}
        <div className="p-4 bg-gray-950 border-t border-gray-800">
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                {user.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">{user.name}</div>
                <div className="text-xs text-gray-500 truncate">{user.email}</div>
              </div>
            </div>
            <button onClick={logout} className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition" title="로그아웃">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-white relative min-w-0">
        <header className="h-14 border-b flex items-center justify-between px-6 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition group" onClick={() => setCurrentView('home')} title="홈으로 이동">
            <span className="font-bold text-gray-800 text-lg group-hover:text-blue-600 transition-colors">RAG AI</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${headerInfo.badgeColor}`}>{headerInfo.badge}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <div className={`w-2 h-2 rounded-full ${headerInfo.statusColor}`}></div> {headerInfo.status}
          </div>
        </header>

        {currentView === 'home' && <HomeDashboard />}
        {currentView === 'chat' && <ChatInterface />}
        {currentView === 'video' && <VideoAnalysis />}
        {currentView === 'agent' && <div className="flex-1 overflow-hidden p-6 bg-gray-50/50"><div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"><AgentList /></div></div>}
        {currentView === 'knowledge' && <div className="flex-1 overflow-hidden p-6 bg-gray-50/50"><div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"><KnowledgeManager /></div></div>}
      </main>

      <Modal isOpen={modalType === 'settings'} onClose={() => setModalType(null)} title="시스템 및 에이전트 설정" size="3xl">
        <AdvancedSettings />
      </Modal>
    </div>
  );
}

// ✅ MainLayout이 AuthProvider를 감싸도록 변경
export default function MainLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}