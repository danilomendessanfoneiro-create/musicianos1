import React, { useState } from 'react';
import { Music } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Input, PrimaryButton } from '../components/ui';

export const Login: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const result =
      mode === 'login' ? await signIn(email, password) : await signUp(email, password, name);

    setLoading(false);
    if (result) {
      setError(result);
    } else if (mode === 'signup') {
      setInfo('Conta criada! Verifique seu e-mail para confirmar o cadastro (se a confirmação estiver ativada no seu projeto Supabase).');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm bg-zinc-900 rounded-2xl shadow-2xl p-8">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Music className="w-8 h-8 text-indigo-400" />
          <h1 className="text-2xl font-bold text-indigo-400">
            Musici<span className="text-white">anos</span>
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <Input
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <Input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {info && <p className="text-teal-400 text-sm">{info}</p>}

          <PrimaryButton type="submit" className="w-full" disabled={loading}>
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </PrimaryButton>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setInfo(null);
          }}
          className="mt-6 text-sm text-zinc-400 hover:text-white w-full text-center"
        >
          {mode === 'login' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  );
};
