import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await authAPI.register(email, password, name);
      alert("회원가입 성공! 로그인해주세요.");
      navigate('/login');
    } catch (err) { alert("회원가입 실패"); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-96">
        <h2 className="text-2xl font-bold mb-6 text-center text-green-600">회원가입</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="이름" className="w-full p-3 border rounded-xl"
            value={name} onChange={(e) => setName(e.target.value)} required />
          <input type="email" placeholder="이메일" className="w-full p-3 border rounded-xl"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="비밀번호" className="w-full p-3 border rounded-xl"
            value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" className="w-full bg-green-600 text-white p-3 rounded-xl font-bold hover:bg-green-700 transition">
            가입하기
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-500">
          이미 계정이 있으신가요? <Link to="/login" className="text-indigo-600 hover:underline">로그인</Link>
        </div>
      </div>
    </div>
  );
}