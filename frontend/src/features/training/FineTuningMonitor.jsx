import React, { useState, useEffect } from "react";
import { finetuningAPI } from "../../api/client";
import { Loader2, Zap, CheckCircle, XCircle, Clock, Trash2, Cpu } from "../../components/ui/Icon";

export default function FineTuningMonitor() {
  const [jobs, setJobs] = useState([]);
  const [customModels, setCustomModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // 5초마다 새로고침 (진행 중인 작업 확인)
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [jobsResult, modelsResult] = await Promise.all([
        finetuningAPI.listJobs(),
        finetuningAPI.listModels(),
      ]);
      setJobs(jobsResult.jobs || []);
      setCustomModels(modelsResult.models || []);
    } catch (error) {
      console.error("데이터 로드 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelJob = async (jobId) => {
    if (!confirm("이 작업을 취소/삭제하시겠습니까?")) return;
    try {
      await finetuningAPI.cancelJob(jobId);
      await loadData();
    } catch (error) {
      console.error("작업 취소 실패:", error);
      alert("작업 취소 실패: " + error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-50 dark:bg-green-900/30";
      case "running":
        return "text-blue-600 bg-blue-50 dark:bg-blue-900/30";
      case "failed":
        return "text-red-600 bg-red-50 dark:bg-red-900/30";
      case "cancelled":
        return "text-gray-600 bg-gray-50 dark:bg-gray-900/30";
      default:
        return "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return <CheckCircle size={16} />;
      case "running":
        return <Loader2 size={16} className="animate-spin" />;
      case "failed":
        return <XCircle size={16} />;
      default:
        return <Clock size={16} />;
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
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">파인튜닝 모니터</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ollama 모델 학습 작업 관리</p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <Loader2 size={16} /> 새로고침
          </button>
        </div>

        {/* 커스텀 모델 목록 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Cpu size={20} /> 내 커스텀 모델 ({customModels.length})
          </h2>
          {customModels.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              커스텀 모델이 없습니다. 데이터셋에서 파인튜닝을 시작해보세요!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {customModels.map((model, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 rounded-lg border border-indigo-200 dark:border-indigo-700"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={14} className="text-indigo-600" />
                    <div className="font-mono text-sm text-gray-900 dark:text-white font-semibold">
                      {model}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">사용 가능</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 파인튜닝 작업 목록 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Zap size={20} /> 파인튜닝 작업
          </h2>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              파인튜닝 작업이 없습니다
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.job_id}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{job.job_name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(job.status)}`}
                        >
                          {getStatusIcon(job.status)}
                          {job.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                        <div>
                          <strong>작업 ID:</strong> <span className="font-mono text-xs">{job.job_id}</span>
                        </div>
                        <div>
                          <strong>기본 모델:</strong> {job.base_model}
                        </div>
                        {job.output_model_name && (
                          <div>
                            <strong>생성된 모델:</strong>{" "}
                            <span className="font-mono text-xs text-green-600 dark:text-green-400">
                              {job.output_model_name}
                            </span>
                          </div>
                        )}
                        {job.error_message && (
                          <div className="text-red-600 dark:text-red-400 text-xs mt-1">
                            <strong>오류:</strong> {job.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelJob(job.job_id)}
                      className="text-gray-400 hover:text-red-500 transition"
                      title="취소/삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* 진행 바 */}
                  {job.status === "running" && (
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 transition-all duration-500"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}

                  {/* 메타데이터 */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>에포크: {job.num_epochs}</span>
                    <span>LR: {job.learning_rate}</span>
                    {job.training_time_seconds && (
                      <span>소요 시간: {Math.floor(job.training_time_seconds / 60)}분</span>
                    )}
                    <span className="ml-auto">{new Date(job.created_at).toLocaleString()}</span>
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
