import React, { useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  MessageSquare, Settings, Bot, Plus, LogOut, 
  Database, FileText, Loader2 
} from 'lucide-react';

export default function Sidebar({ files = [], onUpload, uploading, kbId, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);

  const isActive = (path) => location.pathname === path;

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-full shrink-0">
      {/* 로고 */}
      <div className="p-5 flex items-center gap-3 border-b border-gray-800">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <Bot size={20} className="text-white"/>
        </div>
        <h1 className="text-lg font-bold">RAG AI</h1>
      </div>

      {/* 메뉴 링크 (라우터 연동) */}
      <div className="p-3 space-y-1">
        <button onClick={() => navigate('/home')} 
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive('/home') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
          <MessageSquare size={18}/> <span>채팅 (Chat)</span>
        </button>
        <button onClick={() => navigate('/agents')} 
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive('/agents') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
          <Bot size={18}/> <span>에이전트 (Agents)</span>
        </button>
        <button onClick={() => navigate('/settings')} 
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive('/settings') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
          <Settings size={18}/> <span>설정 (Settings)</span>
        </button>
      </div>

      {/* 지식 베이스 (파일 업로드 기능 복구) */}
      <div className="flex-1 overflow-y-auto px-3 py-4 border-t border-gray-800">
        <div className="flex justify-between items-center mb-3 px-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Knowledge Base</span>
          <button 
            onClick={() => fileInputRef.current.click()} 
            disabled={uploading}
            className="text-gray-400 hover:text-white transition"
          >
            {uploading ? <Loader2 size={14} className="animate-spin"/> : <Plus size={16}/>}
          </button>
          <input type="file" ref={fileInputRef} onChange={(e) => onUpload(e.target.files[0])} className="hidden" />
        </div>

        <div className="space-y-1">
          {files.length === 0 ? (
            <div className="text-xs text-gray-600 text-center py-2">파일이 없습니다.</div>
          ) : (
            files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-2 bg-gray-800/50 rounded-lg group">
                <FileText size={14} className="text-indigo-400"/> 
                <span className="text-xs text-gray-300 truncate flex-1">{f.filename}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 로그아웃 버튼 복구 */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/50">
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition">
          <LogOut size={18}/> <span>로그아웃</span>
        </button>
      </div>
    </div>
  );
}