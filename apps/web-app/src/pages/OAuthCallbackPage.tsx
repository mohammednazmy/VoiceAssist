/**
 * OAuth Callback Page
 * Handles OAuth redirect callbacks from Google and Microsoft
 */

import { useEffect } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { provider } = useParams<{ provider: "google" | "microsoft" }>();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      console.error("OAuth error:", error, errorDescription);
      navigate(
        `/login?error=oauth_failed&message=${encodeURIComponent(errorDescription || error)}`,
      );
      return;
    }

    if (!code) {
      console.error("Missing authorization code");
      navigate("/login?error=oauth_invalid&message=Missing+authorization+code");
      return;
    }

    if (!provider || !["google", "microsoft"].includes(provider)) {
      console.error("Invalid OAuth provider:", provider);
      navigate("/login?error=oauth_invalid&message=Invalid+provider");
      return;
    }

    // Exchange authorization code for tokens
    handleOAuthCallback(provider as "google" | "microsoft", code).catch(
      (err) => {
        console.error("OAuth callback failed:", err);
        const message =
          err instanceof Error ? err.message : "Authentication failed";
        navigate(
          `/login?error=oauth_failed&message=${encodeURIComponent(message)}`,
        );
      },
    );
  }, [searchParams, provider, navigate, handleOAuthCallback]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
        <p className="mt-4 text-neutral-600">Completing sign in...</p>
      </div>
    </div>
  );
}
