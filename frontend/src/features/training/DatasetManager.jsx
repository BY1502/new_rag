import React, { useState, useEffect } from "react";
import { feedbackAPI, datasetAPI, finetuningAPI } from "../../api/client";
import { ThumbsUp, ThumbsDown, Database, Trash2, Plus, Loader2, RefreshCw, Upload, Zap } from "../../components/ui/Icon";

export default function DatasetManager() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, has_positive: 0, avg_rating: null });

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
    const name = prompt("데이터셋 이름을 입력하세요:");
    if (!name) return;

    try {
      await datasetAPI.create({
        name,
        description: "사용자 대화 피드백 데이터",
        format_type: "chat",
        min_rating: 3,
        only_positive: true,
      });
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
    const format = prompt("내보내기 형식을 선택하세요:\n- chat (OpenAI)\n- completion\n- instruction", "chat");
    if (!format || !["chat", "completion", "instruction"].includes(format)) {
      alert("올바른 형식을 입력하세요 (chat, completion, instruction)");
      return;
    }

    try {
      await datasetAPI.export(datasetId, format);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
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
            <div className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{stats.has_positive}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">평균 별점</div>
            <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
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
              onClick={handleCreateDataset}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
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
                    <div className="font-semibold text-gray-900 dark:text-white">{ds.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {ds.total_examples}개 예제 | {ds.verified_examples}개 검증됨
                      {ds.is_exported && <span className="ml-2 text-green-600">✓ 내보내기 완료</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBuildDataset(ds.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition"
                      title="데이터셋 빌드 (긍정 평가 수집)"
                    >
                      <RefreshCw size={14} /> 빌드
                    </button>
                    <button
                      onClick={() => handleExportDataset(ds.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                      title="JSONL 내보내기"
                    >
                      <Upload size={14} /> 내보내기
                    </button>
                    <button
                      onClick={() => handleStartFineTuning(ds.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition"
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
              피드백이 없습니다. 채팅에서 👍/👎 버튼을 눌러 피드백을 남겨보세요!
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.slice(0, 20).map((fb) => (
                <div
                  key={fb.id}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {fb.is_positive === true && <ThumbsUp size={14} className="text-green-600" />}
                      {fb.is_positive === false && <ThumbsDown size={14} className="text-red-600" />}
                      {fb.rating && (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400">★ {fb.rating}</span>
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
