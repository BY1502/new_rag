import React, { useState, useEffect, useRef, useCallback } from 'react';
import { knowledgeAPI } from '../../api/client';
import { Search, Loader2, ChevronDown, ChevronUp, FileText, Layers, Hash, AlertCircle, X, Folder } from '../../components/ui/Icon';

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
    <div className="h-full flex">
      {/* 왼쪽: 파일 사이드바 */}
      <div className="w-64 border-r bg-gray-50/50 flex flex-col shrink-0">
        <div className="h-12 border-b flex items-center px-4 gap-2 shrink-0">
          <Folder size={15} className="text-gray-400" />
          <span className="text-xs font-bold text-gray-500">소스 파일</span>
          <span className="ml-auto text-[11px] text-gray-400 font-bold">{files.length}개</span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <FileText size={24} className="mb-2 text-gray-300" />
              <p className="text-xs">업로드된 파일이 없습니다</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {/* 전체 보기 */}
              <button
                onClick={() => handleSelectFile(null)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all ${
                  selectedSource === null
                    ? 'bg-orange-50 text-orange-700 font-bold border border-orange-200'
                    : 'text-gray-600 hover:bg-gray-100 font-medium'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers size={13} className={selectedSource === null ? 'text-orange-500' : 'text-gray-400'} />
                  <span className="truncate">전체 파일</span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    selectedSource === null ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'
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
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all ${
                    selectedSource === file.source
                      ? 'bg-orange-50 text-orange-700 font-bold border border-orange-200'
                      : 'text-gray-600 hover:bg-gray-100 font-medium'
                  }`}
                  title={file.source}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={13} className={selectedSource === file.source ? 'text-orange-500' : 'text-gray-400'} />
                    <span className="truncate flex-1">{file.filename}</span>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      selectedSource === file.source ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'
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
        <div className="h-12 border-b flex items-center justify-between px-4 bg-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {selectedSource && (
              <button
                onClick={() => handleSelectFile(null)}
                className="shrink-0 flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg hover:bg-orange-100 transition"
              >
                <FileText size={12} />
                <span className="max-w-[120px] truncate">{selectedFileName}</span>
                <X size={12} />
              </button>
            )}
            <div className="relative w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="시맨틱 검색..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white"
              />
            </div>
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); fetchChunks(null, null, selectedSource); }}
                className="text-[11px] text-gray-400 hover:text-gray-600 font-bold transition"
              >
                초기화
              </button>
            )}
          </div>
          <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full flex items-center gap-1">
            <Layers size={12} /> {total}개 청크
          </span>
        </div>

        {/* 청크 본문 */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Loader2 size={28} className="animate-spin text-blue-400 mb-3" />
              <p className="text-sm font-bold">청크 데이터를 불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <AlertCircle size={28} className="text-red-400 mb-3" />
              <p className="text-sm font-bold mb-1">로드 실패</p>
              <p className="text-xs">{error}</p>
              <button
                onClick={() => fetchChunks(null, null, selectedSource)}
                className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
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
                const preview = chunk.text.length > 200 ? chunk.text.slice(0, 200) + '...' : chunk.text;
                const fileName = chunk.source ? chunk.source.split('/').pop().split('\\').pop() : 'unknown';

                return (
                  <div
                    key={chunk.id}
                    className={`bg-white border rounded-xl transition-all hover:shadow-sm cursor-pointer ${isExpanded ? 'border-orange-200 shadow-sm' : 'border-gray-100 hover:border-gray-200'}`}
                    onClick={() => setExpandedId(isExpanded ? null : chunk.id)}
                  >
                    {/* 헤더 */}
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <span className="shrink-0 w-9 h-9 bg-orange-50 text-orange-600 rounded-lg flex items-center justify-center text-xs font-bold">
                        #{chunk.chunk_index}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!selectedSource && (
                            <>
                              <FileText size={12} className="text-gray-400 shrink-0" />
                              <span className="text-[11px] font-bold text-gray-500 truncate">{fileName}</span>
                            </>
                          )}
                          {chunk.score != null && (
                            <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                              유사도 {chunk.score}
                            </span>
                          )}
                        </div>
                        {!isExpanded && (
                          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">{preview}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-gray-300">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>

                    {/* 펼친 내용 */}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2">
                        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono border border-gray-100 max-h-72 overflow-y-auto custom-scrollbar">
                          {chunk.text}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                          <span className="flex items-center gap-1"><Hash size={10} /> ID: {chunk.id.slice(0, 12)}...</span>
                          {!selectedSource && chunk.source && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSelectFile(chunk.source); }}
                              className="text-orange-500 hover:text-orange-700 font-bold transition"
                            >
                              이 파일만 보기
                            </button>
                          )}
                          {chunk.metadata?.uploaded_at && (
                            <span>업로드: {chunk.metadata.uploaded_at}</span>
                          )}
                          <span>길이: {chunk.text.length}자</span>
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
    </div>
  );
}
