import React from 'react';
import AdvancedSettings from '../features/settings/AdvancedSettings';

export default function SettingsPage() {
  return (
    <div className="h-full bg-gray-50 flex flex-col">
       <div className="flex-1 p-6 overflow-hidden flex flex-col">
          <div className="max-w-6xl mx-auto w-full h-full flex flex-col bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
             <AdvancedSettings />
          </div>
       </div>
    </div>
  );
}