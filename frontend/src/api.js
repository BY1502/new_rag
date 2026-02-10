/**
 * API 클라이언트 - 하위 호환성을 위한 재내보내기
 * 실제 구현은 api/client.js에 있습니다.
 */

export {
  streamChat,
  uploadFileToBackend,
  authAPI,
  knowledgeAPI,
  getAuthHeader
} from './api/client.js';

// 레거시 호환성을 위한 chatAPI와 knowledgeAPI 별칭
import { streamChat, uploadFileToBackend, authAPI as auth, knowledgeAPI as knowledge } from './api/client.js';

export const chatAPI = {
  streamChat: (message, kbId, onChunk, onError) => {
    return streamChat(
      { query: message, kb_id: kbId, web_search: false },
      onChunk,
      null
    ).catch(onError);
  },
  getHistory: async () => []
};

export { auth as authAPI };
