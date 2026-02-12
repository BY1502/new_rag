/**
 * 통합 API 클라이언트
 * 모든 백엔드 API 호출을 이 파일에서 관리합니다.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

// 요청 타임아웃 (ms)
const REQUEST_TIMEOUT = 30000;
const UPLOAD_TIMEOUT = 300000; // 파일 업로드는 5분

/**
 * 인증 헤더를 반환합니다.
 */
export const getAuthHeader = () => {
  const token = localStorage.getItem("rag_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * API 에러 클래스
 */
export class ApiError extends Error {
  constructor(message, status, detail = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * API 에러를 처리합니다.
 */
const handleApiError = async (response) => {
  if (response.status === 401) {
    // 토큰 만료 시 로그아웃 처리
    localStorage.removeItem("rag_token");
    window.location.href = "/login";
    throw new ApiError("인증이 만료되었습니다. 다시 로그인해주세요.", 401);
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") || "60";
    throw new ApiError(
      `요청이 너무 많습니다. ${retryAfter}초 후에 다시 시도해주세요.`,
      429,
      { retryAfter: parseInt(retryAfter) },
    );
  }

  if (response.status === 413) {
    throw new ApiError("파일 크기가 너무 큽니다.", 413);
  }

  let errorMessage = `요청 실패 (${response.status})`;
  let detail = null;

  try {
    const errorData = await response.json();
    errorMessage = errorData.detail || errorMessage;
    detail = errorData;
  } catch {
    // JSON 파싱 실패 시 기본 메시지 사용
  }

  throw new ApiError(errorMessage, response.status, detail);
};

/**
 * 타임아웃이 있는 fetch 래퍼
 */
const fetchWithTimeout = async (url, options, timeout = REQUEST_TIMEOUT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new ApiError("요청 시간이 초과되었습니다.", 408);
    }
    throw new ApiError(
      navigator.onLine
        ? "서버에 연결할 수 없습니다."
        : "네트워크 연결을 확인해주세요.",
      0,
    );
  }
};

/**
 * 스트리밍 채팅 API
 */
export const streamChat = async (
  { query, model, kb_ids, web_search, use_deep_think, active_mcp_ids, system_prompt, history, top_k, use_rerank, search_provider, search_mode, images, use_sql, db_connection_id },
  onChunk,
  onComplete,
  abortController,
) => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        message: query,
        kb_ids: kb_ids && kb_ids.length > 0 ? kb_ids : ["default_kb"],
        model: model,
        system_prompt: system_prompt || null,
        history: history || [],
        use_web_search: web_search || false,
        use_deep_think: use_deep_think || false,
        active_mcp_ids: active_mcp_ids || [],
        top_k: top_k || null,
        use_rerank: use_rerank || false,
        search_provider: search_provider || null,
        search_mode: search_mode || 'hybrid',
        images: images || [],
        use_sql: use_sql || false,
        db_connection_id: db_connection_id || null,
      }),
      signal: abortController?.signal,
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const jsonStr =
            line.startsWith('"') && line.endsWith('"')
              ? JSON.parse(line)
              : line;
          const data =
            typeof jsonStr === "object" ? jsonStr : JSON.parse(jsonStr);
          onChunk(data);
        } catch (e) {
          // JSON 파싱 실패 - 무시
        }
      }
    }

    if (onComplete) onComplete();
  } catch (error) {
    if (error.name === "AbortError") {
      if (onComplete) onComplete();
      return;
    }

    const errorMessage =
      error instanceof ApiError ? error.message : "서버 연결에 실패했습니다.";

    onChunk({ type: "content", content: `\n[오류] ${errorMessage}` });
    if (onComplete) onComplete();
  }
};

/**
 * 채팅 첨부 파일 텍스트 추출 API
 */
