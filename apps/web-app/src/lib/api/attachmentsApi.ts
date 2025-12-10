/**
 * Attachments API Client
 * Handles file uploads, downloads, and attachment management for messages
 */

import type {
  Attachment,
  AttachmentUploadResponse,
  UploadProgress,
} from "@voiceassist/types";

export interface AttachmentApiClient {
  uploadAttachment(
    messageId: string,
    file: File,
    metadata?: Record<string, any>,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<AttachmentUploadResponse>;

  listMessageAttachments(messageId: string): Promise<Attachment[]>;

  downloadAttachment(attachmentId: string): Promise<Blob>;

  deleteAttachment(attachmentId: string): Promise<void>;
}

/**
 * Create attachments API client with the given base URL and auth token getter
 */
export function createAttachmentsApi(
  baseUrl: string,
  getAuthToken: () => string | null,
): AttachmentApiClient {
  const apiUrl = `${baseUrl}/api/attachments`;

  return {
    async uploadAttachment(
      messageId: string,
      file: File,
      metadata?: Record<string, any>,
      onProgress?: (progress: UploadProgress) => void,
    ): Promise<AttachmentUploadResponse> {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("message_id", messageId);

      if (metadata) {
        formData.append("metadata", JSON.stringify(metadata));
      }

      const token = getAuthToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable && onProgress) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress({
              fileName: file.name,
              progress,
              status: "uploading",
            });
          }
        });

        // Handle completion
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (onProgress) {
                onProgress({
                  fileName: file.name,
                  progress: 100,
                  status: "complete",
                });
              }
              resolve(response);
            } catch {
              reject(new Error("Failed to parse upload response"));
            }
          } else {
            const error = `Upload failed: ${xhr.status} ${xhr.statusText}`;
            if (onProgress) {
              onProgress({
                fileName: file.name,
                progress: 0,
                status: "error",
                error,
              });
            }
            reject(new Error(error));
          }
        });

        // Handle errors
        xhr.addEventListener("error", () => {
          const error = "Network error during upload";
          if (onProgress) {
            onProgress({
              fileName: file.name,
              progress: 0,
              status: "error",
              error,
            });
          }
          reject(new Error(error));
        });

        xhr.addEventListener("abort", () => {
          const error = "Upload cancelled";
          if (onProgress) {
            onProgress({
              fileName: file.name,
              progress: 0,
              status: "error",
              error,
            });
          }
          reject(new Error(error));
        });

        xhr.open("POST", `${apiUrl}/messages/${messageId}/attachments`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(formData);
      });
    },

    async listMessageAttachments(messageId: string): Promise<Attachment[]> {
      const token = getAuthToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `${apiUrl}/messages/${messageId}/attachments`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to list attachments: ${response.status} ${response.statusText}`,
        );
      }

      return response.json();
    },

    async downloadAttachment(attachmentId: string): Promise<Blob> {
      const token = getAuthToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`${apiUrl}/${attachmentId}/download`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to download attachment: ${response.status} ${response.statusText}`,
        );
      }

      return response.blob();
    },

    async deleteAttachment(attachmentId: string): Promise<void> {
      const token = getAuthToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`${apiUrl}/${attachmentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete attachment: ${response.status} ${response.statusText}`,
        );
      }
    },
  };
}
