import React, { useState, useEffect } from "react";
import { finetuningAPI, settingsAPI } from "../../api/client";
import { Loader2, Zap, CheckCircle, XCircle, Clock, Trash2, Cpu } from "../../components/ui/Icon";

const DEFAULT_BASE_MODEL = "Qwen/Qwen2.5-3B-Instruct";

export default function FineTuningMonitor() {
  const [jobs, setJobs] = useState([]);
  const [customModels, setCustomModels] = useState([]);
  const [baseModels, setBaseModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [defaultModel, setDefaultModel] = useState(null);

  // 모델 다운로드
  const [downloadModel, setDownloadModel] = useState(DEFAULT_BASE_MODEL);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // 다운로드 진행중이면 상태 폴링
  useEffect(() => {
    if (!downloading) return;
    const poll = setInterval(async () => {
      const status = await finetuningAPI.getDownloadStatus(downloadModel);
      setDownloadStatus(status);
      if (status.status === "done" || status.status === "error") {
        setDownloading(false);
        if (status.status === "done") loadData();
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [downloading, downloadModel]);

  const loadData = async () => {
    try {
      const [jobsResult, modelsResult, baseResult, userSettings] = await Promise.all([
        finetuningAPI.listJobs(),
        finetuningAPI.listModels(),
        finetuningAPI.listBaseModels(),
        settingsAPI.getUserSettings(),
      ]);
      setJobs(jobsResult.jobs || []);
      setCustomModels(modelsResult.models || []);
      setBaseModels(baseResult.models || []);
      setDefaultModel(userSettings?.custom_model || null);
    } catch (error) {
      console.error("데이터 로드 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadModel = async () => {
    if (!downloadModel.trim()) return;
    setDownloading(true);
    setDownloadStatus({ status: "downloading", message: "다운로드 시작..." });
    try {
      const result = await finetuningAPI.downloadModel(downloadModel);
      if (result.status === "done") {
        setDownloadStatus({ status: "done", message: result.message });
        setDownloading(false);
        loadData();
      }
    } catch (error) {
      setDownloadStatus({ status: "error", message: error.message });
      setDownloading(false);
    }
  };

  const handleSetDefaultModel = async (modelName) => {
    try {
      await finetuningAPI.setDefaultModel(modelName);
      setDefaultModel(modelName);
    } catch (error) {
      console.error("기본 모델 설정 실패:", error);
      alert("기본 모델 설정 실패: " + error.message);
    }
  };

  const handleClearDefaultModel = async () => {
    try {
      await finetuningAPI.clearDefaultModel();
      setDefaultModel(null);
    } catch (error) {
      console.error("기본 모델 해제 실패:", error);
      alert("기본 모델 해제 실패: " + error.message);
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

  const getProviderLabel = (provider) => {
    switch (provider) {
      case "unsloth": return "QLoRA (Unsloth)";
      case "ollama": return "Ollama (Few-shot)";
      default: return provider;
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
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ollama Few-shot & QLoRA 학습 작업 관리</p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <Loader2 size={16} /> 새로고침
          </button>
        </div>

        {/* 베이스 모델 다운로드 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Cpu size={20} /> 베이스 모델 관리
          </h2>

          {/* 다운로드된 모델 목록 */}
          {baseModels.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">다운로드된 모델</div>
              <div className="flex flex-wrap gap-2">
                {baseModels.map((m, i) => (
                  <span key={i} className="px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm font-mono border border-green-200 dark:border-green-800">
                    {m.name || m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 다운로드 폼 */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={downloadModel}
              onChange={(e) => setDownloadModel(e.target.value)}
              placeholder="HuggingFace 모델명 (예: Qwen/Qwen2.5-3B-Instruct)"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
            />
            <button
              onClick={handleDownloadModel}
              disabled={downloading || !downloadModel.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Cpu size={16} />}
              {downloading ? "다운로드 중..." : "모델 다운로드"}
            </button>
          </div>

          {/* 다운로드 상태 */}
          {downloadStatus && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${
              downloadStatus.status === "done"
                ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : downloadStatus.status === "error"
                ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            }`}>
              {downloadStatus.message || downloadStatus.status}
              {downloadStatus.progress_percent != null && (
                <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 transition-all duration-300"
                    style={{ width: `${downloadStatus.progress_percent}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 커스텀 모델 목록 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Zap size={20} /> 내 커스텀 모델 ({customModels.length})
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
                  className={`p-4 bg-gradient-to-br rounded-lg border ${
                    defaultModel === model
                      ? "from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-300 dark:border-green-700"
                      : "from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 border-indigo-200 dark:border-indigo-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={14} className={defaultModel === model ? "text-green-600" : "text-indigo-600"} />
                    <div className="font-mono text-sm text-gray-900 dark:text-white font-semibold truncate flex-1">
                      {model}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    {defaultModel === model ? (
                      <>
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">기본 모델</span>
                        <button
                          onClick={handleClearDefaultModel}
                          className="text-xs px-2 py-1 text-gray-500 hover:text-red-500 transition"
                        >
                          해제
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-gray-500 dark:text-gray-400">사용 가능</span>
                        <button
                          onClick={() => handleSetDefaultModel(model)}
                          className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800 transition"
                        >
                          기본 모델로 설정
                        </button>
                      </>
                    )}
                  </div>
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
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-semibold text-gray-900 dark:text-white">{job.job_name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(job.status)}`}
                        >
                          {getStatusIcon(job.status)}
                          {job.status}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          job.provider === "unsloth"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                        }`}>
                          {getProviderLabel(job.provider)}
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
                          <div className="flex items-center gap-2">
                            <strong>생성된 모델:</strong>{" "}
                            <span className="font-mono text-xs text-green-600 dark:text-green-400">
                              {job.output_model_name}
                            </span>
                            {job.status === "completed" && defaultModel !== job.output_model_name && (
                              <button
                                onClick={() => handleSetDefaultModel(job.output_model_name)}
                                className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800 transition"
                              >
                                기본 모델로 설정
                              </button>
                            )}
                            {job.status === "completed" && defaultModel === job.output_model_name && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded">
                                현재 기본 모델
                              </span>
                            )}
                          </div>
                        )}
                        {job.final_loss != null && (
                          <div>
                            <strong>최종 Loss:</strong>{" "}
                            <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                              {job.final_loss.toFixed(4)}
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
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                    {job.provider === "unsloth" && <span>에포크: {job.num_epochs || "N/A"}</span>}
                    {job.provider === "unsloth" && <span>LR: {job.learning_rate || "N/A"}</span>}
                    {job.training_time_seconds && (
                      <span>소요 시간: {job.training_time_seconds >= 60 ? `${Math.floor(job.training_time_seconds / 60)}분 ${job.training_time_seconds % 60}초` : `${job.training_time_seconds}초`}</span>
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
