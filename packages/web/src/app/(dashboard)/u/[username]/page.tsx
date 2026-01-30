'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { profilesApi, PublicAgent, PublicConversation } from '@/lib/api';

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;

  const [profile, setProfile] = useState<{
    user: { id: string; username: string; createdAt: string };
    agents: PublicAgent[];
    conversations: PublicConversation[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await profilesApi.getPublicProfile(username);
        setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'User not found');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [username]);

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
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-orange-500 flex items-center justify-center text-2xl font-bold text-black">
            {profile.user.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{profile.user.username}</h1>
            <p className="text-xs text-white/50">
              joined {new Date(profile.user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

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
