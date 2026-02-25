import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { feedbackAPI, datasetAPI, finetuningAPI } from "../../api/client";
import { ThumbsUp, ThumbsDown, Database, Trash2, Plus, Loader2, RefreshCw, Upload, Zap } from "../../components/ui/Icon";

const FORMAT_OPTIONS = [
  { value: "chat", label: "Chat (OpenAI)", desc: "일반 대화 형식" },
  { value: "completion", label: "Completion", desc: "텍스트 완성 형식" },
  { value: "instruction", label: "Instruction", desc: "지시-응답 형식" },
  { value: "tool_calling", label: "Tool Calling", desc: "도구 호출 학습 형식 (Qwen2.5)" },
];

export default function DatasetManager() {
  const navigate = useNavigate();
  const [feedbacks, setFeedbacks] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, has_positive: 0, avg_rating: null });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDataset, setNewDataset] = useState({ name: "", format_type: "chat" });
  const [showExportModal, setShowExportModal] = useState(null);
  const [exportFormat, setExportFormat] = useState("chat");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fbResult, dsResult] = await Promise.all([
        feedbackAPI.list({ limit: 100 }),
        datasetAPI.list(),
      ]);
      setFeedbacks(fbResult.feedbacks || []);
      setStats({
        total: fbResult.total || 0,
        has_positive: fbResult.has_positive || 0,
        avg_rating: fbResult.avg_rating,
      });
      setDatasets(dsResult.datasets || []);
    } catch (error) {
      console.error("데이터 로드 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFeedback = async (id) => {
    if (!confirm("이 피드백을 삭제하시겠습니까?")) return;
    try {
      await feedbackAPI.delete(id);
      await loadData();
    } catch (error) {
      console.error("피드백 삭제 실패:", error);
    }
  };

  const handleCreateDataset = async () => {
    if (!newDataset.name.trim()) return;
    try {
      await datasetAPI.create({
        name: newDataset.name,
        description: `사용자 대화 피드백 데이터 (${newDataset.format_type})`,
        format_type: newDataset.format_type,
        min_rating: 3,
        only_positive: true,
      });
      setShowCreateModal(false);
      setNewDataset({ name: "", format_type: "chat" });
      await loadData();
    } catch (error) {
      console.error("데이터셋 생성 실패:", error);
      alert("데이터셋 생성 실패: " + error.message);
    }
  };

  const handleBuildDataset = async (datasetId) => {
    if (!confirm("데이터셋을 빌드하시겠습니까? 긍정 평가만 포함됩니다.")) return;

    try {
      const result = await datasetAPI.build(datasetId);
      alert(result.message);
      await loadData();
    } catch (error) {
      console.error("데이터셋 빌드 실패:", error);
      alert("빌드 실패: " + error.message);
    }
  };

  const handleExportDataset = async (datasetId) => {
    try {
      await datasetAPI.export(datasetId, exportFormat);
      setShowExportModal(null);
      alert("JSONL 파일 다운로드가 시작되었습니다!");
    } catch (error) {
      console.error("내보내기 실패:", error);
      alert("내보내기 실패: " + error.message);
    }
  };

  const handleStartFineTuning = async (datasetId) => {
    const jobName = prompt("파인튜닝 작업 이름을 입력하세요:", "my_custom_model");
    if (!jobName) return;

    const baseModel = prompt("기본 모델을 입력하세요 (예: llama3.1, gemma2):", "llama3.1");
    if (!baseModel) return;

    if (!confirm(`데이터셋으로 ${baseModel} 모델을 파인튜닝하시겠습니까?\n\n이 작업은 시간이 걸릴 수 있습니다.`)) {
      return;
    }

    try {
      const job = await finetuningAPI.createJob({
        dataset_id: datasetId,
        job_name: jobName,
        base_model: baseModel,
        provider: "ollama",
        format_type: "chat",
        num_epochs: 3,
      });
      alert(`파인튜닝 작업이 시작되었습니다!\n작업 ID: ${job.job_id}\n\n진행 상황은 파인튜닝 페이지에서 확인할 수 있습니다.`);
    } catch (error) {
      console.error("파인튜닝 시작 실패:", error);
      alert("파인튜닝 시작 실패: " + error.message);
    }
  };

  const parseToolCalls = (toolCallsJson) => {
    if (!toolCallsJson) return null;
    try {
      const calls = typeof toolCallsJson === "string" ? JSON.parse(toolCallsJson) : toolCallsJson;
      return Array.isArray(calls) ? calls : null;
    } catch { return null; }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 탭 네비게이션 */}
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
          <button
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-500 text-white shadow-sm"
          >
            <Database size={16} className="inline mr-2" />
            학습 데이터
          </button>
          <button
            onClick={() => navigate('/finetuning')}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <Zap size={16} className="inline mr-2" />
            파인튜닝 모니터
          </button>
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">학습 데이터 관리</h1>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">전체 피드백</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.total}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">긍정 평가</div>
            <div className="text-3xl font-bold text-gray-600 dark:text-gray-400 mt-1">{stats.has_positive}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">평균 별점</div>
            <div className="text-3xl font-bold text-gray-600 dark:text-gray-400 mt-1">
              {stats.avg_rating ? stats.avg_rating.toFixed(1) : "N/A"}
            </div>
          </div>
        </div>

        {/* 데이터셋 목록 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Database size={20} /> 데이터셋
            </h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
            >
              <Plus size={16} /> 새 데이터셋
            </button>
          </div>
          {datasets.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">데이터셋이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {datasets.map((ds) => (
                <div
                  key={ds.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">{ds.name}</span>
                      {ds.format_type && (
                        <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                          ds.format_type === "tool_calling"
                            ? "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                        }`}>
                          {ds.format_type}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {ds.total_examples}개 예제 | {ds.verified_examples}개 검증됨
                      {ds.is_exported && <span className="ml-2 text-gray-600 dark:text-gray-400">내보내기 완료</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBuildDataset(ds.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition"
                      title="데이터셋 빌드 (긍정 평가 수집)"
                    >
                      <RefreshCw size={14} /> 빌드
                    </button>
                    <button
                      onClick={() => { setExportFormat(ds.format_type || "chat"); setShowExportModal(ds.id); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-400 text-white text-sm rounded-lg hover:bg-green-500 transition"
                      title="JSONL 내보내기"
                    >
                      <Upload size={14} /> 내보내기
                    </button>
                    <button
                      onClick={() => handleStartFineTuning(ds.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                      title="파인튜닝 시작"
                    >
                      <Zap size={14} /> 파인튜닝
                    </button>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(ds.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 피드백 목록 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">최근 피드백</h2>
          {feedbacks.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              피드백이 없습니다. 채팅에서 버튼을 눌러 피드백을 남겨보세요!
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.slice(0, 20).map((fb) => {
                const toolCalls = parseToolCalls(fb.tool_calls_json);
                return (
                  <div
                    key={fb.id}
                    className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {fb.is_positive === true && <ThumbsUp size={14} className="text-gray-600" />}
                        {fb.is_positive === false && <ThumbsDown size={14} className="text-red-500" />}
                        {fb.rating && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">{fb.rating}</span>
                        )}
                        {toolCalls && toolCalls.length > 0 && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 rounded text-xs">
                            {toolCalls.map(tc => tc.name).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(fb.created_at).toLocaleString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteFeedback(fb.id)}
                        className="text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                      <strong>Q:</strong> {fb.user_message.slice(0, 100)}
                      {fb.user_message.length > 100 && "..."}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      <strong>A:</strong> {fb.ai_message.slice(0, 100)}
                      {fb.ai_message.length > 100 && "..."}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 데이터셋 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">새 데이터셋 생성</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">이름</label>
                <input
                  type="text"
                  value={newDataset.name}
                  onChange={(e) => setNewDataset(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="데이터셋 이름"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">형식</label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setNewDataset(prev => ({ ...prev, format_type: opt.value }))}
                      className={`p-3 rounded-lg border text-left transition ${
                        newDataset.format_type === opt.value
                          ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                          : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <div className={`text-sm font-medium ${
                        newDataset.format_type === opt.value ? "text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-white"
                      }`}>{opt.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                취소
              </button>
              <button
                onClick={handleCreateDataset}
                disabled={!newDataset.name.trim()}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50"
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 내보내기 모달 */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">내보내기 형식</h3>
            <div className="space-y-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExportFormat(opt.value)}
                  className={`w-full p-3 rounded-lg border text-left transition ${
                    exportFormat === opt.value
                      ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                      : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
                  }`}
                >
                  <div className={`text-sm font-medium ${
                    exportFormat === opt.value ? "text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-white"
                  }`}>{opt.label}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowExportModal(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                취소
              </button>
              <button
                onClick={() => handleExportDataset(showExportModal)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
              >
                다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
