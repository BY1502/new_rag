import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Bot, Loader2, ArrowRight, User, Key, CheckCircle, Lock } from '../../components/ui/Icon';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLoginMode) {
        await login(email, password);
      } else {
        // ✅ 회원가입 처리
        await register(name, email, password);
        alert('회원가입이 완료되었습니다.\n로그인 화면에서 접속해주세요.');
        setIsLoginMode(true); // 로그인 화면으로 전환
        setPassword(''); // 비밀번호 초기화
      }
    } catch (err) {
      setError(err.toString());
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      
      {/* 왼쪽: 브랜드 섹션 */}
      <div className="hidden lg:flex w-1/2 bg-gray-900 relative flex-col justify-between p-12 text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-gray-900 opacity-90"></div>
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-blue-600 rounded-full blur-[128px] opacity-20"></div>
        <div className="absolute -left-20 bottom-0 w-96 h-96 bg-purple-600 rounded-full blur-[128px] opacity-20"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-2xl font-bold">
            <div className="w-10 h-10 bg-white text-gray-900 rounded-xl flex items-center justify-center">R</div>
            RAG AI
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-5xl font-bold mb-6 leading-tight">Enterprise Level<br/>RAG System</h1>
          <p className="text-gray-400 text-lg mb-8">
            나만의 지식 베이스를 구축하고, <br/>
            가장 강력한 AI 에이전트와 대화하세요.
          </p>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full text-sm border border-white/10 backdrop-blur-sm"><CheckCircle size={16} className="text-green-400"/> 보안 강화</div>
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full text-sm border border-white/10 backdrop-blur-sm"><CheckCircle size={16} className="text-blue-400"/> 멀티모달</div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-gray-500">
          © 2026 RAG AI Corp. All rights reserved.
        </div>
      </div>

      {/* 오른쪽: 폼 섹션 */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10 lg:hidden">
            <div className="inline-flex items-center gap-2 text-2xl font-bold text-gray-900 mb-2">
              <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center text-sm">R</div> RAG AI
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">{isLoginMode ? '다시 오셨군요! 👋' : '계정 만들기 🚀'}</h2>
            <p className="text-sm text-gray-500 mt-2">{isLoginMode ? '이메일과 비밀번호로 로그인하세요.' : '30초 만에 RAG AI를 시작해보세요.'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLoginMode && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">이름</label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="홍길동"/>
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">이메일</label>
              <div className="relative">
                <Bot size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="name@example.com"/>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">비밀번호</label>
              <div className="relative">
                <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="••••••••"/>
              </div>
            </div>

            {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg flex items-center gap-2"><Lock size={16}/> {error}</div>}

            <button type="submit" disabled={isLoading} className="w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition flex items-center justify-center gap-2 shadow-lg shadow-gray-200">
              {isLoading ? <Loader2 size={20} className="animate-spin"/> : (isLoginMode ? '로그인' : '회원가입')}
              {!isLoading && <ArrowRight size={18}/>}
            </button>
          </form>

          <div className="mt-8 text-center space-y-4">
            <p className="text-sm text-gray-500">
              {isLoginMode ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'} 
              <button onClick={() => setIsLoginMode(!isLoginMode)} className="ml-2 font-bold text-blue-600 hover:underline">
                {isLoginMode ? '회원가입' : '로그인'}
              </button>
            </p>

            {/* ✅ 비밀번호 찾기 (관리자 문의) */}
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                비밀번호를 잊으셨나요? <span className="text-gray-600 font-medium cursor-help hover:text-blue-600 transition" title="보안상의 이유로 비밀번호 재설정은 관리자 승인이 필요합니다.">관리자에게 문의하세요.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}