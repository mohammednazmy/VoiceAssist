
import { useEffect, useState } from 'react';
import type { APIErrorShape } from '../types';
import { fetchAPI } from '../lib/api';

// Simplified KnowledgeDocument for admin list view
// Full canonical definition in DATA_MODEL.md includes 20+ fields:
// userId, docKey, contentHash, filePath, fileName, fileSize, fileFormat,
// authors, publicationYear, publisher, edition, isbn, doi, etc.
export interface KnowledgeDocument {
  id: string;
  name: string;  // Maps to 'title' in canonical model
  type: 'textbook' | 'journal' | 'guideline' | 'note' | string;  // Maps to 'documentType'
  indexed: boolean;  // Maps to 'isIndexed'
  version?: string;  // Simplified from canonical 'version' (number)
  lastIndexedAt?: string;
}

export function useKnowledgeDocuments() {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIErrorShape | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try real backend; fall back to demo data on failure
        // API path from ADMIN_PANEL_SPECS.md: GET /api/admin/kb/documents
        // Returns APIEnvelope<KnowledgeDocument[]> - fetchAPI unwraps to KnowledgeDocument[]
        const data = await fetchAPI<KnowledgeDocument[]>('/api/admin/kb/documents');
        if (!cancelled) setDocs(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.warn('Falling back to demo KB data:', message);
        if (!cancelled) {
          setError({ code: 'demo', message });
          setDocs([
            {
              id: 'doc-harrisons-hf',
              name: "Harrison's · Heart Failure",
              type: 'textbook',
              indexed: true,
              version: 'v1',
              lastIndexedAt: new Date().toISOString(),
            },
            {
              id: 'doc-aha-2022-hf',
              name: 'AHA/ACC/HFSA 2022 HF Guideline',
              type: 'guideline',
              indexed: true,
              version: 'v1',
              lastIndexedAt: new Date().toISOString(),
            },
          ]);
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

  return { docs, loading, error };
}
