'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';
import { profilesApi } from '@/lib/api';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user?.username) setUsername(user.username);
    if (user?.bio) setBio(user.bio);
    if (user?.avatarUrl) setAvatarUrl(user.avatarUrl);
  }, [user?.username, user?.bio, user?.avatarUrl]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const token = useAuthStore.getState().token;
    if (!token) return;

    setSaving(true);
    try {
      const response = await profilesApi.updateProfile(token, {
        username: username.trim() || undefined,
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
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
        <h1 className="text-2xl font-bold">edit profile</h1>
        <p className="mt-1 text-xs text-white/50">
          customize your public profile.
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

        <div className="space-y-2">
          <label htmlFor="bio" className="text-xs text-white/70">bio</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="tell people about yourself"
            maxLength={300}
            rows={3}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors resize-y"
          />
          <p className="text-xs text-white/30">{bio.length}/300</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="avatarUrl" className="text-xs text-white/70">avatar image url</label>
          <input
            id="avatarUrl"
            type="text"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/your-avatar.jpg"
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
          {avatarUrl && (
            <div className="flex items-center gap-3 mt-2">
              <div className="w-16 h-16 bg-white/5 border border-white/10 overflow-hidden">
                <img
                  src={avatarUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="text-xs text-white/30">preview</p>
            </div>
          )}
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
