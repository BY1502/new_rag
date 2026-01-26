import React from 'react';
import { Bot, Plus, Settings } from 'lucide-react';

const Agent = () => {
  return (
    <div className="p-8 h-full bg-gray-50 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">My Agents</h1>
            <p className="text-gray-500">나만의 AI 에이전트를 관리하세요.</p>
        </div>
        <button className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Create Agent</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 예시 카드 1 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
                <div className="bg-green-100 p-3 rounded-lg">
                    <Bot className="w-8 h-8 text-green-600" />
                </div>
                <button className="text-gray-400 hover:text-gray-600"><Settings className="w-5 h-5"/></button>
            </div>
            <h3 className="font-bold text-lg mb-2">문서 요약 봇</h3>
            <p className="text-gray-500 text-sm mb-4">긴 PDF 문서를 읽고 핵심 내용을 3줄로 요약해주는 에이전트입니다.</p>
            <div className="flex items-center space-x-2 text-xs font-semibold text-green-600 bg-green-50 w-fit px-2 py-1 rounded">
                <span>Active</span>
            </div>
        </div>

        {/* 예시 카드 2 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                    <Bot className="w-8 h-8 text-blue-600" />
                </div>
                <button className="text-gray-400 hover:text-gray-600"><Settings className="w-5 h-5"/></button>
            </div>
            <h3 className="font-bold text-lg mb-2">코드 리뷰어</h3>
            <p className="text-gray-500 text-sm mb-4">Python 코드를 분석하여 버그를 찾고 최적화 제안을 합니다.</p>
            <div className="flex items-center space-x-2 text-xs font-semibold text-gray-500 bg-gray-100 w-fit px-2 py-1 rounded">
                <span>Paused</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Agent;