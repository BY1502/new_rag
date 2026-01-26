import { API_BASE_URL, getAuthHeader } from './config';

// --- 1. 채팅 스트리밍 (Real Backend) ---
export const streamChat = async ({ query, model, kb_id, web_search, active_mcp_ids }, onChunk, onComplete) => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader() // JWT 토큰 포함
      },
      body: JSON.stringify({
        message: query,
        kb_id: kb_id,
        use_web_search: web_search || false,
        active_mcp_ids: active_mcp_ids || []
      })
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("로그인이 필요합니다.");
      throw new Error("Network response was not ok");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        try {
          // 백엔드에서 JSON 문자열로 보냄
          const jsonStr = line.startsWith('"') && line.endsWith('"') 
            ? JSON.parse(line) // 이중 인코딩 된 경우
            : line;
            
          const data = typeof jsonStr === 'object' ? jsonStr : JSON.parse(jsonStr);
          onChunk(data);
        } catch (e) {
          console.error("Parse Error:", e, line);
        }
      }
    }
    onComplete();

  } catch (error) {
    console.error("Stream Error:", error);
    onChunk({ type: 'content', content: `\n[Error] ${error.message}` });
    onComplete();
  }
};

// --- 2. 파일 업로드 (Real Backend) ---
export const uploadFileToBackend = async (file, kbId, chunkSize, chunkOverlap) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kb_id', kbId);
  formData.append('chunk_size', chunkSize);
  formData.append('chunk_overlap', chunkOverlap);

  const response = await fetch(`${API_BASE_URL}/knowledge/upload`, {
    method: 'POST',
    headers: {
      ...getAuthHeader()
    },
    body: formData
  });

  if (!response.ok) throw new Error("Upload failed");
  return await response.json();
};