/**
 * OAuth Callback Page
 * Handles OAuth redirect callbacks from Google and Microsoft
 */

import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();

  useEffect(() => {
    const code = searchParams.get('code');
    const provider = searchParams.get('state') as 'google' | 'microsoft';
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      navigate('/login?error=oauth_failed');
      return;
    }

    if (!code || !provider) {
      console.error('Missing OAuth parameters');
      navigate('/login?error=oauth_invalid');
      return;
    }

    // Exchange authorization code for tokens
    handleOAuthCallback(provider, code).catch((err) => {
      console.error('OAuth callback failed:', err);
      navigate('/login?error=oauth_failed');
    });
  }, [searchParams, navigate, handleOAuthCallback]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
        <p className="mt-4 text-neutral-600">Completing sign in...</p>
      </div>
    </div>
  );
}
