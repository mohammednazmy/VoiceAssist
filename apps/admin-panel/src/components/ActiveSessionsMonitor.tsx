/**
 * Active Sessions Monitor
 * Real-time display of active user sessions
 */

import { useEffect, useState } from 'react';
import { fetchAPI } from '../lib/api';

interface ActiveSession {
  userId: string;
  userName: string;
  connectionId: string;
  connectedAt: string;
  lastActivity: string;
  conversationId?: string;
}

export function ActiveSessionsMonitor() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
    // Refresh every 5 seconds for real-time monitoring
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const data = await fetchAPI<{ sessions: ActiveSession[] }>(
        '/api/admin/sessions/active',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSessions(data.sessions || []);
      setError(null);
    } catch (err: any) {
      // Don't show error on refresh, only on initial load
      if (loading) {
        setError(err.message || 'Failed to load sessions');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (timestamp: string): string => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return 'Just now';
  };

  if (loading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="flex items-center justify-center">
          <div className="text-slate-400">Loading sessions...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">Active Sessions</h3>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-400 border border-green-800">
          <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse"></span>
          {sessions.length} active
        </span>
      </div>

      <div className="p-6">
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No active sessions
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.connectionId}
                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                    {session.userName[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">
                      {session.userName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {session.conversationId ? `In conversation` : 'Idle'}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-400">
                    Connected {formatDuration(session.connectedAt)}
                  </div>
                  <div className="text-xs text-slate-500">
                    Active {formatDuration(session.lastActivity)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
