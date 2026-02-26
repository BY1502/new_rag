import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useStore } from '../contexts/StoreContext';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageSquare, Plus, Database, Settings, Trash2,
  FileText as EditIcon, X, CheckCircle, Upload, Bot,
  Home, LogOut, Sparkles, GraduationCap, ChevronLeft, ChevronRight, BookOpen
} from '../components/ui/Icon';
import AdvancedSettings from '../features/settings/AdvancedSettings';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import CommandPalette from '../components/CommandPalette';
import KeyboardShortcuts from '../components/KeyboardShortcuts';

export default function MainLayout() {
  const { user, logout, isAuthenticated } = useAuth();
  const { sessions, currentSessionId, setCurrentSessionId, createNewSession, renameSession, deleteSession, knowledgeBases, agents, config, setConfig } = useStore();
  const { confirm } = useToast();
  const [modalType, setModalType] = useState(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // 글로벌 단축키
  useEffect(() => {
    const navRoutes = ['/home', '/chat', '/knowledge', '/agent', '/training', '/guide'];
    const handler = (e) => {
      const tag = e.target.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;

      // Ctrl+K: Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        return;
      }
      // Ctrl+N: New chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        createNewSession();
        navigate('/chat');
        return;
      }
      // Ctrl+Shift+W/D/S: Feature toggles
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (e.key === 'W' || e.key === 'w') { e.preventDefault(); setConfig({ ...config, useWebSearch: !config.useWebSearch }); return; }
        if (e.key === 'D' || e.key === 'd') { e.preventDefault(); setConfig({ ...config, useDeepThink: !config.useDeepThink }); return; }
        if (e.key === 'S' || e.key === 's') { e.preventDefault(); setConfig({ ...config, useSql: !config.useSql }); return; }
      }
      // Alt+1~6: Navigation
      if (e.altKey && e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        navigate(navRoutes[parseInt(e.key) - 1]);
        return;
      }
      // ? key (not in input): Show shortcuts
      if (!isInput && e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [config, navigate, createNewSession, setConfig]);

  const handlePaletteAction = (action) => {
    if (action === 'new-chat') { createNewSession(); navigate('/chat'); }
    else if (action.startsWith('navigate:')) navigate(action.split(':')[1]);
    else if (action.startsWith('session:')) { setCurrentSessionId(action.split(':')[1]); navigate('/chat'); }
    else if (action.startsWith('agent:')) { navigate('/chat'); }
    else if (action === 'open-settings') setModalType('settings');
    else if (action === 'toggle-web') setConfig({ ...config, useWebSearch: !config.useWebSearch });
    else if (action === 'toggle-deep-think') setConfig({ ...config, useDeepThink: !config.useDeepThink });
    else if (action === 'toggle-sql') setConfig({ ...config, useSql: !config.useSql });
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const startEditing = (session) => { setEditingSessionId(session.id); setEditTitle(session.title); };
  const saveEditing = () => { if (editingSessionId && editTitle.trim()) renameSession(editingSessionId, editTitle); setEditingSessionId(null); };
  const cancelEditing = () => { setEditingSessionId(null); };

  const isView = (path) => location.pathname.includes(path);
  const isChatPage = isView('/chat');

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Drag & Drop Overlay */}
      {isGlobalDragging && (
        <div className="fixed inset-0 z-[100] bg-gray-50/95 flex flex-col items-center justify-center border-4 border-green-400 border-dashed m-6 rounded-2xl animate-in fade-in duration-300 pointer-events-none">
          <div className="w-24 h-24 bg-green-400 rounded-2xl flex items-center justify-center shadow-lg animate-bounce">
            <Upload size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mt-6 mb-2">파일을 여기에 놓으세요</h2>
          <p className="text-gray-600">지식 베이스로 이동합니다...</p>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-20 animate-slideDown">
        {/* Logo */}
        <div
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-all hover:scale-[1.02]"
          onClick={() => navigate('/home')}
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
            <Sparkles size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">RAG AI</h1>
            <p className="text-[10px] text-gray-500 -mt-0.5">Powered by Claude</p>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="flex items-center gap-2">
          <NavTab
            icon={Home}
            label="홈"
            active={isView('/home')}
            onClick={() => navigate('/home')}
          />
          <NavTab
            icon={MessageSquare}
            label="채팅"
            active={isView('/chat')}
            onClick={() => {
              if (!isChatPage && sessions.length > 0) {
                setCurrentSessionId(sessions[0].id);
              }
              navigate('/chat');
            }}
            badge={sessions.length > 0 ? sessions.length : null}
          />
          <NavTab
            icon={Database}
            label="지식 베이스"
            active={isView('/knowledge')}
            onClick={() => navigate('/knowledge')}
          />
          <NavTab
            icon={Bot}
            label="에이전트"
            active={isView('/agent')}
            onClick={() => navigate('/agent')}
          />
          <NavTab
            icon={GraduationCap}
            label="학습"
            active={isView('/training') || isView('/finetuning')}
            onClick={() => navigate('/training')}
          />
          <NavTab
            icon={BookOpen}
            label="가이드"
            active={isView('/guide')}
            onClick={() => navigate('/guide')}
          />
          <NavTab
            icon={Settings}
            label="설정"
            active={false}
            onClick={() => setModalType('settings')}
          />
        </nav>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {/* New Chat Button (visible only on non-chat pages) */}
          {!isChatPage && (
            <button
              onClick={() => { createNewSession(); navigate('/chat'); }}
              className="flex items-center gap-2 px-4 py-2 bg-green-400 hover:bg-green-500 text-white rounded-lg font-medium text-sm transition-all hover:scale-105 active:scale-95 shadow-sm"
            >
              <Plus size={16} />
              <span>새 대화</span>
            </button>
          )}

          {/* User Profile Dropdown */}
          <div className="flex items-center gap-2.5 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm shadow-sm group-hover:scale-110 transition-transform">
              {user?.name?.[0].toUpperCase() || 'U'}
            </div>
            <div className="hidden md:block">
              <div className="text-sm font-semibold text-gray-900">{user?.name || 'User'}</div>
              <div className="text-xs text-gray-500">{user?.email?.split('@')[0] || 'user'}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); logout(); }}
              className="ml-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg hover:scale-110 active:scale-95 transition-all"
              title="로그아웃"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (only on chat page) */}
        {isChatPage && (
          <aside
            className={`bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-300 ${
              sidebarCollapsed ? 'w-0' : 'w-[280px]'
            } overflow-hidden`}
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">대화 목록</h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">{sessions.length}</span>
              </div>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all hover:scale-110"
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            {/* New Chat Button */}
            <div className="p-3 border-b border-gray-200">
              <button
                onClick={() => { createNewSession(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-400 hover:bg-green-500 text-white rounded-lg font-medium text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-sm"
              >
                <Plus size={18} />
                <span>새 대화</span>
              </button>
            </div>

            {/* Chat Sessions List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1">
              {sessions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">대화가 없습니다</p>
                </div>
              ) : (
                sessions.map((session, idx) => (
                  <div key={session.id} className={`relative group animate-slideUp animate-stagger-${Math.min(idx % 4 + 1, 4)}`}>
                    {editingSessionId === session.id ? (
                      <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-300">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 bg-white border border-gray-300 text-gray-900 text-sm outline-none min-w-0 px-2 py-1 rounded focus:ring-2 focus:ring-green-400 transition-all"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && saveEditing()}
                        />
                        <button onClick={saveEditing} className="p-1 text-green-500 hover:text-green-600 hover:scale-110 transition-all">
                          <CheckCircle size={16}/>
                        </button>
                        <button onClick={cancelEditing} className="p-1 text-gray-400 hover:text-gray-600 hover:scale-110 transition-all">
                          <X size={16}/>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setCurrentSessionId(session.id)}
                        className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all group/btn ${
                          currentSessionId === session.id
                            ? 'bg-gray-50 text-gray-700 font-medium border border-gray-200'
                            : 'text-gray-700 hover:bg-gray-100 hover:scale-[1.02]'
                        }`}
                      >
                        <MessageSquare size={16} className={`${currentSessionId === session.id ? 'text-gray-600' : 'text-gray-400'} transition-all`} />
                        <span className="truncate flex-1 text-left">{session.title}</span>

                        <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-md p-0.5 shadow-sm">
                          <div
                            onClick={(e) => { e.stopPropagation(); startEditing(session); }}
                            className="p-1.5 hover:text-gray-600 hover:bg-gray-50 rounded transition-all hover:scale-110 cursor-pointer"
                          >
                            <EditIcon size={13} />
                          </div>
                          <div
                            onClick={(e) => { e.stopPropagation(); confirm('이 대화를 삭제하시겠습니까?', () => deleteSession(session.id), { confirmLabel: '삭제' }); }}
                            className="p-1.5 hover:text-red-600 hover:bg-red-50 rounded transition-all hover:scale-110 cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Sidebar Toggle Button (when collapsed) */}
        {isChatPage && sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="absolute left-0 top-20 bg-white border border-gray-200 rounded-r-lg p-2 hover:bg-gray-50 transition-all hover:scale-110 z-10 shadow-sm"
          >
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col bg-white relative min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* Settings Modal */}
      <Modal isOpen={modalType === 'settings'} onClose={() => setModalType(null)} title="System Settings" size="3xl">
        <AdvancedSettings />
      </Modal>

      {/* Keyboard Shortcuts */}
      <KeyboardShortcuts isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        sessions={sessions}
        knowledgeBases={knowledgeBases}
        agents={agents}
        onAction={handlePaletteAction}
      />
    </div>
  );
}

// Navigation Tab Component
function NavTab({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 ${
        active
          ? 'bg-green-50 text-green-600 shadow-sm'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={18} className={`${active ? 'text-green-500' : 'text-gray-400'} transition-transform`} />
      <span className="hidden md:inline">{label}</span>
      {badge !== null && badge !== undefined && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm animate-pulse">
          {badge}
        </span>
      )}
    </button>
  );
}
