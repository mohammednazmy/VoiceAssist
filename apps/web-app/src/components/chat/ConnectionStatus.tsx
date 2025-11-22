/**
 * ConnectionStatus Component
 * Displays WebSocket connection status
 */

import type { ConnectionStatus as Status } from '@voiceassist/types';

export interface ConnectionStatusProps {
  status: Status;
  onReconnect?: () => void;
}

export function ConnectionStatus({ status, onReconnect }: ConnectionStatusProps) {
  const statusConfig = {
    connecting: {
      label: 'Connecting',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      icon: (
        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
      ),
    },
    connected: {
      label: 'Connected',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: (
        <div className="w-2 h-2 rounded-full bg-green-500" />
      ),
    },
    reconnecting: {
      label: 'Reconnecting',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      icon: (
        <div className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
      ),
    },
    disconnected: {
      label: 'Disconnected',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: (
        <div className="w-2 h-2 rounded-full bg-red-500" />
      ),
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-full border ${config.bgColor} ${config.borderColor}`}
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${config.label}`}
    >
      {config.icon}
      <span className={`text-xs font-medium ${config.color}`}>
        {config.label}
      </span>

      {status === 'disconnected' && onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="ml-2 text-xs font-medium text-red-600 hover:text-red-700 underline"
          aria-label="Reconnect to chat"
        >
          Retry
        </button>
      )}
    </div>
  );
}
