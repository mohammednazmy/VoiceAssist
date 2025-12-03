import { useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";

interface ClinicalContextSummary {
  id: string;
  user_id: string;
  user_email?: string;
  session_id?: string;
  has_demographics: boolean;
  has_chief_complaint: boolean;
  has_problems: boolean;
  has_medications: boolean;
  has_allergies: boolean;
  has_vitals: boolean;
  last_updated: string;
  created_at: string;
}

interface ClinicalContextDetail {
  id: string;
  user_id: string;
  user_email?: string;
  session_id?: string;
  age?: number | string;
  gender?: string;
  weight_kg?: number | string;
  height_cm?: number | string;
  chief_complaint?: string;
  problems: string[];
  medications: string[];
  allergies: string[];
  vitals: Record<string, unknown>;
  last_updated: string;
  created_at: string;
  phi_masked: boolean;
}

interface ContextsResponse {
  contexts: ClinicalContextSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface ClinicalStats {
  total_contexts: number;
  contexts_with_demographics: number;
  contexts_with_chief_complaint: number;
  contexts_with_problems: number;
  contexts_with_medications: number;
  contexts_with_allergies: number;
  contexts_with_vitals: number;
  active_today: number;
  active_this_week: number;
}

export function ClinicalContextsPage() {
  const [contexts, setContexts] = useState<ClinicalContextSummary[]>([]);
  const [stats, setStats] = useState<ClinicalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] =
    useState<ClinicalContextDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [includePhi, setIncludePhi] = useState(false);
  const [userIdFilter, setUserIdFilter] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [phiAccessNotice, setPhiAccessNotice] = useState(false);
  const { isViewer } = useAuth();

  useEffect(() => {
    loadContexts();
    loadStats();
  }, [page, userIdFilter]);

  useEffect(() => {
    if (selectedId) {
      loadContextDetail(selectedId);
    }
  }, [selectedId, includePhi]);

  const loadContexts = async () => {
    setLoading(true);
    try {
      const offset = page * pageSize;
      let url = `/api/admin/clinical/contexts?offset=${offset}&limit=${pageSize}`;

      if (userIdFilter) {
        url += `&user_id=${encodeURIComponent(userIdFilter)}`;
      }

      const data = await fetchAPI<ContextsResponse>(url);
      setContexts(data.contexts);
      setTotal(data.total);
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load contexts";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await fetchAPI<ClinicalStats>("/api/admin/clinical/stats");
      setStats(data);
    } catch (err: unknown) {
      console.error("Failed to load stats:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadContextDetail = async (contextId: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchAPI<{ context: ClinicalContextDetail }>(
        `/api/admin/clinical/contexts/${contextId}?include_phi=${includePhi}`,
      );
      setSelectedDetail(data.context);
      // Show PHI access notice when PHI is revealed
      if (includePhi && !data.context.phi_masked) {
        setPhiAccessNotice(true);
        setTimeout(() => setPhiAccessNotice(false), 5000);
      }
    } catch (err: unknown) {
      console.error("Failed to load context detail:", err);
      setSelectedDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeleteContext = async () => {
    if (!selectedId) return;
    setDeleteLoading(true);
    try {
      await fetchAPI(`/api/admin/clinical/contexts/${selectedId}`, {
        method: "DELETE",
      });
      // Clear selection and refresh list
      setSelectedId(null);
      setSelectedDetail(null);
      setDeleteDialogOpen(false);
      loadContexts();
      loadStats();
    } catch (err: unknown) {
      console.error("Failed to delete context:", err);
      // Keep dialog open to show error
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const renderTableRows = () => {
    if (loading) {
      return Array.from({ length: 5 }).map((_, idx) => (
        <tr
          key={idx}
          className="divide-x divide-slate-900 bg-slate-900/30 animate-pulse"
        >
          {Array.from({ length: 8 }).map((__, cellIdx) => (
            <td key={cellIdx} className="px-4 py-3">
              <div className="h-3 w-full max-w-[100px] bg-slate-800 rounded" />
            </td>
          ))}
        </tr>
      ));
    }

    return contexts.map((ctx) => (
      <tr
        key={ctx.id}
        className={`hover:bg-slate-800/50 cursor-pointer ${selectedId === ctx.id ? "bg-slate-900/60" : ""}`}
        onClick={() => setSelectedId(ctx.id)}
      >
        <td className="px-4 py-3 text-sm text-slate-300 truncate max-w-[150px]">
          {ctx.user_email || ctx.user_id.slice(0, 8)}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {ctx.has_demographics ? (
            <span className="text-green-400">Yes</span>
          ) : (
            <span className="text-slate-600">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {ctx.has_chief_complaint ? (
            <span className="text-green-400">Yes</span>
          ) : (
            <span className="text-slate-600">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {ctx.has_problems ? (
            <span className="text-green-400">Yes</span>
          ) : (
            <span className="text-slate-600">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {ctx.has_medications ? (
            <span className="text-green-400">Yes</span>
          ) : (
            <span className="text-slate-600">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {ctx.has_allergies ? (
            <span className="text-amber-400">Yes</span>
          ) : (
            <span className="text-slate-600">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {ctx.has_vitals ? (
            <span className="text-green-400">Yes</span>
          ) : (
            <span className="text-slate-600">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-slate-400">
          {formatDate(ctx.last_updated)}
        </td>
      </tr>
    ));
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            Clinical Contexts
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            View and manage clinical context data (HIPAA compliant)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadContexts();
              loadStats();
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              Total Contexts
            </div>
            <div className="text-2xl font-bold text-slate-200 mt-1">
              {stats.total_contexts}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              Active Today
            </div>
            <div className="text-2xl font-bold text-green-400 mt-1">
              {stats.active_today}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              With Demographics
            </div>
            <div className="text-2xl font-bold text-blue-400 mt-1">
              {stats.contexts_with_demographics}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              With Medications
            </div>
            <div className="text-2xl font-bold text-purple-400 mt-1">
              {stats.contexts_with_medications}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              With Allergies
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {stats.contexts_with_allergies}
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <div className="w-64">
          <input
            type="text"
            placeholder="Filter by user ID..."
            value={userIdFilter}
            onChange={(e) => {
              setUserIdFilter(e.target.value);
              setPage(0);
            }}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={loadContexts}
            className="px-3 py-1 text-xs bg-red-900/50 border border-red-800 rounded-md text-red-100 hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Demo
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Chief
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Problems
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Meds
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Allergies
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Vitals
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {renderTableRows()}
          </tbody>
        </table>

        {!loading && contexts.length === 0 && !error && (
          <div className="p-8 text-center text-slate-400">
            No clinical contexts found.
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <div className="text-sm text-slate-400">
              Showing {page * pageSize + 1} to{" "}
              {Math.min((page + 1) * pageSize, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
              >
                Previous
              </button>
              <span className="text-sm text-slate-400">
                Page {page + 1} of {Math.ceil(total / pageSize)}
              </span>
              <button
                onClick={() =>
                  setPage((p) =>
                    Math.min(Math.ceil(total / pageSize) - 1, p + 1),
                  )
                }
                disabled={(page + 1) * pageSize >= total}
                className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              Context Details
            </h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={includePhi}
                  onChange={(e) => setIncludePhi(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-slate-600 bg-slate-800 rounded focus:ring-blue-500"
                />
                Show PHI (Logged)
              </label>
              {!isViewer && (
                <button
                  onClick={() => setDeleteDialogOpen(true)}
                  className="px-3 py-1 text-sm bg-red-900/50 border border-red-800 rounded-md text-red-100 hover:bg-red-900"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedId(null);
                  setSelectedDetail(null);
                }}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
          </div>

          {detailLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-48 bg-slate-800 rounded" />
              <div className="h-4 w-64 bg-slate-800 rounded" />
              <div className="h-4 w-32 bg-slate-800 rounded" />
            </div>
          ) : selectedDetail ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Demographics */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">
                  Demographics
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Age:</span>
                    <span className="ml-2 text-slate-300">
                      {selectedDetail.age || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Gender:</span>
                    <span className="ml-2 text-slate-300">
                      {selectedDetail.gender || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Weight:</span>
                    <span className="ml-2 text-slate-300">
                      {selectedDetail.weight_kg
                        ? `${selectedDetail.weight_kg} kg`
                        : "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Height:</span>
                    <span className="ml-2 text-slate-300">
                      {selectedDetail.height_cm
                        ? `${selectedDetail.height_cm} cm`
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chief Complaint */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">
                  Chief Complaint
                </h3>
                <p className="text-sm text-slate-300">
                  {selectedDetail.chief_complaint || "Not specified"}
                </p>
              </div>

              {/* Problems */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">
                  Problems ({selectedDetail.problems.length})
                </h3>
                {selectedDetail.problems.length > 0 ? (
                  <ul className="text-sm text-slate-300 space-y-1">
                    {selectedDetail.problems.map((p, i) => (
                      <li key={i} className="pl-2 border-l-2 border-slate-700">
                        {p}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">None</p>
                )}
              </div>

              {/* Medications */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">
                  Medications ({selectedDetail.medications.length})
                </h3>
                {selectedDetail.medications.length > 0 ? (
                  <ul className="text-sm text-slate-300 space-y-1">
                    {selectedDetail.medications.map((m, i) => (
                      <li key={i} className="pl-2 border-l-2 border-purple-800">
                        {m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">None</p>
                )}
              </div>

              {/* Allergies */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">
                  Allergies ({selectedDetail.allergies.length})
                </h3>
                {selectedDetail.allergies.length > 0 ? (
                  <ul className="text-sm text-slate-300 space-y-1">
                    {selectedDetail.allergies.map((a, i) => (
                      <li key={i} className="pl-2 border-l-2 border-amber-700">
                        {a}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">None</p>
                )}
              </div>

              {/* Vitals */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">
                  Vitals
                </h3>
                {Object.keys(selectedDetail.vitals).length > 0 ? (
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    {Object.entries(selectedDetail.vitals).map(
                      ([key, value]) => (
                        <div key={key}>
                          <span className="text-slate-500 capitalize">
                            {key.replace(/_/g, " ")}:
                          </span>
                          <span className="ml-2 text-slate-300">
                            {String(value)}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">None recorded</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Unable to load context details.
            </p>
          )}

          {selectedDetail && selectedDetail.phi_masked && (
            <div className="p-3 bg-amber-950/30 border border-amber-900 rounded-md text-amber-300 text-xs">
              PHI data is currently masked. Check "Show PHI" to view actual
              values (access will be logged).
            </div>
          )}
        </div>
      )}

      {/* PHI Access Notice Toast */}
      {phiAccessNotice && (
        <div className="fixed bottom-4 right-4 z-50 p-4 bg-blue-900/90 border border-blue-700 rounded-lg shadow-lg text-blue-100 text-sm flex items-center gap-3 animate-in slide-in-from-right">
          <span className="text-lg">🔓</span>
          <div>
            <div className="font-medium">PHI Access Logged</div>
            <div className="text-xs text-blue-300">
              Your access to unmasked PHI has been recorded for HIPAA
              compliance.
            </div>
          </div>
          <button
            onClick={() => setPhiAccessNotice(false)}
            className="ml-2 text-blue-300 hover:text-blue-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteContext}
        title="Delete Clinical Context"
        message={
          <div>
            <p>Are you sure you want to delete this clinical context?</p>
            <p className="mt-2 text-xs text-slate-500">
              This action cannot be undone. The deletion will be logged for
              audit purposes.
            </p>
          </div>
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteLoading}
      />
    </div>
  );
}
