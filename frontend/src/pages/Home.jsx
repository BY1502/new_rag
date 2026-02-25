import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react'; // 아이콘 경로 수정
import { chatAPI } from '../api';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef(null);
  const kbId = "default_kb";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isGenerating) return;

    const userMsg = { id: Date.now(), role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage("");
    setIsGenerating(true);

    const botMsgId = Date.now() + 1;
    setMessages(prev => [...prev, { id: botMsgId, role: 'ai', content: '', thinking: '' }]);

    let fullContent = "";
    await chatAPI.streamChat(
        userMsg.content,
        kbId,
        (chunk) => {
            if (chunk.type === 'thinking') {
                setMessages(prev => prev.map(msg => msg.id === botMsgId ? { ...msg, thinking: chunk.thinking } : msg));
            } else if (chunk.type === 'content') {
                fullContent += chunk.content;
                setMessages(prev => prev.map(msg => msg.id === botMsgId ? { ...msg, content: fullContent } : msg));
            }
        },
        (error) => {
            console.error(error);
            setMessages(prev => prev.map(msg => msg.id === botMsgId ? { ...msg, content: "오류가 발생했습니다." } : msg));
        }
    );
    setIsGenerating(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <Bot className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">문서를 업로드하고 질문을 시작해보세요!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-gray-600' : 'bg-green-500'}`}>
                  {msg.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  {msg.thinking && (
                      <div className="text-xs text-gray-500 italic bg-white p-3 rounded-lg border border-gray-100 shadow-sm animate-pulse mb-1">
                         Thinking: {msg.thinking}
                      </div>
                  )}
                  <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                      msg.role === 'user' 
                      ? 'bg-green-500 text-white rounded-tr-none' 
                      : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
                    }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative flex items-center">
          <input 
            type="text" 
            value={inputMessage} 
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="질문을 입력하세요..."
            className="w-full pl-5 pr-14 py-4 bg-gray-100 border-none rounded-full focus:ring-2 focus:ring-green-400 focus:bg-white transition-all shadow-inner text-gray-700" 
            disabled={isGenerating} 
          />
          <button type="submit" className="absolute right-3 p-2 bg-green-500 text-white rounded-full shadow-md">
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}