/**
 * Folders API Client
 * Handles folder management for organizing conversations
 */

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  color?: string;
  icon?: string;
  parent_folder_id?: string;
  created_at: string;
  children?: Folder[]; // Present in tree responses
}

export interface FolderCreate {
  name: string;
  color?: string;
  icon?: string;
  parent_folder_id?: string;
}

export interface FolderUpdate {
  name?: string;
  color?: string;
  icon?: string;
  parent_folder_id?: string;
}

export interface FolderApiClient {
  createFolder(folder: FolderCreate): Promise<Folder>;
  listFolders(parentId?: string): Promise<Folder[]>;
  getFolderTree(): Promise<Folder[]>;
  getFolder(folderId: string): Promise<Folder>;
  updateFolder(folderId: string, update: FolderUpdate): Promise<Folder>;
  deleteFolder(folderId: string): Promise<void>;
  moveFolder(folderId: string, targetFolderId: string): Promise<Folder>;
}

/**
 * Create folders API client with the given base URL and auth token getter
 */
export function createFoldersApi(
  baseUrl: string,
  getAuthToken: () => string | null,
): FolderApiClient {
  const apiUrl = `${baseUrl}/api/folders`;

  async function fetchWithAuth(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response;
  }

  return {
    async createFolder(folder: FolderCreate): Promise<Folder> {
      const response = await fetchWithAuth(apiUrl, {
        method: "POST",
        body: JSON.stringify(folder),
      });
      return response.json();
    },

    async listFolders(parentId?: string): Promise<Folder[]> {
      const url = parentId ? `${apiUrl}?parent_id=${parentId}` : apiUrl;
      const response = await fetchWithAuth(url, {
        method: "GET",
      });
      return response.json();
    },

    async getFolderTree(): Promise<Folder[]> {
      const response = await fetchWithAuth(`${apiUrl}/tree`, {
        method: "GET",
      });
      return response.json();
    },

    async getFolder(folderId: string): Promise<Folder> {
      const response = await fetchWithAuth(`${apiUrl}/${folderId}`, {
        method: "GET",
      });
      return response.json();
    },

    async updateFolder(
      folderId: string,
      update: FolderUpdate,
    ): Promise<Folder> {
      const response = await fetchWithAuth(`${apiUrl}/${folderId}`, {
        method: "PUT",
        body: JSON.stringify(update),
      });
      return response.json();
    },

    async deleteFolder(folderId: string): Promise<void> {
      await fetchWithAuth(`${apiUrl}/${folderId}`, {
        method: "DELETE",
      });
    },

    async moveFolder(
      folderId: string,
      targetFolderId: string,
    ): Promise<Folder> {
      const response = await fetchWithAuth(
        `${apiUrl}/${folderId}/move/${targetFolderId}`,
        {
          method: "POST",
        },
      );
      return response.json();
    },
  };
}
