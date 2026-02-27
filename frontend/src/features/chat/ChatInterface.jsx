import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { useStore } from "../../contexts/StoreContext";
import { useToast } from "../../contexts/ToastContext";
import { streamChat, settingsAPI, extractFileText, feedbackAPI, sessionsAPI } from "../../api/client";
import { generateUUID } from "../../utils/uuid";
import {
  Bot,
  User,
  Sparkles,
  Send,
  Paperclip,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  X,
  Loader2,
  CheckCircle,
  StopCircle,
  FileText,
  Copy,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
} from "../../components/ui/Icon";
import AgentPipeline from "./AgentPipeline";
import FollowUpSuggestions from "./FollowUpSuggestions";
import CitationPopover, { CitationBadge } from "./CitationPopover";
import ContextChips from "./ContextChips";

const TEXT_EXTENSIONS = [".txt", ".md", ".csv"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".doc", ".pptx", ".xlsx"];
const ACCEPT_FILE_EXTENSIONS = [
  ...DOCUMENT_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
];
const MAX_ATTACHMENTS = 10;

const getFileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;

// 코드 블록 복사 버튼 컴포넌트
function CodeBlockPre({ children, ...props }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);
  const handleCopyCode = () => {
    const text = codeRef.current?.textContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group/code">
      <pre ref={codeRef} {...props}>{children}</pre>
      <button
        onClick={handleCopyCode}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-gray-600 hover:text-white opacity-0 group-hover/code:opacity-100 transition-all text-[10px] flex items-center gap-1"
      >
        {copied ? <><CheckCircle size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
      </button>
    </div>
  );
}

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
  const { toast } = useToast();
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
    DEFAULT_TOOL_PRESET,
  } = useStore();

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
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

  const [activeMcpIds, setActiveMcpIds] = useState([]);
  const [selectedKbIds, setSelectedKbIds] = useState([currentKbId]);
  const [selectedDbConnectionId, setSelectedDbConnectionId] = useState(null);
  const [dbConnections, setDbConnections] = useState([]);

  // 에이전트 기본값 (sources 형식) — 에이전트 선택이 곧 소스 선택
  const agentDefaults = currentAgent?.defaultTools || DEFAULT_TOOL_PRESET || { sources: { rag: true, web_search: false, mcp: false, sql: false } };

  // 최종 소스 상태 (에이전트에서 직접 결정, 오버라이드 없음)
  const effectiveSources = useMemo(() => ({
    rag: agentDefaults.sources?.rag ?? true,
    web_search: agentDefaults.sources?.web_search ?? false,
    mcp: agentDefaults.sources?.mcp ?? false,
    sql: agentDefaults.sources?.sql ?? false,
  }), [agentDefaults]);

  // Smart Mode 자동 계산: 활성 소스 2개 이상이면 AI 자동 선택
  const activeSourceCount = useMemo(() =>
    Object.values(effectiveSources).filter(Boolean).length,
    [effectiveSources]
  );
  const smartMode = activeSourceCount >= 2;

  // 복사 알림
  const [copiedId, setCopiedId] = useState(null);

  // 스마트 스크롤
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isNearBottomRef = useRef(true);

  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

  const toggleKb = (kbId) => {
    setSelectedKbIds((prev) => {
      if (prev.includes(kbId)) {
        return prev.filter((id) => id !== kbId);  // KB 전체 해제 허용
      }
      return [...prev, kbId];
    });
  };

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
    if (isNearBottomRef.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [currentMessages, isTyping]);

  // 스마트 스크롤 감지
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 150;
    const isNear = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottomRef.current = isNear;
    setShowScrollButton(!isNear && currentMessages.length > 0);
  }, [currentMessages.length]);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setShowScrollButton(false);
  }, []);

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

  const appendFiles = useCallback((incomingFiles) => {
    if (!incomingFiles || incomingFiles.length === 0) return;

    let duplicateCount = 0;
    let overflowCount = 0;

    setFiles((prev) => {
      const next = [...prev];
      const keys = new Set(prev.map(getFileKey));

      for (const file of incomingFiles) {
        const key = getFileKey(file);
        if (keys.has(key)) {
          duplicateCount += 1;
          continue;
        }
        if (next.length >= MAX_ATTACHMENTS) {
          overflowCount += 1;
          continue;
        }
        next.push(file);
        keys.add(key);
      }
      return next;
    });

    if (duplicateCount > 0) {
      toast.info(`중복 파일 ${duplicateCount}개를 제외했습니다.`);
    }
    if (overflowCount > 0) {
      toast.warning(`첨부 파일은 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
    }
  }, [toast]);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      appendFiles(Array.from(e.target.files));
    }
    e.target.value = "";
  };

  const toggleMcpServer = (id) => {
    setActiveMcpIds((prev) =>
      prev.includes(id) ? prev.filter((mid) => mid !== id) : [...prev, id],
    );
  };

  // 에이전트 변경 시 하위 선택 초기화
  const handleAgentChange = useCallback((agentId) => {
    setCurrentAgentId(agentId);
    setActiveMcpIds([]);
    setSelectedDbConnectionId(null);
  }, [setCurrentAgentId]);

  const handleSend = async (retryQuery = null) => {
    const query = retryQuery || input;
    if (!query.trim() && files.length === 0) return;

    // SQL 모드 검증: DB 미선택 시 전송 차단
    if (effectiveSources.sql && !selectedDbConnectionId) {
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
    let latestThinking = null;
    let latestToolCallsMeta = null;

    const initialThinking = smartMode
      ? "Smart Mode: 최적 소스를 분석하고 있습니다..."
      : null;
    latestThinking = initialThinking;

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
        kb_ids: effectiveSources.rag ? selectedKbIds : [],
        use_rag: effectiveSources.rag,
        web_search: effectiveSources.web_search,
        use_deep_think: smartMode,
        active_mcp_ids: effectiveSources.mcp ? activeMcpIds : [],
        system_prompt: currentAgent?.systemPrompt || null,
        history: recentHistory,
        top_k: config.searchTopK || null,
        use_rerank: config.useRerank || false,
        search_provider: config.activeSearchProviderId || null,
        search_mode: config.searchMode || 'hybrid',
        dense_weight: config.denseWeight ?? 0.5,
        use_multimodal_search: config.useMultimodalSearch || false,
        images: imageBase64List,
        use_sql: effectiveSources.sql,
        db_connection_id: effectiveSources.sql ? selectedDbConnectionId : null,
      };
      await streamChat(
        chatParams,
        (chunk) => {
          if (abortControllerRef.current?.signal.aborted) return;

          if (chunk.type === "thinking") {
            latestThinking = chunk.thinking || latestThinking;
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === aiMessageId
                          ? { ...m, thinking: chunk.thinking, activeAgent: chunk.active_agent || m.activeAgent }
                          : m,
                      ),
                    }
                  : s,
              ),
            );
          } else if (chunk.type === "pipeline_plan") {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? { ...s, messages: s.messages.map((m) => m.id === aiMessageId ? { ...m, pipelineAgents: chunk.agents, completedAgents: {} } : m) }
                  : s,
              ),
            );
          } else if (chunk.type === "agent_status" && chunk.status === "done") {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? { ...s, messages: s.messages.map((m) => m.id === aiMessageId ? { ...m, completedAgents: { ...(m.completedAgents || {}), [chunk.agent]: chunk.duration_ms || 0 } } : m) }
                  : s,
              ),
            );
          } else if (chunk.type === "agent_status" && chunk.status === "active") {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? { ...s, messages: s.messages.map((m) => m.id === aiMessageId ? { ...m, activeAgent: chunk.agent } : m) }
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
            latestToolCallsMeta = chunk.tool_calls || latestToolCallsMeta;
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
          } else if (chunk.type === "sources") {
            // 인용 출처 메타데이터
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === aiMessageId
                          ? { ...m, sources: chunk.sources }
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
          const wasAborted = abortControllerRef.current?.signal?.aborted;
          setIsTyping(false);
          abortControllerRef.current = null;

          // 최종 assistant 응답을 백엔드에 영속화
          if (!wasAborted && accumulatedText.trim()) {
            sessionsAPI.addMessage(activeSessionId, {
              role: "assistant",
              content: accumulatedText,
              thinking: latestThinking || null,
              metadata_json: latestToolCallsMeta
                ? JSON.stringify(latestToolCallsMeta)
                : null,
            }).catch((e) => console.warn("assistant 메시지 백엔드 저장 실패:", e));
          }
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

  const hasInput = input.trim().length > 0 || files.length > 0;
  const sqlDbRequired = effectiveSources.sql && !selectedDbConnectionId;
  const sendDisabled = !hasInput || isTyping || isExtractingFiles || sqlDbRequired;

  const handleInputKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent?.isComposing || isComposing) return;
    if (sendDisabled) return;
    e.preventDefault();
    handleSend();
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
        used_web_search: effectiveSources.web_search,
        used_deep_think: smartMode,
        tool_calls_json: aiMsg.toolCallsMeta
          ? JSON.stringify(aiMsg.toolCallsMeta)
          : null,
      });
    } catch (error) {
      console.error("피드백 저장 실패:", error);
    }
  };

  // 동적 시작 질문
  const starterQuestions = useMemo(() => {
    const questions = [];
    if (effectiveSources.sql) {
      questions.push("데이터베이스에서 매출 현황을 조회해줘");
      questions.push("테이블 구조를 보여줘");
    }
    if (currentAgent?.systemPrompt) {
      questions.push(`${currentAgent.name}에게 역할에 대해 물어보기`);
    }
    const kbName = knowledgeBases.find(kb => selectedKbIds.includes(kb.id))?.name;
    if (kbName) {
      questions.push(`"${kbName}" 문서를 요약해줘`);
      questions.push(`"${kbName}"에서 핵심 내용을 찾아줘`);
    }
    if (effectiveSources.web_search) {
      questions.push("최신 뉴스를 검색해줘");
    }
    const defaults = ["업로드한 문서를 요약해줘", "궁금한 점을 질문해보세요", "데이터를 요약해줘"];
    while (questions.length < 3) {
      questions.push(defaults[questions.length]);
    }
    return questions.slice(0, 3);
  }, [effectiveSources, currentAgent, knowledgeBases, selectedKbIds]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-gray-50">
      {/* 메시지 리스트 */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth relative"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {currentMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-6 px-4">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 shadow-lg rounded-2xl flex items-center justify-center">
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
              {starterQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    textareaRef.current?.focus();
                  }}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50 hover:border-green-300 hover:text-green-500 transition-all font-medium shadow-sm"
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
            {/* Follow-up Suggestions */}
            {!isTyping && currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role === 'assistant' && currentMessages[currentMessages.length - 1].text && (
              <div className="max-w-[80%] ml-11">
                <FollowUpSuggestions message={currentMessages[currentMessages.length - 1]} onSend={(text) => handleSend(text)} />
              </div>
            )}
            {/* 타이핑 인디케이터 */}
            {isTyping && currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role === "user" && (
              <div className="flex items-start gap-3 py-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <Bot size={16} className="text-gray-600 dark:text-gray-400" />
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

      {/* 새 메시지 스크롤 버튼 */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 text-xs font-medium rounded-full shadow-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-all animate-slideUp z-10"
        >
          <ArrowDown size={14} /> 새 메시지
        </button>
      )}

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

          <div className="bg-white border border-gray-300 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-green-400 focus-within:border-green-400 transition-all flex flex-col relative">
            {/* 상단: Context Chips */}
            <div className="px-3 pt-2.5 flex flex-wrap items-center gap-1.5">
              <ContextChips
                agents={agents}
                currentAgent={currentAgent}
                config={config}
                onAgentChange={handleAgentChange}
                effectiveSources={effectiveSources}
                knowledgeBases={knowledgeBases}
                selectedKbIds={selectedKbIds}
                onToggleKb={toggleKb}
                mcpServers={mcpServers}
                activeMcpIds={activeMcpIds}
                onToggleMcp={toggleMcpServer}
                dbConnections={dbConnections}
                selectedDbConnectionId={selectedDbConnectionId}
                onSelectDb={setSelectedDbConnectionId}
              />
            </div>

            {/* 파일 태그 */}
            {files.length > 0 && (
              <div className="px-3 pb-1.5 pt-1 flex items-start gap-2">
                <div className="flex flex-wrap items-center gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
                  {/* 파일 태그 */}
                  {files.map((file, idx) => {
                    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
                    const isImage = IMAGE_EXTENSIONS.includes(ext);

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
                </div>
                <button
                  onClick={() => setFiles([])}
                  className="shrink-0 px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md border border-gray-200 transition-colors"
                  title="첨부 파일 전체 제거"
                >
                  전체 삭제
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onBlur={() => setIsComposing(false)}
              placeholder={`${currentAgent?.name || "AI"}에게 메시지를 입력하세요...`}
              className="w-full bg-transparent border-none outline-none resize-none px-4 py-2 text-sm custom-scrollbar leading-relaxed min-h-[44px] max-h-48 dark:text-gray-100 dark:placeholder-gray-500"
              rows={1}
            />

            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
              <div className="flex items-center gap-0.5">
                <input
                  type="file"
                  multiple
                  accept={ACCEPT_FILE_EXTENSIONS.join(",")}
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isTyping || isExtractingFiles || files.length >= MAX_ATTACHMENTS}
                  className="p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                  title="파일 첨부"
                >
                  <Paperclip size={18} />
                </button>
              </div>
              <button
                onClick={() => handleSend()}
                disabled={sendDisabled}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm ${
                  !sendDisabled
                    ? "bg-green-500 text-white hover:bg-green-600 shadow-sm hover:shadow"
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
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-[10px] text-gray-400">
                {isComposing ? "한글 입력 중..." : "Enter 전송 · Shift+Enter 줄바꿈"}
              </p>
              {sqlDbRequired && (
                <p className="text-[10px] text-amber-600 font-medium">
                  SQL 사용 시 DB 연결을 먼저 선택하세요.
                </p>
              )}
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

  // 인용 출처 팝오버 상태
  const [activeCitation, setActiveCitation] = useState(null);

  // Thinking 접기/펼치기
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  // [N] 패턴을 CitationBadge로 변환하는 헬퍼
  const wrapCitations = useCallback((children) => {
    if (!msg.sources?.length) return children;
    return React.Children.map(children, child => {
      if (typeof child === 'string') {
        const parts = [];
        let lastIdx = 0;
        const regex = /\[(\d+)\]/g;
        let m;
        while ((m = regex.exec(child)) !== null) {
          const num = parseInt(m[1]);
          const src = msg.sources.find(s => s.id === num);
          if (src) {
            if (m.index > lastIdx) parts.push(child.slice(lastIdx, m.index));
            parts.push(
              <CitationBadge
                key={`c${num}-${m.index}`}
                num={num}
                source={src}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveCitation({ source: src, anchorRect: rect });
                }}
              />
            );
            lastIdx = regex.lastIndex;
          }
        }
        if (parts.length > 0) {
          if (lastIdx < child.length) parts.push(child.slice(lastIdx));
          return parts;
        }
      }
      return child;
    });
  }, [msg.sources]);

  // ReactMarkdown 컴포넌트 오버라이드 (인용 + 코드 블록 복사)
  const markdownComponents = useMemo(() => {
    const comps = { pre: CodeBlockPre };
    if (msg.sources?.length) {
      const wrap = (Tag) => ({ children, node, ...props }) => <Tag {...props}>{wrapCitations(children)}</Tag>;
      Object.assign(comps, { p: wrap('p'), li: wrap('li'), td: wrap('td'), strong: wrap('strong'), em: wrap('em') });
    }
    return comps;
  }, [msg.sources, wrapCitations]);

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
              ? "bg-gray-600"
              : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          }`}
        >
          {isUser ? (
            <User size={16} className="text-white" />
          ) : (
            <Bot size={16} className="text-gray-600 dark:text-gray-400" />
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

          {/* 도구 호출 뱃지 */}
          {!isUser && msg.toolCallsMeta && msg.toolCallsMeta.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {msg.toolCallsMeta.map((tc, i) => {
                const toolStyles = {
                  vector_retrieval: { icon: "📚", label: "RAG 검색", bg: "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
                  web_search: { icon: "🌐", label: "웹 검색", bg: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300 border-green-200 dark:border-green-800" },
                  mcp_tools: { icon: "🔌", label: "MCP", bg: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800" },
                  sql_query: { icon: "🗄️", label: "SQL", bg: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
                  process: { icon: "⚙️", label: "물류 도구", bg: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-800" },
                };
                const style = toolStyles[tc.name] || { icon: "🔧", label: tc.name || "도구", bg: "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700" };
                const durationSec = tc.duration_ms ? (tc.duration_ms / 1000).toFixed(1) : null;
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${style.bg}`}>
                    <span>{style.icon}</span> {style.label}
                    {durationSec && <span className="opacity-50">{durationSec}s</span>}
                  </span>
                );
              })}
            </div>
          )}

          {/* Agent Pipeline Visualization */}
          {msg.pipelineAgents?.length > 0 && (
            <AgentPipeline
              agents={msg.pipelineAgents}
              activeAgent={msg.activeAgent}
              completedMap={msg.completedAgents || {}}
            />
          )}

          {/* Thinking */}
          {msg.thinking && (
            <div className={`text-xs text-gray-500 dark:text-gray-400 italic p-3 rounded-xl border ${
              thinkingDone
                ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                : "bg-gray-50/50 dark:bg-gray-900/20 border-gray-100 dark:border-gray-900"
            }`}>
              <div
                className={`flex items-center gap-2 font-bold text-[11px] ${thinkingDone ? "cursor-pointer select-none" : "mb-1.5"}`}
                onClick={() => thinkingDone && setThinkingExpanded(!thinkingExpanded)}
              >
                {thinkingDone ? (
                  <><CheckCircle size={11} className="text-green-400" /> <span className="text-gray-500">사고 과정</span></>
                ) : (
                  <><Loader2 size={11} className="animate-spin text-green-400" /> <span className="text-gray-500">분석 중...</span></>
                )}
                {msg.activeAgent && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border not-italic ${
                    {
                      supervisor: 'bg-purple-50 text-purple-600 border-purple-200',
                      rag: 'bg-blue-50 text-blue-600 border-blue-200',
                      web_search: 'bg-cyan-50 text-cyan-600 border-cyan-200',
                      t2sql: 'bg-amber-50 text-amber-600 border-amber-200',
                      mcp: 'bg-indigo-50 text-indigo-600 border-indigo-200',
                      process: 'bg-orange-50 text-orange-600 border-orange-200',
                      synthesizer: 'bg-green-50 text-green-600 border-green-200',
                    }[msg.activeAgent] || 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}>
                    {{
                      supervisor: 'Supervisor',
                      rag: 'RAG',
                      web_search: 'Web Search',
                      t2sql: 'T2SQL',
                      mcp: 'MCP',
                      process: 'Process',
                      synthesizer: 'Synthesizer',
                    }[msg.activeAgent] || msg.activeAgent}
                  </span>
                )}
                {thinkingDone && (
                  <span className="ml-auto p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                    {thinkingExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </span>
                )}
              </div>
              <div className={`pl-4 border-l-2 border-gray-200 dark:border-gray-600 leading-relaxed custom-scrollbar transition-all duration-300 overflow-hidden ${
                !thinkingDone ? "max-h-32 overflow-y-auto mt-1.5" :
                thinkingExpanded ? "max-h-[300px] overflow-y-auto mt-1.5" : "max-h-0"
              }`}>
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
              <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
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
                  ? "bg-green-500 text-white rounded-tr-sm"
                  : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-tl-sm"
              }`}
            >
              {isUser ? (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              ) : (
                <div className="markdown-body prose prose-sm dark:prose-invert max-w-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:text-gray-600 dark:prose-code:text-gray-400 prose-code:before:content-none prose-code:after:content-none prose-code:font-mono prose-code:text-xs">
                  <ReactMarkdown components={markdownComponents}>{msg.text}</ReactMarkdown>
                </div>
              )}

              {/* 스트리밍 커서 */}
              {isStreaming && !isUser && (
                <span className="inline-block w-0.5 h-4 bg-gray-500 animate-pulse ml-0.5 align-text-bottom" />
              )}

              {/* 기능 버튼 */}
              {!isUser && !isStreaming && (
                <div className="absolute -bottom-8 left-0 flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 mobile-always-show transition-opacity">
                  <button
                    onClick={() => onCopy(msg.text, msg.id)}
                    className={`p-1.5 rounded-lg transition text-xs flex items-center gap-1 ${
                      isCopied
                        ? "text-green-400 bg-green-50 dark:bg-green-800/30"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                    title="복사"
                  >
                    {isCopied ? <><CheckCircle size={12} /> 복사됨</> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={onRegenerate}
                    className="p-1.5 text-gray-400 hover:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900/30 rounded-lg transition"
                    title="재생성"
                  >
                    <RotateCw size={12} />
                  </button>
                  <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
                  <button
                    onClick={() => msg.onFeedback && msg.onFeedback(true)}
                    className={`p-1.5 rounded-lg transition ${
                      msg.feedback?.is_positive === true
                        ? "text-green-500 bg-green-50 dark:bg-green-800/30"
                        : "text-gray-400 hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-800/30"
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

          {/* 인용 출처 요약 */}
          {!isUser && !isStreaming && msg.sources?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-[10px] text-gray-400 font-medium">출처:</span>
              {msg.sources.map((src) => (
                <button
                  key={src.id}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setActiveCitation({ source: src, anchorRect: rect });
                  }}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  <FileText size={10} />
                  <span className="max-w-[120px] truncate">{src.filename}</span>
                </button>
              ))}
            </div>
          )}

          {/* 인용 팝오버 */}
          {activeCitation && (
            <CitationPopover
              source={activeCitation.source}
              anchorRect={activeCitation.anchorRect}
              onClose={() => setActiveCitation(null)}
            />
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
