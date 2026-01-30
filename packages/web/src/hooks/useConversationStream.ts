'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useConversationsStore } from '@/stores/conversations';
import { useCreditsStore } from '@/stores/credits';
import { Message } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface StreamEvent {
  type: string;
  data?: unknown;
  [key: string]: unknown;
}

interface MessageStartData {
  agentId: string;
  messageId: string;
}

interface MessageTokenData {
  messageId: string;
  token: string;
  tokenIndex: number;
}

interface MessageCompleteData {
  messageId: string;
  fullContent: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

interface TurnChangeData {
  nextAgentId: string;
  agentName: string;
  round: number;
}

interface RoundCompleteData {
  roundNumber: number;
}

interface ConversationCompleteData {
  totalCostCents: number;
}

interface ErrorData {
  code: string;
  message: string;
}

interface StreamingMessage {
  id: string;
  agentId: string;
  content: string;
  isStreaming: boolean;
}

interface UseConversationStreamOptions {
  conversationId: string | null;
  onMessageStart?: (agentId: string, messageId: string) => void;
  onMessageToken?: (messageId: string, token: string) => void;
  onMessageComplete?: (messageId: string, content: string) => void;
  onTurnChange?: (agentId: string, agentName: string, round: number) => void;
  onRoundComplete?: (round: number) => void;
  onWaitingForInput?: (round: number) => void;
  onConversationComplete?: (totalCostCents: number) => void;
  onError?: (code: string, message: string) => void;
}

export function useConversationStream({
  conversationId,
  onMessageStart,
  onMessageToken,
  onMessageComplete,
  onTurnChange,
  onRoundComplete,
  onWaitingForInput,
  onConversationComplete,
  onError,
}: UseConversationStreamOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamingMessageRef = useRef<StreamingMessage | null>(null);
  const connectedConversationIdRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);

  // Store refs to avoid dependency issues
  const callbacksRef = useRef({
    onMessageStart,
    onMessageToken,
    onMessageComplete,
    onTurnChange,
    onRoundComplete,
    onWaitingForInput,
    onConversationComplete,
    onError,
  });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onMessageStart,
      onMessageToken,
      onMessageComplete,
      onTurnChange,
      onRoundComplete,
      onWaitingForInput,
      onConversationComplete,
      onError,
    };
  });

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      connectedConversationIdRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Connect to SSE - only depends on conversationId
  useEffect(() => {
    const token = useAuthStore.getState().token;

    if (!conversationId || !token) {
      disconnect();
      return;
    }

    // Don't reconnect if already connected to same conversation
    if (connectedConversationIdRef.current === conversationId && eventSourceRef.current) {
      return;
    }

    // Close any existing connection
    disconnect();

    // Create new EventSource with auth token in URL (SSE doesn't support headers)
    const url = `${API_URL}/api/conversations/${conversationId}/stream?token=${encodeURIComponent(token)}`;
    console.log('[SSE] Connecting to:', conversationId);
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log('[SSE] Connected to:', conversationId);
      connectedConversationIdRef.current = conversationId;
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as StreamEvent;
        const eventType = parsed.type;
        // Data can be in parsed.data (wrapped) or directly on parsed (flat)
        const eventData = (parsed.data || parsed) as Record<string, unknown>;

        // Get current store state directly to avoid stale closures
        const store = useConversationsStore.getState();
        const creditsStore = useCreditsStore.getState();
        const callbacks = callbacksRef.current;

        switch (eventType) {
          case 'message:start': {
            setIsWaitingForInput(false);
            const d = eventData as unknown as MessageStartData;
            const participant = store.participants.find((p) => p.agentId === d.agentId);
            const newMessage: Message = {
              id: d.messageId,
              conversationId: conversationId,
              agentId: d.agentId,
              userId: null,
              content: '',
              role: 'agent',
              roundNumber: null,
              modelUsed: participant?.agent.model || null,
              inputTokens: null,
              outputTokens: null,
              costCents: 0,
              generationTimeMs: null,
              messageType: 'standard',
              createdAt: new Date().toISOString(),
            };
            store.addMessage(newMessage);
            streamingMessageRef.current = {
              id: d.messageId,
              agentId: d.agentId,
              content: '',
              isStreaming: true,
            };
            callbacks.onMessageStart?.(d.agentId, d.messageId);
            break;
          }

          case 'message:token': {
            const d = eventData as unknown as MessageTokenData;
            if (streamingMessageRef.current?.id === d.messageId) {
              streamingMessageRef.current.content += d.token;
              store.updateMessage(d.messageId, { content: streamingMessageRef.current.content });
            }
            callbacks.onMessageToken?.(d.messageId, d.token);
            break;
          }

          case 'message:complete': {
            const d = eventData as unknown as MessageCompleteData;
            store.updateMessage(d.messageId, {
              content: d.fullContent,
              inputTokens: d.inputTokens,
              outputTokens: d.outputTokens,
              costCents: d.costCents,
            });
            streamingMessageRef.current = null;
            callbacks.onMessageComplete?.(d.messageId, d.fullContent);
            break;
          }

          case 'turn:change': {
            const d = eventData as unknown as TurnChangeData;
            callbacks.onTurnChange?.(d.nextAgentId, d.agentName, d.round);
            break;
          }

          case 'round:complete': {
            const d = eventData as unknown as RoundCompleteData;
            callbacks.onRoundComplete?.(d.roundNumber);
            break;
          }

          case 'conversation:complete': {
            const d = eventData as unknown as ConversationCompleteData;
            store.updateConversationStatus('completed');
            callbacks.onConversationComplete?.(d.totalCostCents);
            break;
          }

          case 'waiting:input': {
            const d = eventData as unknown as { roundNumber: number };
            setIsWaitingForInput(true);
            callbacks.onWaitingForInput?.(d.roundNumber);
            break;
          }

          case 'credit:update': {
            creditsStore.fetchBalance();
            break;
          }

          case 'error': {
            const d = eventData as unknown as ErrorData;
            callbacks.onError?.(d.code, d.message);
            if (d.code === 'INSUFFICIENT_CREDITS') {
              store.updateConversationStatus('paused');
            }
            break;
          }
        }
      } catch (err) {
        console.error('[SSE] Failed to parse event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[SSE] Connection error:', err);
      setIsConnected(false);
      // EventSource will automatically try to reconnect
    };

    eventSourceRef.current = eventSource;

    return () => {
      console.log('[SSE] Disconnecting');
      disconnect();
    };
  }, [conversationId, disconnect]); // Only reconnect when conversationId changes

  return {
    disconnect,
    isConnected,
    isWaitingForInput,
    streamingMessage: streamingMessageRef.current,
  };
}
