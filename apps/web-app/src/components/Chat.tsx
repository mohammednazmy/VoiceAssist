
import { FormEvent, useState } from 'react';
import { useChatSession } from '../hooks/useChatSession';
import { useToolConfirmation } from '../hooks/useToolConfirmation';
import { ToolConfirmationDialog } from './ToolConfirmationDialog';

export function Chat() {
  const [input, setInput] = useState('');
  const [conversationId] = useState<string | undefined>('demo-conversation');
  const { messages, connectionStatus, sendMessage } = useChatSession({ conversationId });
  const tool = useToolConfirmation();
  const loading = connectionStatus === 'connecting' || connectionStatus === 'reconnecting';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
    setInput('');
  };

  return (
    <section className="flex-1 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col h-full">
        <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-100">Clinical conversation</div>
            <div className="text-xs text-slate-500">
              Quick consult · not connected to real PHI · demo only
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 text-sm">
          {messages.length === 0 && (
            <div className="text-slate-500 text-xs">
              Ask a question like:{' '}
              <span className="italic">
                "Initial management for 65M with acutely decompensated HFrEF on home ACEi and beta blocker?"
              </span>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              <div className="text-xs text-slate-500 mb-1">
                {m.role === 'assistant' ? 'Assistant' : 'You'} ·{' '}
                {new Date(m.timestamp).toLocaleTimeString()}
              </div>
              <div className="whitespace-pre-wrap text-slate-100">{m.content}</div>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 text-[10px] text-slate-400 space-y-1">
                  <div className="uppercase tracking-wide text-slate-500">Sources</div>
                  {m.citations.map((c) => (
                    <div key={c.id}>• {c.title}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {connectionStatus === 'failed' && <div className="text-xs text-red-400">Connection failed</div>}
        </div>
        <form onSubmit={onSubmit} className="border-t border-slate-800 px-6 py-3 flex gap-2">
          <input
            className="flex-1 rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder="Ask a focused clinical question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm rounded-md bg-emerald-600 disabled:bg-emerald-900 hover:bg-emerald-500 text-white"
          >
            {loading ? 'Thinking…' : 'Send'}
          </button>
        </form>
        <ToolConfirmationDialog
          pending={tool.pending}
          onConfirm={tool.confirm}
          onCancel={tool.cancel}
        />
      </div>
      <aside className="border-l border-slate-800 bg-slate-950/60 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500">Evidence</div>
          <div className="text-xs text-slate-400">
            Sources and tools will appear here as the system is implemented.
          </div>
        </div>
        <div className="flex-1 px-4 py-3 text-xs text-slate-500 space-y-2 overflow-y-auto">
          <div className="font-semibold text-slate-300 text-sm">Demo notes</div>
          <p>
            This UI is wired to the stubbed QueryOrchestrator at <code>/api/chat/message</code>. As the
            backend RAG pipeline is built out, this panel will show citations and tool activity.
          </p>
        </div>
      </aside>
    </section>
  );
}
