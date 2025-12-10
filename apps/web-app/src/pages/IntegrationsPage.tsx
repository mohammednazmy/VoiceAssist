/**
 * Integrations Page - User Calendar Connections
 * Allows users to connect their calendars (Google, Microsoft, Apple, Nextcloud)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Badge,
  Spinner,
} from "@voiceassist/ui";
import { useAuth } from "../hooks/useAuth";

interface CalendarConnection {
  id: string;
  provider: string;
  account_email: string;
  calendar_name: string | null;
  is_default: boolean;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

interface CalendarProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  auth_type: "oauth" | "caldav";
  configured: boolean;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  google: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  ),
  microsoft: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.4 24H0V12.6h11.4V24z" fill="#00A4EF" />
      <path d="M24 24H12.6V12.6H24V24z" fill="#FFB900" />
      <path d="M11.4 11.4H0V0h11.4v11.4z" fill="#F25022" />
      <path d="M24 11.4H12.6V0H24v11.4z" fill="#7FBA00" />
    </svg>
  ),
  apple: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  ),
  nextcloud: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12.018 6.537c-2.5 0-4.6 1.712-5.241 4.015-.56-1.616-2.1-2.783-3.9-2.783C1.285 7.769 0 9.062 0 10.662s1.285 2.894 2.877 2.894c1.8 0 3.34-1.167 3.9-2.783.641 2.303 2.741 4.015 5.241 4.015 2.5 0 4.6-1.712 5.241-4.015.56 1.616 2.1 2.783 3.9 2.783 1.592 0 2.877-1.294 2.877-2.894s-1.285-2.893-2.877-2.893c-1.8 0-3.34 1.167-3.9 2.783-.641-2.303-2.741-4.015-5.241-4.015z"
        fill="#0082C9"
      />
    </svg>
  ),
};

export function IntegrationsPage() {
  const { apiClient } = useAuth();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [providers, setProviders] = useState<CalendarProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // CalDAV form state
  const [showCalDavForm, setShowCalDavForm] = useState(false);
  const [caldavProvider, setCaldavProvider] = useState<"apple" | "nextcloud">(
    "apple",
  );
  const [caldavUrl, setCaldavUrl] = useState("");
  const [caldavUsername, setCaldavUsername] = useState("");
  const [caldavPassword, setCaldavPassword] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both connections and providers
      const [connectionsRes, providersRes] = await Promise.all([
        apiClient.request<{ data: CalendarConnection[] }>({
          method: "GET",
          url: "/api/user/calendars/connections",
        }),
        apiClient.request<{ data: { providers: CalendarProvider[] } }>({
          method: "GET",
          url: "/api/user/calendars/providers",
        }),
      ]);

      // Handle API response format
      setConnections(
        Array.isArray(connectionsRes)
          ? connectionsRes
          : connectionsRes.data || [],
      );
      const provData = providersRes.data || providersRes;
      setProviders(
        (provData as { providers?: CalendarProvider[] }).providers || [],
      );
    } catch (err) {
      console.error("Failed to fetch calendar data:", err);
      setError("Failed to load calendar connections");
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOAuthConnect = async (provider: string) => {
    try {
      setActionLoading(provider);
      setError(null);

      const response = await apiClient.request<{ data: { url: string } }>({
        method: "GET",
        url: `/api/user/calendars/oauth/${provider}/authorize`,
      });

      // Redirect to OAuth provider
      const authData =
        (response as { data?: { url: string } }).data || response;
      window.location.href = (authData as { url: string }).url;
    } catch (err) {
      console.error(`Failed to initiate ${provider} OAuth:`, err);
      setError(`Failed to connect to ${provider}. Please try again.`);
      setActionLoading(null);
    }
  };

  const handleCalDavConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setActionLoading("caldav");
      setError(null);

      await apiClient.request({
        method: "POST",
        url: "/api/user/calendars/caldav/connect",
        data: {
          provider: caldavProvider,
          caldav_url: caldavUrl,
          username: caldavUsername,
          password: caldavPassword,
        },
      });

      setSuccessMessage(
        `Successfully connected to ${caldavProvider === "apple" ? "iCloud" : "Nextcloud"} calendar`,
      );
      setShowCalDavForm(false);
      setCaldavUrl("");
      setCaldavUsername("");
      setCaldavPassword("");
      fetchData();
    } catch (err) {
      console.error("Failed to connect CalDAV:", err);
      setError("Failed to connect calendar. Please check your credentials.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (connectionId: string, provider: string) => {
    if (
      !confirm(`Are you sure you want to disconnect this ${provider} calendar?`)
    ) {
      return;
    }

    try {
      setActionLoading(connectionId);
      setError(null);

      await apiClient.request({
        method: "DELETE",
        url: `/api/user/calendars/connections/${connectionId}`,
      });

      setSuccessMessage("Calendar disconnected successfully");
      fetchData();
    } catch (err) {
      console.error("Failed to disconnect calendar:", err);
      setError("Failed to disconnect calendar. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetDefault = async (connectionId: string) => {
    try {
      setActionLoading(connectionId);
      setError(null);

      await apiClient.request({
        method: "POST",
        url: `/api/user/calendars/connections/${connectionId}/set-default`,
      });

      setSuccessMessage("Default calendar updated");
      fetchData();
    } catch (err) {
      console.error("Failed to set default:", err);
      setError("Failed to update default calendar.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    try {
      setActionLoading(connectionId);
      setError(null);

      const response = await apiClient.request<{
        data: { success: boolean; message?: string; error?: string };
      }>({
        method: "POST",
        url: `/api/user/calendars/connections/${connectionId}/test`,
      });

      const testResult =
        (response as { data?: { success: boolean; error?: string } }).data ||
        response;
      if ((testResult as { success: boolean }).success) {
        setSuccessMessage("Connection test successful!");
      } else {
        setError(
          (testResult as { error?: string }).error || "Connection test failed",
        );
      }
    } catch (err) {
      console.error("Failed to test connection:", err);
      setError(
        "Connection test failed. The calendar may need to be reconnected.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Integrations</h1>
          <p className="mt-2 text-text-secondary">
            Connect your calendars to allow the AI assistant to check your
            schedule and create events
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="p-4 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-400">
              {successMessage}
            </p>
          </div>
        )}

        {/* Connected Calendars */}
        <Card>
          <CardHeader>
            <CardTitle>Connected Calendars</CardTitle>
            <CardDescription>
              {connections.length === 0
                ? "No calendars connected yet. Connect a calendar below to get started."
                : `You have ${connections.length} calendar${connections.length === 1 ? "" : "s"} connected`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <div className="text-center py-8 text-text-tertiary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-12 h-12 mx-auto mb-3 opacity-50"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
                <p>Connect a calendar to enable scheduling features</p>
              </div>
            ) : (
              <div className="space-y-4">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {PROVIDER_ICONS[connection.provider] || (
                          <div className="w-6 h-6 rounded bg-neutral-200 dark:bg-neutral-700" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-text-primary">
                            {connection.account_email}
                          </span>
                          {connection.is_default && (
                            <Badge variant="secondary" size="sm">
                              Default
                            </Badge>
                          )}
                          {!connection.is_active && (
                            <Badge variant="error" size="sm">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-text-tertiary">
                          {connection.provider.charAt(0).toUpperCase() +
                            connection.provider.slice(1)}
                          {connection.calendar_name &&
                            ` - ${connection.calendar_name}`}
                        </div>
                        {connection.last_sync_at && (
                          <div className="text-xs text-text-tertiary mt-1">
                            Last synced:{" "}
                            {new Date(connection.last_sync_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!connection.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetDefault(connection.id)}
                          disabled={actionLoading === connection.id}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestConnection(connection.id)}
                        disabled={actionLoading === connection.id}
                      >
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleDisconnect(connection.id, connection.provider)
                        }
                        disabled={actionLoading === connection.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                      >
                        {actionLoading === connection.id ? (
                          <Spinner size="sm" />
                        ) : (
                          "Disconnect"
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Calendar */}
        <Card>
          <CardHeader>
            <CardTitle>Add Calendar</CardTitle>
            <CardDescription>
              Connect a new calendar from one of the supported providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map((provider) => {
                const isConnected = connections.some(
                  (c) => c.provider === provider.id && c.is_active,
                );

                return (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-500 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {PROVIDER_ICONS[provider.id] || (
                          <div className="w-6 h-6 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs">
                            {provider.icon}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-text-primary">
                          {provider.name}
                        </div>
                        <div className="text-sm text-text-tertiary">
                          {provider.description}
                        </div>
                        {!provider.configured && (
                          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Not configured by admin
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      {provider.auth_type === "oauth" ? (
                        <Button
                          size="sm"
                          variant={isConnected ? "outline" : "primary"}
                          onClick={() => handleOAuthConnect(provider.id)}
                          disabled={
                            !provider.configured ||
                            actionLoading === provider.id
                          }
                          className={isConnected ? "text-xs px-2.5" : ""}
                        >
                          {actionLoading === provider.id ? (
                            <Spinner size="sm" />
                          ) : isConnected ? (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              Add
                            </span>
                          ) : (
                            "Connect"
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={isConnected ? "outline" : "secondary"}
                          onClick={() => {
                            setCaldavProvider(
                              provider.id as "apple" | "nextcloud",
                            );
                            setShowCalDavForm(true);
                          }}
                          disabled={actionLoading === "caldav"}
                          className={isConnected ? "text-xs px-2.5" : ""}
                        >
                          {isConnected ? (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              Add
                            </span>
                          ) : (
                            "Configure"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CalDAV Form */}
            {showCalDavForm && (
              <div className="mt-6 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-text-primary">
                    Connect{" "}
                    {caldavProvider === "apple" ? "iCloud" : "Nextcloud"}{" "}
                    Calendar
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCalDavForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
                <form onSubmit={handleCalDavConnect} className="space-y-4">
                  {caldavProvider === "nextcloud" && (
                    <Input
                      id="caldav-url"
                      label="Nextcloud Server URL"
                      type="url"
                      placeholder="https://cloud.example.com"
                      value={caldavUrl}
                      onChange={(e) => setCaldavUrl(e.target.value)}
                      required
                      fullWidth
                      helperText="Your Nextcloud server URL (without /remote.php/dav)"
                    />
                  )}
                  <Input
                    id="caldav-username"
                    label={caldavProvider === "apple" ? "Apple ID" : "Username"}
                    type="email"
                    placeholder={
                      caldavProvider === "apple"
                        ? "your@icloud.com"
                        : "username"
                    }
                    value={caldavUsername}
                    onChange={(e) => setCaldavUsername(e.target.value)}
                    required
                    fullWidth
                  />
                  <Input
                    id="caldav-password"
                    label={
                      caldavProvider === "apple"
                        ? "App-Specific Password"
                        : "Password"
                    }
                    type="password"
                    placeholder="••••••••••••••••"
                    value={caldavPassword}
                    onChange={(e) => setCaldavPassword(e.target.value)}
                    required
                    fullWidth
                    helperText={
                      caldavProvider === "apple"
                        ? "Create an app-specific password at appleid.apple.com"
                        : "Your Nextcloud password or app password"
                    }
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowCalDavForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={actionLoading === "caldav"}>
                      {actionLoading === "caldav" ? (
                        <Spinner size="sm" />
                      ) : (
                        "Connect Calendar"
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card>
          <CardHeader>
            <CardTitle>How Calendar Integration Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm text-text-secondary">
              <p>When you connect a calendar, the AI assistant can:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Check your availability when scheduling appointments</li>
                <li>Create new events on your behalf when you ask</li>
                <li>
                  Remind you of upcoming appointments during conversations
                </li>
                <li>Find free time slots for scheduling</li>
              </ul>
              <p className="mt-4">
                <strong>Privacy:</strong> Your calendar data is only accessed
                when you ask about scheduling. We don&apos;t store your calendar
                events - we only read them when needed for a specific request.
              </p>
              <p>
                <strong>Multiple calendars:</strong> If you have multiple
                calendars connected, the assistant will ask which one to use
                when creating events. You can set a default calendar to skip
                this step.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
