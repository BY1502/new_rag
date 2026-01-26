import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { uploadFileToBackend } from '../../api/client'; // ✅ API 함수 import
import { Upload, FileText, Trash2, CheckCircle, Database, Plus, Settings, AlertCircle, Loader2, Search, Sliders, Info, Brain, AlignJustify, Split, ArrowLeft, FolderUp, Clock, Share2, Network, GitBranch } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';

export default function KnowledgeManager() {
  const { knowledgeBases, currentKbId, setCurrentKbId, addFilesToKb, updateFileStatusInKb, updateKbConfig, setKnowledgeBases, removeFileFromKb } = useStore();
  
  const [viewMode, setViewMode] = useState('list');
  const [activeTab, setActiveTab] = useState('files');
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const [kbForm, setKbForm] = useState({ name: '', description: '', chunkingMethod: 'fixed', chunkSize: 512, chunkOverlap: 50, semanticThreshold: 0.75 });

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  
  const currentKb = knowledgeBases.find(kb => kb.id === currentKbId);
  const currentFiles = currentKb?.files || [];

  const handleSelectKb = (id) => { setCurrentKbId(id); setViewMode('detail'); setActiveTab('files'); };
  const handleDragOver = (e) => { e.preventDefault(); setIsUploadDragging(true); };
  const handleDragLeave = () => setIsUploadDragging(false);
  const handleDrop = (e) => { e.preventDefault(); setIsUploadDragging(false); handleFiles(Array.from(e.dataTransfer.files)); };

  // ✅ 파일 처리 핸들러 (실제 백엔드 전송)
  const handleFiles = async (files) => {
    // 1. UI에 먼저 표시 (Uploading 상태)
    const newFiles = files.map(file => ({ 
      id: crypto.randomUUID(), 
      name: file.name, 
      size: (file.size / 1024).toFixed(1) + ' KB', 
      type: file.type || 'Unknown', 
      status: 'uploading', 
      progress: 0,
      rawFile: file // 실제 파일 객체 보관
    }));
    addFilesToKb(newFiles);

    // 2. 백엔드로 하나씩 전송
    for (const fileItem of newFiles) {
      try {
        updateFileStatusInKb(fileItem.id, 'processing');
        
        // API 호출
        await uploadFileToBackend(
          fileItem.rawFile, 
          currentKbId, 
          currentKb.config?.chunkSize || 512, 
          currentKb.config?.chunkOverlap || 50
        );

        updateFileStatusInKb(fileItem.id, 'ready');
      } catch (error) {
        console.error("Upload Error:", error);
        updateFileStatusInKb(fileItem.id, 'error'); // 에러 상태 (UI에 빨간색 표시 필요)
      }
    }
  };

  const openCreateModal = () => { setKbForm({ name: '', description: '', chunkingMethod: 'fixed', chunkSize: 512, chunkOverlap: 50, semanticThreshold: 0.75 }); setIsCreateOpen(true); };
  const openConfigModal = () => { if (!currentKb) return; setKbForm({ name: currentKb.name, description: currentKb.description, chunkingMethod: currentKb.config?.chunkingMethod || 'fixed', chunkSize: currentKb.config?.chunkSize || 512, chunkOverlap: currentKb.config?.chunkOverlap || 50, semanticThreshold: currentKb.config?.semanticThreshold || 0.75 }); setIsConfigOpen(true); };
  
  const handleSaveKb = (isNew) => {
    if (!kbForm.name.trim()) return alert('이름을 입력해주세요.');
    const newKbData = { name: kbForm.name, description: kbForm.description, config: { chunkingMethod: kbForm.chunkingMethod, chunkSize: kbForm.chunkSize, chunkOverlap: kbForm.chunkOverlap, semanticThreshold: kbForm.semanticThreshold } };
    if (isNew) { setKnowledgeBases(prev => [...prev, { id: crypto.randomUUID(), files: [], created_at: new Date().toLocaleDateString(), ...newKbData }]); setIsCreateOpen(false); } 
    else { setKnowledgeBases(prev => prev.map(kb => kb.id === currentKbId ? { ...kb, ...newKbData } : kb)); setIsConfigOpen(false); }
  };
  const handleDeleteKb = () => { if (knowledgeBases.length <= 1) return alert('최소 하나는 있어야 합니다.'); if (confirm('삭제하시겠습니까?')) { const newKbs = knowledgeBases.filter(kb => kb.id !== currentKbId); setKnowledgeBases(newKbs); setCurrentKbId(newKbs[0].id); setViewMode('list'); setIsConfigOpen(false); } };

  const GraphView = () => (
    <div className="h-full flex flex-col relative bg-gray-900 overflow-hidden">
      <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md p-3 rounded-xl border border-gray-700 text-white text-xs">
        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Person</div><div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Organization</div><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Document</div>
      </div>
      <svg className="w-full h-full animate-in fade-in duration-1000">
        <g className="animate-pulse opacity-50"><line x1="40%" y1="40%" x2="60%" y2="60%" stroke="#4B5563" strokeWidth="1" /><line x1="40%" y1="40%" x2="30%" y2="70%" stroke="#4B5563" strokeWidth="1" /><line x1="60%" y1="60%" x2="70%" y2="30%" stroke="#4B5563" strokeWidth="1" /></g>
        <circle cx="40%" cy="40%" r="20" fill="#3B82F6" className="animate-bounce" style={{animationDuration: '3s'}}/><circle cx="60%" cy="60%" r="15" fill="#10B981" /><circle cx="30%" cy="70%" r="10" fill="#EAB308" /><circle cx="70%" cy="30%" r="25" fill="#3B82F6" />
        <text x="40%" y="45%" textAnchor="middle" fill="white" fontSize="10" dy="15">Elon</text><text x="60%" y="65%" textAnchor="middle" fill="white" fontSize="10" dy="15">OpenAI</text>
      </svg>
      <div className="absolute bottom-6 right-6 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg flex items-center gap-2"><Loader2 size={16} className="animate-spin text-purple-400"/> Building Graph Index...</div>
    </div>
  );

  const renderConfigForm = () => (
    <div className="space-y-6">
      <div className="space-y-4"><div><label className="block text-xs font-bold text-gray-700 mb-1.5">이름</label><input type="text" value={kbForm.name} onChange={e => setKbForm({...kbForm, name: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"/></div><div><label className="block text-xs font-bold text-gray-700 mb-1.5">설명</label><textarea value={kbForm.description} onChange={e => setKbForm({...kbForm, description: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none h-20"/></div></div>
      <div className="border-t border-gray-100 pt-4 space-y-4">
        <label className="block text-sm font-bold text-gray-800 flex items-center gap-2"><Sliders size={16}/> 청킹(Chunking) 전략</label>
        <div className="grid grid-cols-2 gap-4">
          <div onClick={() => setKbForm({...kbForm, chunkingMethod: 'fixed'})} className={`p-4 border-2 rounded-xl cursor-pointer transition-all flex flex-col items-center gap-2 text-center ${kbForm.chunkingMethod === 'fixed' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}><div className={`p-2 rounded-full ${kbForm.chunkingMethod === 'fixed' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}><AlignJustify size={20}/></div><div><div className="font-bold text-sm text-gray-800">고정 크기</div><div className="text-[10px] text-gray-500">Fixed Size</div></div></div>
          <div onClick={() => setKbForm({...kbForm, chunkingMethod: 'semantic'})} className={`p-4 border-2 rounded-xl cursor-pointer transition-all flex flex-col items-center gap-2 text-center ${kbForm.chunkingMethod === 'semantic' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}><div className={`p-2 rounded-full ${kbForm.chunkingMethod === 'semantic' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}><Brain size={20}/></div><div><div className="font-bold text-sm text-gray-800">의미 기반</div><div className="text-[10px] text-gray-500">Semantic</div></div></div>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
          {kbForm.chunkingMethod === 'fixed' ? (
            <><div><div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-600">Chunk Size (Token)</label><span className="text-xs font-mono bg-white px-1.5 rounded border">{kbForm.chunkSize}</span></div><input type="range" min="128" max="2048" step="128" value={kbForm.chunkSize} onChange={e => setKbForm({...kbForm, chunkSize: Number(e.target.value)})} className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"/></div><div><div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-600">Chunk Overlap</label><span className="text-xs font-mono bg-white px-1.5 rounded border">{kbForm.chunkOverlap}</span></div><input type="range" min="0" max="200" step="10" value={kbForm.chunkOverlap} onChange={e => setKbForm({...kbForm, chunkOverlap: Number(e.target.value)})} className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"/></div></>
          ) : (
            <><div><div className="flex gap-3 bg-purple-50 border border-purple-100 p-3 rounded-lg text-xs text-purple-800 mb-2"><Info size={16} className="shrink-0 mt-0.5"/><p><strong>시멘틱 청킹이란?</strong><br/>텍스트의 의미가 급격히 변하는 지점을 찾아 문서를 나눕니다. 문맥이 끊기지 않아 검색 정확도가 높아집니다.</p></div><div><div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-600">Similarity Threshold</label><span className="text-xs font-mono bg-white px-1.5 rounded border">{kbForm.semanticThreshold}</span></div><input type="range" min="0.1" max="0.95" step="0.05" value={kbForm.semanticThreshold} onChange={e => setKbForm({...kbForm, semanticThreshold: Number(e.target.value)})} className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-purple-600"/><p className="text-[10px] text-gray-400 mt-1 text-right">값이 높을수록 더 세밀하게 나뉩니다.</p></div></div></>
          )}
        </div>
      </div>
    </div>
  );

  if (viewMode === 'list') {
    return (
      <div className="h-full flex flex-col p-8 bg-gray-50/50 overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-end mb-8"><div><h2 className="text-3xl font-bold text-gray-900">지식 베이스</h2><p className="text-gray-500 mt-2">AI가 학습하고 참조할 문서 저장소들을 관리합니다.</p></div><button onClick={openCreateModal} className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 font-bold text-sm"><Plus size={20} /> <span>새 지식 베이스 만들기</span></button></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">{knowledgeBases.map(kb => (<div key={kb.id} onClick={() => handleSelectKb(kb.id)} className="group bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:border-blue-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col h-64"><div className="flex items-start justify-between mb-4"><div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300"><Database size={24} /></div>{kb.config?.chunkingMethod === 'semantic' && <span className="text-[10px] font-bold px-2 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-100">Semantic</span>}</div><h3 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors">{kb.name}</h3><p className="text-sm text-gray-500 line-clamp-3 mb-4 flex-1">{kb.description || '설명이 없습니다.'}</p><div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400"><div className="flex items-center gap-1"><FileText size={12}/> {kb.files.length} 문서</div><div className="flex items-center gap-1"><Clock size={12}/> {kb.created_at}</div></div></div>))}<button onClick={openCreateModal} className="border-2 border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all h-64 gap-4"><div className="p-4 bg-gray-100 rounded-full"><Plus size={24}/></div><span className="font-bold">새 지식 베이스 추가</span></button></div>
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="새 지식 베이스 생성"><div className="p-6">{renderConfigForm()}<div className="mt-8 flex justify-end gap-3"><button onClick={() => setIsCreateOpen(false)} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition">취소</button><button onClick={() => handleSaveKb(true)} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg transition">생성하기</button></div></div></Modal>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50/50">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4"><button onClick={() => setViewMode('list')} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 text-gray-600 transition shadow-sm"><ArrowLeft size={20} /></button><div><h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">{currentKb?.name}<span className="text-xs font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{currentKb?.config?.chunkingMethod === 'semantic' ? 'Semantic' : 'Fixed'}</span></h2><p className="text-sm text-gray-500">{currentKb?.description || '설명이 없습니다.'}</p></div></div>
        <div className="flex bg-gray-200 p-1 rounded-xl"><button onClick={() => setActiveTab('files')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'files' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><FileText size={16}/> 목록</button><button onClick={() => setActiveTab('graph')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'graph' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Network size={16}/> 그래프</button></div>
        <button onClick={openConfigModal} className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition text-sm font-bold shadow-sm"><Settings size={16} /> <span>설정</span></button>
      </div>
      <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
        {activeTab === 'files' ? (
          <>
            <div className="h-16 border-b flex items-center justify-between px-6 bg-gray-50/30">
              <div className="flex items-center gap-3">
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(Array.from(e.target.files))}/>
                <input type="file" multiple webkitdirectory="" className="hidden" ref={folderInputRef} onChange={(e) => handleFiles(Array.from(e.target.files))}/>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-bold transition"><Upload size={16}/> 파일 업로드</button>
                <button onClick={() => folderInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-bold transition"><FolderUp size={16}/> 폴더 업로드</button>
              </div>
              <div className="relative w-64"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input type="text" placeholder="문서 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"/></div>
            </div>
            <div className={`flex-1 overflow-y-auto p-4 ${isUploadDragging ? 'bg-blue-50/50' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              {currentFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl m-4"><div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4"><Database size={32} className="opacity-30"/></div><h3 className="text-lg font-bold text-gray-600">등록된 문서가 없습니다.</h3><p className="text-sm mt-1">파일을 드래그하거나 상단 버튼을 눌러 업로드하세요.</p></div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {currentFiles.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(file => (
                    <div key={file.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:shadow-sm hover:border-blue-200 transition group">
                      <div className="flex items-center gap-4"><div className="p-3 bg-red-50 text-red-500 rounded-lg"><FileText size={20}/></div><div><div className="font-bold text-gray-800 text-sm">{file.name}</div><div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2"><span>{file.size}</span><span className="w-1 h-1 bg-gray-300 rounded-full"></span><span className="capitalize">{file.type}</span></div></div></div>
                      <div className="flex items-center gap-4">
                        {file.status === 'ready' && <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full"><CheckCircle size={12}/> Ready</span>}
                        {file.status === 'processing' && <span className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full"><Loader2 size={12} className="animate-spin"/> Processing</span>}
                        {file.status === 'error' && <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full"><AlertCircle size={12}/> Error</span>}
                        <button onClick={() => removeFileFromKb(file.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"><Trash2 size={18}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (<GraphView />)}
      </div>
      <Modal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} title="지식 베이스 설정"><div className="p-6">{renderConfigForm()}<div className="mt-8 flex justify-between items-center"><button onClick={handleDeleteKb} className="text-red-500 text-sm font-bold hover:underline flex items-center gap-1"><Trash2 size={14}/> 삭제하기</button><div className="flex gap-3"><button onClick={() => setIsConfigOpen(false)} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition">취소</button><button onClick={() => handleSaveKb(false)} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg transition">저장하기</button></div></div></div></Modal>
    </div>
  );
}