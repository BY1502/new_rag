import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StoreProvider } from "./contexts/StoreContext";
import { AuthProvider } from "./contexts/AuthContext";
import MainLayout from "./layouts/MainLayout";

// 페이지 컴포넌트
import HomeDashboard from "./features/home/HomeDashboard";
import ChatInterface from "./features/chat/ChatInterface";
import AgentList from "./features/agent/AgentList";
import KnowledgeManager from "./features/knowledge/KnowledgeManager";
import DatasetManager from "./features/training/DatasetManager";
import FineTuningMonitor from "./features/training/FineTuningMonitor";
import AuthPage from "./features/auth/AuthPage";
import Register from "./pages/Register";

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <BrowserRouter>
          <Routes>
            {/* 로그인 & 회원가입 (Public Routes) */}
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<Register />} />

            {/* 메인 레이아웃 (Protected Routes) */}
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<HomeDashboard />} />
              <Route path="chat" element={<ChatInterface />} />

              {/* 스타일 유지를 위한 래퍼 포함 */}
              <Route path="agent" element={
                <div className="flex-1 overflow-hidden p-6 bg-gray-50/50 dark:bg-gray-900 h-full">
                  <div className="h-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <AgentList />
                  </div>
                </div>
              } />
              <Route path="knowledge" element={
                <div className="flex-1 overflow-hidden p-6 bg-gray-50/50 dark:bg-gray-900 h-full">
                  <div className="h-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <KnowledgeManager />
                  </div>
                </div>
              } />
              <Route path="training" element={<DatasetManager />} />
              <Route path="finetuning" element={<FineTuningMonitor />} />
            </Route>

            {/* 그 외 경로는 로그인으로 */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </AuthProvider>
  );
}