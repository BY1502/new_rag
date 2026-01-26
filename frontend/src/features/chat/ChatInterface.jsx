import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../../contexts/StoreContext';
import { streamChat } from '../../api/client';
import { Bot, User, Sparkles, Send, Paperclip, ChevronDown, ChevronUp, X, Upload, Loader2, CheckCircle, Search, Database, FileText, Copy, RotateCw, Edit, StopCircle, Cpu, Globe, Brain, BookOpen, Plug } from '../../components/ui/Icon';

export default function ChatInterface() {
  const { currentMessages, addMessage, config, agents, currentAgent, setCurrentAgentId, knowledgeBases, currentKbId, setCurrentKbId, mcpServers } = useStore(); // ✅ mcpServers 추가
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [files, setFiles] = useState([]);
  
  // UI 상태
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [isKbMenuOpen, setIsKbMenuOpen] = useState(false);
  const [isMcpMenuOpen, setIsMcpMenuOpen] = useState(false); // ✅ MCP 메뉴 상태

  // 기능 토글
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useDeepThink, setUseDeepThink] = useState(false);
  
  // ✅ 활성화된 MCP 서버 ID들
  const [activeMcpIds, setActiveMcpIds] = useState([]);

  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const abortControllerRef = useRef(null);

  const currentKb = knowledgeBases.find(kb => kb.id === currentKbId) || knowledgeBases[0];

  useEffect(() => {
    const handleClickOutside = () => {
      setIsAgentMenuOpen(false);
      setIsKbMenuOpen(false);
      setIsMcpMenuOpen(false); // ✅ 외부 클릭 시 닫기
    };
    if(isAgentMenuOpen || isKbMenuOpen || isMcpMenuOpen) window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [isAgentMenuOpen, isKbMenuOpen, isMcpMenuOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [currentMessages, isTyping]);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...selectedFiles]);
    }
    e.target.value = '';
  };

  // ✅ MCP 토글 핸들러
  const toggleMcpServer = (id) => {
    setActiveMcpIds(prev => 
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const handleSend = async (retryQuery = null) => {
    const query = retryQuery || input;
    if (!query.trim() && files.length === 0) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    if (!retryQuery) {
      addMessage({ role: 'user', text: query, attachments: files.map(f => ({ name: f.name })) });
      setInput('');
      setFiles([]);
    }
    
    setIsTyping(true);

    const aiMessageId = crypto.randomUUID();
    let accumulatedText = "";
    
    const initialThinking = useDeepThink ? "사용자의 질문을 심층 분석하고 있습니다..." : null;

    addMessage({ 
      id: aiMessageId, 
      role: 'assistant', 
      text: "", 
      thinking: initialThinking, 
      thinkingTime: 0,
      sources: [] 
    });

    const startTime = Date.now();

    try {
      await streamChat({
        query: query,
        model: currentAgent?.model || config.llm,
        agent_id: currentAgent?.id,
        kb_id: currentKbId,
        web_search: useWebSearch,
        active_mcp_ids: activeMcpIds, // ✅ 활성 MCP 목록 전달
      }, (chunk) => {
        if (abortControllerRef.current?.signal.aborted) return;

        if (chunk.type === 'thinking') {
          useStore.setState(state => ({
            ...state,
            sessions: state.sessions.map(s => s.id === state.currentSessionId ? {
              ...s,
              messages: s.messages.map(m => m.id === aiMessageId ? { ...m, thinking: chunk.thinking } : m)
            } : s)
          }));
        } else if (chunk.type === 'content') {
          accumulatedText += chunk.content;
          const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          useStore.setState(state => ({
            ...state,
            sessions: state.sessions.map(s => s.id === state.currentSessionId ? {
              ...s,
              messages: s.messages.map(m => m.id === aiMessageId ? { ...m, text: accumulatedText, thinkingTime: timeElapsed } : m)
            } : s)
          }));
        }
      }, () => {
        setIsTyping(false);
        abortControllerRef.current = null;
      });
    } catch (error) {
      console.error(error);
      setIsTyping(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsTyping(false);
    }
  };

  const getAgentIcon = (id) => {
    switch(id) {
      case 'agent-general': return Sparkles;
      case 'agent-rag': return FileText;
      default: return Bot;
    }
  };

  const CurrentIcon = getAgentIcon(currentAgent?.id);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-gray-50/30">
      
      {/* 헤더 */}
      <div className="h-12 border-b bg-white flex items-center px-6 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3"></div>
      </div>

      {/* 메시지 리스트 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 custom-scrollbar scroll-smooth" ref={scrollRef}>
        {currentMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-6 opacity-80">
            <div className="w-20 h-20 bg-white shadow-sm border rounded-3xl flex items-center justify-center animate-in zoom-in duration-500">
                <CurrentIcon size={40} className={currentAgent?.id === 'agent-rag' ? "text-blue-600" : "text-indigo-500"} />
            </div>
            <div className="text-center">
                <h3 className="text-xl font-bold text-gray-800 mb-2">{currentAgent?.name}입니다.</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto px-4">{currentAgent?.description || "지식 베이스를 기반으로 정확하게 답변합니다."}</p>
            </div>
          </div>
        ) : (
          currentMessages.map((msg, idx) => (
            <MessageBubble key={msg.id} msg={msg} onRegenerate={() => handleSend(msg.role === 'assistant' && idx > 0 ? currentMessages[idx-1].text : null)} />
          ))
        )}
      </div>

      {/* 입력창 */}
      <div className="p-6 bg-white">
        <div className="max-w-4xl mx-auto relative">
          
          {isTyping && (
            <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-20">
              <button onClick={handleStop} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 shadow-md rounded-full text-sm text-red-500 hover:bg-red-50 font-medium transition animate-in fade-in slide-in-from-bottom-2"><StopCircle size={16} fill="currentColor" className="opacity-20"/> 생성 중단</button>
            </div>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all flex flex-col relative">
            
            {/* 상단 태그 영역 */}
            <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
              {/* 에이전트 선택 */}
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setIsAgentMenuOpen(!isAgentMenuOpen); setIsKbMenuOpen(false); setIsMcpMenuOpen(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition cursor-pointer">
                  <CurrentIcon size={12}/><span className="max-w-[100px] truncate">{currentAgent?.name}</span><ChevronDown size={10} className={`transition-transform ${isAgentMenuOpen ? 'rotate-180' : ''}`}/>
                </button>
                {isAgentMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Select Agent</div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {agents.map(agent => (
                        <button key={agent.id} onClick={() => { setCurrentAgentId(agent.id); setIsAgentMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition ${currentAgent?.id === agent.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                          <div className="w-5 h-5 rounded flex items-center justify-center bg-gray-100 text-gray-500"><getAgentIcon id={agent.id} size={12}/></div><div className="flex-1 truncate text-xs font-medium">{agent.name}</div>{currentAgent?.id === agent.id && <CheckCircle size={12} className="text-indigo-600"/>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 지식 베이스 선택 */}
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setIsKbMenuOpen(!isKbMenuOpen); setIsAgentMenuOpen(false); setIsMcpMenuOpen(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold transition cursor-pointer">
                  <Database size={12}/><span className="max-w-[100px] truncate">{currentKb?.name || '지식 베이스 없음'}</span><ChevronDown size={10} className={`transition-transform ${isKbMenuOpen ? 'rotate-180' : ''}`}/>
                </button>
                {isKbMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Select Knowledge Base</div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {knowledgeBases.map(kb => (
                        <button key={kb.id} onClick={() => { setCurrentKbId(kb.id); setIsKbMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition ${currentKbId === kb.id ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                          <Database size={14} className={currentKbId === kb.id ? 'text-emerald-600' : 'text-gray-400'}/><div className="flex-1 truncate text-xs font-medium">{kb.name}</div>{currentKbId === kb.id && <CheckCircle size={12} className="text-emerald-600"/>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 파일 태그 */}
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border rounded-lg text-[11px] font-medium text-gray-700 shadow-sm animate-in zoom-in duration-200">
                  <Paperclip size={10} className="text-gray-400"/><span className="max-w-[100px] truncate">{file.name}</span><button onClick={() => setFiles(p => p.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 ml-1"><X size={10} /></button>
                </div>
              ))}
            </div>

            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder={`${currentAgent?.name}에게 메시지를 입력하세요...`} className="w-full max-h-48 bg-transparent border-none outline-none resize-none px-4 py-2 text-sm custom-scrollbar leading-relaxed min-h-[48px]" rows={1} />

            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div className="flex items-center gap-1">
                
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-600 rounded-xl transition" title="파일 첨부"><Paperclip size={18}/></button>

                {/* 웹 검색 */}
                <button onClick={() => setUseWebSearch(!useWebSearch)} className={`p-2 rounded-xl transition flex items-center gap-1.5 ${useWebSearch ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`} title="웹 검색">
                  <Globe size={18} />{useWebSearch && <span className="text-xs font-bold">Search On</span>}
                </button>

                {/* ✅ MCP 도구 선택 메뉴 */}
                <div className="relative">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsMcpMenuOpen(!isMcpMenuOpen); setIsAgentMenuOpen(false); setIsKbMenuOpen(false); }}
                    className={`p-2 rounded-xl transition flex items-center gap-1.5 ${activeMcpIds.length > 0 || isMcpMenuOpen ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`} 
                    title="MCP 도구"
                  >
                    <Plug size={18} />
                    {activeMcpIds.length > 0 && <span className="text-xs font-bold">{activeMcpIds.length} Tools</span>}
                  </button>

                  {isMcpMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Available MCP Tools</div>
                      <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                        {mcpServers.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">연결된 MCP 서버가 없습니다.<br/>설정에서 추가해주세요.</div>
                        ) : (
                          mcpServers.map(server => {
                            const isActive = activeMcpIds.includes(server.id);
                            return (
                              <button key={server.id} onClick={(e) => { e.stopPropagation(); toggleMcpServer(server.id); }} className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 transition">
                                <div className={`w-4 h-4 border rounded flex items-center justify-center transition ${isActive ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                                  {isActive && <CheckCircle size={10} className="text-white"/>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold text-gray-800 truncate">{server.name}</div>
                                  <div className="text-[10px] text-gray-400 truncate">{server.status}</div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 딥 씽킹 & 모델 정보 */}
                <div className="flex items-center bg-gray-100 rounded-xl p-0.5 ml-1">
                  <button onClick={() => setUseDeepThink(!useDeepThink)} className={`p-1.5 rounded-lg transition flex items-center gap-1.5 ${useDeepThink ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Deep Thinking">
                    <Brain size={18} />
                  </button>
                  <div className="px-2 text-[10px] font-mono text-gray-500 border-l border-gray-200">{currentAgent?.model || config.llm}</div>
                </div>

              </div>
              <button onClick={() => handleSend()} disabled={(!input.trim() && files.length === 0) || isTyping} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm shadow-sm ${(input.trim() || files.length > 0) && !isTyping ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                {isTyping ? <Loader2 size={16} className="animate-spin"/> : <Send size={16} fill="currentColor" />} <span>전송</span>
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-2">WeKnora AI can make mistakes. Check important info.</p>
        </div>
      </div>
    </div>
  );
}