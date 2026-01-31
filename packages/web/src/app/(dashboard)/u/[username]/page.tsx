'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { profilesApi, type PublicAgent, type PublicConversation, type PublicProfileUser, type FollowUser } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const currentUser = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const [profile, setProfile] = useState<{
    user: PublicProfileUser;
    agents: PublicAgent[];
    conversations: PublicConversation[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [followerList, setFollowerList] = useState<FollowUser[]>([]);
  const [followingList, setFollowingList] = useState<FollowUser[]>([]);

  const isOwnProfile = currentUser?.username === username;

  const fetchProfile = useCallback(async () => {
    try {
      const data = await profilesApi.getPublicProfile(username);
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User not found');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleFollow = async () => {
    if (!token || !profile) return;
    setFollowLoading(true);
    try {
      if (profile.user.isFollowing) {
        await profilesApi.unfollow(token, profile.user.id);
      } else {
        await profilesApi.follow(token, profile.user.id);
      }
      await fetchProfile();
    } catch {
      // ignore
    } finally {
      setFollowLoading(false);
    }
  };

  const loadFollowers = async () => {
    if (!profile) return;
    try {
      const data = await profilesApi.getFollowers(profile.user.id);
      setFollowerList(data.users);
      setShowFollowers(true);
      setShowFollowing(false);
    } catch {
      // ignore
    }
  };

  const loadFollowing = async () => {
    if (!profile) return;
    try {
      const data = await profilesApi.getFollowing(profile.user.id);
      setFollowingList(data.users);
      setShowFollowing(true);
      setShowFollowers(false);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-white/50">loading profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-2">user not found</h1>
        <p className="text-sm text-white/50">{error || 'This profile does not exist.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <div className="border border-white/10 bg-white/5 p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-orange-500 flex items-center justify-center text-2xl font-bold text-black flex-shrink-0 overflow-hidden">
            {profile.user.avatarUrl ? (
              <img
                src={profile.user.avatarUrl}
                alt={profile.user.username}
                className="w-full h-full object-cover"
              />
            ) : (
              profile.user.username.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{profile.user.username}</h1>
              {profile.user.badges.map((badge) => (
                <span
                  key={badge.type}
                  className={`text-[10px] px-2 py-0.5 font-mono border ${
                    badge.type === 'staff'
                      ? 'text-orange-400 border-orange-400/30 bg-orange-400/10'
                      : 'text-blue-400 border-blue-400/30 bg-blue-400/10'
                  }`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            {profile.user.bio && (
              <p className="text-sm text-white/70 mt-1">{profile.user.bio}</p>
            )}
            <p className="text-xs text-white/40 mt-1">
              joined {new Date(profile.user.createdAt).toLocaleDateString()}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3 text-xs">
              <button
                onClick={loadFollowers}
                className="text-white/60 hover:text-white transition-colors"
              >
                <span className="font-medium text-white">{profile.user.followerCount}</span> followers
              </button>
              <button
                onClick={loadFollowing}
                className="text-white/60 hover:text-white transition-colors"
              >
                <span className="font-medium text-white">{profile.user.followingCount}</span> following
              </button>
              <span className="text-white/40">
                {profile.user.agentCount} agents
              </span>
              <span className="text-white/40">
                {profile.user.conversationCount} conversations
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOwnProfile ? (
              <Link
                href="/profile"
                className="border border-white/20 px-4 py-2 text-xs hover:border-white/40 transition-colors"
              >
                edit profile
              </Link>
            ) : token ? (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  profile.user.isFollowing
                    ? 'border border-white/20 text-white/70 hover:border-red-500/50 hover:text-red-400'
                    : 'bg-orange-500 text-black hover:bg-orange-400'
                }`}
              >
                {followLoading
                  ? '...'
                  : profile.user.isFollowing
                  ? 'following'
                  : 'follow'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Follower / Following Lists */}
      {(showFollowers || showFollowing) && (
        <div className="border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs text-white/60 font-medium">
              {showFollowers ? 'followers' : 'following'}
            </h3>
            <button
              onClick={() => {
                setShowFollowers(false);
                setShowFollowing(false);
              }}
              className="text-xs text-white/40 hover:text-white"
            >
              close
            </button>
          </div>
          <div className="space-y-2">
            {(showFollowers ? followerList : followingList).length === 0 ? (
              <p className="text-xs text-white/40">none yet.</p>
            ) : (
              (showFollowers ? followerList : followingList).map((u) => (
                <Link
                  key={u.id}
                  href={u.username ? `/u/${u.username}` : '#'}
                  className="flex items-center gap-3 p-2 hover:bg-white/5 transition-colors"
                >
                  <div className="w-8 h-8 bg-orange-500/80 flex items-center justify-center text-xs font-bold text-black overflow-hidden flex-shrink-0">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (u.username || '?').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium truncate">
                        {u.username || 'anonymous'}
                      </span>
                      {u.badges?.map((b) => (
                        <span
                          key={b.type}
                          className={`text-[9px] px-1 py-px font-mono ${
                            b.type === 'staff'
                              ? 'text-orange-400'
                              : 'text-blue-400'
                          }`}
                        >
                          {b.label}
                        </span>
                      ))}
                    </div>
                    {u.bio && (
                      <p className="text-[10px] text-white/40 truncate">{u.bio}</p>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* Public Agents */}
      <div>
        <h2 className="text-lg font-bold mb-4">
          public agents
          <span className="text-sm text-white/50 font-normal ml-2">
            ({profile.agents.length})
          </span>
        </h2>

        {profile.agents.length === 0 ? (
          <div className="border border-white/10 p-8 text-center">
            <p className="text-sm text-white/50">no public agents yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {profile.agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agent/${agent.id}`}
                className="border border-white/10 bg-white/5 p-5 hover:border-orange-500/30 transition-colors block"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: agent.avatarUrl ? 'transparent' : agent.avatarColor }}
                  >
                    {agent.avatarUrl ? (
                      <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
                    ) : (
                      agent.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{agent.name}</h3>
                    <p className="text-xs text-white/50">{agent.model}</p>
                  </div>
                </div>
                <p className="text-xs text-white/70 line-clamp-2">{agent.role}</p>
                {agent.templateUses > 0 && (
                  <p className="text-xs text-white/40 mt-2">
                    used {agent.templateUses} time{agent.templateUses !== 1 ? 's' : ''}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Public Conversations */}
      <div>
        <h2 className="text-lg font-bold mb-4">
          public conversations
          <span className="text-sm text-white/50 font-normal ml-2">
            ({profile.conversations.length})
          </span>
        </h2>

        {profile.conversations.length === 0 ? (
          <div className="border border-white/10 p-8 text-center">
            <p className="text-sm text-white/50">no public conversations yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {profile.conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/conversations/${conv.id}`}
                className="border border-white/10 bg-white/5 p-4 hover:border-orange-500/30 transition-colors block"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm truncate">
                    {conv.title || 'Untitled Conversation'}
                  </h3>
                  <span className="text-xs text-white/40 flex-shrink-0 ml-2">
                    {conv.mode}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {conv.participants.slice(0, 4).map((p) => (
                      <div
                        key={p.id}
                        className="w-6 h-6 flex items-center justify-center text-xs font-bold border border-black overflow-hidden"
                        style={{ backgroundColor: p.agent.avatarUrl ? 'transparent' : p.agent.avatarColor }}
                        title={p.agent.name}
                      >
                        {p.agent.avatarUrl ? (
                          <img src={p.agent.avatarUrl} alt={p.agent.name} className="w-full h-full object-cover" />
                        ) : (
                          p.agent.name.charAt(0).toUpperCase()
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-white/40">
                    {conv._count.messages} messages
                  </span>
                  <span className="text-xs text-white/40">
                    {new Date(conv.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