export const extractFileText = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/chat/extract-text`,
    {
      method: "POST",
      headers: { ...getAuthHeader() },
      body: formData,
    },
    60000,
  );

  if (!response.ok) {
    await handleApiError(response);
  }

  return await response.json();
};

/**
 * 파일 업로드 API (진행률 콜백 지원)
 *
 * @param {File} file - 업로드할 파일
 * @param {string} kbId - 지식 베이스 ID
 * @param {function} onProgress - 진행률 콜백 (0-100)
 * @returns {Promise<object>} 업로드 결과
 */
export const uploadFileToBackend = async (
  file,
  kbId,
  onProgress = null,
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kb_id", kbId || "default_kb");

  // XMLHttpRequest를 사용하여 진행률 추적
  if (onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round(
            (event.loaded / event.total) * 100,
          );
          onProgress(percentComplete);
        }
      });

      xhr.addEventListener("load", async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve(result);
          } catch {
            resolve({ success: true });
          }
        } else {
          let errorMessage = `업로드 실패 (${xhr.status})`;
          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMessage = errorData.detail || errorMessage;
          } catch {
            // 파싱 실패
          }
          reject(new ApiError(errorMessage, xhr.status));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new ApiError("네트워크 오류가 발생했습니다.", 0));
      });

      xhr.addEventListener("timeout", () => {
        reject(new ApiError("업로드 시간이 초과되었습니다.", 408));
      });

      xhr.addEventListener("abort", () => {
        reject(new ApiError("업로드가 취소되었습니다.", 0));
      });

      xhr.open("POST", `${API_BASE_URL}/knowledge/upload`);
      xhr.timeout = UPLOAD_TIMEOUT;

      // 인증 헤더 추가
      const token = localStorage.getItem("rag_token");
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  }

  // 진행률 콜백 없을 때는 기존 fetch 사용
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/knowledge/upload`,
    {
      method: "POST",
      headers: { ...getAuthHeader() },
      body: formData,
    },
    UPLOAD_TIMEOUT,
  );

  if (!response.ok) {
    await handleApiError(response);
  }

  return await response.json();
};

/**
 * 재시도 래퍼 - 실패 시 자동 재시도
 * @param {function} fn - 실행할 함수
 * @param {number} maxRetries - 최대 재시도 횟수
 * @param {number} delay - 재시도 간격 (ms)
 */
export const withRetry = async (fn, maxRetries = 3, delay = 1000) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 재시도하지 않을 에러들
      if (
        error.status === 401 ||
        error.status === 403 ||
        error.status === 413
      ) {
        throw error;
      }

      // 마지막 시도가 아니면 대기 후 재시도
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }
  }

  throw lastError;
};

/**
 * 인증 API
 */
export const authAPI = {
  login: async (username, password) => {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    return await response.json();
  },

  register: async (email, password, name) => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    return await response.json();
  },
};

/**
 * Knowledge Base API
 */
