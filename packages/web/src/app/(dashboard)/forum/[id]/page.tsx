'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { forumApi, type ForumThreadFull } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function ForumThreadPage() {
  const { id } = useParams<{ id: string }>();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [thread, setThread] = useState<ForumThreadFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThread = () => {
    setLoading(true);
    forumApi
      .getThread(id)
      .then((data) => setThread(data.thread))
      .catch(() => setError('Thread not found'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchThread();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !reply.trim()) return;
    setSubmitting(true);
    try {
      await forumApi.createPost(token, id, reply.trim());
      setReply('');
      fetchThread();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !confirm('Delete this thread?')) return;
    try {
      await forumApi.deleteThread(token, id);
      window.location.href = '/forum';
    } catch {
      // ignore
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-xs text-white/40">loading thread...</div>;
  }

  if (!thread) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold mb-2">thread not found</h1>
        <Link href="/forum" className="text-xs text-orange-500 hover:text-orange-400">
          back to forum
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/forum" className="text-xs text-white/40 hover:text-white transition-colors">
        &larr; back to forum
      </Link>

      {/* Thread */}
      <div className="border border-white/10 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              {thread.isPinned && (
                <span className="text-[10px] text-orange-500 font-mono">PINNED</span>
              )}
              <h1 className="text-xl font-bold">{thread.title}</h1>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {thread.user.avatarUrl && (
                <div className="w-5 h-5 overflow-hidden flex-shrink-0">
                  <img src={thread.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <p className="text-xs text-white/50">
                <Link
                  href={thread.user.username ? `/u/${thread.user.username}` : '#'}
                  className="hover:text-orange-400 transition-colors"
                >
                  {thread.user.username || 'anonymous'}
                </Link>
                {thread.user.badges?.map((b) => (
                  <span
                    key={b.type}
                    className={`ml-1 text-[10px] ${
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
          {user?.id === thread.userId && (
            <button
              onClick={handleDelete}
              className="text-xs text-white/30 hover:text-red-400 transition-colors"
            >
              delete
            </button>
          )}
        </div>
        <div className="mt-4 text-sm text-white/80 whitespace-pre-wrap">{thread.content}</div>
      </div>

      {/* Replies */}
      <div>
        <h2 className="text-xs text-white/60 font-medium mb-3">
          {thread.posts.length} {thread.posts.length === 1 ? 'reply' : 'replies'}
        </h2>

        {thread.posts.length === 0 ? (
          <div className="border border-white/10 p-6 text-center">
            <p className="text-xs text-white/40">no replies yet. be the first!</p>
          </div>
        ) : (
          <div className="border border-white/10 divide-y divide-white/10">
            {thread.posts.map((post) => (
              <div key={post.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {post.user.avatarUrl && (
                    <div className="w-5 h-5 overflow-hidden flex-shrink-0">
                      <img
                        src={post.user.avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <Link
                    href={post.user.username ? `/u/${post.user.username}` : '#'}
                    className="text-xs text-white/60 hover:text-orange-400 transition-colors"
                  >
                    {post.user.username || 'anonymous'}
                  </Link>
                  {post.user.badges?.map((b) => (
                    <span
                      key={b.type}
                      className={`text-[9px] ${
                        b.type === 'staff' ? 'text-orange-400' : 'text-blue-400'
                      }`}
                    >
                      [{b.label}]
                    </span>
                  ))}
                  <span className="text-[10px] text-white/30">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-white/80 whitespace-pre-wrap">{post.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply Form */}
      {token && (
        <form onSubmit={handleReply} className="space-y-3">
          {error && (
            <div className="border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply..."
            maxLength={10000}
            rows={3}
            className="w-full bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-orange-500/50 resize-y"
          />
          <button
            type="submit"
            disabled={submitting || !reply.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30 text-black text-xs font-medium px-4 py-2 transition-colors"
          >
            {submitting ? 'posting...' : 'reply'}
          </button>
        </form>
      )}
    </div>
  );
}
