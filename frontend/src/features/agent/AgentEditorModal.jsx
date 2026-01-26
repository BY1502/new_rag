import React, { useState, useEffect } from 'react';
import { X, Bot, Save, Info, Cpu, FileText } from '../../components/ui/Icon';

export default function AgentEditorModal({ isOpen, onClose, onSave, initialData = null }) {
  if (!isOpen) return null;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    model: 'gemma3:12b',
    systemPrompt: '',
    published: true
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        description: initialData.description || '',
        model: initialData.model || 'gemma3:12b',
        systemPrompt: initialData.systemPrompt || '',
        published: initialData.published
      });
    } else {
      setFormData({ name: '', description: '', model: 'gemma3:12b', systemPrompt: '', published: true });
    }
  }, [initialData, isOpen]);

  const handleSubmit = () => {
    if (!formData.name.trim()) return alert('에이전트 이름을 입력해주세요.');
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden m-4 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Bot size={20} /></div>
            <h3 className="text-lg font-bold text-gray-800">{initialData ? '에이전트 편집' : '새 에이전트 생성'}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2"><Info size={16} className="text-gray-500"/> 기본 정보</h4>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">이름 <span className="text-red-500">*</span></label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="예: 고객 상담 봇" className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">설명</label>
                <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="이 에이전트의 역할과 기능을 설명하세요." className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none h-20" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2"><Cpu size={16} className="text-gray-500"/> 모델 설정</h4>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">LLM 모델</label>
              <select value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
                <option value="gemma3:12b">Gemma 3 (12B)</option>
                <option value="llama3:8b">Llama 3 (8B)</option>
                <option value="mistral:7b">Mistral (7B)</option>
              </select>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2"><FileText size={16} className="text-gray-500"/> 프롬프트 설정</h4>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">시스템 프롬프트</label>
              <textarea value={formData.systemPrompt} onChange={(e) => setFormData({...formData, systemPrompt: e.target.value})} placeholder="에이전트에게 부여할 페르소나나 지시사항을 입력하세요. (예: 당신은 친절한 여행 가이드입니다.)" className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none h-32" />
            </div>
          </section>

        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200 bg-white border border-gray-300 rounded-xl transition">취소</button>
          <button onClick={handleSubmit} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg transition flex items-center gap-2"><Save size={16} /> 저장하기</button>
        </div>
      </div>
    </div>
  );
}