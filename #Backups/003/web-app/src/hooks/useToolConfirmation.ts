
import { useState } from 'react';

export interface PendingToolCall {
  id: string;
  name: string;
  description: string;
  args: Record<string, unknown>;
}

export function useToolConfirmation() {
  const [pending, setPending] = useState<PendingToolCall | null>(null);

  const requestConfirmation = (call: PendingToolCall) => {
    setPending(call);
  };

  const confirm = () => {
    const current = pending;
    setPending(null);
    return current;
  };

  const cancel = () => {
    setPending(null);
  };

  return {
    pending,
    requestConfirmation,
    confirm,
    cancel,
  };
}
