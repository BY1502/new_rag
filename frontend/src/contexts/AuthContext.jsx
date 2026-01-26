import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../api/config';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 앱 시작 시 토큰 확인
  useEffect(() => {
    const token = localStorage.getItem('rag_token');
    const savedUser = localStorage.getItem('rag_user');
    
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  // --- 로그인 (Real API) ---
  const login = async (email, password) => {
    const formData = new FormData();
    formData.append('username', email); // OAuth2 표준은 username 필드 사용
    formData.append('password', password);

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "로그인 실패");
    }

    const data = await response.json();
    const token = data.access_token;
    
    // 유저 정보 임시 생성 (실제로는 /me 엔드포인트로 가져오는 게 정석)
    const userData = { 
      name: email.split('@')[0], 
      email: email 
    };

    localStorage.setItem('rag_token', token);
    localStorage.setItem('rag_user', JSON.stringify(userData));
    setUser(userData);
    
    return userData;
  };

  // --- 회원가입 (Real API) ---
  const register = async (name, email, password) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "회원가입 실패");
    }
    return await response.json();
  };

  const logout = () => {
    localStorage.removeItem('rag_token');
    localStorage.removeItem('rag_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user, isLoading }}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);