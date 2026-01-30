'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';
import { profilesApi } from '@/lib/api';

export default function ProfilePage() {
  const { user, checkAuth } = useAuthStore();
  const [username, setUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
  }, [user?.username]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const token = useAuthStore.getState().token;
    if (!token) return;

    setSaving(true);
    try {
      const response = await profilesApi.updateProfile(token, { username: username.trim() });
      useAuthStore.setState({ user: response.user });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">profile</h1>
        <p className="mt-1 text-xs text-white/50">
          set your username to create a public profile page.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="border border-green-500/50 bg-green-500/10 p-3 text-xs text-green-400">
            profile updated successfully
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-xs text-white/70">email</label>
          <input
            id="email"
            type="text"
            value={user?.email || ''}
            disabled
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/50 cursor-not-allowed"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="username" className="text-xs text-white/70">username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="choose a username"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_-]+"
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
          <p className="text-xs text-white/30">
            3-30 characters. letters, numbers, underscores, and hyphens only.
          </p>
        </div>

        {user?.username && (
          <div className="space-y-2">
            <label className="text-xs text-white/70">public profile</label>
            <div className="border border-white/10 bg-white/5 p-4">
              <Link
                href={`/u/${user.username}`}
                className="text-sm text-orange-500 hover:text-orange-400 transition-colors"
              >
                /u/{user.username}
              </Link>
              <p className="text-xs text-white/30 mt-1">
                your public agents and shared conversations will appear here.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-orange-500 text-black px-6 py-3 text-sm font-medium hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'saving...' : 'save profile'}
        </button>
      </form>
    </div>
  );
}
