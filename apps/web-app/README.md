# VoiceAssist Web Application

## Overview

The VoiceAssist web application provides browser-based access to the AI assistant from any device. Built with React and TypeScript, it offers both text and voice interaction modes with a modern, responsive interface.

**URL**: https://voiceassist.asimo.io

## Features

- **Text Chat Interface**: Real-time conversation with streaming responses
- **Voice Mode**: Browser-based voice input and audio responses
- **File Attachments**: Upload PDFs, documents, images for analysis
- **Citation Display**: Medical sources with links and formatted references
- **Conversation History**: Search and manage past conversations
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark Mode**: Eye-friendly theme for extended use

## Technology Stack

- **React 18+**: UI framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: High-quality component library
- **React Router**: Client-side routing
- **Zustand**: State management
- **Socket.io / WebSocket**: Real-time communication
- **React Markdown**: Render markdown responses
- **Web Audio API**: Voice input/output

## Project Structure

```
web-app/
├── src/
│   ├── main.tsx                # Application entry
│   ├── App.tsx                 # Root component
│   ├── components/             # React components
│   │   ├── chat/
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── Message.tsx
│   │   │   ├── InputArea.tsx
│   │   │   └── VoiceInput.tsx
│   │   ├── citations/
│   │   │   ├── CitationCard.tsx
│   │   │   └── CitationList.tsx
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   └── ConversationList.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   └── ui/                 # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       └── ...
│   ├── pages/                  # Page components
│   │   ├── Chat.tsx
│   │   ├── Login.tsx
│   │   ├── Settings.tsx
│   │   ├── History.tsx
│   │   └── Library.tsx
│   ├── hooks/                  # Custom React hooks
│   │   ├── useChat.ts
│   │   ├── useVoice.ts
│   │   ├── useWebSocket.ts
│   │   └── useAuth.ts
│   ├── services/               # API clients
│   │   ├── api.ts              # REST API client
│   │   ├── websocket.ts        # WebSocket client
│   │   └── auth.ts             # Authentication
│   ├── stores/                 # Zustand stores
│   │   ├── authStore.ts
│   │   ├── chatStore.ts
│   │   └── settingsStore.ts
│   ├── utils/                  # Utilities
│   │   ├── formatters.ts
│   │   └── helpers.ts
│   ├── types/                  # TypeScript types
│   │   ├── message.ts
│   │   ├── conversation.ts
│   │   └── citation.ts
│   └── styles/                 # Global styles
│       └── globals.css
├── public/                     # Static assets
│   ├── index.html
│   └── assets/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── .env.example
```

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env.local
# Edit .env.local with your settings
```

3. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Configuration

### Development Environment

Create `.env.local` for local development:

```bash
# API URLs (local development)
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/api/realtime/ws

# Environment
VITE_ENV=development

# Features
VITE_ENABLE_VOICE=true
VITE_ENABLE_FILE_UPLOAD=true

# Analytics (optional)
VITE_ANALYTICS_ID=
```

### Production Environment

Create `.env.production` for production builds:

```bash
# API URLs (production)
VITE_API_URL=https://voice.asimo.io
VITE_WS_URL=wss://voice.asimo.io/api/realtime/ws

# Environment
VITE_ENV=production

# Features
VITE_ENABLE_VOICE=true
VITE_ENABLE_FILE_UPLOAD=true

# Analytics
VITE_ANALYTICS_ID=your-analytics-id
```

## Core Types & Interfaces

All TypeScript types are defined in `src/types/`. See [`docs/WEB_APP_SPECS.md`](../docs/WEB_APP_SPECS.md) for complete type definitions.

**Key Types:**

```typescript
// Clinical context sent with each query
interface ClinicalContext {
  id: string;
  caseId?: string;
  title: string;
  patient?: {
    age?: number;
    sex?: 'M' | 'F' | 'Other' | 'Unknown';
    weight?: number;
    height?: number;
  };
  problems?: string[];
  medications?: string[];
  allergies?: string[];
  labs?: string;
  vitals?: string;
  notes?: string;
  specialty?: string;
  urgency?: 'routine' | 'urgent' | 'emergent';
}

