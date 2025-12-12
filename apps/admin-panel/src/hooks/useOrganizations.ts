/**
 * useOrganizations hook
 * Manages organization CRUD operations for multi-tenancy support
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types matching the backend Organization models

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  status: "active" | "suspended" | "trial" | "cancelled";
  plan: "free" | "starter" | "professional" | "enterprise";
  max_users: number;
  current_users: number;
  max_storage_mb: number;
  used_storage_mb: number;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "invited" | "suspended";
  permissions?: Record<string, boolean>;
  invited_by?: string;
  invited_at?: string;
  joined_at?: string;
  email?: string;
  display_name?: string;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  is_expired: boolean;
  invited_by?: string;
  created_at: string;
  accepted_at?: string;
}

export interface OrganizationAPIKey {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  permissions?: Record<string, boolean>;
  rate_limit?: number;
  last_used_at?: string;
  expires_at?: string;
  created_by?: string;
  created_at: string;
  revoked_at?: string;
}

export interface OrganizationAuditLog {
  id: string;
  organization_id: string;
  user_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
  description?: string;
  plan?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: string;
}

export interface CreateAPIKeyRequest {
  name: string;
  permissions?: Record<string, boolean>;
  rate_limit?: number;
  expires_days?: number;
}

interface UseOrganizationsOptions {
  autoLoad?: boolean;
}

interface UseOrganizationsReturn {
  // Data
  organizations: Organization[];
  currentOrganization: Organization | null;
  members: OrganizationMember[];
  invitations: OrganizationInvitation[];
  apiKeys: OrganizationAPIKey[];
  auditLogs: OrganizationAuditLog[];

  // Loading states
  loading: boolean;
  membersLoading: boolean;
  invitationsLoading: boolean;
  apiKeysLoading: boolean;
  auditLogsLoading: boolean;

  // Error state
  error: string | null;

  // Organization actions
  loadOrganizations: () => Promise<void>;
  selectOrganization: (orgId: string) => Promise<void>;
  createOrganization: (data: CreateOrganizationRequest) => Promise<Organization | null>;
  updateOrganization: (orgId: string, updates: Partial<Organization>) => Promise<boolean>;
  deleteOrganization: (orgId: string) => Promise<boolean>;

  // Member actions
  loadMembers: (orgId: string) => Promise<void>;
  inviteMember: (orgId: string, data: InviteMemberRequest) => Promise<boolean>;
  updateMemberRole: (orgId: string, userId: string, role: string) => Promise<boolean>;
  removeMember: (orgId: string, userId: string) => Promise<boolean>;

  // Invitation actions
  loadInvitations: (orgId: string) => Promise<void>;
  cancelInvitation: (orgId: string, invitationId: string) => Promise<boolean>;
  resendInvitation: (orgId: string, invitationId: string) => Promise<boolean>;

  // API Key actions
  loadAPIKeys: (orgId: string) => Promise<void>;
  createAPIKey: (orgId: string, data: CreateAPIKeyRequest) => Promise<{ key: string; key_id: string } | null>;
  revokeAPIKey: (orgId: string, keyId: string) => Promise<boolean>;

  // Audit log actions
  loadAuditLogs: (orgId: string, limit?: number) => Promise<void>;
}

export function useOrganizations(
  options: UseOrganizationsOptions = {}
): UseOrganizationsReturn {
  const { autoLoad = true } = options;

  // Data state
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [apiKeys, setApiKeys] = useState<OrganizationAPIKey[]>([]);
  const [auditLogs, setAuditLogs] = useState<OrganizationAuditLog[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Load all organizations
  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAPI<{ data: Organization[] }>("/api/organizations");
      setOrganizations(response.data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load organizations";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Select and load organization details
  const selectOrganization = useCallback(async (orgId: string) => {
    try {
      const response = await fetchAPI<{ data: Organization }>(`/api/organizations/${orgId}`);
      setCurrentOrganization(response.data);
    } catch (err) {
      console.error("Failed to load organization:", err);
    }
  }, []);

  // Create organization
  const createOrganization = useCallback(
    async (data: CreateOrganizationRequest): Promise<Organization | null> => {
      try {
        const response = await fetchAPI<{ data: Organization }>("/api/organizations", {
          method: "POST",
          body: JSON.stringify(data),
        });
        await loadOrganizations();
        return response.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create organization";
        setError(message);
        return null;
      }
    },
    [loadOrganizations]
  );

  // Update organization
  const updateOrganization = useCallback(
    async (orgId: string, updates: Partial<Organization>): Promise<boolean> => {
      try {
        await fetchAPI(`/api/organizations/${orgId}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        await loadOrganizations();
        if (currentOrganization?.id === orgId) {
          await selectOrganization(orgId);
        }
        return true;
      } catch (err) {
        console.error("Failed to update organization:", err);
        return false;
      }
    },
    [loadOrganizations, currentOrganization, selectOrganization]
  );

  // Delete organization
  const deleteOrganization = useCallback(
    async (orgId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/organizations/${orgId}`, {
          method: "DELETE",
        });
        await loadOrganizations();
        if (currentOrganization?.id === orgId) {
          setCurrentOrganization(null);
        }
        return true;
      } catch (err) {
        console.error("Failed to delete organization:", err);
        return false;
      }
    },
    [loadOrganizations, currentOrganization]
  );

  // Load members
  const loadMembers = useCallback(async (orgId: string) => {
    setMembersLoading(true);
    try {
      const response = await fetchAPI<{ data: OrganizationMember[] }>(
        `/api/organizations/${orgId}/members`
      );
      setMembers(response.data);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  // Invite member
  const inviteMember = useCallback(
    async (orgId: string, data: InviteMemberRequest): Promise<boolean> => {
      try {
        await fetchAPI(`/api/organizations/${orgId}/invitations`, {
          method: "POST",
          body: JSON.stringify(data),
        });
        await loadInvitations(orgId);
        return true;
      } catch (err) {
        console.error("Failed to invite member:", err);
        return false;
      }
    },
    []
  );

  // Update member role
  const updateMemberRole = useCallback(
    async (orgId: string, userId: string, role: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/organizations/${orgId}/members/${userId}`, {
          method: "PATCH",
          body: JSON.stringify({ role }),
        });
        await loadMembers(orgId);
        return true;
      } catch (err) {
        console.error("Failed to update member role:", err);
        return false;
      }
    },
    [loadMembers]
  );

  // Remove member
  const removeMember = useCallback(
    async (orgId: string, userId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/organizations/${orgId}/members/${userId}`, {
          method: "DELETE",
        });
        await loadMembers(orgId);
        return true;
      } catch (err) {
        console.error("Failed to remove member:", err);
        return false;
      }
    },
    [loadMembers]
  );

  // Load invitations
  const loadInvitations = useCallback(async (orgId: string) => {
    setInvitationsLoading(true);
    try {
      const response = await fetchAPI<{ data: OrganizationInvitation[] }>(
        `/api/organizations/${orgId}/invitations`
      );
      setInvitations(response.data);
    } catch (err) {
      console.error("Failed to load invitations:", err);
    } finally {
      setInvitationsLoading(false);
    }
  }, []);

  // Cancel invitation
  const cancelInvitation = useCallback(
    async (orgId: string, invitationId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/organizations/${orgId}/invitations/${invitationId}`, {
          method: "DELETE",
        });
        await loadInvitations(orgId);
        return true;
      } catch (err) {
        console.error("Failed to cancel invitation:", err);
        return false;
      }
    },
    [loadInvitations]
  );

  // Resend invitation
  const resendInvitation = useCallback(
    async (orgId: string, invitationId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/organizations/${orgId}/invitations/${invitationId}/resend`, {
          method: "POST",
        });
        return true;
      } catch (err) {
        console.error("Failed to resend invitation:", err);
        return false;
      }
    },
    []
  );

  // Load API keys
  const loadAPIKeys = useCallback(async (orgId: string) => {
    setApiKeysLoading(true);
    try {
      const response = await fetchAPI<{ data: OrganizationAPIKey[] }>(
        `/api/organizations/${orgId}/api-keys`
      );
      setApiKeys(response.data);
    } catch (err) {
      console.error("Failed to load API keys:", err);
    } finally {
      setApiKeysLoading(false);
    }
  }, []);

  // Create API key
  const createAPIKey = useCallback(
    async (
      orgId: string,
      data: CreateAPIKeyRequest
    ): Promise<{ key: string; key_id: string } | null> => {
      try {
        const response = await fetchAPI<{ data: { key: string; key_id: string } }>(
          `/api/organizations/${orgId}/api-keys`,
          {
            method: "POST",
            body: JSON.stringify(data),
          }
        );
        await loadAPIKeys(orgId);
        return response.data;
      } catch (err) {
        console.error("Failed to create API key:", err);
        return null;
      }
    },
    [loadAPIKeys]
  );

  // Revoke API key
  const revokeAPIKey = useCallback(
    async (orgId: string, keyId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/organizations/${orgId}/api-keys/${keyId}`, {
          method: "DELETE",
        });
        await loadAPIKeys(orgId);
        return true;
      } catch (err) {
        console.error("Failed to revoke API key:", err);
        return false;
      }
    },
    [loadAPIKeys]
  );

  // Load audit logs
  const loadAuditLogs = useCallback(async (orgId: string, limit = 50) => {
    setAuditLogsLoading(true);
    try {
      const response = await fetchAPI<{ data: OrganizationAuditLog[] }>(
        `/api/organizations/${orgId}/audit-logs?limit=${limit}`
      );
      setAuditLogs(response.data);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setAuditLogsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (autoLoad) {
      loadOrganizations();
    }
  }, [autoLoad, loadOrganizations]);

  return {
    organizations,
    currentOrganization,
    members,
    invitations,
    apiKeys,
    auditLogs,
    loading,
    membersLoading,
    invitationsLoading,
    apiKeysLoading,
    auditLogsLoading,
    error,
    loadOrganizations,
    selectOrganization,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    loadMembers,
    inviteMember,
    updateMemberRole,
    removeMember,
    loadInvitations,
    cancelInvitation,
    resendInvitation,
    loadAPIKeys,
    createAPIKey,
    revokeAPIKey,
    loadAuditLogs,
  };
}
