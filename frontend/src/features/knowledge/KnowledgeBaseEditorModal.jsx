import React, { useState, useEffect } from 'react';
import { X, Database, Settings, Info, Save, Layers, Cpu, Server } from '../../components/ui/Icon';
import { externalServicesAPI } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export default function KnowledgeBaseEditorModal({ isOpen, onClose, onSave, initialData = null }) {
  const { toast } = useToast();
  if (!isOpen) return null;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    embeddingModel: 'bge-m3',
    chunkSize: 512,
    chunkOverlap: 50,
    externalServiceId: ''
  });
  const [qdrantServices, setQdrantServices] = useState([]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        description: initialData.description || '',
        embeddingModel: initialData.config?.embeddingModel || 'bge-m3',
        chunkSize: initialData.config?.chunkSize || 512,
        chunkOverlap: initialData.config?.chunkOverlap || 50,
        externalServiceId: initialData.externalServiceId || ''
      });
    } else {
      setFormData({ name: '', description: '', embeddingModel: 'bge-m3', chunkSize: 512, chunkOverlap: 50, externalServiceId: '' });
    }
  }, [initialData, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    externalServicesAPI.list().then(res => {
      const qdrant = (res.services || []).filter(s => s.service_type === 'qdrant');
      setQdrantServices(qdrant);
    });
  }, [isOpen]);

  const handleSubmit = () => {
    if (!formData.name.trim()) return toast.warning('지식 베이스 이름을 입력해주세요.');
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden m-4 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gray-100 text-gray-600 rounded-lg">
              <Database size={20} />
            </div>
            <h3 className="text-lg font-bold text-gray-800">
              {initialData ? '지식 베이스 수정' : '새 지식 베이스 생성'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        {/* 바디 (스크롤 가능) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* 1. 기본 정보 섹션 */}
          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2">
              <Info size={16} className="text-gray-500"/> 기본 정보
            </h4>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">이름 <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="예: 프로젝트 매뉴얼, 회사 규정집"
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none transition text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">설명</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="이 지식 베이스에 대한 간단한 설명을 입력하세요."
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 outline-none transition text-sm resize-none h-20"
                />
              </div>
            </div>
          </section>

          {/* 2. 임베딩 모델 설정 */}
          <section className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2">
              <Cpu size={16} className="text-gray-500"/> AI 모델 설정
            </h4>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Embedding Model</label>
              <div className="relative">
                <select 
                  value={formData.embeddingModel}
                  onChange={(e) => setFormData({...formData, embeddingModel: e.target.value})}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 outline-none bg-white text-sm appearance-none cursor-pointer hover:border-gray-400 transition"
                >
                  <option value="bge-m3">BAAI/bge-m3 (Recommended)</option>
                  <option value="text-embedding-3-small">OpenAI/text-embedding-3-small</option>
                  <option value="ko-sbert-nli">KR/ko-sbert-nli</option>
                </select>
                <div className="absolute right-3 top-3 pointer-events-none text-gray-400">
                  <Settings size={14} />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1.5 ml-1">문서의 의미를 벡터로 변환하는 모델입니다. 생성 후에는 변경할 수 없습니다.</p>
            </div>
          </section>

          {/* 3. 청킹 설정 */}
          <section className="space-y-6">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2">
              <Layers size={16} className="text-gray-500"/> 청킹(Chunking) 설정
            </h4>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-gray-700">Chunk Size</label>
                  <span className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-0.5 rounded">{formData.chunkSize}</span>
                </div>
                <input 
                  type="range" min="128" max="2048" step="64" 
                  value={formData.chunkSize} 
                  onChange={(e) => setFormData({...formData, chunkSize: Number(e.target.value)})}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
                <p className="text-[10px] text-gray-400">문서를 자르는 크기입니다. (Token 단위)</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-gray-700">Chunk Overlap</label>
                  <span className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-0.5 rounded">{formData.chunkOverlap}</span>
                </div>
                <input 
                  type="range" min="0" max="200" step="10" 
                  value={formData.chunkOverlap} 
                  onChange={(e) => setFormData({...formData, chunkOverlap: Number(e.target.value)})}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
                <p className="text-[10px] text-gray-400">문맥 유지를 위한 중첩 구간입니다.</p>
              </div>
            </div>
          </section>

          {/* 4. 벡터 DB 설정 */}
          {qdrantServices.length > 0 && (
            <section className="space-y-4">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2">
                <Server size={16} className="text-gray-500"/> 벡터 DB 설정
              </h4>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Qdrant 서비스</label>
                <div className="relative">
                  <select
                    value={formData.externalServiceId}
                    onChange={(e) => setFormData({...formData, externalServiceId: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 outline-none bg-white text-sm appearance-none cursor-pointer hover:border-gray-400 transition"
                  >
                    <option value="">기본 (로컬 Qdrant)</option>
                    {qdrantServices.map(svc => (
                      <option key={svc.service_id} value={svc.service_id}>
                        {svc.name} ({svc.url})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-3 pointer-events-none text-gray-400">
                    <Settings size={14} />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1.5 ml-1">문서 벡터를 저장할 Qdrant 서비스를 선택합니다. 외부 서비스 미선택 시 로컬 Qdrant를 사용합니다.</p>
              </div>
            </section>
          )}

        </div>

        {/* 푸터 */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200 bg-white border border-gray-300 rounded-xl transition"
          >
            취소
          </button>
          <button 
            onClick={handleSubmit}
            className="px-5 py-2.5 text-sm font-bold text-white bg-green-500 hover:bg-green-600 rounded-xl shadow-lg shadow-green-100 transition flex items-center gap-2"
          >
            <Save size={16} /> {initialData ? '저장하기' : '생성하기'}
          </button>
        </div>
      </div>
    </div>
  );
}