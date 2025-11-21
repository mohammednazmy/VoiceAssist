/**
 * Home Page
 * Landing page after login
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@voiceassist/ui';

export function HomePage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Welcome to VoiceAssist</h1>
        <p className="mt-2 text-neutral-600">
          Your medical AI assistant for intelligent healthcare support
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Chat</CardTitle>
            <CardDescription>
              Have a conversation with your AI assistant
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-600">
              Ask questions, get medical information, and receive intelligent assistance.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Voice Mode</CardTitle>
            <CardDescription>
              Interact using your voice
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-600">
              Use push-to-talk to ask questions and receive spoken responses.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Documents</CardTitle>
            <CardDescription>
              Upload and search medical documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-600">
              Upload PDFs and images to build your knowledge base.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
