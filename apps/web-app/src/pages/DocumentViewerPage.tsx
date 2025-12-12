import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type {
  KBDocumentSummary,
  UserDocument,
} from "@voiceassist/api-client";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@voiceassist/ui";

type ViewerDocument = {
  id: string;
  title: string;
  category?: string;
  sourceType?: string;
  indexingStatus?: string;
  isPublic?: boolean;
};

export function DocumentViewerPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { apiClient } = useAuth();

  const [doc, setDoc] = useState<ViewerDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setError("Missing document id");
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Prefer the user-facing KB document API.
        let kbDoc: KBDocumentSummary | null = null;
        try {
          kbDoc = await apiClient.getKBDocument(documentId);
        } catch (err: any) {
          // Swallow 404s and fall back to user document API below.
          if (err?.response?.status !== 404) {
            console.warn("[DocumentViewerPage] getKBDocument failed", err);
          }
        }

        if (!isMounted) return;

        if (kbDoc) {
          setDoc({
            id: kbDoc.document_id,
            title: kbDoc.title,
            category: kbDoc.category,
            sourceType: kbDoc.source_type,
            indexingStatus: kbDoc.indexing_status,
            isPublic: kbDoc.is_public,
          });
          setIsLoading(false);
          return;
        }

        // Fallback: legacy user document endpoint (e.g. when opened from
        // DocumentsPage where only /api/documents is available).
        try {
          const userDoc: UserDocument = await apiClient.getUserDocument(
            documentId,
          );
          if (!isMounted) return;
          setDoc({
            id: userDoc.document_id,
            title: userDoc.title,
            category: userDoc.source_type?.replace(/^user_/, ""),
            sourceType: userDoc.source_type,
            indexingStatus: userDoc.indexing_status,
            isPublic: userDoc.is_public,
          });
          setIsLoading(false);
        } catch (err) {
          console.error(
            "[DocumentViewerPage] Unable to load document via KB or user APIs",
            err,
          );
          if (!isMounted) return;
          setError("Document could not be loaded.");
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[DocumentViewerPage] Unexpected error", err);
        if (!isMounted) return;
        setError("Document could not be loaded.");
        setIsLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [apiClient, documentId]);

  const handleBack = () => {
    // Prefer navigating back to the documents list when possible.
    navigate("/documents");
  };

  return (
    <div className="flex flex-col h-full w-full px-4 py-4 md:px-8 md:py-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            ← Back to documents
          </Button>
          <h1 className="text-base md:text-lg font-semibold text-slate-100">
            Document Viewer
          </h1>
        </div>
        <Link
          to="/documents"
          className="text-xs text-emerald-400 hover:text-emerald-300 underline"
        >
          Open Documents tab
        </Link>
      </div>

      <Card className="flex-1 overflow-hidden bg-slate-950/60 border-slate-800">
        <CardHeader className="border-b border-slate-800 pb-3">
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="truncate">
              {isLoading ? "Loading document..." : doc?.title ?? "Unknown document"}
            </span>
            {doc?.category && (
              <span className="text-[11px] rounded-full bg-slate-800 px-2 py-0.5 text-slate-200">
                {doc.category}
              </span>
            )}
          </CardTitle>
          {doc?.sourceType && (
            <p className="mt-1 text-xs text-slate-500">
              Source type: <span className="font-mono">{doc.sourceType}</span>
            </p>
          )}
          {doc?.indexingStatus && (
            <p className="text-xs text-slate-500">
              Indexing status:{" "}
              <span className="font-semibold">{doc.indexingStatus}</span>
            </p>
          )}
        </CardHeader>
        <CardContent className="h-full overflow-y-auto pt-4 text-sm text-slate-200">
          {isLoading && (
            <p className="text-slate-400">Fetching document metadata…</p>
          )}
          {error && (
            <p className="text-red-400 text-sm">
              {error} Please try again from the{" "}
              <Link to="/documents" className="underline">
                Documents tab
              </Link>
              .
            </p>
          )}
          {!isLoading && !error && doc && (
            <div className="space-y-3">
              <p className="text-slate-300 text-sm">
                This is a minimal document viewer focused on metadata and
                knowledge-base context. A richer reader (full text, page
                navigation, figures, and annotations) will be layered on top of
                this route in a future iteration.
              </p>
              <div className="text-xs text-slate-500">
                <div>
                  <span className="font-semibold">Document ID:</span>{" "}
                  <span className="font-mono break-all">{doc.id}</span>
                </div>
                {typeof doc.isPublic === "boolean" && (
                  <div className="mt-1">
                    <span className="font-semibold">Visibility:</span>{" "}
                    {doc.isPublic ? "Public" : "Private"}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DocumentViewerPage;

