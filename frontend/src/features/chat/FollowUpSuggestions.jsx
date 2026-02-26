import React, { useMemo } from 'react';

export default function FollowUpSuggestions({ message, onSend }) {
  const suggestions = useMemo(() => {
    const tools = message.toolCallsMeta?.map(tc => tc.name) || [];
    const intent = message.toolCallsMeta?.intent || [];
    const hasSql = !!message.generatedSql;
    const hasTable = !!message.tableData;
    const hasRag = tools.includes('vector_retrieval') || intent.includes('rag');
    const hasWeb = tools.includes('web_search') || intent.includes('web_search');

    if (hasSql || hasTable) return [
      '조건을 변경해서 다시 조회해줘',
      '이 결과를 분석해줘',
      '관련 데이터를 더 조회해줘',
    ];
    if (hasWeb && hasRag) return [
      '더 자세히 비교 분석해줘',
      '출처별로 정리해줘',
      '표로 요약해줘',
    ];
    if (hasWeb) return [
      '더 최신 정보를 검색해줘',
      '출처별로 정리해줘',
      '이 내용을 요약해줘',
    ];
    if (hasRag) return [
      '관련 문서를 더 찾아줘',
      '더 자세히 설명해줘',
      '표로 정리해줘',
    ];
    return [
      '더 자세히 설명해줘',
      '예시를 들어줘',
      '요약해줘',
    ];
  }, [message.toolCallsMeta, message.generatedSql, message.tableData]);

  return (
    <div className="flex flex-wrap gap-2 mt-3 animate-fadeIn">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSend(s)}
          className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all hover:scale-105 active:scale-95 animate-slideUp"
          style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'both' }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
