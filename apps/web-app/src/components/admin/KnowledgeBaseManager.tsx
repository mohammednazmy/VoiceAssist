/**
 * Knowledge Base Manager
 * Upload, manage, and index documents for RAG
 */

import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "@voiceassist/ui";

interface Document {
  id: string;
  title: string;
  filename: string;
  fileType: string;
  size: number;
  uploadedAt: string;
  status: "indexed" | "processing" | "failed";
  chunks?: number;
}

export function KnowledgeBaseManager() {
  const { apiClient: _apiClient } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      // TODO: Replace with actual API call when backend is ready
      // const docs = await apiClient.get('/admin/documents');

      // Mock data for now
      setDocuments([
        {
          id: "1",
          title: "Harrison's Principles of Internal Medicine",
          filename: "harrisons-21st-edition.pdf",
          fileType: "application/pdf",
          size: 52428800, // 50 MB
          uploadedAt: new Date().toISOString(),
          status: "indexed",
          chunks: 2500,
        },
        {
          id: "2",
          title: "Clinical Practice Guidelines - Diabetes",
          filename: "diabetes-guidelines-2024.pdf",
          fileType: "application/pdf",
          size: 5242880, // 5 MB
          uploadedAt: new Date(Date.now() - 86400000).toISOString(),
          status: "indexed",
          chunks: 150,
        },
        {
          id: "3",
          title: "Cardiology Clinical Updates",
          filename: "cardiology-updates.pdf",
          fileType: "application/pdf",
          size: 10485760, // 10 MB
          uploadedAt: new Date(Date.now() - 172800000).toISOString(),
          status: "processing",
          chunks: 0,
        },
      ]);

      setIsLoading(false);
    } catch (error) {
      console.error("Failed to load documents:", error);
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      // TODO: Implement actual file upload when backend is ready
      // for (const file of files) {
      //   const formData = new FormData();
      //   formData.append('file', file);
      //   await apiClient.post('/admin/documents/upload', formData);
      // }

      // Simulate upload
      await new Promise((resolve) => setTimeout(resolve, 2000));
      alert("File upload will be available when backend is ready");

      await loadDocuments();
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      // TODO: Implement actual delete when backend is ready
      // await apiClient.delete(`/admin/documents/${id}`);

      setDocuments((docs) => docs.filter((d) => d.id !== id));
      alert("Delete functionality will be available when backend is ready");
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Delete failed. Please try again.");
    }
  };

  const handleReindex = async (_id: string) => {
    try {
      // TODO: Implement actual reindex when backend is ready
      // await apiClient.post(`/admin/documents/${id}/reindex`);

      alert("Reindex functionality will be available when backend is ready");
    } catch (error) {
      console.error("Reindex failed:", error);
      alert("Reindex failed. Please try again.");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  const getStatusBadge = (status: Document["status"]) => {
    switch (status) {
      case "indexed":
        return (
          <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
            Indexed
          </span>
        );
      case "processing":
        return (
          <span className="px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full">
            Processing...
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
            Failed
          </span>
        );
    }
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading knowledge base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Knowledge Base
          </h1>
          <p className="text-sm text-neutral-600">
            Manage medical documents for RAG system
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".pdf,.txt,.md,.docx"
            multiple
            onChange={handleFileUpload}
            disabled={isUploading}
          />
          <label htmlFor="file-upload">
            <Button as="span" disabled={isUploading}>
              {isUploading ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4 mr-2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  Upload Documents
                </>
              )}
            </Button>
          </label>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-neutral-600">Total Documents</p>
          <p className="text-2xl font-bold text-neutral-900">
            {documents.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-neutral-600">Indexed Chunks</p>
          <p className="text-2xl font-bold text-neutral-900">
            {documents
              .reduce((sum, doc) => sum + (doc.chunks || 0), 0)
              .toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-neutral-600">Total Storage</p>
          <p className="text-2xl font-bold text-neutral-900">
            {formatFileSize(documents.reduce((sum, doc) => sum + doc.size, 0))}
          </p>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Chunks
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Uploaded
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-neutral-500"
                  >
                    {searchQuery
                      ? "No documents found"
                      : "No documents uploaded yet"}
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-neutral-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-8 h-8 text-red-500 mr-3"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                          />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {doc.title}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {doc.filename}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(doc.status)}</td>
                    <td className="px-6 py-4 text-sm text-neutral-900">
                      {formatFileSize(doc.size)}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-900">
                      {doc.chunks?.toLocaleString() || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleReindex(doc.id)}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Reindex
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