// Rich citation with medical metadata
interface Citation {
  id: string;
  sourceType: 'textbook' | 'journal' | 'guideline' | 'uptodate' | 'note' | 'trial';
  title: string;
  subtitle?: string;
  authors?: string[];
  recommendationClass?: 'I' | 'IIa' | 'IIb' | 'III';  // ACC/AHA classes
  evidenceLevel?: 'A' | 'B' | 'C';
  doi?: string;
  pmid?: string;
  url?: string;
  excerpt?: string;
  relevanceScore?: number;
}

// Streaming message
interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  attachments?: Attachment[];
  createdAt: string;
  streaming?: boolean;
}
```

## Custom Hooks

### useWebSocket Hook

Manages WebSocket connection with automatic reconnection.

**Implementation (`src/hooks/useWebSocket.ts`):**

```typescript
import { useRef, useState, useCallback, useEffect } from 'react';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (event: ServerEvent) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    onMessage,
    onError,
    onConnect,
    onDisconnect,
    reconnectAttempts = 5,
    reconnectDelay = 2000
  } = options;

  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const reconnectCount = useRef(0);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      reconnectCount.current = 0;
      onConnect?.();
    };

    ws.current.onmessage = (event) => {
      try {
        const data: ServerEvent = JSON.parse(event.data);
        onMessage?.(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
      onDisconnect?.();

      // Attempt reconnection
      if (reconnectCount.current < reconnectAttempts) {
        reconnectCount.current++;
        setTimeout(() => {
          console.log(`Reconnecting... (attempt ${reconnectCount.current})`);
          connect();
        }, reconnectDelay);
      }
    };
  }, [url, onMessage, onError, onConnect, onDisconnect, reconnectAttempts, reconnectDelay]);

  const send = useCallback((event: ClientEvent) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(event));
    } else {
      console.warn('WebSocket not connected, cannot send:', event);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    connectionStatus,
    send,
    disconnect,
    reconnect: connect
  };
}
```

### useChat Hook

Higher-level hook that wraps `useWebSocket` for chat functionality.

**Implementation (`src/hooks/useChat.ts`):**

```typescript
import { useState, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import type { ChatMessage, Citation, ClinicalContext, ClientEvent, ServerEvent } from '../types';

interface UseChatOptions {
  sessionId?: string;
  mode: 'quick_consult' | 'case_workspace' | 'guideline_comparison';
  clinicalContext?: ClinicalContext;
}

export function useChat(options: UseChatOptions) {
  const { sessionId: initialSessionId, mode, clinicalContext } = options;

  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const currentMessageRef = useRef<ChatMessage | null>(null);

  const handleServerEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case 'session.started':
        setSessionId(event.sessionId);
        break;

      case 'message.delta':
        setIsStreaming(true);
        if (!currentMessageRef.current || currentMessageRef.current.id !== event.messageId) {
          const newMessage: ChatMessage = {
            id: event.messageId,
            sessionId: event.sessionId,
            role: event.role,
            content: event.contentDelta,
            createdAt: new Date().toISOString(),
            streaming: true
          };
          currentMessageRef.current = newMessage;
          setMessages(prev => [...prev, newMessage]);
        } else {
          setMessages(prev => prev.map(msg =>
            msg.id === event.messageId
              ? { ...msg, content: msg.content + event.contentDelta }
              : msg
          ));
        }
        break;

      case 'message.complete':
        setIsStreaming(false);
        setMessages(prev => prev.map(msg =>
          msg.id === event.messageId
            ? { ...msg, streaming: false }
            : msg
        ));
        currentMessageRef.current = null;
        break;

      case 'citation.list':
        setMessages(prev => prev.map(msg =>
          msg.id === event.messageId
            ? { ...msg, citations: event.citations }
            : msg
        ));
        break;

      case 'error':
        console.error('Server error:', event.message);
        setIsStreaming(false);
        break;
    }
  }, []);

  const { isConnected, send } = useWebSocket({
    url: `${import.meta.env.VITE_WS_URL}/chat`,
    onMessage: handleServerEvent,
    onConnect: () => {
      send({
        type: 'session.start',
        sessionId,
        mode,
        clinicalContext
      });
    }
  });

  const sendMessage = useCallback((content: string, attachments?: string[]) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: sessionId!,
      role: 'user',
      content,
      attachments: attachments?.map(id => ({ id, type: 'file', url: '', name: '' })),
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);

    send({
      type: 'message.send',
      sessionId: sessionId!,
      content,
      attachments
    });
  }, [sessionId, send]);

  const stopGeneration = useCallback(() => {
    send({
      type: 'generation.stop',
      sessionId: sessionId!
    });
    setIsStreaming(false);
  }, [sessionId, send]);

  return {
    sessionId,
    messages,
    isStreaming,
    isConnected,
    sendMessage,
    stopGeneration
  };
}
```

### useVoice Hook

Handles voice input recording and audio playback.

**Implementation (`src/hooks/useVoice.ts`):**

```typescript
import { useState, useCallback, useRef } from 'react';

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const startRecording = useCallback(async (
    onDataAvailable: (chunk: Blob) => void
  ) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          onDataAvailable(event.data);
        }
      };

      mediaRecorder.start(100); // Emit chunks every 100ms
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, []);

  const playAudio = useCallback(async (audioData: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      source.onended = () => setIsPlaying(false);

      setIsPlaying(true);
      source.start(0);
    } catch (error) {
      console.error('Failed to play audio:', error);
      setIsPlaying(false);
    }
  }, []);

  return {
    isRecording,
    isPlaying,
    startRecording,
    stopRecording,
    playAudio
  };
}
```

## Main Chat Page Implementation

Complete example of the Chat page component (`src/pages/Chat.tsx`):

```typescript
import { useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useVoice } from '../hooks/useVoice';
import { MessageList } from '../components/chat/MessageList';
import { InputArea } from '../components/chat/InputArea';
import { ContextPanel } from '../components/chat/ContextPanel';
import { CitationSidebar } from '../components/citations/CitationSidebar';
import type { ClinicalContext } from '../types';

