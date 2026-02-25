import React from 'react';
import { useStore } from '../contexts/StoreContext';
import { Bot, Plus, Settings, MoreHorizontal } from '../components/ui/Icon';

export default function Agents() {
  const { agents } = useStore();

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Agents</h1>
            <p className="text-sm text-gray-500 mt-1">AI 페르소나를 생성하고 관리합니다.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 transition shadow-sm">
            <Plus size={16} /> Create Agent
          </button>
        </div>
      </header>

      <div className="p-8 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-lg transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-600">
                  <Bot size={28} />
                </div>
                <button className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100">
                   <MoreHorizontal size={20} />
                </button>
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">{agent.name}</h3>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2 h-10">{agent.description}</p>
              
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <span className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-md font-medium">Active</span>
                <button className="text-xs font-bold text-gray-600 hover:underline">설정</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}