'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    clearError();

    if (!email || !username || !password || !confirmPassword) {
      setFormError('Please fill in all fields');
      return;
    }

    if (username.length < 3) {
      setFormError('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setFormError('Username can only contain letters, numbers, underscores, and hyphens');
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    try {
      await register(email, password, username);
      router.push('/dashboard');
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">create account</h1>
        <p className="text-xs text-white/50">
          get started with $0.10 free credit daily
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {(error || formError) && (
          <div className="border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-400">
            {error || formError}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-xs text-white/70">email</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 disabled:opacity-50 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="username" className="text-xs text-white/70">username</label>
          <input
            id="username"
            type="text"
            placeholder="pick a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            minLength={3}
            maxLength={30}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 disabled:opacity-50 transition-colors"
          />
          <p className="text-xs text-white/30">
            3-30 characters. letters, numbers, underscores, and hyphens only.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-xs text-white/70">password</label>
          <input
            id="password"
            type="password"
            placeholder="at least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 disabled:opacity-50 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-xs text-white/70">confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 disabled:opacity-50 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-orange-500 text-black py-3 text-sm font-medium hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'creating account...' : 'create account'}
        </button>
      </form>

      <div className="space-y-3">
        <p className="text-center text-xs text-white/50">
          already have an account?{' '}
          <Link href="/login" className="text-orange-500 hover:text-orange-400 transition-colors">
            sign in
          </Link>
        </p>

        <p className="text-center text-xs text-white/30">
          by creating an account, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}
