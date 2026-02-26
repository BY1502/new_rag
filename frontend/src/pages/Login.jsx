import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api';
import { useToast } from '../contexts/ToastContext';

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem('rag_token', data.access_token);
      navigate('/home');
    } catch (err) { toast.error("로그인 실패: 이메일과 비밀번호를 확인하세요."); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-96">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-600">RAG AI Login</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" placeholder="Email" className="w-full p-3 border rounded-xl"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" className="w-full p-3 border rounded-xl"
            value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={loading} className="w-full bg-green-500 text-white p-3 rounded-xl font-bold hover:bg-green-600 transition">
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-500">
          계정이 없으신가요? <Link to="/register" className="text-gray-600 hover:underline">회원가입</Link>
        </div>
      </div>
    </div>
  );
}