/**
 * Organizations Page
 * Multi-tenancy management - organizations, members, API keys, and audit logs
 */

import { useEffect, useState } from "react";
import {
  PageContainer,
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  StatCard,
  DataPanel,
  TabGroup,
  ConfirmDialog,
  StatusBadge,
  Tab,
} from "../components/shared";
import {
  useOrganizations,
  Organization,
  OrganizationMember,
  OrganizationInvitation,
  OrganizationAPIKey,
  OrganizationAuditLog,
  CreateOrganizationRequest,
  InviteMemberRequest,
  CreateAPIKeyRequest,
} from "../hooks/useOrganizations";

type OrgTab = "list" | "members" | "invitations" | "apiKeys" | "audit";

const tabs: Tab[] = [
  { id: "list", label: "Organizations" },
  { id: "members", label: "Members" },
  { id: "invitations", label: "Invitations" },
  { id: "apiKeys", label: "API Keys" },
  { id: "audit", label: "Audit Log" },
];

export function OrganizationsPage() {
  const [activeTab, setActiveTab] = useState<OrgTab>("list");
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showAPIKeyDialog, setShowAPIKeyDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [newOrgData, setNewOrgData] = useState<CreateOrganizationRequest>({
    name: "",
    slug: "",
    description: "",
    plan: "starter",
  });
  const [inviteData, setInviteData] = useState<InviteMemberRequest>({
    email: "",
    role: "member",
  });
  const [apiKeyData, setApiKeyData] = useState<CreateAPIKeyRequest>({
    name: "",
    rate_limit: 1000,
  });
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  const {
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
    updateOrganization: _updateOrganization,
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
  } = useOrganizations();

  // Load related data when organization is selected
  useEffect(() => {
    if (currentOrganization) {
      loadMembers(currentOrganization.id);
      loadInvitations(currentOrganization.id);
      loadAPIKeys(currentOrganization.id);
      loadAuditLogs(currentOrganization.id);
    }
  }, [currentOrganization, loadMembers, loadInvitations, loadAPIKeys, loadAuditLogs]);

  const handleCreateOrganization = async () => {
    const result = await createOrganization(newOrgData);
    if (result) {
      setShowCreateOrgDialog(false);
      setNewOrgData({ name: "", slug: "", description: "", plan: "starter" });
    }
  };

  const handleInviteMember = async () => {
    if (!currentOrganization) return;
    const success = await inviteMember(currentOrganization.id, inviteData);
    if (success) {
      setShowInviteDialog(false);
      setInviteData({ email: "", role: "member" });
    }
  };

  const handleCreateAPIKey = async () => {
    if (!currentOrganization) return;
    const result = await createAPIKey(currentOrganization.id, apiKeyData);
    if (result) {
      setNewApiKey(result.key);
      setApiKeyData({ name: "", rate_limit: 1000 });
    }
  };

  const handleDeleteOrganization = async (orgId: string) => {
    await deleteOrganization(orgId);
    setShowDeleteConfirm(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPlanBadgeStatus = (plan: string): "success" | "warning" | "pending" | "inactive" => {
    switch (plan) {
      case "enterprise": return "success";
      case "professional": return "pending";
      case "starter": return "warning";
      default: return "inactive";
    }
  };

  const getStatusBadgeStatus = (status: string): "active" | "warning" | "error" | "inactive" => {
    switch (status) {
      case "active": return "active";
      case "trial": return "warning";
      case "suspended": return "error";
      case "cancelled": return "error";
      default: return "inactive";
    }
  };

  if (loading && organizations.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Organizations" description="Manage multi-tenant organizations" />
        <LoadingState />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Organizations" description="Manage multi-tenant organizations" />
        <ErrorState message={error} onRetry={loadOrganizations} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Organizations"
        description="Manage multi-tenant organizations, members, and API keys"
        actions={
          <button
            onClick={() => setShowCreateOrgDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Organization
          </button>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Organizations"
          value={organizations.length}
          icon="🏢"
        />
        <StatCard
          title="Active"
          value={organizations.filter((o) => o.status === "active").length}
          icon="✅"
          color="green"
        />
        <StatCard
          title="Trial"
          value={organizations.filter((o) => o.status === "trial").length}
          icon="⏰"
          color="yellow"
        />
        <StatCard
          title="Total Users"
          value={organizations.reduce((sum, o) => sum + o.current_users, 0)}
          icon="👥"
        />
      </div>

      {/* Organization Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Select Organization
        </label>
        <select
          value={currentOrganization?.id || ""}
          onChange={(e) => e.target.value && selectOrganization(e.target.value)}
          className="w-full max-w-md px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select an organization...</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name} ({org.slug}) - {org.plan}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as OrgTab)}
      />

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "list" && (
          <OrganizationsList
            organizations={organizations}
            onSelect={selectOrganization}
            onDelete={(id) => setShowDeleteConfirm(id)}
            getPlanBadgeStatus={getPlanBadgeStatus}
            getStatusBadgeStatus={getStatusBadgeStatus}
            formatDate={formatDate}
          />
        )}

        {activeTab === "members" && currentOrganization && (
          <MembersList
            members={members}
            loading={membersLoading}
            onInvite={() => setShowInviteDialog(true)}
            onUpdateRole={updateMemberRole}
            onRemove={removeMember}
            orgId={currentOrganization.id}
            formatDate={formatDate}
          />
        )}

        {activeTab === "invitations" && currentOrganization && (
          <InvitationsList
            invitations={invitations}
            loading={invitationsLoading}
            onCancel={cancelInvitation}
            onResend={resendInvitation}
            orgId={currentOrganization.id}
            formatDate={formatDate}
          />
        )}

        {activeTab === "apiKeys" && currentOrganization && (
          <APIKeysList
            apiKeys={apiKeys}
            loading={apiKeysLoading}
            onCreate={() => setShowAPIKeyDialog(true)}
            onRevoke={revokeAPIKey}
            orgId={currentOrganization.id}
            formatDate={formatDate}
          />
        )}

        {activeTab === "audit" && currentOrganization && (
          <AuditLogsList
            logs={auditLogs}
            loading={auditLogsLoading}
            formatDate={formatDate}
          />
        )}

        {(activeTab !== "list" && !currentOrganization) && (
          <EmptyState
            title="No Organization Selected"
            message="Please select an organization from the dropdown above to view details."
          />
        )}
      </div>

      {/* Create Organization Dialog */}
      {showCreateOrgDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Create Organization</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={newOrgData.name}
                  onChange={(e) => setNewOrgData({ ...newOrgData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Organization name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Slug</label>
                <input
                  type="text"
                  value={newOrgData.slug}
                  onChange={(e) => setNewOrgData({ ...newOrgData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="organization-slug"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={newOrgData.description || ""}
                  onChange={(e) => setNewOrgData({ ...newOrgData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Plan</label>
                <select
                  value={newOrgData.plan}
                  onChange={(e) => setNewOrgData({ ...newOrgData, plan: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateOrgDialog(false)}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrganization}
                disabled={!newOrgData.name || !newOrgData.slug}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Dialog */}
      {showInviteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Invite Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={inviteData.role}
                  onChange={(e) => setInviteData({ ...inviteData, role: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInviteDialog(false)}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleInviteMember}
                disabled={!inviteData.email}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create API Key Dialog */}
      {showAPIKeyDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Create API Key</h3>
            {newApiKey ? (
              <div className="space-y-4">
                <p className="text-green-400 text-sm">API key created successfully!</p>
                <div className="bg-slate-900 p-3 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Copy this key - it won't be shown again:</p>
                  <code className="text-sm text-white break-all">{newApiKey}</code>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newApiKey);
                    setNewApiKey(null);
                    setShowAPIKeyDialog(false);
                  }}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Copy & Close
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Key Name</label>
                    <input
                      type="text"
                      value={apiKeyData.name}
                      onChange={(e) => setApiKeyData({ ...apiKeyData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      placeholder="Production API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Rate Limit (requests/hour)</label>
                    <input
                      type="number"
                      value={apiKeyData.rate_limit}
                      onChange={(e) => setApiKeyData({ ...apiKeyData, rate_limit: parseInt(e.target.value) || 1000 })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAPIKeyDialog(false)}
                    className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAPIKey}
                    disabled={!apiKeyData.name}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Create Key
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!showDeleteConfirm}
        title="Delete Organization"
        message="Are you sure you want to delete this organization? This action cannot be undone and will remove all members, API keys, and associated data."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => showDeleteConfirm && handleDeleteOrganization(showDeleteConfirm)}
        onClose={() => setShowDeleteConfirm(null)}
      />
    </PageContainer>
  );
}

// Sub-components

interface OrganizationsListProps {
  organizations: Organization[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  getPlanBadgeStatus: (plan: string) => "success" | "warning" | "pending" | "inactive" | "active";
  getStatusBadgeStatus: (status: string) => "active" | "warning" | "error" | "inactive";
  formatDate: (date: string) => string;
}

function OrganizationsList({
  organizations,
  onSelect,
  onDelete,
  getPlanBadgeStatus,
  getStatusBadgeStatus,
  formatDate,
}: OrganizationsListProps) {
  if (organizations.length === 0) {
    return (
      <EmptyState
        title="No Organizations"
        message="Create your first organization to get started with multi-tenancy."
      />
    );
  }

  return (
    <DataPanel title="All Organizations" subtitle={`${organizations.length} organizations`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
              <th className="pb-3 font-medium">Organization</th>
              <th className="pb-3 font-medium">Plan</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Users</th>
              <th className="pb-3 font-medium">Storage</th>
              <th className="pb-3 font-medium">Created</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr
                key={org.id}
                className="border-b border-slate-700/50 hover:bg-slate-800/50 cursor-pointer"
                onClick={() => onSelect(org.id)}
              >
                <td className="py-3">
                  <div>
                    <p className="text-white font-medium">{org.name}</p>
                    <p className="text-sm text-slate-400">{org.slug}</p>
                  </div>
                </td>
                <td className="py-3">
                  <StatusBadge status={getPlanBadgeStatus(org.plan)} label={org.plan} />
                </td>
                <td className="py-3">
                  <StatusBadge status={getStatusBadgeStatus(org.status)} label={org.status} />
                </td>
                <td className="py-3 text-slate-300">
                  {org.current_users} / {org.max_users}
                </td>
                <td className="py-3 text-slate-300">
                  {Math.round(org.used_storage_mb)} / {org.max_storage_mb} MB
                </td>
                <td className="py-3 text-slate-400 text-sm">
                  {formatDate(org.created_at)}
                </td>
                <td className="py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(org.id);
                    }}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataPanel>
  );
}

interface MembersListProps {
  members: OrganizationMember[];
  loading: boolean;
  onInvite: () => void;
  onUpdateRole: (orgId: string, userId: string, role: string) => Promise<boolean>;
  onRemove: (orgId: string, userId: string) => Promise<boolean>;
  orgId: string;
  formatDate: (date: string) => string;
}

function MembersList({ members, loading, onInvite, onUpdateRole, onRemove, orgId, formatDate }: MembersListProps) {
  if (loading) return <LoadingState />;

  return (
    <DataPanel
      title="Members"
      subtitle={`${members.length} members`}
      headerAction={
        <button
          onClick={onInvite}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Invite Member
        </button>
      }
    >
      {members.length === 0 ? (
        <EmptyState title="No Members" message="Invite members to this organization." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                <th className="pb-3 font-medium">Member</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Joined</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-slate-700/50">
                  <td className="py-3">
                    <div>
                      <p className="text-white">{member.display_name || "Unknown"}</p>
                      <p className="text-sm text-slate-400">{member.email}</p>
                    </div>
                  </td>
                  <td className="py-3">
                    <select
                      value={member.role}
                      onChange={(e) => onUpdateRole(orgId, member.user_id, e.target.value)}
                      className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                      disabled={member.role === "owner"}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="owner" disabled>Owner</option>
                    </select>
                  </td>
                  <td className="py-3">
                    <StatusBadge
                      status={member.status === "active" ? "success" : "warning"}
                      label={member.status}
                    />
                  </td>
                  <td className="py-3 text-slate-400 text-sm">
                    {member.joined_at ? formatDate(member.joined_at) : "-"}
                  </td>
                  <td className="py-3">
                    {member.role !== "owner" && (
                      <button
                        onClick={() => onRemove(orgId, member.user_id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  );
}

interface InvitationsListProps {
  invitations: OrganizationInvitation[];
  loading: boolean;
  onCancel: (orgId: string, invitationId: string) => Promise<boolean>;
  onResend: (orgId: string, invitationId: string) => Promise<boolean>;
  orgId: string;
  formatDate: (date: string) => string;
}

function InvitationsList({ invitations, loading, onCancel, onResend, orgId, formatDate }: InvitationsListProps) {
  if (loading) return <LoadingState />;

  const pendingInvitations = invitations.filter((inv) => !inv.accepted_at);

  return (
    <DataPanel title="Pending Invitations" subtitle={`${pendingInvitations.length} pending`}>
      {pendingInvitations.length === 0 ? (
        <EmptyState title="No Pending Invitations" message="All invitations have been accepted." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Expires</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingInvitations.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white">{inv.email}</td>
                  <td className="py-3 text-slate-300 capitalize">{inv.role}</td>
                  <td className="py-3">
                    <StatusBadge
                      status={inv.is_expired ? "error" : "warning"}
                      label={inv.is_expired ? "Expired" : "Pending"}
                    />
                  </td>
                  <td className="py-3 text-slate-400 text-sm">{formatDate(inv.expires_at)}</td>
                  <td className="py-3 flex gap-2">
                    <button
                      onClick={() => onResend(orgId, inv.id)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Resend
                    </button>
                    <button
                      onClick={() => onCancel(orgId, inv.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  );
}

interface APIKeysListProps {
  apiKeys: OrganizationAPIKey[];
  loading: boolean;
  onCreate: () => void;
  onRevoke: (orgId: string, keyId: string) => Promise<boolean>;
  orgId: string;
  formatDate: (date: string) => string;
}

function APIKeysList({ apiKeys, loading, onCreate, onRevoke, orgId, formatDate }: APIKeysListProps) {
  if (loading) return <LoadingState />;

  const activeKeys = apiKeys.filter((key) => !key.revoked_at);

  return (
    <DataPanel
      title="API Keys"
      subtitle={`${activeKeys.length} active keys`}
      headerAction={
        <button
          onClick={onCreate}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Create Key
        </button>
      }
    >
      {activeKeys.length === 0 ? (
        <EmptyState title="No API Keys" message="Create an API key to enable programmatic access." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Key Prefix</th>
                <th className="pb-3 font-medium">Rate Limit</th>
                <th className="pb-3 font-medium">Last Used</th>
                <th className="pb-3 font-medium">Created</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeKeys.map((key) => (
                <tr key={key.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white">{key.name}</td>
                  <td className="py-3">
                    <code className="text-sm text-slate-300 bg-slate-700 px-2 py-0.5 rounded">
                      {key.key_prefix}...
                    </code>
                  </td>
                  <td className="py-3 text-slate-300">
                    {key.rate_limit ? `${key.rate_limit}/hr` : "Unlimited"}
                  </td>
                  <td className="py-3 text-slate-400 text-sm">
                    {key.last_used_at ? formatDate(key.last_used_at) : "Never"}
                  </td>
                  <td className="py-3 text-slate-400 text-sm">{formatDate(key.created_at)}</td>
                  <td className="py-3">
                    <button
                      onClick={() => onRevoke(orgId, key.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  );
}

interface AuditLogsListProps {
  logs: OrganizationAuditLog[];
  loading: boolean;
  formatDate: (date: string) => string;
}

function AuditLogsList({ logs, loading, formatDate }: AuditLogsListProps) {
  if (loading) return <LoadingState />;

  return (
    <DataPanel title="Audit Log" subtitle={`${logs.length} entries`}>
      {logs.length === 0 ? (
        <EmptyState title="No Audit Logs" message="Activity will appear here." />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-4 p-3 bg-slate-800/50 rounded-lg"
            >
              <div className="flex-1">
                <p className="text-white">
                  <span className="font-medium">{log.action}</span>
                  {log.resource_type && (
                    <span className="text-slate-400"> on {log.resource_type}</span>
                  )}
                </p>
                {log.details && (
                  <pre className="text-xs text-slate-400 mt-1 overflow-x-auto">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">{formatDate(log.created_at)}</p>
                {log.ip_address && (
                  <p className="text-xs text-slate-500">{log.ip_address}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
