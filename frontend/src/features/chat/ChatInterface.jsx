import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { useStore } from "../../contexts/StoreContext";
import { streamChat, settingsAPI, extractFileText, feedbackAPI } from "../../api/client";
import { generateUUID } from "../../utils/uuid";
import {
  Bot,
  User,
  Sparkles,
  Send,
  Paperclip,
  ChevronDown,
  X,
  Upload,
  Loader2,
  CheckCircle,
  Database,
  Plug,
  Globe,
  Brain,
  StopCircle,
  FileText,
  Copy,
  RotateCw,
  HardDrive,
  ThumbsUp,
  ThumbsDown,
} from "../../components/ui/Icon";

const AgentIcon = ({ agentId, size = 12, className = "" }) => {
  switch (agentId) {
    case "agent-general":
      return <Sparkles size={size} className={className} />;
    case "agent-rag":
      return <FileText size={size} className={className} />;
    default:
      return <Bot size={size} className={className} />;
  }
};

export default function ChatInterface() {
  const {
    currentMessages,
    addMessage,
    renameSession,
    config,
    setConfig,
    agents,
    currentAgent,
    setCurrentAgentId,
    knowledgeBases,
    currentKbId,
    mcpServers,
    setSessions,
    currentSessionId,
    sessions,
  } = useStore();

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [files, setFiles] = useState([]);
  const [isExtractingFiles, setIsExtractingFiles] = useState(false);

  // 파일 미리보기 ObjectURL 관리 (메모리 누수 방지)
  const filePreviewUrls = useRef(new Map());
  const getFilePreviewUrl = useCallback((file) => {
    if (!filePreviewUrls.current.has(file)) {
      filePreviewUrls.current.set(file, URL.createObjectURL(file));
    }
    return filePreviewUrls.current.get(file);
  }, []);

  // files 변경 시 제거된 파일의 ObjectURL 해제
  useEffect(() => {
    const currentFiles = new Set(files);
    for (const [file, url] of filePreviewUrls.current) {
      if (!currentFiles.has(file)) {
        URL.revokeObjectURL(url);
        filePreviewUrls.current.delete(file);
      }
    }
    // 컴포넌트 언마운트 시 모든 URL 해제
    return () => {
      for (const url of filePreviewUrls.current.values()) {
        URL.revokeObjectURL(url);
      }
      filePreviewUrls.current.clear();
    };
  }, [files]);

  // UI 상태
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [isKbMenuOpen, setIsKbMenuOpen] = useState(false);
  const [isMcpMenuOpen, setIsMcpMenuOpen] = useState(false);

  // 기능 토글
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useDeepThink, setUseDeepThink] = useState(false);
  const [activeMcpIds, setActiveMcpIds] = useState([]);
  const [selectedKbIds, setSelectedKbIds] = useState([currentKbId]);

  // 모델 선택
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);

  // SQL 모드
  const [useSql, setUseSql] = useState(false);
  const [selectedDbConnectionId, setSelectedDbConnectionId] = useState(null);
  const [dbConnections, setDbConnections] = useState([]);
  const [isDbMenuOpen, setIsDbMenuOpen] = useState(false);

  // 복사 알림
  const [copiedId, setCopiedId] = useState(null);

  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

  const toggleKb = (kbId) => {
    setSelectedKbIds((prev) => {
      if (prev.includes(kbId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== kbId);
      }
      return [...prev, kbId];
    });
  };

  const selectedKbLabel =
    selectedKbIds.length === 1
      ? knowledgeBases.find((kb) => kb.id === selectedKbIds[0])?.name || "KB"
      : `${selectedKbIds.length}개 KB`;

  // DB 연결 목록 로드
  useEffect(() => {
    const loadDbConns = async () => {
      try {
        const data = await settingsAPI.getDbConnections();
        if (data?.connections) setDbConnections(data.connections);
      } catch (e) {
        /* ignore */
      }
    };
    loadDbConns();
  }, []);

  // 사용 가능한 모델 목록 로드 (마운트 시 + 모델 메뉴 열 때 갱신)
  const loadAvailableModels = useCallback(async () => {
    try {
      const result = await settingsAPI.getAvailableModels();
      if (result?.models) setAvailableModels(result.models);
    } catch (e) {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadAvailableModels();
  }, [loadAvailableModels]);

  useEffect(() => {
    if (isModelMenuOpen) loadAvailableModels();
  }, [isModelMenuOpen, loadAvailableModels]);

  // currentKbId 또는 knowledgeBases 변경 시 selectedKbIds 동기화
  useEffect(() => {
    const validIds = knowledgeBases.map((kb) => kb.id);
    setSelectedKbIds((prev) => {
      const filtered = prev.filter((id) => validIds.includes(id));
      if (filtered.length > 0) return filtered;
      // 유효한 ID가 없으면 currentKbId 또는 첫 번째 KB 사용
      if (validIds.includes(currentKbId)) return [currentKbId];
      if (validIds.length > 0) return [validIds[0]];
      return prev;
    });
  }, [currentKbId, knowledgeBases]);

  useEffect(() => {
    const handleClickOutside = () => {
      setIsAgentMenuOpen(false);
      setIsKbMenuOpen(false);
      setIsMcpMenuOpen(false);
      setIsDbMenuOpen(false);
      setIsModelMenuOpen(false);
    };
    if (isAgentMenuOpen || isKbMenuOpen || isMcpMenuOpen || isDbMenuOpen || isModelMenuOpen)
      window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [isAgentMenuOpen, isKbMenuOpen, isMcpMenuOpen, isDbMenuOpen, isModelMenuOpen]);

  // 세션 전환 시 스트리밍 중단 및 상태 초기화
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTyping(false);
    setIsExtractingFiles(false);
  }, [currentSessionId]);

  // 컴포넌트 unmount 시 스트리밍 중단
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [currentMessages, isTyping]);

  // textarea auto-resize
  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 192) + "px";
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
    e.target.value = "";
  };

  const toggleMcpServer = (id) => {
    setActiveMcpIds((prev) =>
      prev.includes(id) ? prev.filter((mid) => mid !== id) : [...prev, id],
    );
  };

  const handleSend = async (retryQuery = null) => {
    const query = retryQuery || input;
    if (!query.trim() && files.length === 0) return;

    // SQL 모드 검증: DB 미선택 시 전송 차단
    if (useSql && !selectedDbConnectionId) {
      addMessage({
        role: "assistant",
        text: "SQL 모드가 활성화되어 있지만 데이터베이스가 선택되지 않았습니다. 먼저 DB를 선택해주세요.",
      });
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const activeSessionId = currentSessionId;

    // 파일 텍스트/이미지 추출
    const TEXT_EXTENSIONS = [".txt", ".md", ".csv"];
    const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
    let fileTexts = [];
    let imageBase64List = [];
    const currentFiles = [...files];

    if (currentFiles.length > 0) {
      setIsExtractingFiles(true);
      try {
        const extractionPromises = currentFiles.map(async (file) => {
          const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

          if (IMAGE_EXTENSIONS.includes(ext)) {
            // 이미지 파일: base64로 인코딩
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                const base64 = e.target.result.split(',')[1]; // data:image/...;base64, 제거
                resolve({ filename: file.name, type: 'image', data: base64 });
              };
              reader.onerror = () => {
                console.error(`이미지 인코딩 실패: ${file.name}`);
                resolve({ filename: file.name, type: 'error' });
              };
              reader.readAsDataURL(file);
            });
          } else if (TEXT_EXTENSIONS.includes(ext)) {
            // 텍스트 파일: 클라이언트에서 직접 읽기
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve({ filename: file.name, type: 'text', text: e.target.result });
              reader.onerror = () => {
                console.error(`텍스트 읽기 실패: ${file.name}`);
                resolve({ filename: file.name, type: 'text', text: "" });
              };
              reader.readAsText(file);
            });
          } else {
            // 바이너리 파일: 서버에서 추출 (PDF, DOCX 등 - Docling 사용)
            try {
              const result = await extractFileText(file);
              return { ...result, type: 'document' };
            } catch (error) {
              console.error(`문서 추출 실패: ${file.name}`, error);
              return { filename: file.name, type: 'document', text: "" };
            }
          }
        });

        const results = await Promise.all(extractionPromises);

        // 결과를 타입별로 분리
        fileTexts = results.filter(r => r.type === 'text' || r.type === 'document');
        imageBase64List = results
          .filter(r => r.type === 'image' && r.data)
          .map(r => r.data);

        // 파일 처리 완료
      } catch (error) {
        console.error('파일 처리 중 오류:', error);
      } finally {
        setIsExtractingFiles(false);
      }
    }

    // 이미지 검증 (최대 5개, 경고만 표시)
    if (imageBase64List.length > 5) {
      // 이미지 5개 초과 시 처리 시간 길어질 수 있음
    }

    // 파일 텍스트를 쿼리에 병합
    let augmentedQuery = query;
    const validTexts = fileTexts.filter((ft) => ft.text?.trim());
    if (validTexts.length > 0) {
      const fileSection = validTexts
        .map((ft) => `[첨부 파일: ${ft.filename}]\n${ft.text}`)
        .join("\n\n");
      augmentedQuery = validTexts.length > 0 && query.trim()
        ? `${query}\n\n---\n${fileSection}`
        : fileSection || query;
    }

    // 이미지가 있는 경우 알림
    if (imageBase64List.length > 0 && !query.trim() && validTexts.length === 0) {
      augmentedQuery = "이 이미지에 대해 설명해주세요.";
    }

    if (!retryQuery) {
      const currentSession = sessions.find((s) => s.id === currentSessionId);
      if (currentSession && currentSession.messages.length === 0) {
        const title = query.length > 30 ? query.slice(0, 30) + "..." : query;
        renameSession(currentSessionId, title);
      }

      addMessage({
        role: "user",
        text: query,
        attachments: currentFiles.map((f) => ({ name: f.name })),
      });
      setInput("");
      setFiles([]);
    }

    setIsTyping(true);

    const aiMessageId = generateUUID();
    let accumulatedText = "";

    const initialThinking = useDeepThink
      ? "사용자의 질문을 심층 분석하고 있습니다..."
      : null;

    addMessage({
      id: aiMessageId,
      role: "assistant",
      text: "",
      thinking: initialThinking,
      thinkingTime: 0,
      sources: [],
    });

    const startTime = Date.now();

    try {
      const recentHistory = currentMessages
        .filter((m) => m.text)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.text }));

      const chatParams = {
        query: augmentedQuery,
        model: currentAgent?.model || config.llm,
        kb_ids: selectedKbIds,
        web_search: useWebSearch,
        use_deep_think: useDeepThink,
        active_mcp_ids: activeMcpIds,
        system_prompt: currentAgent?.systemPrompt || null,
        history: recentHistory,
        top_k: config.searchTopK || null,
        use_rerank: config.useRerank || false,
        search_provider: config.activeSearchProviderId || null,
        search_mode: config.searchMode || 'hybrid',
        dense_weight: config.denseWeight ?? 0.5,
        use_multimodal_search: config.useMultimodalSearch || false,
        images: imageBase64List,
        use_sql: useSql,
        db_connection_id: selectedDbConnectionId,
      };
      await streamChat(
        chatParams,
        (chunk) => {
          if (abortControllerRef.current?.signal.aborted) return;

          if (chunk.type === "thinking") {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === aiMessageId
                          ? { ...m, thinking: chunk.thinking }
                          : m,
                      ),
                    }
                  : s,
              ),
            );
          } else if (chunk.type === "sql") {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === aiMessageId
                          ? { ...m, generatedSql: chunk.sql }
                          : m,
                      ),
                    }
                  : s,
              ),
            );
          } else if (chunk.type === "table") {
            const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === aiMessageId
                          ? {
                              ...m,
                              tableData: {
                                columns: chunk.columns,
                                rows: chunk.rows,
                                total: chunk.total,
                              },
                              thinkingTime: timeElapsed,
                            }
                          : m,
                      ),
                    }
                  : s,
              ),
            );
          } else if (chunk.type === "tool_calls_meta") {
            // 도구 호출 메타데이터를 AI 메시지에 첨부 (파인튜닝 데이터 수집용)
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === aiMessageId
                          ? { ...m, toolCallsMeta: chunk.tool_calls }
                          : m,
                      ),
                    }
                  : s,
              ),
            );
          } else if (chunk.type === "content") {
            accumulatedText += chunk.content;
            const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === aiMessageId
                          ? {
                              ...m,
                              text: accumulatedText,
                              thinkingTime: timeElapsed,
                            }
                          : m,
                      ),
                    }
                  : s,
              ),
            );
          }
        },
        () => {
          setIsTyping(false);
          abortControllerRef.current = null;
        },
        abortControllerRef.current,
      );
    } catch (error) {
      console.error('채팅 전송 오류:', error);
      setIsTyping(false);

      // 에러 메시지 표시
      const errorMessage = error.message || '메시지 전송 중 오류가 발생했습니다.';
      addMessage({
        id: generateUUID(),
        role: "assistant",
        text: `⚠️ ${errorMessage}`,
        thinking: "",
        thinkingTime: 0,
        sources: [],
      });
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsTyping(false);
    }
  };

  const handleCopy = (text, msgId) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        // HTTPS가 아닌 환경에서 clipboard API 실패 시 폴백
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      });
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleFeedback = async (msgIndex, isPositive) => {
    const messages = currentMessages;
    if (msgIndex < 0 || msgIndex >= messages.length) return;

    const aiMsg = messages[msgIndex];
    const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;

    if (!userMsg || aiMsg.role !== "assistant") return;

    // 낙관적 업데이트: API 결과를 기다리지 않고 즉시 UI 반영
    const updatedMessages = [...messages];
    updatedMessages[msgIndex] = {
      ...updatedMessages[msgIndex],
      feedback: { is_positive: isPositive },
    };
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId ? { ...s, messages: updatedMessages } : s,
      ),
    );

    try {
      await feedbackAPI.create({
        session_id: currentSessionId,
        message_index: msgIndex,
        user_message: userMsg.text || "",
        ai_message: aiMsg.text || "",
        is_positive: isPositive,
        agent_id: currentAgent?.id,
        model_name: currentAgent?.model || config.llm,
        kb_ids: JSON.stringify(selectedKbIds),
        used_web_search: useWebSearch,
        used_deep_think: useDeepThink,
        tool_calls_json: aiMsg.toolCallsMeta
          ? JSON.stringify(aiMsg.toolCallsMeta)
          : null,
      });
    } catch (error) {
      console.error("피드백 저장 실패:", error);
    }
  };

  // 활성 기능 요약
  const activeFeatures = [];
  if (useWebSearch) activeFeatures.push("웹 검색");
  if (useDeepThink) activeFeatures.push("Deep Think");
  if (useSql) activeFeatures.push("SQL");
  if (activeMcpIds.length > 0) activeFeatures.push(`MCP ${activeMcpIds.length}`);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-gray-50">
      {/* 메시지 리스트 */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth"
        ref={scrollRef}
      >
        {currentMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-6 px-4">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg rounded-2xl flex items-center justify-center">
              <AgentIcon
                agentId={currentAgent?.id}
                size={36}
                className="text-white"
              />
            </div>
            <div className="text-center max-w-lg">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {currentAgent?.name || "AI"}에게 질문하세요
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {currentAgent?.description ||
                  "지식 베이스를 기반으로 정확하게 답변합니다."}
              </p>
            </div>
            {/* 추천 질문 */}
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {[
                "업로드한 문서를 요약해줘",
                "이 주제에 대해 설명해줘",
                "관련 정보를 찾아줘",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    textareaRef.current?.focus();
                  }}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50 hover:border-green-400 hover:text-green-600 transition-all font-medium shadow-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-1">
            {currentMessages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                msg={{
                  ...msg,
                  onFeedback: msg.role === "assistant" ? (isPositive) => handleFeedback(idx, isPositive) : null,
                }}
                isLast={idx === currentMessages.length - 1}
                isStreaming={isTyping && idx === currentMessages.length - 1 && msg.role === "assistant"}
                copiedId={copiedId}
                onCopy={handleCopy}
                onRegenerate={() =>
                  handleSend(
                    msg.role === "assistant" && idx > 0
                      ? currentMessages[idx - 1].text
                      : null,
                  )
                }
              />
            ))}
            {/* 타이핑 인디케이터 */}
            {isTyping && currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role === "user" && (
              <div className="flex items-start gap-3 py-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <Bot size={16} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-gray-400 ml-1">응답 생성 중...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 입력창 영역 */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="max-w-4xl mx-auto relative">
          {isTyping && (
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20">
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-red-300 shadow-md rounded-full text-sm text-red-600 hover:bg-red-50 font-medium transition-colors"
              >
                <StopCircle size={14} /> 생성 중단
              </button>
            </div>
          )}

          <div className="bg-white border border-gray-300 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-green-500 focus-within:border-green-500 transition-all flex flex-col relative">
            {/* 상단 태그 영역 */}
            <div className="px-3 pt-2.5 flex flex-wrap items-center gap-1.5">
              {/* 에이전트 선택 */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAgentMenuOpen(!isAgentMenuOpen);
                    setIsKbMenuOpen(false);
                    setIsMcpMenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    currentAgent
                      ? "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200"
                  }`}
                >
                  {currentAgent ? (
                    <AgentIcon agentId={currentAgent.id} size={12} />
                  ) : (
                    <Bot size={12} />
                  )}
                  <span className="max-w-[100px] truncate">
                    {currentAgent?.name || "기본 모드"}
                  </span>
                  <ChevronDown
                    size={10}
                    className={`transition-transform ${isAgentMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isAgentMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
                      에이전트 선택
                    </div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {/* 기본 모드 (에이전트 없음) */}
                      <button
                        onClick={() => {
                          setCurrentAgentId(null);
                          setIsAgentMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition ${
                          !currentAgent
                            ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                          !currentAgent
                            ? "bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}>
                          <Bot size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">기본 모드</div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">에이전트 없이 대화</div>
                        </div>
                        {!currentAgent && (
                          <CheckCircle size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                        )}
                      </button>
                      <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2 my-1" />
                      {agents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => {
                            setCurrentAgentId(agent.id);
                            setIsAgentMenuOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition ${
                            currentAgent?.id === agent.id
                              ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                            currentAgent?.id === agent.id
                              ? "bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                          }`}>
                            <AgentIcon agentId={agent.id} size={13} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate">{agent.name}</div>
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{agent.model || config.llm}</div>
                          </div>
                          {currentAgent?.id === agent.id && (
                            <CheckCircle size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 지식 베이스 선택 */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsKbMenuOpen(!isKbMenuOpen);
                    setIsAgentMenuOpen(false);
                    setIsMcpMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Database size={12} />
                  <span className="max-w-[120px] truncate">
                    {selectedKbLabel}
                  </span>
                  <ChevronDown
                    size={10}
                    className={`transition-transform ${isKbMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isKbMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
                      지식 베이스 (다중 선택)
                    </div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {knowledgeBases.map((kb) => {
                        const isSelected = selectedKbIds.includes(kb.id);
                        return (
                          <button
                            key={kb.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleKb(kb.id);
                            }}
                            className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                          >
                            <div
                              className={`w-4 h-4 border-2 rounded flex items-center justify-center transition ${
                                isSelected
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "border-gray-300 dark:border-gray-600"
                              }`}
                            >
                              {isSelected && (
                                <CheckCircle size={10} className="text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                                {kb.name}
                              </div>
                              <div className="text-[10px] text-gray-400 truncate">
                                {kb.files?.length || 0}개 문서
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 파일 태그 */}
              {files.map((file, idx) => {
                const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
                const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(ext);

                return (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] font-medium text-gray-700 dark:text-gray-300 shadow-sm"
                  >
                    {isImage ? (
                      <img
                        src={getFilePreviewUrl(file)}
                        alt={file.name}
                        className="w-6 h-6 object-cover rounded"
                      />
                    ) : (
                      <Paperclip size={10} className="text-gray-400" />
                    )}
                    <span className="max-w-[100px] truncate">{file.name}</span>
                    <button
                      onClick={() =>
                        setFiles((p) => p.filter((_, i) => i !== idx))
                      }
                      className="text-gray-400 hover:text-red-500 ml-0.5"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}

              {/* 활성 기능 표시 */}
              {activeFeatures.length > 0 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">
                  {activeFeatures.join(" · ")}
                </span>
              )}
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                !e.shiftKey &&
                (e.preventDefault(), handleSend())
              }
              placeholder={`${currentAgent?.name || "AI"}에게 메시지를 입력하세요...`}
              className="w-full bg-transparent border-none outline-none resize-none px-4 py-2 text-sm custom-scrollbar leading-relaxed min-h-[44px] max-h-48 dark:text-gray-100 dark:placeholder-gray-500"
              rows={1}
            />

            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
              <div className="flex items-center gap-0.5">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md,.pptx,.xlsx,.csv"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl transition"
                  title="파일 첨부"
                >
                  <Paperclip size={18} />
                </button>

                {/* 웹 검색 */}
                <button
                  onClick={() => setUseWebSearch(!useWebSearch)}
                  className={`p-2 rounded-xl transition flex items-center gap-1.5 ${
                    useWebSearch
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                      : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600"
                  }`}
                  title="웹 검색"
                >
                  <Globe size={18} />
                </button>

                {/* MCP */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMcpMenuOpen(!isMcpMenuOpen);
                      setIsAgentMenuOpen(false);
                      setIsKbMenuOpen(false);
                    }}
                    className={`p-2 rounded-xl transition flex items-center gap-1.5 ${
                      activeMcpIds.length > 0 || isMcpMenuOpen
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600"
                    }`}
                    title="MCP 도구"
                  >
                    <Plug size={18} />
                  </button>

                  {isMcpMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 overflow-hidden">
                      <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                        MCP 도구
                      </div>
                      <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                        {mcpServers.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">
                            연결된 MCP 서버가 없습니다.
                            <br />
                            설정에서 추가해주세요.
                          </div>
                        ) : (
                          mcpServers.map((server) => {
                            const isActive = activeMcpIds.includes(server.id);
                            return (
                              <button
                                key={server.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMcpServer(server.id);
                                }}
                                className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                              >
                                <div
                                  className={`w-4 h-4 border-2 rounded flex items-center justify-center transition ${
                                    isActive
                                      ? "bg-green-500 border-green-500"
                                      : "border-gray-300 dark:border-gray-600"
                                  }`}
                                >
                                  {isActive && (
                                    <CheckCircle
                                      size={10}
                                      className="text-white"
                                    />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                                    {server.name}
                                  </div>
                                  <div className="text-[10px] text-gray-400 truncate">
                                    {server.status}
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* SQL */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!useSql) {
                        setUseSql(true);
                        setIsDbMenuOpen(true);
                      } else {
                        setUseSql(false);
                        setSelectedDbConnectionId(null);
                        setIsDbMenuOpen(false);
                      }
                    }}
                    className={`p-2 rounded-xl transition flex items-center gap-1.5 ${
                      useSql
                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
                        : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600"
                    }`}
                    title="SQL 모드"
                  >
                    <HardDrive size={18} />
                  </button>

                  {isDbMenuOpen && (
                    <div
                      className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        데이터베이스 선택
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {dbConnections.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">
                            등록된 DB가 없습니다.
                            <br />
                            설정에서 추가해주세요.
                          </div>
                        ) : (
                          dbConnections.map((conn) => (
                            <button
                              key={conn.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDbConnectionId(conn.id);
                                setIsDbMenuOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition ${
                                selectedDbConnectionId === conn.id
                                  ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                                  : ""
                              }`}
                            >
                              <Database size={14} className="shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold truncate">
                                  {conn.name}
                                </div>
                                <div className="text-[10px] text-gray-400 truncate">
                                  {conn.db_type}
                                  {conn.db_type !== "sqlite" &&
                                    ` · ${conn.host}:${conn.port}`}
                                </div>
                              </div>
                              {selectedDbConnectionId === conn.id && (
                                <CheckCircle
                                  size={12}
                                  className="text-orange-600 shrink-0"
                                />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

                {/* Deep Think + 모델 */}
                <button
                  onClick={() => setUseDeepThink(!useDeepThink)}
                  className={`p-2 rounded-xl transition ${
                    useDeepThink
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600"
                      : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600"
                  }`}
                  title="Deep Thinking"
                >
                  <Brain size={18} />
                </button>
                {/* 모델 선택 드롭다운 */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsModelMenuOpen(!isModelMenuOpen);
                      setIsAgentMenuOpen(false);
                      setIsKbMenuOpen(false);
                      setIsMcpMenuOpen(false);
                      setIsDbMenuOpen(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
                    title="모델 변경"
                  >
                    <span className="max-w-[140px] truncate">
                      {currentAgent?.model || config.llm}
                    </span>
                    <ChevronDown size={8} className={`transition-transform ${isModelMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isModelMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 overflow-hidden">
                      <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        모델 선택
                        {currentAgent?.model && (
                          <span className="ml-1 text-[9px] text-amber-500 normal-case">
                            (에이전트 설정 우선)
                          </span>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">
                        {availableModels.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">
                            사용 가능한 모델이 없습니다.
                          </div>
                        ) : (
                          (() => {
                            const providerLabels = {
                              ollama: "🏠 로컬 (Ollama)",
                              openai: "🤖 OpenAI",
                              anthropic: "🧠 Anthropic",
                              google: "🔍 Google AI",
                              groq: "⚡ Groq",
                            };
                            const grouped = {};
                            availableModels.forEach((m) => {
                              const p = m.provider || "ollama";
                              if (!grouped[p]) grouped[p] = [];
                              grouped[p].push(m);
                            });
                            return Object.entries(grouped).map(([provider, models]) => (
                              <div key={provider}>
                                <div className="px-3 py-1.5 text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                  {providerLabels[provider] || provider}
                                </div>
                                {models.map((m) => {
                                  const activeModel = currentAgent?.model || config.llm;
                                  const isActive = activeModel === m.name;
                                  return (
                                    <button
                                      key={m.name}
                                      onClick={() => {
                                        setConfig({ ...config, llm: m.name });
                                        setIsModelMenuOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition ${
                                        isActive
                                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                      }`}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold truncate flex items-center gap-1">
                                          {m.display_name || m.name}
                                          {m.is_korean && (
                                            <span className="text-[8px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1 py-0.5 rounded font-bold shrink-0">KR</span>
                                          )}
                                        </div>
                                      </div>
                                      {isActive && (
                                        <CheckCircle size={12} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ));
                          })()
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && files.length === 0) || isTyping || isExtractingFiles}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm ${
                  (input.trim() || files.length > 0) && !isTyping && !isExtractingFiles
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isExtractingFiles ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : isTyping ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} fill="currentColor" />
                )}
                <span className="hidden sm:inline">{isExtractingFiles ? "분석 중" : "전송"}</span>
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
            AI can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, isLast, isStreaming, copiedId, onCopy, onRegenerate }) {
  const isUser = msg.role === "user";
  const isCopied = copiedId === msg.id;
  const hasText = msg.text && msg.text.trim().length > 0;
  const thinkingDone = hasText && msg.thinking;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group py-3`}>
      <div
        className={`flex max-w-[80%] ${
          isUser ? "flex-row-reverse" : "flex-row"
        } items-start gap-3`}
      >
        {/* 아바타 */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            isUser
              ? "bg-indigo-600"
              : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          }`}
        >
          {isUser ? (
            <User size={16} className="text-white" />
          ) : (
            <Bot size={16} className="text-indigo-600 dark:text-indigo-400" />
          )}
        </div>

        {/* 메시지 내용 */}
        <div className="flex flex-col gap-1.5 min-w-0">
          {/* 이름 + 시간 */}
          <div
            className={`flex items-center gap-2 ${
              isUser ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              {isUser ? "You" : "AI"}
            </span>
            {msg.time && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {msg.time}
              </span>
            )}
            {msg.thinkingTime > 0 && !isUser && hasText && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {msg.thinkingTime}s
              </span>
            )}
          </div>

          {/* Thinking */}
          {msg.thinking && (
            <div className={`text-xs text-gray-500 dark:text-gray-400 italic p-3 rounded-xl border ${
              thinkingDone
                ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                : "bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900"
            }`}>
              <div className="flex items-center gap-2 mb-1.5 font-bold text-[11px]">
                {thinkingDone ? (
                  <><CheckCircle size={11} className="text-green-500" /> <span className="text-gray-500">사고 과정</span></>
                ) : (
                  <><Loader2 size={11} className="animate-spin text-indigo-500" /> <span className="text-indigo-500">분석 중...</span></>
                )}
              </div>
              <div className="pl-4 border-l-2 border-gray-200 dark:border-gray-600 leading-relaxed max-h-32 overflow-y-auto custom-scrollbar">
                {msg.thinking}
              </div>
            </div>
          )}

          {/* SQL 쿼리 표시 */}
          {msg.generatedSql && (
            <div className="bg-gray-900 dark:bg-gray-950 rounded-xl p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Generated SQL</span>
                <button
                  onClick={() => navigator.clipboard.writeText(msg.generatedSql)}
                  className="text-gray-500 hover:text-gray-300 transition"
                  title="SQL 복사"
                >
                  <Copy size={11} />
                </button>
              </div>
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {msg.generatedSql}
              </pre>
            </div>
          )}

          {/* 테이블 결과 */}
          {msg.tableData && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    {msg.tableData.columns.map((col, i) => (
                      <th key={i} className="px-3 py-2 text-left font-bold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {msg.tableData.rows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800">
                          {cell === null || cell === undefined ? (
                            <span className="text-gray-400 italic">NULL</span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-1.5 text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                총 {msg.tableData.total}건
              </div>
            </div>
          )}

          {/* 메인 텍스트 */}
          {hasText && (
            <div
              className={`px-4 py-3 rounded-2xl text-sm leading-relaxed break-words relative group/bubble ${
                isUser
                  ? "bg-indigo-600 text-white rounded-tr-sm"
                  : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-tl-sm"
              }`}
            >
              {isUser ? (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              ) : (
                <div className="markdown-body prose prose-sm dark:prose-invert max-w-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:text-indigo-600 dark:prose-code:text-indigo-400 prose-code:before:content-none prose-code:after:content-none prose-code:font-mono prose-code:text-xs">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              )}

              {/* 스트리밍 커서 */}
              {isStreaming && !isUser && (
                <span className="inline-block w-0.5 h-4 bg-indigo-500 animate-pulse ml-0.5 align-text-bottom" />
              )}

              {/* 기능 버튼 */}
              {!isUser && !isStreaming && (
                <div className="absolute -bottom-8 left-0 flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity">
                  <button
                    onClick={() => onCopy(msg.text, msg.id)}
                    className={`p-1.5 rounded-lg transition text-xs flex items-center gap-1 ${
                      isCopied
                        ? "text-green-500 bg-green-50 dark:bg-green-900/30"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                    title="복사"
                  >
                    {isCopied ? <><CheckCircle size={12} /> 복사됨</> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={onRegenerate}
                    className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"
                    title="재생성"
                  >
                    <RotateCw size={12} />
                  </button>
                  <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
                  <button
                    onClick={() => msg.onFeedback && msg.onFeedback(true)}
                    className={`p-1.5 rounded-lg transition ${
                      msg.feedback?.is_positive === true
                        ? "text-green-600 bg-green-50 dark:bg-green-900/30"
                        : "text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30"
                    }`}
                    title="좋아요"
                  >
                    <ThumbsUp size={12} />
                  </button>
                  <button
                    onClick={() => msg.onFeedback && msg.onFeedback(false)}
                    className={`p-1.5 rounded-lg transition ${
                      msg.feedback?.is_positive === false
                        ? "text-red-600 bg-red-50 dark:bg-red-900/30"
                        : "text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                    }`}
                    title="싫어요"
                  >
                    <ThumbsDown size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 첨부파일 */}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className={`flex flex-wrap gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
              {msg.attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-[11px] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                >
                  <Paperclip size={10} className="text-gray-400" /> {file.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
