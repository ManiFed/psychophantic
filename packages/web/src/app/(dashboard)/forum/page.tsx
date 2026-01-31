'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { forumApi, type ForumThread } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function ForumPage() {
  const token = useAuthStore((s) => s.token);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // New thread form
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    forumApi
      .listThreads(page)
      .then((data) => {
        setThreads(data.threads);
        setTotalPages(data.totalPages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !title.trim() || !content.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await forumApi.createThread(token, { title: title.trim(), content: content.trim() });
      setTitle('');
      setContent('');
      setShowForm(false);
      // Refresh
      const data = await forumApi.listThreads(1);
      setThreads(data.threads);
      setTotalPages(data.totalPages);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">forum</h1>
          <p className="text-xs text-white/50 mt-1">community discussions</p>
        </div>
        {token && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-orange-500 hover:bg-orange-600 text-black text-xs font-medium px-4 py-2 transition-colors"
          >
            {showForm ? 'cancel' : 'new thread'}
          </button>
        )}
      </div>

      {/* New Thread Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="border border-white/10 p-4 space-y-4">
          {error && (
            <div className="border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Thread title..."
            maxLength={200}
            className="w-full bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-orange-500/50"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            maxLength={10000}
            rows={4}
            className="w-full bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-orange-500/50 resize-y"
          />
          <button
            type="submit"
            disabled={submitting || !title.trim() || !content.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30 text-black text-xs font-medium px-4 py-2 transition-colors"
          >
            {submitting ? 'posting...' : 'post thread'}
          </button>
        </form>
      )}

      {/* Thread List */}
      {loading ? (
        <div className="text-center py-12 text-xs text-white/40">loading threads...</div>
      ) : threads.length === 0 ? (
        <div className="border border-white/10 p-12 text-center">
          <p className="text-sm text-white/50">no threads yet. start a discussion!</p>
        </div>
      ) : (
        <div className="border border-white/10 divide-y divide-white/10">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/forum/${thread.id}`}
              className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {thread.isPinned && (
                    <span className="text-[10px] text-orange-500 font-mono">PIN</span>
                  )}
                  <h3 className="text-sm font-medium truncate">{thread.title}</h3>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {thread.user.avatarUrl && (
                    <div className="w-4 h-4 overflow-hidden flex-shrink-0">
                      <img
                        src={thread.user.avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-white/40">
                    {thread.user.username || 'anonymous'}
                    {thread.user.badges?.map((b) => (
                      <span
                        key={b.type}
                        className={`ml-1 ${
                          b.type === 'staff' ? 'text-orange-400' : 'text-blue-400'
                        }`}
                      >
                        [{b.label}]
                      </span>
                    ))}
                    {' · '}
                    {new Date(thread.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <span className="text-xs text-white/30 ml-4 flex-shrink-0">
                {thread._count.posts} replies
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs text-white/50 hover:text-white disabled:text-white/20 transition-colors"
          >
            prev
          </button>
          <span className="text-xs text-white/40">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs text-white/50 hover:text-white disabled:text-white/20 transition-colors"
          >
            next
          </button>
        </div>
      )}
    </div>
  );
}
