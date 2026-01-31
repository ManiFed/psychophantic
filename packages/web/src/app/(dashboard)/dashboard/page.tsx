'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { feedApi, type FeedData } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    feedApi
      .getFeed()
      .then(setFeed)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-10">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          welcome{user?.username ? `, ${user.username}` : ''}
        </h1>
        <p className="mt-2 text-xs text-white/50">
          explore trending agents, conversations, arena matches, and community discussions.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/agents/new"
          className="group border border-white/10 bg-white/5 p-5 hover:border-orange-500/50 transition-colors"
        >
          <div className="text-xs text-orange-500 mb-1">01</div>
          <h3 className="text-sm font-medium mb-1">create an agent</h3>
          <p className="text-xs text-white/50">build ai agents with unique personalities.</p>
        </Link>
        <Link
          href="/conversations/new?mode=debate"
          className="group border border-white/10 bg-white/5 p-5 hover:border-orange-500/50 transition-colors"
        >
          <div className="text-xs text-orange-500 mb-1">02</div>
          <h3 className="text-sm font-medium mb-1">start a debate</h3>
          <p className="text-xs text-white/50">pit agents against each other.</p>
        </Link>
        <Link
          href="/arena/new"
          className="group border border-white/10 bg-white/5 p-5 hover:border-orange-500/50 transition-colors"
        >
          <div className="text-xs text-orange-500 mb-1">03</div>
          <h3 className="text-sm font-medium mb-1">create arena</h3>
          <p className="text-xs text-white/50">host a live multiplayer debate.</p>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-white/40">loading feed...</div>
      ) : feed ? (
        <>
          {/* Trending Agents */}
          {feed.trendingAgents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium">trending agents</h2>
                <Link href="/agents" className="text-xs text-orange-500 hover:text-orange-400">
                  browse all →
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {feed.trendingAgents.map((agent) => (
                  <Link
                    key={agent.id}
                    href={`/agent/${agent.id}`}
                    className="border border-white/10 bg-white/5 p-4 hover:border-orange-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-8 h-8 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden"
                        style={{
                          backgroundColor: agent.avatarUrl ? 'transparent' : agent.avatarColor,
                        }}
                      >
                        {agent.avatarUrl ? (
                          <img
                            src={agent.avatarUrl}
                            alt={agent.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          agent.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{agent.name}</p>
                        <p className="text-[10px] text-white/40 truncate">{agent.role}</p>
                      </div>
                    </div>
                    {agent.user?.username && (
                      <p className="text-[10px] text-white/30">by {agent.user.username}</p>
                    )}
                    {agent.templateUses > 0 && (
                      <p className="text-[10px] text-white/30 mt-1">
                        cloned {agent.templateUses}x
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Trending Conversations */}
          {feed.trendingConversations.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium">trending conversations</h2>
                <Link
                  href="/conversations"
                  className="text-xs text-orange-500 hover:text-orange-400"
                >
                  view all →
                </Link>
              </div>
              <div className="space-y-2">
                {feed.trendingConversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className="border border-white/10 bg-white/5 p-4 hover:border-orange-500/30 transition-colors block"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium truncate">
                        {conv.title || 'Untitled'}
                      </h3>
                      <span className="text-[10px] text-white/30 ml-2 flex-shrink-0">
                        {conv.mode}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {conv.participants?.slice(0, 4).map((p) => (
                          <div
                            key={p.id}
                            className="w-6 h-6 flex items-center justify-center text-[10px] font-bold border border-black overflow-hidden"
                            style={{
                              backgroundColor: p.agent.avatarUrl
                                ? 'transparent'
                                : p.agent.avatarColor,
                            }}
                            title={p.agent.name}
                          >
                            {p.agent.avatarUrl ? (
                              <img
                                src={p.agent.avatarUrl}
                                alt={p.agent.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              p.agent.name.charAt(0).toUpperCase()
                            )}
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] text-white/30">
                        {conv._count?.messages || 0} messages
                      </span>
                      {conv.user?.username && (
                        <span className="text-[10px] text-white/30">
                          by {conv.user.username}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Active Arena Matches */}
          {feed.activeArenas.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-orange-400">live arena</h2>
                <Link href="/arena" className="text-xs text-orange-500 hover:text-orange-400">
                  all rooms →
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {feed.activeArenas.map((room) => (
                  <Link
                    key={room.id}
                    href={`/arena/${room.id}`}
                    className="border border-orange-500/20 bg-orange-500/5 p-4 hover:border-orange-500/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium truncate">{room.title}</h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 border font-mono ${
                          room.status === 'waiting'
                            ? 'text-yellow-400 border-yellow-400/30'
                            : 'text-green-400 border-green-400/30'
                        }`}
                      >
                        {room.status}
                      </span>
                    </div>
                    <p className="text-xs text-white/50 mb-2 truncate">{room.topic}</p>
                    <div className="flex items-center gap-2 text-[10px] text-white/30">
                      <span>
                        {room._count?.participants || room.participants?.length || 0}/
                        {room.maxParticipants} players
                      </span>
                      <span>{room.totalRounds} rounds</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent Forum Threads */}
          {feed.recentThreads.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium">community forum</h2>
                <Link href="/forum" className="text-xs text-orange-500 hover:text-orange-400">
                  all threads →
                </Link>
              </div>
              <div className="border border-white/10 divide-y divide-white/10">
                {feed.recentThreads.map((thread) => (
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
                      <p className="text-[10px] text-white/30 mt-0.5">
                        by {thread.user.username || 'anonymous'} ·{' '}
                        {new Date(thread.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-[10px] text-white/30 ml-4 flex-shrink-0">
                      {thread._count.posts} replies
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {feed.trendingAgents.length === 0 &&
            feed.trendingConversations.length === 0 &&
            feed.activeArenas.length === 0 &&
            feed.recentThreads.length === 0 && (
              <div className="text-center py-12 border border-white/10">
                <p className="text-sm text-white/50">
                  nothing here yet. be the first to create an agent or start a conversation!
                </p>
              </div>
            )}
        </>
      ) : (
        <div className="text-center py-12 text-xs text-white/40">
          failed to load feed. try refreshing.
        </div>
      )}
    </div>
  );
}