export const knowledgeAPI = {
  upload: uploadFileToBackend,

  // KB CRUD
  listBases: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/knowledge/bases`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return { bases: [] };
      return await response.json();
    } catch {
      return { bases: [] };
    }
  },

  createBase: async (data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/bases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  updateBase: async (kbId, data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/bases/${encodeURIComponent(kbId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  deleteBase: async (kbId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/bases/${encodeURIComponent(kbId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  getFiles: async (kbId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/${kbId}/files`,
      {
        method: "GET",
        headers: { ...getAuthHeader() },
      },
    );

    if (!response.ok) {
      await handleApiError(response);
    }

    return await response.json();
  },

  getGraph: async (kbId) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/knowledge/graph?kb_id=${encodeURIComponent(kbId || "default_kb")}`,
        {
          method: "GET",
          headers: { ...getAuthHeader() },
        },
      );

      if (!response.ok) {
        await handleApiError(response);
      }

      return await response.json();
    } catch (error) {
      return { nodes: [], edges: [], error: error.message };
    }
  },

  deleteFile: async (kbId, fileId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/${kbId}/files/${fileId}`,
      {
        method: "DELETE",
        headers: { ...getAuthHeader() },
      },
    );

    if (!response.ok) {
      await handleApiError(response);
    }

    return await response.json();
  },

  deleteFileChunks: async (kbId, source) => {
    const params = new URLSearchParams({ source });
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/${encodeURIComponent(kbId)}/files?${params}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  getFilesList: async (kbId) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/knowledge/${encodeURIComponent(kbId)}/files`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return { files: [] };
      return await response.json();
    } catch {
      return { files: [] };
    }
  },

  getChunks: async (kbId, offset = null, limit = 20, search = null, source = null) => {
    const params = new URLSearchParams();
    if (offset !== null) params.append("offset", offset);
    params.append("limit", limit);
    if (search) params.append("search", search);
    if (source) params.append("source", source);
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/knowledge/${encodeURIComponent(kbId)}/chunks?${params}`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) await handleApiError(response);
      return await response.json();
    } catch (error) {
      return { chunks: [], total: 0, next_offset: null, kb_id: kbId };
    }
  },

  getStats: async (kbId) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/knowledge/${encodeURIComponent(kbId)}/stats`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  createNode: async (kbId, node) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/graph/nodes?kb_id=${encodeURIComponent(kbId || "default_kb")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(node),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  updateNode: async (nodeId, updates) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/graph/nodes/${encodeURIComponent(nodeId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(updates),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  deleteNode: async (nodeId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/graph/nodes/${encodeURIComponent(nodeId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  createEdge: async (kbId, edge) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/graph/edges?kb_id=${encodeURIComponent(kbId || "default_kb")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(edge),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  deleteEdge: async (edgeId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/knowledge/graph/edges/${encodeURIComponent(edgeId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },
};

/**
 * 헬스 체크 API
 */
export const healthAPI = {
  check: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL.replace("/api/v1", "")}/health`,
        {
          method: "GET",
        },
        5000,
      );

      if (!response.ok) {
        return { status: "unhealthy", error: `HTTP ${response.status}` };
      }

      return await response.json();
    } catch (error) {
      return { status: "unreachable", error: error.message };
    }
  },

  testService: async (serviceName) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL.replace("/api/v1", "")}/health/${serviceName}`,
        { method: "GET" },
        10000,
      );

      if (!response.ok) {
        return {
          status: "disconnected",
          service: serviceName,
          detail: `HTTP ${response.status}`,
        };
      }

      return await response.json();
    } catch (error) {
      return {
        status: "disconnected",
        service: serviceName,
        detail: error.message,
      };
    }
  },
};

/**
 * Settings API
 */
export const settingsAPI = {
  getConfig: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/settings/config`,
        {
          method: "GET",
          headers: { ...getAuthHeader() },
        },
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to load backend config:", error);
      return null;
    }
  },

  getUserSettings: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/settings/user`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  updateUserSettings: async (updates) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/settings/user`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify(updates),
        },
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  saveApiKey: async (provider, key) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/settings/api-keys`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ provider, key }),
      },
    );

    if (!response.ok) {
      await handleApiError(response);
    }

    return await response.json();
  },

  getApiKeys: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/settings/api-keys`,
        {
          method: "GET",
          headers: { ...getAuthHeader() },
        },
      );

      if (!response.ok) {
        return { keys: [] };
      }

      return await response.json();
    } catch (error) {
      return { keys: [] };
    }
  },

  deleteApiKey: async (provider) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/settings/api-keys/${encodeURIComponent(provider)}`,
      {
        method: "DELETE",
        headers: { ...getAuthHeader() },
      },
    );

    if (!response.ok) {
      await handleApiError(response);
    }

    return await response.json();
  },

  getOllamaModels: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/settings/ollama-models`,
        {
          method: "GET",
          headers: { ...getAuthHeader() },
        },
      );

      if (!response.ok) {
        return { models: [], error: "Failed to fetch models" };
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to fetch Ollama models:", error);
      return { models: [], error: error.message };
    }
  },

  // DB Connections (T2SQL)
  getDbConnections: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/settings/db-connections`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return { connections: [] };
      return await response.json();
    } catch (error) {
      return { connections: [] };
    }
  },

  addDbConnection: async (connData) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/settings/db-connections`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(connData),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  deleteDbConnection: async (connId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/settings/db-connections/${encodeURIComponent(connId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  testDbConnection: async (connId) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/settings/db-connections/${encodeURIComponent(connId)}/test`,
        { method: "POST", headers: { ...getAuthHeader() } },
        10000,
      );
      if (!response.ok)
        return { status: "disconnected", detail: `HTTP ${response.status}` };
      return await response.json();
    } catch (error) {
      return { status: "disconnected", detail: error.message };
    }
  },

  getDbSchema: async (connId) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/settings/db-connections/${encodeURIComponent(connId)}/schema`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return { tables: [] };
      return await response.json();
    } catch (error) {
      return { tables: [], error: error.message };
    }
  },
};

/**
 * Agents API
 */
