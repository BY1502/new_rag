import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { knowledgeAPI } from '../api';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const kbId = "default_kb";

  // 홈 화면이거나 파일 변경이 필요할 때 목록 갱신
  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await knowledgeAPI.getFiles(kbId);
      setFiles(res.data.files || []);
    } catch (e) { console.error("파일 목록 로드 실패:", e); }
  };

  const handleFileUpload = async (file) => {
    setUploading(true);
    try {
      await knowledgeAPI.uploadFile(file, kbId);
      await fetchFiles(); // 목록 갱신
      alert("업로드 완료!");
    } catch (e) { alert("업로드 실패: " + e.message); }
    finally { setUploading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('rag_token');
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* 사이드바에 파일 목록과 업로드 함수 전달 (복구됨) */}
      <Sidebar 
        files={files} 
        onUpload={handleFileUpload} 
        uploading={uploading} 
        kbId={kbId}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col w-full transition-all duration-300">
        <main className="flex-1 overflow-hidden relative bg-gray-50">
          {/* 하위 페이지 렌더링 */}
          <Outlet context={{ files, fetchFiles }} />
        </main>
      </div>
    </div>
  );
}