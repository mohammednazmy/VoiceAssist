/**
 * PageImageViewer - Display rendered page image
 *
 * Shows the rendered PDF page image with zoom controls.
 */

import { useState, useEffect, useRef } from "react";
import { getApiClient } from "../../lib/apiClient";

interface PageImageViewerProps {
  documentId: string;
  pageNumber: number;
  className?: string;
}

export function PageImageViewer({
  documentId,
  pageNumber,
  className = "",
}: PageImageViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const loadImage = async () => {
      setLoading(true);
      setError(null);

      try {
        const apiClient = getApiClient();
        const blob = await apiClient.request<Blob>({
          url: `/api/admin/kb/documents/${documentId}/page-image/${pageNumber}`,
          method: "GET",
          responseType: "blob",
        });

        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        setImageUrl(url);
      } catch (err) {
        if (cancelled) return;
        console.warn("Failed to load page image:", err);
        setError("Page image not available");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      cancelled = true;
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, pageNumber]);

  const handleZoomIn = () => setZoom((z) => Math.min(200, z + 25));
  const handleZoomOut = () => setZoom((z) => Math.max(50, z - 25));
  const handleZoomReset = () => setZoom(100);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Zoom Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <span className="text-sm text-slate-400">Page {pageNumber}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom out"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom in"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-950 flex items-start justify-center p-4"
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <div className="animate-spin h-8 w-8 border-2 border-slate-600 border-t-blue-500 rounded-full mb-3" />
            <span className="text-sm">Loading page image...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <svg className="h-12 w-12 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm">{error}</span>
            <span className="text-xs text-slate-600 mt-1">
              This document may not have rendered page images yet.
            </span>
          </div>
        )}

        {imageUrl && !loading && (
          <img
            src={imageUrl}
            alt={`Page ${pageNumber}`}
            style={{ width: `${zoom}%`, maxWidth: `${zoom * 2}%` }}
            className="shadow-lg border border-slate-700 rounded"
          />
        )}
      </div>
    </div>
  );
}
