import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../contexts/StoreContext'; // ✅ Store 가져오기
import { Play, Square, Activity, AlertTriangle, CheckCircle, Video, X } from '../../components/ui/Icon';

export default function VideoAnalysis() {
  const { setCurrentView } = useStore(); // ✅ 화면 전환 함수 가져오기
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  // 로그 자동 스크롤
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 분석 시뮬레이션
  useEffect(() => {
    let interval;
    if (isAnalyzing) {
      interval = setInterval(() => {
        const events = [
          { type: 'info', text: '작업자 안전모 착용 확인됨 (Confidence: 98%)' },
          { type: 'info', text: '지게차 이동 감지 (Zone B)' },
          { type: 'warning', text: '⚠️ 주의: 제한 구역 내 움직임 포착' },
          { type: 'safe', text: '현재 현장 상황 안전함' }
        ];
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        
        setLogs(prev => [...prev, {
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          ...randomEvent
        }].slice(-50));
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  return (
    <div className="flex h-full bg-gray-50 relative">
      
      {/* ✅ 닫기 버튼 (우측 상단 플로팅) */}
      <button 
        onClick={() => setCurrentView('chat')}
        className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-white/90 hover:bg-red-50 text-gray-700 hover:text-red-600 border border-gray-200 rounded-lg shadow-lg transition-all font-bold text-xs"
        title="분석 종료 및 채팅으로 복귀"
      >
        <X size={16} /> 닫기
      </button>

      {/* 1. 비디오 영역 (왼쪽) */}
      <div className="flex-1 p-6 flex flex-col min-w-0">
        <div className="bg-black rounded-2xl flex-1 relative overflow-hidden shadow-xl border border-gray-800 group">
          
          {/* 비디오 화면 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            {isAnalyzing ? (
              <div className="w-full h-full bg-gray-900 relative">
                 {/* 실제 Video/WebRTC 영역 */}
                 <div className="absolute top-4 left-4 bg-red-600 text-white text-xs px-2 py-1 rounded animate-pulse font-bold z-10">● LIVE</div>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-gray-600">CCTV Stream Simulation</p>
                 </div>
                 {/* 바운딩 박스 데모 */}
                 <div className="absolute top-1/3 left-1/4 w-32 h-48 border-2 border-green-500 rounded opacity-60">
                    <span className="bg-green-500 text-white text-[10px] px-1 absolute -top-4 left-0">Worker #1</span>
                 </div>
              </div>
            ) : (
              <div className="flex flex-col items-center animate-in fade-in">
                <Video size={48} className="mb-4 opacity-50" />
                <p>분석을 시작하려면 재생 버튼을 누르세요.</p>
              </div>
            )}
          </div>

          {/* 컨트롤 바 */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between px-6 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-4">
               <button 
                 onClick={() => setIsAnalyzing(!isAnalyzing)}
                 className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${isAnalyzing ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
               >
                 {isAnalyzing ? <><Square size={16} fill="currentColor"/> 중지</> : <><Play size={16} fill="currentColor"/> 분석 시작</>}
               </button>
               <span className="text-white/70 text-sm font-mono">Camera_01: Main Gate</span>
            </div>
            <div className="text-green-400 text-sm flex items-center gap-2">
              <Activity size={16} /> System Optimal
            </div>
          </div>
        </div>
      </div>

      {/* 2. 로그 및 분석 패널 (오른쪽) */}
      <div className="w-[350px] bg-white border-l border-gray-200 flex flex-col shrink-0">
        <div className="p-4 border-b bg-gray-50 pt-12"> {/* 상단 패딩 추가 (닫기 버튼 공간 확보) */}
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Activity size={18} className="text-blue-600"/> 실시간 분석 로그
          </h3>
          <p className="text-xs text-gray-500 mt-1">LLM Vision Model Detection</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar font-mono text-sm">
          {logs.length === 0 && (
            <p className="text-center text-gray-400 py-10 text-xs">로그 대기 중...</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className={`p-3 rounded-lg border animate-in slide-in-from-right-5 fade-in duration-300 ${
              log.type === 'warning' ? 'bg-red-50 border-red-100 text-red-800' :
              log.type === 'safe' ? 'bg-green-50 border-green-100 text-green-800' :
              'bg-gray-50 border-gray-100 text-gray-700'
            }`}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-xs opacity-70">{log.time}</span>
                {log.type === 'warning' && <AlertTriangle size={14} />}
                {log.type === 'safe' && <CheckCircle size={14} />}
              </div>
              <p className="leading-tight">{log.text}</p>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        <div className="p-4 border-t bg-gray-50">
            <div className="text-xs text-gray-500 mb-2 font-semibold">감지 설정</div>
            <div className="flex gap-2">
                <span className="px-2 py-1 bg-white border rounded text-xs text-gray-600">안전모</span>
                <span className="px-2 py-1 bg-white border rounded text-xs text-gray-600">화재</span>
                <span className="px-2 py-1 bg-white border rounded text-xs text-gray-600">쓰러짐</span>
            </div>
        </div>
      </div>
    </div>
  );
}