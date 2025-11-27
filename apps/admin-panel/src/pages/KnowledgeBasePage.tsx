import { useState } from "react";
import { useKnowledgeDocuments, type KnowledgeDocument } from "../hooks/useKnowledgeDocuments";
import { useAuth } from "../contexts/AuthContext";

export function KnowledgeBasePage() {
  const { docs, loading, error } = useKnowledgeDocuments();
  const [uploading, setUploading] = useState(false);
  const { isViewer } = useAuth();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isViewer) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // TODO: Implement uploadDocument when backend is ready
      console.warn("Uploading file (demo):", file.name);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      alert("Document uploaded successfully! (demo)");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      alert(message);
    } finally {
      setUploading(false);
      e.target.value = ""; // Reset input
    }
  };

  const renderStatCards = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse"
            >
              <div className="h-3 w-20 bg-slate-800 rounded" />
              <div className="h-6 w-12 bg-slate-800 rounded mt-3" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Documents"
          value={docs.length}
          icon="📚"
          color="blue"
        />
        <StatCard
          label="Indexed"
          value={docs.filter((d: KnowledgeDocument) => d.indexed).length}
          icon="✓"
          color="green"
        />
        <StatCard
          label="Processing"
          value={docs.filter((d: KnowledgeDocument) => !d.indexed && !d.lastIndexedAt).length}
          icon="⏳"
          color="yellow"
        />
        <StatCard
          label="Available"
          value={docs.filter((d: KnowledgeDocument) => d.indexed).length}
          icon="✓"
          color="green"
        />
      </div>
    );
  };

  const renderDocsTable = () => {
    if (loading) {
      return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
          <div className="divide-y divide-slate-800">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-4 grid grid-cols-6 gap-4 animate-pulse">
                {Array.from({ length: 6 }).map((__, cellIdx) => (
                  <div key={cellIdx} className="h-4 bg-slate-800 rounded" />
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Chunks
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Uploaded
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {docs.map((doc: KnowledgeDocument) => (
              <tr key={doc.id} className="hover:bg-slate-800/50">
                <td className="px-4 py-3 text-sm text-slate-300 font-medium">{doc.name}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{doc.type}</td>
                <td className="px-4 py-3 text-sm">
                  <StatusBadge status={doc.indexed ? "indexed" : "pending"} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">{doc.version || "-"}</td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {doc.lastIndexedAt ? new Date(doc.lastIndexedAt).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3 text-sm text-right space-x-2">
                  <button
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                    title="View details"
                  >
                    👁️
                  </button>
                  <button
                    className="text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Reindex"
                    disabled={isViewer}
                  >
                    🔄
                  </button>
                  <button
                    className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete"
                    disabled={isViewer}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && docs.length === 0 && !error && (
          <div className="p-8 text-center text-slate-400">
            No documents found. {isViewer ? "Contact an admin to upload." : "Upload your first document to get started."}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Knowledge Base</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage medical documents, textbooks, and reference materials
          </p>
        </div>
        <label
          className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors ${
            uploading || isViewer
              ? "cursor-not-allowed opacity-70 bg-blue-950 hover:bg-blue-950 text-slate-400"
              : "cursor-pointer"
          }`}
        >
          {uploading ? "Uploading..." : "+ Upload Document"}
          <input
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileUpload}
            disabled={uploading || isViewer}
            className="hidden"
          />
        </label>
      </div>

      {isViewer && (
        <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-md text-amber-300 text-sm">
          Viewer role is read-only. Uploads and destructive actions are disabled.
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400">
          {error.message || "An error occurred"}
        </div>
      )}

      {/* Statistics */}
      {renderStatCards()}

      {/* Documents Table */}
      {renderDocsTable()}

      <div className="text-xs text-slate-500">
        Supported formats: PDF, TXT | Maximum file size: 50MB
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: "blue" | "green" | "yellow" | "red";
}) {
  const colors = {
    blue: "from-blue-900/50 to-blue-950/30 border-blue-800",
    green: "from-green-900/50 to-green-950/30 border-green-800",
    yellow: "from-yellow-900/50 to-yellow-950/30 border-yellow-800",
    red: "from-red-900/50 to-red-950/30 border-red-800",
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xl">{icon}</span>
        <span className="text-2xl font-bold text-slate-200">{value}</span>
      </div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    {
      indexed: "bg-green-900/50 text-green-400 border-green-800",
      processing: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      failed: "bg-red-900/50 text-red-400 border-red-800",
      uploaded: "bg-blue-900/50 text-blue-400 border-blue-800",
      pending: "bg-slate-800 text-slate-400 border-slate-700",
    }[status] || "bg-slate-800 text-slate-400 border-slate-700";

  return (
    <span
      className={`inline-flex px-2 py-1 text-xs font-medium rounded border ${styles}`}
    >
      {status}
    </span>
  );
}