export function ChatPage() {
  const [mode, setMode] = useState<'quick_consult' | 'case_workspace'>('quick_consult');
  const [clinicalContext, setClinicalContext] = useState<ClinicalContext | undefined>();
  const [showContext, setShowContext] = useState(false);

  // Initialize chat hook
  const {
    sessionId,
    messages,
    isStreaming,
    isConnected,
    sendMessage,
    stopGeneration
  } = useChat({
    mode,
    clinicalContext
  });

  // Initialize voice hook
  const {
    isRecording,
    startRecording,
    stopRecording
  } = useVoice();

  const handleSendMessage = (content: string, attachments?: string[]) => {
    sendMessage(content, attachments);
  };

  const handleVoiceToggle = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording((chunk) => {
        // Send audio chunk to WebSocket
        // Implementation would use useWebSocket directly for audio streaming
      });
    }
  };

  return (
    <div className="flex h-screen">
      {/* Context Panel - Shows in case_workspace mode */}
      {mode === 'case_workspace' && showContext && (
        <ContextPanel
          context={clinicalContext}
          onUpdate={setClinicalContext}
          onClose={() => setShowContext(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">
              {mode === 'quick_consult' ? 'Quick Consult' : 'Case Workspace'}
            </h1>
            {!isConnected && (
              <span className="text-sm text-red-600">Disconnected</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode === 'case_workspace' && (
              <button
                onClick={() => setShowContext(!showContext)}
                className="px-3 py-1 text-sm border rounded"
              >
                {showContext ? 'Hide' : 'Show'} Context
              </button>
            )}

            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="px-3 py-1 border rounded"
            >
              <option value="quick_consult">Quick Consult</option>
              <option value="case_workspace">Case Workspace</option>
              <option value="guideline_comparison">Guideline Comparison</option>
            </select>
          </div>
        </header>

        {/* Message List */}
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
        />

        {/* Input Area */}
        <InputArea
          onSend={handleSendMessage}
          onVoiceToggle={handleVoiceToggle}
          isRecording={isRecording}
          isStreaming={isStreaming}
          onStopGeneration={stopGeneration}
          disabled={!isConnected}
        />
      </div>

      {/* Citation Sidebar - Shows citations for current message */}
      <CitationSidebar
        citations={messages[messages.length - 1]?.citations || []}
      />
    </div>
  );
}
```

## Key Components

### Chat Interface

**MessageList.tsx**
- Displays conversation messages using `ChatMessage[]` type
- Streaming response support with `streaming` flag on messages
- Virtualized scrolling for performance using `@tanstack/react-virtual`
- Auto-scroll to bottom during streaming
- Renders citations inline with `CitationCard` components

**MessageBubble.tsx**
```typescript
interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="message-content">
        <ReactMarkdown>{message.content}</ReactMarkdown>
        {isStreaming && <span className="cursor-blink">▊</span>}
      </div>

      {message.citations && message.citations.length > 0 && (
        <div className="citations-inline">
          <h4>Sources:</h4>
          {message.citations.map((citation) => (
            <CitationCard key={citation.id} citation={citation} compact />
          ))}
        </div>
      )}

      <div className="message-meta">
        {new Date(message.createdAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
```

**InputArea.tsx**
- Text input with markdown support
- File attachment picker using `<input type="file">`
- Voice toggle button that calls `useVoice` hook
- Send on Enter (with Shift+Enter for newlines)
- Shows "Stop Generation" button when `isStreaming` is true

**VoiceInput.tsx**
- Web Audio API for recording via `useVoice` hook
- Real-time audio visualization using AnalyserNode
- Push-to-talk or toggle mode
- Automatic silence detection using volume threshold

### Citations

**CitationCard.tsx**
```typescript
interface CitationCardProps {
  citation: Citation;
  compact?: boolean;
}

export function CitationCard({ citation, compact }: CitationCardProps) {
  return (
    <div className="citation-card">
      <div className="citation-header">
        <span className="source-type">{citation.sourceType}</span>
        {citation.recommendationClass && (
          <span className="rec-class">Class {citation.recommendationClass}</span>
        )}
        {citation.evidenceLevel && (
          <span className="evidence">Level {citation.evidenceLevel}</span>
        )}
      </div>

      <h4 className="citation-title">{citation.title}</h4>
      {citation.subtitle && <p className="citation-subtitle">{citation.subtitle}</p>}

      {citation.authors && (
        <p className="citation-authors">{citation.authors.join(', ')}</p>
      )}

      {citation.excerpt && !compact && (
        <blockquote className="citation-excerpt">{citation.excerpt}</blockquote>
      )}

      <div className="citation-links">
        {citation.doi && (
          <a href={`https://doi.org/${citation.doi}`} target="_blank" rel="noopener">
            DOI
          </a>
        )}
        {citation.pmid && (
          <a href={`https://pubmed.ncbi.nlm.nih.gov/${citation.pmid}`} target="_blank" rel="noopener">
            PubMed
          </a>
        )}
        {citation.url && (
          <a href={citation.url} target="_blank" rel="noopener">
            Full Text
          </a>
        )}
      </div>
    </div>
  );
}
```

### Context Management

**ContextPanel.tsx**
- Form for entering patient demographics, problems list, medications, labs
- Uses `ClinicalContext` type
- Real-time updates sent via `context.update` WebSocket event
- Collapsible sections for different context categories
- Auto-save with debouncing

**Sidebar.tsx**
- List of conversations grouped by date
- Search conversations
- New conversation button
- Delete/archive options

## State Management

### Auth Store (Zustand)

```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
```

### Chat Store

```typescript
interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  sendMessage: (content: string) => void;
  startNewConversation: () => void;
}
```

## API Integration

### REST API (api.ts)

```typescript
// Authentication
export const login = async (email: string, password: string): Promise<AuthResponse>
export const logout = async (): Promise<void>

// Conversations
export const getConversations = async (): Promise<Conversation[]>
export const getConversation = async (id: string): Promise<Conversation>
export const deleteConversation = async (id: string): Promise<void>

// Files
export const uploadFile = async (file: File): Promise<FileUpload>
export const downloadFile = async (id: string): Promise<Blob>

// Settings
export const getSettings = async (): Promise<Settings>
export const updateSettings = async (settings: Partial<Settings>): Promise<Settings>
```

### WebSocket (websocket.ts)

```typescript
// Events sent to server
emit('conversation.start', { conversationId?: string })
emit('message.send', { content: string, attachments?: string[] })
emit('audio.chunk', { data: ArrayBuffer })
emit('generation.stop')

// Events received from server
on('message.chunk', (data: { messageId: string, content: string, done: boolean }) => {})
on('message.citations', (data: { messageId: string, citations: Citation[] }) => {})
on('audio.chunk', (data: { data: ArrayBuffer }) => {})
on('error', (data: { message: string, code: string }) => {})
on('tool.use', (data: { tool: string, description: string }) => {})
```

## Voice Integration

### Recording

```typescript
// Start recording
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mediaRecorder = new MediaRecorder(stream);

// Send audio chunks via WebSocket
mediaRecorder.ondataavailable = (event) => {
  websocket.emit('audio.chunk', { data: event.data });
};
```

### Playback

```typescript
// Receive audio chunks and play
websocket.on('audio.chunk', (data) => {
  const audioContext = new AudioContext();
  audioContext.decodeAudioData(data.data, (buffer) => {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
  });
});
```

## Styling

### Tailwind CSS

Custom theme in `tailwind.config.js`:

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',    // Medical blue
        secondary: '#14B8A6',  // Teal
        // ...
      },
    },
  },
}
```

### Dark Mode

```typescript
// Toggle dark mode
const toggleDarkMode = () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
};
```

## Responsive Design

### Breakpoints

- Mobile: < 768px
- Tablet: 768px - 1023px
- Desktop: 1024px+

### Mobile Optimizations

- Collapsible sidebar
- Bottom sheet for settings
- Touch-friendly buttons (min 44px)
- Optimized keyboard for text input
- Voice button prominently placed

## Performance

### Code Splitting

```typescript
// Lazy load routes
const Settings = lazy(() => import('./pages/Settings'));
const History = lazy(() => import('./pages/History'));
```

### Virtualization

Long message lists use virtualized scrolling (react-window).

### Caching

- API responses cached with SWR or React Query
- Images lazy loaded
- Static assets cached with service worker

## Testing

### Unit Tests

```bash
npm run test
```

### E2E Tests (Playwright)

```bash
npm run test:e2e
```

### Type Checking

```bash
npm run type-check
```

## Build & Deployment

### Production Build

```bash
npm run build
```

Output in `dist/` directory.

### Preview Build

```bash
npm run preview
```

### Deploy to Server

```bash
# Build
npm run build

# Copy to server
rsync -avz dist/ user@asimo.io:/var/www/voiceassist/

# Or use CI/CD pipeline
```

## Accessibility

### Features

- Semantic HTML
- ARIA labels on interactive elements
- Keyboard navigation (Tab, Enter, Escape)
- Focus management
- Screen reader announcements for messages
- High contrast mode support

### Keyboard Shortcuts

- `Cmd/Ctrl + K`: Global search
- `Cmd/Ctrl + N`: New conversation
- `Cmd/Ctrl + /`: Focus input
- `Cmd/Ctrl + Enter`: Send message
- `Esc`: Stop voice recording

## Browser Support

- Chrome/Edge: 90+
- Firefox: 88+
- Safari: 14+

Note: Voice features require modern browser with Web Audio API support.

## Development

### Running Locally

```bash
npm run dev
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

### Component Development (Storybook - Optional)

```bash
npm run storybook
```

## Troubleshooting

### WebSocket connection fails

- Check CORS configuration on server
- Verify WSS URL in environment
- Check firewall/proxy settings

### Voice not working

- Grant microphone permission
- Check HTTPS (required for getUserMedia)
- Verify browser compatibility

### Slow initial load

- Optimize bundle size
- Enable code splitting
- Use CDN for static assets

## Future Enhancements

- [ ] Progressive Web App (PWA)
- [ ] Offline mode with service worker
- [ ] Push notifications
- [ ] Multi-language support
- [ ] Accessibility improvements
- [ ] Performance optimizations
- [ ] Video consultation mode
- [ ] Screen sharing for telemedicine

## Contributing

See [CONTRIBUTING.md](../docs/CONTRIBUTING.md)

## License

Personal use project.
