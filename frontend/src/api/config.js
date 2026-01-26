export const API_BASE_URL = "http://localhost:8000/api/v1";

export const getAuthHeader = () => {
  const token = localStorage.getItem('rag_token');
  return token ? { "Authorization": `Bearer ${token}` } : {};
};