import { publishEvent, events } from './events.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GenerationResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  generationTimeMs: number;
}

interface Agent {
  id: string;
  name: string;
  model: string;
  role: string;
  systemPrompt: string | null;
}

interface Participant {
  agentId: string;
  agent: Agent;
}

interface Message {
  agentId: string | null;
  userId: string | null;
  content: string;
  role: string;
}

export function buildAgentContext(
  agent: Agent,
  messages: Message[],
  participants: Participant[]
): OpenRouterMessage[] {
  // Build list of other participants for context
  const otherAgents = participants
    .filter((p) => p.agentId !== agent.id)
    .map((p) => `- ${p.agent.name}: ${p.agent.role}`)
    .join('\n');

  // System prompt combines agent's instructions with context
  const systemPrompt = `${agent.systemPrompt || ''}

You are ${agent.name}. Your role: ${agent.role}

Other participants in this conversation:
${otherAgents}

Respond in character. Be concise but substantive. Stay true to your role and perspective.`;

  // Get agent name by ID helper
  const getAgentName = (agentId: string | null): string => {
    if (!agentId) return 'User';
    const participant = participants.find((p) => p.agentId === agentId);
    return participant?.agent.name || 'Unknown';
  };

  // Convert message history - agents see all messages but NOT other agents' system prompts
  const history: OpenRouterMessage[] = messages.map((msg) => ({
    role: msg.agentId === agent.id ? 'assistant' : 'user',
    content: msg.agentId
      ? `[${getAgentName(msg.agentId)}]: ${msg.content}`
      : `[User]: ${msg.content}`,
  }));

  return [{ role: 'system', content: systemPrompt }, ...history];
}

export async function generateAgentResponse(
  conversationId: string,
  agent: Agent,
  context: OpenRouterMessage[],
  messageId: string
): Promise<GenerationResult> {
  const startTime = Date.now();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  console.log(`[OpenRouter] Generating response for agent ${agent.name} using model ${agent.model}`);

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'Psychophant',
    },
    body: JSON.stringify({
      model: agent.model,
      messages: context,
      stream: true,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[OpenRouter] API error (${response.status}):`, errorText);
    throw new Error(`OpenRouter error (${response.status}): ${errorText}`);
  }

  console.log(`[OpenRouter] Stream started for message ${messageId}`);

  // Publish message start event
  await publishEvent(conversationId, events.messageStart(agent.id, messageId));

  let fullContent = '';
  let tokenIndex = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content || '';

        if (token) {
          fullContent += token;
          await publishEvent(
            conversationId,
            events.messageToken(messageId, token, tokenIndex++)
          );
        }

        // Capture usage info from final chunk
        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens || 0;
          outputTokens = parsed.usage.completion_tokens || 0;
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  // Calculate cost - OpenRouter provides this in headers or we estimate
  // Cost is in dollars, convert to cents
  const costHeader = response.headers.get('x-openrouter-cost');
  let costCents = 0;

  if (costHeader) {
    costCents = Math.ceil(parseFloat(costHeader) * 100);
  } else {
    // Fallback: estimate based on model rates
    costCents = estimateCost(agent.model, inputTokens, outputTokens);
  }

  // Publish message complete event
  await publishEvent(
    conversationId,
    events.messageComplete(messageId, fullContent, inputTokens, outputTokens, costCents)
  );

  return {
    content: fullContent,
    inputTokens,
    outputTokens,
    costCents,
    generationTimeMs: Date.now() - startTime,
  };
}

// Estimate cost based on known model rates (in cents per 1M tokens)
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Approximate rates per 1M tokens (input/output)
  const rates: Record<string, [number, number]> = {
    'anthropic/claude-sonnet-4': [300, 1500], // $3/$15 per 1M
    'anthropic/claude-3.5-sonnet': [300, 1500],
    'openai/gpt-4o': [250, 1000], // $2.50/$10 per 1M
    'openai/gpt-4o-mini': [15, 60], // $0.15/$0.60 per 1M
    'meta-llama/llama-3.1-405b-instruct': [270, 270],
    'meta-llama/llama-3.1-70b-instruct': [52, 52],
    'google/gemini-pro-1.5': [125, 500],
    'google/gemini-flash-1.5': [8, 30],
  };

  const [inputRate, outputRate] = rates[model] || [100, 300]; // Default rates

  const inputCost = (inputTokens / 1_000_000) * inputRate;
  const outputCost = (outputTokens / 1_000_000) * outputRate;

  return Math.ceil(inputCost + outputCost);
}

// Generate without streaming (for synthesis/voting in Force Agreement)
export async function generateCompletion(
  model: string,
  messages: OpenRouterMessage[]
): Promise<{ content: string; inputTokens: number; outputTokens: number; costCents: number }> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'Psychophant',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${error}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content || '';
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  const costHeader = response.headers.get('x-openrouter-cost');
  const costCents = costHeader
    ? Math.ceil(parseFloat(costHeader) * 100)
    : estimateCost(model, inputTokens, outputTokens);

  return { content, inputTokens, outputTokens, costCents };
}
