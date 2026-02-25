import React, { useState, useEffect, useRef, useCallback } from 'react';
import { knowledgeAPI } from '../../api/client';
import { Search, Loader2, ChevronDown, ChevronUp, FileText, Layers, Hash, AlertCircle, X, Folder, Image as ImageIcon, Eye } from '../../components/ui/Icon';

export default function ChunksView({ kbId }) {
  // 파일 목록
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState(null); // null = 전체

  // 청크 목록
  const [chunks, setChunks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextOffset, setNextOffset] = useState(null);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);
  const searchTimer = useRef(null);
  const [lightboxImage, setLightboxImage] = useState(null); // 이미지 확대보기

  // 파일 목록 로드
  useEffect(() => {
    let cancelled = false;
    const loadFiles = async () => {
      setFilesLoading(true);
      const data = await knowledgeAPI.getFilesList(kbId);
      if (!cancelled) {
        setFiles(data.files || []);
        setFilesLoading(false);
      }
    };
    loadFiles();
    return () => { cancelled = true; };
  }, [kbId]);

  // 청크 로드
  const fetchChunks = useCallback(async (offset = null, search = null, source = null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await knowledgeAPI.getChunks(kbId, offset, 20, search || null, source || null);
      if (append) {
        setChunks(prev => [...prev, ...data.chunks]);
      } else {
        setChunks(data.chunks);
      }
      setTotal(data.total);
      setNextOffset(data.next_offset);
    } catch (e) {
      setError(e.message || '청크를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [kbId]);

  // 파일 선택 또는 초기 로드 시 청크 가져오기
  useEffect(() => {
    fetchChunks(null, searchQuery || null, selectedSource);
  }, [selectedSource, fetchChunks]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (value) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchChunks(null, value, selectedSource);
    }, 400);
  };

  const handleLoadMore = () => {
    if (nextOffset && !loadingMore) {
      fetchChunks(nextOffset, searchQuery || null, selectedSource, true);
    }
  };

  const handleSelectFile = (source) => {
    setSelectedSource(source === selectedSource ? null : source);
    setSearchQuery('');
    setExpandedId(null);
  };

  const totalChunks = files.reduce((sum, f) => sum + f.chunk_count, 0);
  const selectedFileName = selectedSource
    ? (files.find(f => f.source === selectedSource)?.filename || 'unknown')
    : null;

  return (
    <div className="h-full flex bg-gray-50">
      {/* 왼쪽: 파일 사이드바 */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col shrink-0">
        <div className="h-14 border-b border-gray-200 flex items-center px-5 gap-3 shrink-0 bg-gray-50">
          <div className="p-2 rounded-lg bg-gray-600">
            <Folder size={16} className="text-white" />
          </div>
          <span className="text-sm font-bold text-gray-900">소스 파일</span>
          <span className="ml-auto text-xs text-gray-600 font-semibold bg-gray-100 px-2.5 py-1 rounded-full">{files.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-green-200" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <FileText size={24} className="mb-2 text-gray-300" />
              <p className="text-xs">업로드된 파일이 없습니다</p>
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {/* 전체 보기 */}
              <button
                onClick={() => handleSelectFile(null)}
                className={`group w-full text-left px-4 py-3 rounded-lg text-sm transition-all ${
                  selectedSource === null
                    ? 'bg-green-500 text-white font-semibold shadow-sm'
                    : 'text-gray-700 hover:bg-gray-50 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg transition-all ${selectedSource === null ? 'bg-gray-500' : 'bg-gray-100 group-hover:bg-gray-200'}`}>
                    <Layers size={14} className={selectedSource === null ? 'text-white' : 'text-gray-600'} />
                  </div>
                  <span className="truncate">전체 파일</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold transition-all ${
                    selectedSource === null ? 'bg-green-400 text-white' : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                  }`}>
                    {totalChunks}
                  </span>
                </div>
              </button>

              {/* 개별 파일 */}
              {files.map((file) => (
                <button
                  key={file.source}
                  onClick={() => handleSelectFile(file.source)}
                  className={`group w-full text-left px-4 py-3 rounded-lg text-sm transition-all ${
                    selectedSource === file.source
                      ? 'bg-purple-600 text-white font-semibold shadow-sm'
                      : 'text-gray-700 hover:bg-gray-50 font-medium'
                  }`}
                  title={file.source}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg transition-all ${selectedSource === file.source ? 'bg-purple-500' : 'bg-gray-100 group-hover:bg-gray-200'}`}>
                      <FileText size={14} className={selectedSource === file.source ? 'text-white' : 'text-gray-600'} />
                    </div>
                    <span className="truncate flex-1">{file.filename}</span>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold transition-all ${
                      selectedSource === file.source ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                    }`}>
                      {file.chunk_count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽: 청크 리스트 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 상단 바 */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {selectedSource && (
              <button
                onClick={() => handleSelectFile(null)}
                className="shrink-0 flex items-center gap-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg transition-colors shadow-sm"
              >
                <FileText size={13} />
                <span className="max-w-[120px] truncate">{selectedFileName}</span>
                <X size={13} />
              </button>
            )}
            <div className="relative w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="시맨틱 검색..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none bg-white"
              />
            </div>
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); fetchChunks(null, null, selectedSource); }}
                className="text-sm text-gray-600 hover:text-gray-900 font-semibold transition-colors"
              >
                초기화
              </button>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-4 py-2 rounded-full flex items-center gap-2">
            <Layers size={14} className="text-gray-600" /> {total}개
          </span>
        </div>

        {/* 청크 본문 */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Loader2 size={28} className="animate-spin text-green-300 mb-3" />
              <p className="text-sm font-bold">청크 데이터를 불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <AlertCircle size={28} className="text-red-400 mb-3" />
              <p className="text-sm font-bold mb-1">로드 실패</p>
              <p className="text-xs">{error}</p>
              <button
                onClick={() => fetchChunks(null, null, selectedSource)}
                className="mt-3 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 transition"
              >
                다시 시도
              </button>
            </div>
          ) : chunks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-3">
                <Layers size={28} className="text-orange-300" />
              </div>
              <h3 className="text-base font-bold text-gray-500">
                {searchQuery ? '검색 결과가 없습니다' : selectedSource ? '이 파일에 청크가 없습니다' : '아직 청크가 없습니다'}
              </h3>
              <p className="text-xs mt-1 text-center text-gray-400">
                {searchQuery ? '다른 검색어를 시도해보세요.' : '문서를 업로드하면 자동으로 청킹됩니다.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {chunks.map((chunk) => {
                const isExpanded = expandedId === chunk.id;
                const isImage = chunk.content_type === 'image';
                const preview = chunk.text.length > 200 ? chunk.text.slice(0, 200) + '...' : chunk.text;
                const fileName = chunk.source ? chunk.source.split('/').pop().split('\\').pop() : 'unknown';
                const thumbnailUrl = chunk.thumbnail_path || null;
                const fullImageUrl = chunk.image_path || null;

                return (
                  <div
                    key={chunk.id}
                    className={`group bg-white border rounded-lg transition-all cursor-pointer ${
                      isExpanded
                        ? 'border-gray-400 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : chunk.id)}
                  >
                    {/* 헤더 */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <span className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm transition-all ${
                        isImage
                          ? 'bg-pink-600 text-white'
                          : 'bg-green-500 text-white'
                      }`}>
                        {isImage ? <ImageIcon size={18} /> : `#${chunk.chunk_index}`}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!selectedSource && (
                            <>
                              <div className={`p-1 rounded-lg ${isImage ? 'bg-pink-50' : 'bg-gray-50'}`}>
                                {isImage ? <ImageIcon size={13} className="text-pink-600 shrink-0" /> : <FileText size={13} className="text-gray-600 shrink-0" />}
                              </div>
                              <span className="text-xs font-semibold text-gray-700 truncate">{fileName}</span>
                            </>
                          )}
                          {isImage && (
                            <span className="text-xs font-semibold bg-pink-600 text-white px-2.5 py-1 rounded-full">
                              IMAGE
                            </span>
                          )}
                          {chunk.score != null && (
                            <span className="text-xs font-semibold bg-green-500 text-white px-2.5 py-1 rounded-full">
                              {chunk.score}
                            </span>
                          )}
                        </div>
                        {!isExpanded && !isImage && (
                          <p className="text-sm text-gray-700 mt-1.5 line-clamp-2 leading-relaxed">{preview}</p>
                        )}
                        {!isExpanded && isImage && chunk.caption && (
                          <p className="text-sm text-gray-700 mt-1.5 line-clamp-1 leading-relaxed italic">{chunk.caption}</p>
                        )}
                      </div>
                      <div className={`shrink-0 transition-all ${isExpanded ? 'text-gray-600' : 'text-gray-400 group-hover:text-gray-500'}`}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {/* 펼친 내용 */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {isImage ? (
                          <>
                            {/* 이미지 표시 */}
                            {thumbnailUrl && (
                              <div className="relative group/img">
                                <img
                                  src={thumbnailUrl}
                                  alt={fileName}
                                  className="w-full max-w-lg mx-auto rounded-lg border-2 border-gray-200 cursor-pointer hover:border-gray-500 transition-all shadow-sm"
                                  onClick={(e) => { e.stopPropagation(); setLightboxImage(fullImageUrl); }}
                                />
                                <button
                                  onClick={(e) => { e.stopPropagation(); setLightboxImage(fullImageUrl); }}
                                  className="absolute top-3 right-3 p-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg opacity-0 group-hover/img:opacity-100 transition-all shadow-sm"
                                  title="원본 크기로 보기"
                                >
                                  <Eye size={16} />
                                </button>
                              </div>
                            )}
                            {/* 이미지 메타데이터 */}
                            <div className="bg-pink-50 rounded-lg p-4 space-y-2 text-sm border border-pink-200">
                              {chunk.caption && (
                                <div className="flex gap-2">
                                  <span className="font-semibold text-pink-700 shrink-0">설명:</span>
                                  <span className="text-gray-700 italic">{chunk.caption}</span>
                                </div>
                              )}
                              {chunk.ocr_text && (
                                <div className="flex gap-2">
                                  <span className="font-semibold text-pink-700 shrink-0">텍스트:</span>
                                  <span className="text-gray-700">{chunk.ocr_text}</span>
                                </div>
                              )}
                              {chunk.image_dimensions && (
                                <div className="flex gap-2">
                                  <span className="font-semibold text-pink-700 shrink-0">크기:</span>
                                  <span className="text-gray-700">{chunk.image_dimensions}</span>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono border border-gray-200 max-h-96 overflow-y-auto custom-scrollbar">
                            {chunk.text}
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-600 flex-wrap">
                          <span className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-lg">
                            <Hash size={11} /> {chunk.id.slice(0, 12)}...
                          </span>
                          {!selectedSource && chunk.source && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSelectFile(chunk.source); }}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg font-semibold transition-colors"
                            >
                              이 파일만 보기
                            </button>
                          )}
                          {chunk.metadata?.uploaded_at && (
                            <span className="bg-gray-100 px-2.5 py-1 rounded-lg">업로드: {chunk.metadata.uploaded_at}</span>
                          )}
                          {!isImage && <span className="bg-gray-100 px-2.5 py-1 rounded-lg">길이: {chunk.text.length}자</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 더 보기 */}
              {nextOffset && !searchQuery && (
                <div className="flex justify-center py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleLoadMore(); }}
                    disabled={loadingMore}
                    className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {loadingMore ? <><Loader2 size={13} className="animate-spin" /> 불러오는 중...</> : <>더 보기 ({chunks.length}/{total})</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 이미지 라이트박스 */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-8"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors shadow-lg"
          >
            <X size={28} />
          </button>
          <img
            src={lightboxImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
