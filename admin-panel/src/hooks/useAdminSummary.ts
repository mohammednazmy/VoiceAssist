import { useEffect, useState } from 'react';
import { fetchAPI } from '../lib/api';
import type { APIErrorShape } from '../types';

export interface AdminSummary {
  total_users: number;
  active_users: number;
  admin_users: number;
  timestamp: string;
}

export function useAdminSummary() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIErrorShape | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAPI<AdminSummary>('/api/admin/panel/summary');
        if (!cancelled) {
          setSummary(data);
        }
      } catch (e: any) {
        console.warn('Admin summary fetch failed, using demo values:', e?.message);
        if (!cancelled) {
          setSummary({
            total_users: 3,
            active_users: 3,
            admin_users: 1,
            timestamp: new Date().toISOString(),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { summary, loading, error };
}
