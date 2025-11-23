/**
 * Alert Notifications
 * System alerts and warnings display
 */

import { useEffect, useState } from 'react';
import { fetchAPI } from '../lib/api';

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export function AlertNotifications() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const loadAlerts = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const data = await fetchAPI<{ alerts: Alert[] }>(
        '/api/admin/alerts',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeAlert = async (id: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      await fetchAPI(`/api/admin/alerts/${id}/acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(alerts.filter(a => a.id !== id));
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const getAlertStyles = (type: Alert['type']) => {
    switch (type) {
      case 'error':
        return {
          bg: 'bg-red-900/20 border-red-800',
          icon: '🔴',
          text: 'text-red-400',
          button: 'hover:bg-red-900/30',
        };
      case 'warning':
        return {
          bg: 'bg-yellow-900/20 border-yellow-800',
          icon: '⚠️',
          text: 'text-yellow-400',
          button: 'hover:bg-yellow-900/30',
        };
      case 'info':
        return {
          bg: 'bg-blue-900/20 border-blue-800',
          icon: 'ℹ️',
          text: 'text-blue-400',
          button: 'hover:bg-blue-900/30',
        };
    }
  };

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);

  if (loading) return null;

  if (unacknowledged Alerts.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center space-x-2 text-green-400">
          <span>✓</span>
          <span className="text-sm font-medium">All systems operational</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-200">Active Alerts</h3>
      {unacknowledgedAlerts.map((alert) => {
        const styles = getAlertStyles(alert.type);
        return (
          <div
            key={alert.id}
            className={`border rounded-lg p-4 ${styles.bg}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <span className="text-xl">{styles.icon}</span>
                <div className="flex-1">
                  <div className={`font-medium ${styles.text}`}>
                    {alert.title}
                  </div>
                  <div className="text-sm text-slate-300 mt-1">
                    {alert.message}
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    {new Date(alert.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => acknowledgeAlert(alert.id)}
                className={`ml-4 px-3 py-1 text-xs rounded ${styles.button} ${styles.text} transition-colors`}
              >
                Acknowledge
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