export const agentsAPI = {
  list: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/agents`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return { agents: [] };
      return await response.json();
    } catch {
      return { agents: [] };
    }
  },

  create: async (data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/agents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  update: async (agentId, data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/agents/${encodeURIComponent(agentId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  delete: async (agentId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/agents/${encodeURIComponent(agentId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },
};

/**
 * Sessions API
 */
export const sessionsAPI = {
  list: async (limit = 50, offset = 0) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/sessions?limit=${limit}&offset=${offset}`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return { sessions: [] };
      return await response.json();
    } catch {
      return { sessions: [] };
    }
  },

  create: async (data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  get: async (sessionId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "GET", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  update: async (sessionId, data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  delete: async (sessionId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  addMessage: async (sessionId, data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  getMessages: async (sessionId, limit = 100, offset = 0) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}&offset=${offset}`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return { messages: [] };
      return await response.json();
    } catch {
      return { messages: [] };
    }
  },
};

/**
 * External Services API
 */
export const externalServicesAPI = {
  list: async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/services`,
        { method: "GET", headers: { ...getAuthHeader() } },
      );
      if (!response.ok) return { services: [] };
      return await response.json();
    } catch {
      return { services: [] };
    }
  },

  create: async (data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/services`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  update: async (serviceId, data) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/services/${encodeURIComponent(serviceId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  delete: async (serviceId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/services/${encodeURIComponent(serviceId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  test: async (serviceId) => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/services/${encodeURIComponent(serviceId)}/test`,
        { method: "POST", headers: { ...getAuthHeader() } },
        10000,
      );
      if (!response.ok)
        return { status: "disconnected", detail: `HTTP ${response.status}` };
      return await response.json();
    } catch (error) {
      return { status: "disconnected", detail: error.message };
    }
  },
};

export const mcpAPI = {
  list: async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/settings/mcp-servers`,
      { headers: { ...getAuthHeader(), "Content-Type": "application/json" } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  create: async (serverData) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/settings/mcp-servers`,
      {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(serverData),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  delete: async (serverId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/settings/mcp-servers/${encodeURIComponent(serverId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  reorder: async (serverIds) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/settings/mcp-servers/reorder`,
      {
        method: "PUT",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ server_ids: serverIds }),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },
};

export const feedbackAPI = {
  create: async (feedbackData) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/feedback`,
      {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(feedbackData),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  list: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.session_id) queryParams.append("session_id", params.session_id);
    if (params.min_rating) queryParams.append("min_rating", params.min_rating);
    if (params.only_positive !== undefined) queryParams.append("only_positive", params.only_positive);
    if (params.skip) queryParams.append("skip", params.skip);
    if (params.limit) queryParams.append("limit", params.limit);

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/feedback?${queryParams}`,
      { headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  update: async (feedbackId, updateData) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/feedback/${feedbackId}`,
      {
        method: "PUT",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  delete: async (feedbackId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/feedback/${feedbackId}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },
};

export const datasetAPI = {
  create: async (datasetData) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/datasets`,
      {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(datasetData),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  list: async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/datasets`,
      { headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  get: async (datasetId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/datasets/${datasetId}`,
      { headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  delete: async (datasetId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/datasets/${datasetId}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  build: async (datasetId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/datasets/${datasetId}/build`,
      {
        method: "POST",
        headers: { ...getAuthHeader() },
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  export: async (datasetId, format = "chat") => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/training/datasets/${datasetId}/export?format=${format}`,
      { headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);

    // 파일 다운로드
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dataset_${datasetId}_${format}.jsonl`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  },
};

export const finetuningAPI = {
  createJob: async (jobData) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/finetuning/jobs`,
      {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(jobData),
      },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  listJobs: async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/finetuning/jobs`,
      { headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  getJob: async (jobId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/finetuning/jobs/${encodeURIComponent(jobId)}`,
      { headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  cancelJob: async (jobId) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/finetuning/jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE", headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },

  listModels: async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/finetuning/models`,
      { headers: { ...getAuthHeader() } },
    );
    if (!response.ok) await handleApiError(response);
    return await response.json();
  },
};

export default {
  streamChat,
  uploadFileToBackend,
  extractFileText,
  authAPI,
  knowledgeAPI,
  healthAPI,
  settingsAPI,
  agentsAPI,
  sessionsAPI,
  externalServicesAPI,
  mcpAPI,
  feedbackAPI,
  datasetAPI,
  finetuningAPI,
  getAuthHeader,
  API_BASE_URL,
  ApiError,
};
