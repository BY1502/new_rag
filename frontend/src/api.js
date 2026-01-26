import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

// Axios 인스턴스 생성
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터: 토큰이 있으면 헤더에 실어보냄
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('rag_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const authAPI = {
  login: async (username, password) => {
    // FastAPI OAuth2 폼 데이터 형식
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    const response = await apiClient.post('/auth/token', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  },
  register: async (email, password, fullName) => {
    return await apiClient.post('/auth/register', { email, password, full_name: fullName });
  },
  me: async () => {
    return await apiClient.get('/users/me');
  }
};

export const chatAPI = {
  // 스트리밍 채팅은 fetch API 사용 (axios는 스트림 처리가 복잡함)
  streamChat: async (message, kbId, onChunk, onError) => {
    const token = localStorage.getItem('rag_token');
    try {
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: message,
          kb_id: kbId,
          use_web_search: false // 필요시 true로 변경
        })
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // 줄바꿈 기준으로 청크가 올 수 있음
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
            try {
                const json = JSON.parse(line);
                onChunk(json);
            } catch (e) {
                console.error("JSON Parse Error:", e);
            }
        }
      }
    } catch (error) {
      onError(error);
    }
  },
  getHistory: async () => {
    // 백엔드 구현 여부에 따라 다름 (현재는 예시)
    return []; 
  }
};

export const knowledgeAPI = {
  uploadFile: async (file, kbId) => {
    const formData = new FormData();
    formData.append('file', file);
    return await apiClient.post(`/knowledge/${kbId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  getFiles: async (kbId) => {
    return await apiClient.get(`/knowledge/${kbId}/files`);
  }
};