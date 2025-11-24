/**
 * Export API Client
 * Handles conversation export to PDF and Markdown formats
 */

export interface ExportApiClient {
  exportAsMarkdown(conversationId: string): Promise<Blob>;
  exportAsPdf(conversationId: string): Promise<Blob>;
}

/**
 * Create export API client with the given base URL and auth token getter
 */
export function createExportApi(
  baseUrl: string,
  getAuthToken: () => string | null,
): ExportApiClient {
  const apiUrl = `${baseUrl}/api/export`;

  return {
    async exportAsMarkdown(conversationId: string): Promise<Blob> {
      const token = getAuthToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `${apiUrl}/conversations/${conversationId}/markdown`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to export as markdown: ${response.status} ${response.statusText}`,
        );
      }

      return response.blob();
    },

    async exportAsPdf(conversationId: string): Promise<Blob> {
      const token = getAuthToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `${apiUrl}/conversations/${conversationId}/pdf`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to export as PDF: ${response.status} ${response.statusText}`,
        );
      }

      return response.blob();
    },
  };
}

/**
 * Trigger browser download of a blob with the given filename
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
