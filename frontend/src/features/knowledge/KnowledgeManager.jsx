import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { uploadFileToBackend, knowledgeAPI, externalServicesAPI } from '../../api/client';
import { generateUUID } from '../../utils/uuid';
import { Upload, FileText, Trash2, CheckCircle, Database, Plus, Settings, AlertCircle, Loader2, Search, Sliders, Info, Brain, AlignJustify, Split, ArrowLeft, FolderUp, Clock, Share2, Network, GitBranch, RefreshCw, Layers, Cpu, Server } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import ChunksView from './ChunksView';

export default function KnowledgeManager() {
  const { knowledgeBases, currentKbId, setCurrentKbId, addFilesToKb, updateFileStatusInKb, updateKbConfig, setKnowledgeBases, removeFileFromKb } = useStore();
  
  const [viewMode, setViewMode] = useState('list');
  const [activeTab, setActiveTab] = useState('files');
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const [kbForm, setKbForm] = useState({ name: '', description: '', chunkingMethod: 'fixed', chunkSize: 512, chunkOverlap: 50, semanticThreshold: 0.75, externalServiceId: '' });
  const [kbStats, setKbStats] = useState({});
  const [qdrantServices, setQdrantServices] = useState([]);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const currentKb = knowledgeBases.find(kb => kb.id === currentKbId);
  const currentFiles = currentKb?.files || [];

  // KB 통계 로드
  useEffect(() => {
    const fetchAllStats = async () => {
      const statsMap = {};
      for (const kb of knowledgeBases) {
        try {
          const stats = await knowledgeAPI.getStats(kb.id);
          if (stats) statsMap[kb.id] = stats;
        } catch { /* ignore */ }
      }
      setKbStats(statsMap);
    };
    if (knowledgeBases.length > 0) fetchAllStats();
  }, [knowledgeBases.length, viewMode]);

  const [deleteConfirm, setDeleteConfirm] = useState(null); // { fileId, fileName }
  const [deleting, setDeleting] = useState(false);

  const handleDeleteFile = async (file) => {
    setDeleteConfirm({ fileId: file.id, fileName: file.name, source: file.source || file.name });
  };

  const confirmDeleteFile = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      // VDB에서 청크 삭제 시도 (source 경로 기반)
      await knowledgeAPI.deleteFileChunks(currentKbId, deleteConfirm.source);
    } catch (e) {
      // VDB 삭제 실패해도 로컬 파일 목록에서는 제거
      console.warn('VDB chunk deletion failed:', e.message);
    }
    // 로컬 상태에서 파일 제거
    removeFileFromKb(deleteConfirm.fileId);
    setDeleteConfirm(null);
    setDeleting(false);
  };

  const handleSelectKb = (id) => { setCurrentKbId(id); setViewMode('detail'); setActiveTab('files'); };
  const handleDragOver = (e) => { e.preventDefault(); setIsUploadDragging(true); };
  const handleDragLeave = () => setIsUploadDragging(false);
  const handleDrop = (e) => { e.preventDefault(); setIsUploadDragging(false); handleFiles(Array.from(e.dataTransfer.files)); };

  // ✅ 파일 처리 핸들러 (실제 백엔드 전송)
  const handleFiles = async (files) => {
    // 1. UI에 먼저 표시 (Uploading 상태)
    const newFiles = files.map(file => ({ 
      id: generateUUID(), 
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
        await uploadFileToBackend(fileItem.rawFile, currentKbId);

        updateFileStatusInKb(fileItem.id, 'ready');
      } catch (error) {
        console.error("Upload Error:", error);
        const msg = error?.message || '업로드에 실패했습니다.';
        updateFileStatusInKb(fileItem.id, 'error', msg);
      }
    }
  };

  const fetchQdrantServices = async () => {
    const res = await externalServicesAPI.list();
    setQdrantServices((res.services || []).filter(s => s.service_type === 'qdrant'));
  };
  const openCreateModal = () => { setKbForm({ name: '', description: '', chunkingMethod: 'fixed', chunkSize: 512, chunkOverlap: 50, semanticThreshold: 0.75, externalServiceId: '' }); fetchQdrantServices(); setIsCreateOpen(true); };
  const openConfigModal = () => { if (!currentKb) return; setKbForm({ name: currentKb.name, description: currentKb.description, chunkingMethod: currentKb.chunkingMethod || currentKb.config?.chunkingMethod || 'fixed', chunkSize: currentKb.chunkSize || currentKb.config?.chunkSize || 512, chunkOverlap: currentKb.chunkOverlap || currentKb.config?.chunkOverlap || 50, semanticThreshold: currentKb.semanticThreshold || currentKb.config?.semanticThreshold || 0.75, externalServiceId: currentKb.externalServiceId || '' }); fetchQdrantServices(); setIsConfigOpen(true); };
  
  const handleSaveKb = async (isNew) => {
    if (!kbForm.name.trim()) return alert('이름을 입력해주세요.');
    const newKbData = { name: kbForm.name, description: kbForm.description, config: { chunkingMethod: kbForm.chunkingMethod, chunkSize: kbForm.chunkSize, chunkOverlap: kbForm.chunkOverlap, semanticThreshold: kbForm.semanticThreshold }, externalServiceId: kbForm.externalServiceId || '' };
    if (isNew) {
      const kbId = generateUUID();
      try {
        await knowledgeAPI.createBase({ kb_id: kbId, name: kbForm.name, description: kbForm.description, chunk_size: kbForm.chunkSize, chunk_overlap: kbForm.chunkOverlap, chunking_method: kbForm.chunkingMethod, semantic_threshold: kbForm.semanticThreshold, external_service_id: kbForm.externalServiceId || null });
      } catch (e) { console.error('KB create API failed:', e); }
      setKnowledgeBases(prev => [...prev, { id: kbId, files: [], created_at: new Date().toLocaleDateString(), ...newKbData }]);
      setIsCreateOpen(false);
    } else {
      try {
        await knowledgeAPI.updateBase(currentKbId, { name: kbForm.name, description: kbForm.description, chunk_size: kbForm.chunkSize, chunk_overlap: kbForm.chunkOverlap, chunking_method: kbForm.chunkingMethod, semantic_threshold: kbForm.semanticThreshold, external_service_id: kbForm.externalServiceId || null });
      } catch (e) { console.error('KB update API failed:', e); }
      setKnowledgeBases(prev => prev.map(kb => kb.id === currentKbId ? { ...kb, ...newKbData } : kb));
      setIsConfigOpen(false);
    }
  };
  const handleDeleteKb = () => { if (knowledgeBases.length <= 1) return alert('최소 하나는 있어야 합니다.'); if (confirm('삭제하시겠습니까?')) { const newKbs = knowledgeBases.filter(kb => kb.id !== currentKbId); setKnowledgeBases(newKbs); setCurrentKbId(newKbs[0].id); setViewMode('list'); setIsConfigOpen(false); } };

  // GraphView는 별도 컴포넌트로 분리
  const GraphView = () => <InteractiveGraphView kbId={currentKbId} />;

  const renderConfigForm = () => (
    <div className="space-y-5">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">이름</label>
          <input type="text" value={kbForm.name} onChange={e => setKbForm({...kbForm, name: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white" placeholder="지식 베이스 이름"/>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">설명</label>
          <textarea value={kbForm.description} onChange={e => setKbForm({...kbForm, description: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white resize-none h-20" placeholder="지식 베이스 설명"/>
        </div>
      </div>
      <div className="border-t border-gray-200 pt-5 space-y-4">
        <label className="block text-sm font-bold text-gray-900 flex items-center gap-2"><Sliders size={15}/> 청킹 전략</label>
        <div className="grid grid-cols-2 gap-3">
          <div onClick={() => setKbForm({...kbForm, chunkingMethod: 'fixed'})} className={`p-4 border-2 rounded-lg cursor-pointer transition-all flex flex-col items-center gap-2 text-center ${kbForm.chunkingMethod === 'fixed' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}>
            <div className={`p-2 rounded-lg ${kbForm.chunkingMethod === 'fixed' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
              <AlignJustify size={18}/>
            </div>
            <div>
              <div className="font-bold text-sm text-gray-900">고정 크기</div>
              <div className="text-[10px] text-gray-500">Fixed Size</div>
            </div>
          </div>
          <div onClick={() => setKbForm({...kbForm, chunkingMethod: 'semantic'})} className={`p-4 border-2 rounded-lg cursor-pointer transition-all flex flex-col items-center gap-2 text-center ${kbForm.chunkingMethod === 'semantic' ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}>
            <div className={`p-2 rounded-lg ${kbForm.chunkingMethod === 'semantic' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
              <Brain size={18}/>
            </div>
            <div>
              <div className="font-bold text-sm text-gray-900">의미 기반</div>
              <div className="text-[10px] text-gray-500">Semantic</div>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
          {kbForm.chunkingMethod === 'fixed' ? (
            <>
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">Chunk Size (Token)</label>
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">{kbForm.chunkSize}</span>
                </div>
                <input type="range" min="128" max="2048" step="128" value={kbForm.chunkSize} onChange={e => setKbForm({...kbForm, chunkSize: Number(e.target.value)})} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">Chunk Overlap</label>
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">{kbForm.chunkOverlap}</span>
                </div>
                <input type="range" min="0" max="200" step="10" value={kbForm.chunkOverlap} onChange={e => setKbForm({...kbForm, chunkOverlap: Number(e.target.value)})} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
              </div>
            </>
          ) : (
            <div>
              <div className="flex gap-2 bg-purple-50 border border-purple-200 p-3 rounded-lg text-xs text-purple-900 mb-3">
                <Info size={14} className="shrink-0 mt-0.5"/>
                <p><strong>시멘틱 청킹이란?</strong><br/>텍스트의 의미가 급격히 변하는 지점을 찾아 문서를 나눕니다. 문맥이 끊기지 않아 검색 정확도가 높아집니다.</p>
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">Similarity Threshold</label>
                  <span className="text-xs font-mono bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">{kbForm.semanticThreshold}</span>
                </div>
                <input type="range" min="0.1" max="0.95" step="0.05" value={kbForm.semanticThreshold} onChange={e => setKbForm({...kbForm, semanticThreshold: Number(e.target.value)})} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"/>
                <p className="text-[10px] text-gray-500 mt-1 text-right">값이 높을수록 더 세밀하게 나뉩니다.</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
          <Info size={13} className="shrink-0"/>
          <span>청킹 설정은 새로 업로드하는 파일에만 적용됩니다.</span>
        </div>
      </div>
      {qdrantServices.length > 0 && (
        <div className="border-t border-gray-200 pt-5 space-y-3">
          <label className="block text-sm font-bold text-gray-900 flex items-center gap-2"><Server size={15}/> 벡터 DB 설정</label>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Qdrant 서비스</label>
            <select value={kbForm.externalServiceId} onChange={e => setKbForm({...kbForm, externalServiceId: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white cursor-pointer">
              <option value="">기본 (로컬 Qdrant)</option>
              {qdrantServices.map(svc => (<option key={svc.service_id} value={svc.service_id}>{svc.name} ({svc.url})</option>))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">문서 벡터를 저장할 Qdrant 서비스를 선택합니다.</p>
          </div>
        </div>
      )}
    </div>
  );

  if (viewMode === 'list') {
    return (
      <div className="h-full flex flex-col p-8 bg-gray-50 overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">지식 베이스</h2>
            <p className="text-gray-600">AI가 학습하고 참조할 문서 저장소들을 관리합니다.</p>
          </div>
          <button onClick={openCreateModal} className="flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors shadow-sm">
            <Plus size={20} />
            <span>새 지식 베이스</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {knowledgeBases.map((kb, idx) => (
            <div
              key={kb.id}
              onClick={() => handleSelectKb(kb.id)}
              className={`group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-green-300 hover-lift cursor-pointer flex flex-col h-56 animate-scaleIn animate-stagger-${Math.min(idx % 4 + 1, 4)}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-green-50 text-green-600 rounded-lg group-hover:bg-green-100 group-hover:scale-110 transition-all">
                  <Database size={22} className="group-hover:rotate-6 transition-transform" />
                </div>
                {kb.config?.chunkingMethod === 'semantic' && (
                  <span className="text-[10px] font-semibold px-2 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-200 animate-fadeIn">Semantic</span>
                )}
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">{kb.name}</h3>
              <p className="text-sm text-gray-600 line-clamp-2 mb-4 flex-1">{kb.description || '설명이 없습니다.'}</p>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 hover:text-blue-600 transition-colors"><FileText size={11}/> {kbStats[kb.id]?.file_count ?? kb.files.length}</span>
                  <span className="flex items-center gap-1 hover:text-purple-600 transition-colors"><Layers size={11}/> {kbStats[kb.id]?.chunk_count ?? '—'}</span>
                  <span className="flex items-center gap-1 hover:text-green-600 transition-colors"><Network size={11}/> {kbStats[kb.id]?.graph_node_count ?? '—'}</span>
                </div>
              </div>
            </div>
          ))}
          <button onClick={openCreateModal} className="group border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-green-400 hover:text-green-600 hover:bg-green-50 hover-lift h-56 gap-3 animate-scaleIn">
            <div className="p-3 bg-gray-100 group-hover:bg-green-100 rounded-full group-hover:scale-110 transition-all">
              <Plus size={24} className="group-hover:rotate-90 transition-transform"/>
            </div>
            <span className="font-semibold">새 지식 베이스</span>
          </button>
        </div>
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="새 지식 베이스 생성"><div className="p-6">{renderConfigForm()}<div className="mt-8 flex justify-end gap-3"><button onClick={() => setIsCreateOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">취소</button><button onClick={() => handleSaveKb(true)} className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm">생성하기</button></div></div></Modal>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50">
      <div className="flex justify-between items-center mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setViewMode('list')} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors shadow-sm">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {currentKb?.name}
              <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                {currentKb?.config?.chunkingMethod === 'semantic' ? 'Semantic' : 'Fixed'}
              </span>
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-gray-600">{currentKb?.description || '설명이 없습니다.'}</p>
              {kbStats[currentKbId] && (
                <span className="flex items-center gap-3 text-xs text-gray-500 ml-2 border-l pl-3 border-gray-300">
                  <span className="flex items-center gap-1"><Layers size={10}/> {kbStats[currentKbId].chunk_count}</span>
                  <span className="flex items-center gap-1"><Network size={10}/> {kbStats[currentKbId].graph_node_count}</span>
                  <span className="flex items-center gap-1"><GitBranch size={10}/> {kbStats[currentKbId].graph_edge_count}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button onClick={() => setActiveTab('files')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'files' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <FileText size={15}/> 목록
            </button>
            <button onClick={() => setActiveTab('chunks')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'chunks' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <Layers size={15}/> 청크
            </button>
            <button onClick={() => setActiveTab('graph')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'graph' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <Network size={15}/> 그래프
            </button>
          </div>
          <button onClick={openConfigModal} className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm">
            <Settings size={15} /> <span>설정</span>
          </button>
        </div>
      </div>
      <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
        {activeTab === 'files' ? (
          <>
            <div className="h-16 border-b border-gray-200 flex items-center justify-between px-5 bg-gray-50">
              <div className="flex items-center gap-2">
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(Array.from(e.target.files))}/>
                <input type="file" multiple webkitdirectory="" className="hidden" ref={folderInputRef} onChange={(e) => handleFiles(Array.from(e.target.files))}/>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                  <Upload size={15}/> 파일 업로드
                </button>
                <button onClick={() => folderInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors shadow-sm">
                  <FolderUp size={15}/> 폴더 업로드
                </button>
              </div>
              <div className="relative w-64">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="text" placeholder="문서 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"/>
              </div>
            </div>
            <div className={`flex-1 overflow-y-auto p-4 transition-colors ${isUploadDragging ? 'bg-blue-50' : 'bg-white'}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              {currentFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 rounded-xl m-4">
                  <div className="w-20 h-20 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                    <Upload size={36} className="text-blue-500"/>
                  </div>
                  <h3 className="text-base font-bold text-gray-700 mb-2">문서를 업로드하세요</h3>
                  <p className="text-sm text-center text-gray-500 mb-1">PDF, DOCX, TXT, MD, PPTX, XLSX, JPG, PNG 파일을</p>
                  <p className="text-sm text-center text-gray-500">드래그하거나 상단 버튼을 눌러 업로드하세요</p>
                  <p className="text-xs text-gray-400 mt-3">최대 500MB</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {currentFiles.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((file, idx) => {
                    const isImage = file.type === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
                    const thumbnailUrl = file.thumbnail_path || null;

                    return (
                    <div key={file.id} className={`group flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md hover:border-gray-300 hover-lift transition-all animate-slideUp animate-stagger-${Math.min(idx % 4 + 1, 4)}`}>
                      <div className="flex items-center gap-3">
                        {isImage && thumbnailUrl ? (
                          <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border-2 border-gray-200 group-hover:border-pink-400 transition-colors">
                            <img
                              src={thumbnailUrl}
                              alt={file.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ) : (
                          <div className={`p-2.5 rounded-lg ${isImage ? 'bg-pink-50 text-pink-600' : 'bg-red-50 text-red-600'} group-hover:scale-110 transition-transform`}>
                            <FileText size={18}/>
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                            {file.name}
                            {isImage && <span className="text-[10px] font-bold px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full">IMAGE</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                            <span>{file.size}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                            <span className="capitalize">{file.type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {file.status === 'ready' && <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200"><CheckCircle size={11}/> 완료</span>}
                        {file.status === 'uploading' && <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200"><Loader2 size={11} className="animate-spin"/> 업로드 중</span>}
                        {file.status === 'processing' && <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200"><Loader2 size={11} className="animate-spin"/> 처리 중</span>}
                        {file.status === 'error' && <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200 cursor-help" title={file.errorMessage || '업로드 실패'}><AlertCircle size={11}/> 실패</span>}
                        <button onClick={() => handleDeleteFile(file)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={16}/>
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'chunks' ? (
          <ChunksView kbId={currentKbId} />
        ) : (<GraphView />)}
      </div>
      <Modal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} title="지식 베이스 설정">
        <div className="p-6">
          {renderConfigForm()}
          <div className="mt-8 flex justify-between items-center">
            <button onClick={handleDeleteKb} className="text-red-600 text-sm font-semibold hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
              <Trash2 size={14}/> 삭제하기
            </button>
            <div className="flex gap-3">
              <button onClick={() => setIsConfigOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">취소</button>
              <button onClick={() => handleSaveKb(false)} className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm">저장하기</button>
            </div>
          </div>
        </div>
      </Modal>
      {/* 파일 삭제 확인 다이얼로그 */}
      <Modal isOpen={!!deleteConfirm} onClose={() => !deleting && setDeleteConfirm(null)} title="파일 삭제 확인">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="p-2.5 bg-red-100 rounded-lg">
              <AlertCircle size={24} className="text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-900">이 작업은 되돌릴 수 없습니다</p>
              <p className="text-xs text-red-700 mt-0.5">벡터 DB에 저장된 청크 데이터도 영구 삭제됩니다.</p>
            </div>
          </div>
          <p className="text-sm text-gray-700 mb-2">다음 파일을 삭제하시겠습니까?</p>
          <p className="text-sm font-semibold text-gray-900 bg-gray-100 px-3 py-2.5 rounded-lg mb-4 flex items-center gap-2 border border-gray-300">
            <FileText size={14} className="text-gray-600" />
            {deleteConfirm?.fileName}
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} disabled={deleting} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">취소</button>
            <button onClick={confirmDeleteFile} disabled={deleting} className="px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2">
              {deleting ? <><Loader2 size={14} className="animate-spin" /> 삭제 중...</> : <><Trash2 size={14} /> 영구 삭제</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


// ============================================================
// 인터랙티브 그래프 시각화 컴포넌트
// ============================================================
const LABEL_COLORS = {
  Location: '#10B981', Vehicle: '#3B82F6', Person: '#F59E0B',
  Entity: '#8B5CF6', Concept: '#06B6D4', Place: '#10B981',
  Event: '#EF4444', Organization: '#EC4899', Document: '#6366F1',
  System: '#F97316', Unknown: '#9CA3AF',
};
const DEFAULT_COLOR = '#6B7280';

const ALLOWED_LABELS = ['Entity', 'Concept', 'Person', 'Place', 'Event', 'Organization', 'Document'];
const ALLOWED_REL_TYPES = ['RELATION', 'INCLUDES', 'INVOLVES', 'CAUSES', 'RELATED_TO', 'HAS', 'PART_OF'];

function InteractiveGraphView({ kbId }) {
  const svgRef = useRef(null);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState({});
  const [hoveredNode, setHoveredNode] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const animRef = useRef(null);
  const posRef = useRef({});

  // CRUD state
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [nodeForm, setNodeForm] = useState({ label: 'Entity', name: '', properties: {} });
  const [edgeMode, setEdgeMode] = useState(null); // null | 'selectSource' | 'selectTarget'
  const [edgeSource, setEdgeSource] = useState(null);
  const [edgeRelType, setEdgeRelType] = useState('RELATION');
  const [actionLoading, setActionLoading] = useState(false);
  const [editName, setEditName] = useState('');
  const [newPropKey, setNewPropKey] = useState('');
  const [newPropVal, setNewPropVal] = useState('');

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await knowledgeAPI.getGraph(kbId);
      if (data.error) {
        setError(data.error);
        setGraphData({ nodes: [], edges: [] });
      } else {
        setGraphData(data);
        const init = {};
        const cx = 400, cy = 300, r = Math.min(250, data.nodes.length * 30);
        data.nodes.forEach((node, i) => {
          const angle = (2 * Math.PI * i) / data.nodes.length;
          // 기존 위치가 있으면 유지
          if (posRef.current[node.id]) {
            init[node.id] = posRef.current[node.id];
          } else {
            init[node.id] = {
              x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * 20,
              y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * 20,
              vx: 0, vy: 0
            };
          }
        });
        posRef.current = init;
        setPositions({ ...init });
      }
    } catch (e) {
      setError(e.message || '그래프 데이터를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // 힘 시뮬레이션
  useEffect(() => {
    if (graphData.nodes.length === 0) return;
    let frameCount = 0;
    const maxFrames = 300;
    const simulate = () => {
      if (frameCount >= maxFrames) return;
      frameCount++;
      const pos = posRef.current;
      const nodes = graphData.nodes;
      const edges = graphData.edges;
      const cx = 400, cy = 300;
      nodes.forEach(n => {
        if (!pos[n.id]) return;
        let fx = 0, fy = 0;
        nodes.forEach(m => {
          if (n.id === m.id || !pos[m.id]) return;
          const dx = pos[n.id].x - pos[m.id].x;
          const dy = pos[n.id].y - pos[m.id].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 3000 / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        });
        edges.forEach(e => {
          let other = null;
          if (e.source === n.id && pos[e.target]) other = pos[e.target];
          else if (e.target === n.id && pos[e.source]) other = pos[e.source];
          if (!other) return;
          const dx = other.x - pos[n.id].x;
          const dy = other.y - pos[n.id].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const force = (dist - 120) * 0.01;
          fx += (dx / Math.max(dist, 1)) * force;
          fy += (dy / Math.max(dist, 1)) * force;
        });
        fx += (cx - pos[n.id].x) * 0.001;
        fy += (cy - pos[n.id].y) * 0.001;
        if (dragging !== n.id) {
          pos[n.id].vx = (pos[n.id].vx + fx) * 0.8;
          pos[n.id].vy = (pos[n.id].vy + fy) * 0.8;
          pos[n.id].x += pos[n.id].vx;
          pos[n.id].y += pos[n.id].vy;
        }
      });
      setPositions({ ...pos });
      animRef.current = requestAnimationFrame(simulate);
    };
    animRef.current = requestAnimationFrame(simulate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [graphData, dragging]);

  // 마우스 이벤트
  const handleMouseDown = (e, nodeId) => {
    e.stopPropagation();
    if (edgeMode === 'selectSource') {
      setEdgeSource(nodeId);
      setEdgeMode('selectTarget');
      return;
    }
    if (edgeMode === 'selectTarget' && edgeSource) {
      handleCreateEdge(edgeSource, nodeId);
      return;
    }
    setDragging(nodeId);
  };

  const handleNodeClick = (e, node) => {
    e.stopPropagation();
    if (edgeMode) return;
    setSelectedNode(node);
    setSelectedEdge(null);
    setEditName(node.name);
  };

  const handleEdgeClick = (e, edge) => {
    e.stopPropagation();
    if (edgeMode) return;
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const handleSvgMouseDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === 'rect') {
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      if (!edgeMode) { setSelectedNode(null); setSelectedEdge(null); }
    }
  };

  const handleMouseMove = useCallback((e) => {
    if (dragging && posRef.current[dragging]) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      posRef.current[dragging].x = (e.clientX - rect.left - pan.x) / zoom;
      posRef.current[dragging].y = (e.clientY - rect.top - pan.y) / zoom;
      posRef.current[dragging].vx = 0;
      posRef.current[dragging].vy = 0;
      setPositions({ ...posRef.current });
    } else if (isPanning) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }
  }, [dragging, isPanning, zoom, pan]);

  const handleMouseUp = useCallback(() => { setDragging(null); setIsPanning(false); }, []);
  const handleWheel = useCallback((e) => { e.preventDefault(); setZoom(z => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001))); }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // CRUD 핸들러
  const handleCreateNode = async () => {
    if (!nodeForm.name.trim()) return;
    setActionLoading(true);
    try {
      await knowledgeAPI.createNode(kbId, { label: nodeForm.label, name: nodeForm.name, properties: nodeForm.properties });
      setShowNodeForm(false);
      setNodeForm({ label: 'Entity', name: '', properties: {} });
      await fetchGraph();
    } catch (e) { alert('노드 생성 실패: ' + (e.message || '')); }
    finally { setActionLoading(false); }
  };

  const handleUpdateNode = async () => {
    if (!selectedNode || !editName.trim()) return;
    setActionLoading(true);
    try {
      await knowledgeAPI.updateNode(selectedNode.id, { name: editName });
      setSelectedNode(null);
      await fetchGraph();
    } catch (e) { alert('노드 수정 실패: ' + (e.message || '')); }
    finally { setActionLoading(false); }
  };

  const handleDeleteNode = async () => {
    if (!selectedNode || !confirm(`"${selectedNode.name}" 노드를 삭제하시겠습니까? 연결된 엣지도 함께 삭제됩니다.`)) return;
    setActionLoading(true);
    try {
      await knowledgeAPI.deleteNode(selectedNode.id);
      setSelectedNode(null);
      await fetchGraph();
    } catch (e) { alert('노드 삭제 실패: ' + (e.message || '')); }
    finally { setActionLoading(false); }
  };

  const handleCreateEdge = async (sourceId, targetId) => {
    if (sourceId === targetId) { setEdgeMode(null); setEdgeSource(null); return; }
    setActionLoading(true);
    try {
      await knowledgeAPI.createEdge(kbId, { source_id: sourceId, target_id: targetId, relationship_type: edgeRelType });
      await fetchGraph();
    } catch (e) { alert('엣지 생성 실패: ' + (e.message || '')); }
    finally { setActionLoading(false); setEdgeMode(null); setEdgeSource(null); }
  };

  const handleDeleteEdge = async () => {
    if (!selectedEdge?.id || !confirm('이 관계를 삭제하시겠습니까?')) return;
    setActionLoading(true);
    try {
      await knowledgeAPI.deleteEdge(selectedEdge.id);
      setSelectedEdge(null);
      await fetchGraph();
    } catch (e) { alert('엣지 삭제 실패: ' + (e.message || '')); }
    finally { setActionLoading(false); }
  };

  const labels = [...new Set(graphData.nodes.map(n => n.label))];

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-white">
        <Loader2 size={32} className="animate-spin text-purple-400 mb-4" />
        <p className="font-bold">그래프 데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-white">
        <AlertCircle size={32} className="text-red-400 mb-4" />
        <p className="font-bold mb-2">그래프 로드 실패</p>
        <p className="text-sm text-gray-400 mb-4">{error}</p>
        <button onClick={fetchGraph} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-bold flex items-center gap-2">
          <RefreshCw size={14} /> 다시 시도
        </button>
      </div>
    );
  }

  if (graphData.nodes.length === 0 && !showNodeForm) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-white">
        <Network size={48} className="text-gray-600 mb-4" />
        <p className="font-bold text-lg mb-2">그래프 데이터가 없습니다</p>
        <p className="text-sm text-gray-400 text-center mb-4">문서를 업로드하면 자동으로<br/>지식 그래프가 생성됩니다.</p>
        <button onClick={() => setShowNodeForm(true)} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-bold flex items-center gap-2">
          <Plus size={14} /> 노드 직접 추가
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative bg-gray-900 overflow-hidden">
      {/* 범례 */}
      <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md p-3 rounded-xl border border-gray-700 text-white text-xs">
        {labels.map(label => (
          <div key={label} className="flex items-center gap-2 mb-1 last:mb-0">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: LABEL_COLORS[label] || DEFAULT_COLOR }} />
            <span>{label}</span>
          </div>
        ))}
        <div className="border-t border-gray-700 mt-2 pt-2 text-gray-400">
          {graphData.nodes.length} nodes / {graphData.edges.length} edges
        </div>
      </div>

      {/* 엣지 모드 안내 */}
      {edgeMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-3 shadow-lg">
          <GitBranch size={16} />
          {edgeMode === 'selectSource' ? '소스 노드를 클릭하세요' : '타겟 노드를 클릭하세요'}
          <select value={edgeRelType} onChange={e => setEdgeRelType(e.target.value)} className="bg-orange-700 text-white text-xs px-2 py-1 rounded-lg border border-orange-500 outline-none">
            {ALLOWED_REL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => { setEdgeMode(null); setEdgeSource(null); }} className="text-orange-200 hover:text-white ml-1">취소</button>
        </div>
      )}

      {/* 컨트롤 */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button onClick={fetchGraph} className="p-2 bg-black/60 backdrop-blur-md text-white rounded-lg border border-gray-700 hover:bg-gray-700 transition" title="새로고침">
          <RefreshCw size={16} />
        </button>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-2 bg-black/60 backdrop-blur-md text-white rounded-lg border border-gray-700 hover:bg-gray-700 transition" title="확대">
          <Plus size={16} />
        </button>
        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="p-2 bg-black/60 backdrop-blur-md text-white rounded-lg border border-gray-700 hover:bg-gray-700 transition" title="축소">
          <span className="block w-4 h-4 text-center leading-4 font-bold">-</span>
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-2 bg-black/60 backdrop-blur-md text-white rounded-lg border border-gray-700 hover:bg-gray-700 transition text-[10px] font-bold" title="리셋">
          1:1
        </button>
        <div className="border-t border-gray-700 my-1" />
        <button onClick={() => { setShowNodeForm(true); setSelectedNode(null); setSelectedEdge(null); }} className="p-2 bg-green-600/80 backdrop-blur-md text-white rounded-lg border border-green-500 hover:bg-green-600 transition" title="노드 추가">
          <Plus size={16} />
        </button>
        <button onClick={() => { setEdgeMode('selectSource'); setEdgeSource(null); setSelectedNode(null); setSelectedEdge(null); }} className={`p-2 backdrop-blur-md text-white rounded-lg border transition ${edgeMode ? 'bg-orange-600 border-orange-500' : 'bg-orange-600/60 border-orange-500/50 hover:bg-orange-600'}`} title="엣지 추가">
          <GitBranch size={16} />
        </button>
      </div>

      {/* 노드 상세/편집 패널 */}
      {selectedNode && !edgeMode && (
        <div className="absolute right-4 top-[220px] z-20 w-72 bg-black/80 backdrop-blur-md rounded-xl border border-gray-600 p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: LABEL_COLORS[selectedNode.label] || DEFAULT_COLOR }}>{selectedNode.label}</span>
            <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-white"><span className="text-lg leading-none">&times;</span></button>
          </div>
          <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mb-3 outline-none focus:border-purple-500" placeholder="노드 이름" />
          {Object.entries(selectedNode.properties || {}).filter(([k]) => k !== 'name').length > 0 && (
            <div className="mb-3 space-y-1">
              <div className="text-[10px] text-gray-400 uppercase font-bold">속성</div>
              {Object.entries(selectedNode.properties).filter(([k]) => k !== 'name').map(([k, v]) => (
                <div key={k} className="text-xs text-gray-300 flex gap-1"><span className="text-gray-500">{k}:</span> {v}</div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleUpdateNode} disabled={actionLoading} className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-xs font-bold transition disabled:opacity-50">
              {actionLoading ? '저장 중...' : '저장'}
            </button>
            <button onClick={handleDeleteNode} disabled={actionLoading} className="px-3 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-xs font-bold transition disabled:opacity-50">
              삭제
            </button>
          </div>
        </div>
      )}

      {/* 엣지 상세 패널 */}
      {selectedEdge && !edgeMode && (
        <div className="absolute right-4 top-[220px] z-20 w-64 bg-black/80 backdrop-blur-md rounded-xl border border-gray-600 p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-orange-400">{selectedEdge.type}</span>
            <button onClick={() => setSelectedEdge(null)} className="text-gray-400 hover:text-white"><span className="text-lg leading-none">&times;</span></button>
          </div>
          <div className="text-xs text-gray-300 mb-1">
            {graphData.nodes.find(n => n.id === selectedEdge.source)?.name || '?'} → {graphData.nodes.find(n => n.id === selectedEdge.target)?.name || '?'}
          </div>
          <button onClick={handleDeleteEdge} disabled={actionLoading} className="w-full mt-3 px-3 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-xs font-bold transition disabled:opacity-50">
            {actionLoading ? '삭제 중...' : '관계 삭제'}
          </button>
        </div>
      )}

      {/* 노드 생성 폼 */}
      {showNodeForm && (
        <div className="absolute right-4 top-[220px] z-20 w-72 bg-black/80 backdrop-blur-md rounded-xl border border-green-600 p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-green-400">노드 추가</span>
            <button onClick={() => setShowNodeForm(false)} className="text-gray-400 hover:text-white"><span className="text-lg leading-none">&times;</span></button>
          </div>
          <select value={nodeForm.label} onChange={e => setNodeForm({...nodeForm, label: e.target.value})} className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mb-2 outline-none focus:border-green-500">
            {ALLOWED_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <input value={nodeForm.name} onChange={e => setNodeForm({...nodeForm, name: e.target.value})} className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mb-2 outline-none focus:border-green-500" placeholder="노드 이름" />
          <div className="mb-2">
            <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">속성 추가</div>
            <div className="flex gap-1">
              <input value={newPropKey} onChange={e => setNewPropKey(e.target.value)} className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none" placeholder="키" />
              <input value={newPropVal} onChange={e => setNewPropVal(e.target.value)} className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none" placeholder="값" />
              <button onClick={() => { if (newPropKey.trim()) { setNodeForm({...nodeForm, properties: {...nodeForm.properties, [newPropKey]: newPropVal}}); setNewPropKey(''); setNewPropVal(''); } }} className="px-2 py-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-600">+</button>
            </div>
            {Object.entries(nodeForm.properties).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1 mt-1 text-xs text-gray-300">
                <span className="text-gray-500">{k}:</span> {v}
                <button onClick={() => { const p = {...nodeForm.properties}; delete p[k]; setNodeForm({...nodeForm, properties: p}); }} className="ml-auto text-red-400 hover:text-red-300 text-[10px]">x</button>
              </div>
            ))}
          </div>
          <button onClick={handleCreateNode} disabled={actionLoading || !nodeForm.name.trim()} className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-bold transition disabled:opacity-50">
            {actionLoading ? '생성 중...' : '노드 생성'}
          </button>
        </div>
      )}

      {/* 호버 정보 (CRUD 패널이 없을 때만) */}
      {hoveredNode && !selectedNode && !selectedEdge && !showNodeForm && positions[hoveredNode.id] && (
        <div
          className="absolute z-20 bg-black/80 backdrop-blur-md text-white p-3 rounded-xl border border-gray-600 text-xs max-w-xs pointer-events-none"
          style={{
            left: Math.min(positions[hoveredNode.id].x * zoom + pan.x + 20, (svgRef.current?.clientWidth || 600) - 200),
            top: positions[hoveredNode.id].y * zoom + pan.y - 10
          }}
        >
          <div className="font-bold text-sm mb-1 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LABEL_COLORS[hoveredNode.label] || DEFAULT_COLOR }} />
            {hoveredNode.name}
          </div>
          <div className="text-gray-400 mb-1">{hoveredNode.label}</div>
          <div className="text-[10px] text-gray-500">클릭하여 편집</div>
        </div>
      )}

      {/* SVG 그래프 */}
      <svg
        ref={svgRef}
        className={`w-full h-full ${edgeMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      >
        <rect width="100%" height="100%" fill="transparent" />
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* 엣지 */}
          {graphData.edges.map((edge, i) => {
            const sp = positions[edge.source];
            const tp = positions[edge.target];
            if (!sp || !tp) return null;
            const mx = (sp.x + tp.x) / 2;
            const my = (sp.y + tp.y) / 2;
            const isSelected = selectedEdge?.id === edge.id;
            return (
              <g key={`e-${i}`}>
                {/* 투명 히트영역 */}
                <line x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} onClick={(e) => handleEdgeClick(e, edge)} />
                <line x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke={isSelected ? '#F59E0B' : '#4B5563'} strokeWidth={isSelected ? 2.5 : 1.5} strokeOpacity={isSelected ? 1 : 0.6} />
                <text x={mx} y={my - 6} textAnchor="middle" fill={isSelected ? '#F59E0B' : '#6B7280'} fontSize={9} fontWeight="bold">{edge.type}</text>
              </g>
            );
          })}

          {/* 노드 */}
          {graphData.nodes.map(node => {
            const p = positions[node.id];
            if (!p) return null;
            const color = LABEL_COLORS[node.label] || DEFAULT_COLOR;
            const isHovered = hoveredNode?.id === node.id;
            const isSelected = selectedNode?.id === node.id;
            const isEdgeEndpoint = edgeSource === node.id;
            const r = isHovered || isSelected ? 22 : 18;
            return (
              <g
                key={node.id}
                style={{ cursor: edgeMode ? 'crosshair' : 'pointer' }}
                onMouseDown={(e) => handleMouseDown(e, node.id)}
                onClick={(e) => handleNodeClick(e, node)}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {(isHovered || isSelected) && <circle cx={p.x} cy={p.y} r={r + 8} fill={color} fillOpacity={0.15} />}
                {isEdgeEndpoint && <circle cx={p.x} cy={p.y} r={r + 6} fill="#F59E0B" fillOpacity={0.3} />}
                <circle cx={p.x} cy={p.y} r={r} fill={color} stroke={isSelected ? '#fff' : isHovered ? '#fff' : color} strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.5} fillOpacity={0.85} />
                <text x={p.x} y={p.y + r + 14} textAnchor="middle" fill="#D1D5DB" fontSize={10} fontWeight="600">
                  {node.name.length > 12 ? node.name.slice(0, 12) + '...' : node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}