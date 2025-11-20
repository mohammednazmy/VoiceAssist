
import { useState } from 'react';
import type { ChatMessage, Citation } from '../types';
import { fetchAPI } from '../lib/api';

interface ChatMessageResponse {
  session_id: string;
  message_id: string;
  content: string;
  created_at: string;
  citations: Citation[];
}

export function useChatSession(initialSessionId?: string) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        session_id: sessionId ?? null,
        content,
        clinical_context_id: null,
      };
      const data = await fetchAPI<ChatMessageResponse>('/api/chat/message', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSessionId(data.session_id);
      const msg: ChatMessage = {
        id: data.message_id,
        sessionId: data.session_id,
        role: 'assistant',
        content: data.content,
        createdAt: data.created_at,
        citations: data.citations,
      };
      setMessages((prev) => [...prev, msg]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  return {
    sessionId,
    messages,
    loading,
    error,
    sendMessage,
  };
}
