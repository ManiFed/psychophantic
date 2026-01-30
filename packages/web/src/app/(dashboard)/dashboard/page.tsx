'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useAgentsStore } from '@/stores/agents';
import { useConversationsStore } from '@/stores/conversations';
import { useCreditsStore, formatCents } from '@/stores/credits';

export default function DashboardPage() {
  const { agents, fetchAgents, isLoading: agentsLoading } = useAgentsStore();
  const { conversations, fetchConversations, isLoading: conversationsLoading } = useConversationsStore();
  const { totalCents, freeCents, fetchBalance, isLoading: creditsLoading } = useCreditsStore();

  useEffect(() => {
    fetchAgents();
    fetchConversations();
    fetchBalance();
  }, [fetchAgents, fetchConversations, fetchBalance]);

  // Get 3 most recent agents for display
  const recentAgents = agents.slice(0, 3);
  const recentConversations = conversations.slice(0, 3);

  return (
    <div className="space-y-10">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold">dashboard</h1>
        <p className="mt-2 text-xs text-white/50">
          create ai agents and watch them debate your ideas.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/agents/new" className="group border border-white/10 bg-white/5 p-6 hover:border-orange-500/50 transition-colors">
          <div className="text-xs text-orange-500 mb-2">01</div>
          <h3 className="text-sm font-medium mb-2">create an agent</h3>
          <p className="text-xs text-white/50">
            build ai agents with unique personalities and hidden instructions.
          </p>
        </Link>

        <Link href="/conversations/new?mode=debate" className="group border border-white/10 bg-white/5 p-6 hover:border-orange-500/50 transition-colors">
          <div className="text-xs text-orange-500 mb-2">02</div>
          <h3 className="text-sm font-medium mb-2">start a debate</h3>
          <p className="text-xs text-white/50">
            pit your agents against each other to stress-test an idea.
          </p>
        </Link>

        <Link href="/conversations/new?mode=collaborate" className="group border border-white/10 bg-white/5 p-6 hover:border-orange-500/50 transition-colors">
          <div className="text-xs text-orange-500 mb-2">03</div>
          <h3 className="text-sm font-medium mb-2">start a collaboration</h3>
          <p className="text-xs text-white/50">
            have agents work together to build on ideas.
          </p>
        </Link>
      </div>

      {/* Your Agents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">your agents</h2>
          {agents.length > 0 && (
            <Link href="/agents" className="text-xs text-orange-500 hover:text-orange-400 transition-colors">
              view all →
            </Link>
          )}
        </div>
        <div className="border border-white/10">
          {agentsLoading ? (
            <div className="p-8 text-center">
              <p className="text-xs text-white/50">loading agents...</p>
            </div>
          ) : recentAgents.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-white/50">no agents yet.</p>
              <p className="mt-2 text-xs text-white/30">
                <Link href="/agents/new" className="text-orange-500 hover:text-orange-400">
                  create your first agent
                </Link>
                {' '}to get started!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {recentAgents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}/edit`}
                  className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: agent.avatarColor || '#f97316' }}
                  >
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <p className="text-xs text-white/50 truncate">{agent.role}</p>
                  </div>
                  <div className="text-xs text-white/30">{agent.model}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Conversations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">recent conversations</h2>
          {conversations.length > 0 && (
            <Link href="/conversations" className="text-xs text-orange-500 hover:text-orange-400 transition-colors">
              view all →
            </Link>
          )}
        </div>
        <div className="border border-white/10">
          {conversationsLoading ? (
            <div className="p-8 text-center">
              <p className="text-xs text-white/50">loading conversations...</p>
            </div>
          ) : recentConversations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-white/50">no conversations yet.</p>
              <p className="mt-2 text-xs text-white/30">
                create some agents and{' '}
                <Link href="/conversations/new" className="text-orange-500 hover:text-orange-400">
                  start your first debate
                </Link>
                !
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {recentConversations.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {conv.title || 'Untitled Conversation'}
                    </p>
                    <p className="text-xs text-white/50">
                      {conv.mode} · {conv.status}
                      {conv.mode === 'debate' && conv.totalRounds
                        ? ` · round ${conv.currentRound}/${conv.totalRounds}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-xs text-white/30">
                    ${(conv.totalCostCents / 100).toFixed(2)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/50">total agents</p>
          <p className="mt-1 text-xl font-bold">
            {agentsLoading ? '—' : agents.length}
          </p>
        </div>
        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/50">conversations</p>
          <p className="mt-1 text-xl font-bold">
            {conversationsLoading ? '—' : conversations.length}
          </p>
        </div>
        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/50">free credits</p>
          <p className="mt-1 text-xl font-bold">
            {creditsLoading ? '—' : formatCents(freeCents)}
          </p>
        </div>
        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/50">total balance</p>
          <p className="mt-1 text-xl font-bold text-orange-500">
            {creditsLoading ? '—' : formatCents(totalCents)}
          </p>
        </div>
      </div>
    </div>
  );
}
