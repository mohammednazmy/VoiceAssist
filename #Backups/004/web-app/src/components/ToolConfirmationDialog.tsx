
import type { PendingToolCall } from '../hooks/useToolConfirmation';

interface ToolConfirmationDialogProps {
  pending: PendingToolCall | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ToolConfirmationDialog({ pending, onConfirm, onCancel }: ToolConfirmationDialogProps) {
  if (!pending) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-w-md w-full p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-100">Confirm tool action</div>
        <div className="text-xs text-slate-400">
          The assistant wants to call <span className="font-mono text-emerald-300">{pending.name}</span>.
        </div>
        <pre className="bg-slate-950 border border-slate-800 rounded p-2 text-[10px] text-slate-300 overflow-auto max-h-40">
          {JSON.stringify(pending.args, null, 2)}
        </pre>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1 text-xs rounded border border-slate-700 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
