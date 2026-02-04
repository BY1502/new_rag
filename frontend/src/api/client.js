import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const getAuthHeader = () => {
  const token = localStorage.getItem('rag_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// model, use_deep_think 추가 전송
export const streamChat = async ({ query, model, kb_id, web_search, use_deep_think, active_mcp_ids }, onChunk, onComplete) => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({
        message: query,
        kb_id: kb_id || "default_kb",
        model: model, // ✅ 전송
        use_web_search: web_search || false,
        use_deep_think: use_deep_think || false, // ✅ 전송
        active_mcp_ids: active_mcp_ids || []
      })
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("로그인이 필요합니다.");
      throw new Error(`Network response was not ok: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); 

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const jsonStr = line.startsWith('"') && line.endsWith('"') ? JSON.parse(line) : line;
          const data = typeof jsonStr === 'object' ? jsonStr : JSON.parse(jsonStr);
          onChunk(data);
        } catch (e) { console.error("Parse Error:", e); }
      }
    }
    if (onComplete) onComplete();

  } catch (error) {
    console.error("Stream Error:", error);
    onChunk({ type: 'content', content: `\n[Error] ${error.message}` });
    if (onComplete) onComplete();
  }
};

export const uploadFileToBackend = async (file, kbId, chunkSize, chunkOverlap) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kb_id', kbId || "default_kb");
  if (chunkSize) formData.append('chunk_size', chunkSize);
  if (chunkOverlap) formData.append('chunk_overlap', chunkOverlap);

  const response = await fetch(`${API_BASE_URL}/knowledge/upload`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Upload failed");
  }
  return await response.json();
};