
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments';
import { useIndexingJobs } from '../hooks/useIndexingJobs';

export function KnowledgeBase() {
  const { docs, loading: docsLoading } = useKnowledgeDocuments();
  const { jobs, loading: jobsLoading } = useIndexingJobs();

  return (
    <section id="kb" className="flex-1 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Knowledge Base</h2>
          <p className="text-xs text-slate-500">
            Textbooks, journals, guidelines, and notes indexed for RAG.
          </p>
        </div>
        <button className="px-3 py-1.5 text-xs rounded bg-slate-100 text-slate-900 hover:bg-white">
          + Upload document
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 text-xs">
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <div className="font-medium text-slate-200 text-xs">Documents</div>
            {docsLoading && <div className="text-[10px] text-slate-500">Loading…</div>}
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-slate-950">
              <tr className="border-b border-slate-800">
                <th className="text-left px-3 py-2 text-slate-500 font-normal">Name</th>
                <th className="text-left px-3 py-2 text-slate-500 font-normal">Type</th>
                <th className="text-left px-3 py-2 text-slate-500 font-normal">Version</th>
                <th className="text-left px-3 py-2 text-slate-500 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-slate-900 hover:bg-slate-900">
                  <td className="px-3 py-2 text-slate-100">{d.name}</td>
                  <td className="px-3 py-2 text-slate-400">{d.type}</td>
                  <td className="px-3 py-2 text-slate-400">{d.version ?? '—'}</td>
                  <td className="px-3 py-2">
                    {d.indexed ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-700/60">
                        indexed
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-200 border border-slate-600">
                        pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {docs.length === 0 && !docsLoading && (
                <tr>
                  <td className="px-3 py-4 text-slate-500 text-center" colSpan={4}>
                    No documents yet. Upload a PDF or import from Nextcloud.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <div className="font-medium text-slate-200 text-xs">Indexing Jobs</div>
            {jobsLoading && <div className="text-[10px] text-slate-500">Loading…</div>}
          </div>
          <div className="p-3 space-y-2 text-[11px]">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="border border-slate-800 rounded px-3 py-2 flex items-center justify-between"
              >
                <div>
                  <div className="text-slate-100 font-medium">{j.documentId}</div>
                  <div className="text-slate-500 text-[10px]">Job {j.id}</div>
                </div>
                <div className="text-slate-300 text-[10px] uppercase tracking-wide">
                  {j.state}
                </div>
              </div>
            ))}
            {jobs.length === 0 && !jobsLoading && (
              <div className="text-slate-500 text-[11px]">
                No indexing jobs yet. When documents are uploaded, jobs will appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
