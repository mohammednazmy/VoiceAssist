# VoiceAssist Web App - Testing Guide

**Date:** 2025-11-24
**Status:** Ready for Integration Testing

---

## ✅ What's Been Completed

### Authentication Flow

- [x] User registration with backend
- [x] User login with JWT tokens
- [x] Token storage in localStorage
- [x] Protected route navigation
- [x] Theme context (light/dark mode)
- [x] React dedupe fix for monorepo

### Chat Infrastructure

- [x] WebSocket client implementation (`useChatSession` hook)
- [x] Message streaming with delta/chunk support
- [x] Connection status monitoring
- [x] Auto-reconnection with exponential backoff
- [x] Heartbeat ping/pong
- [x] Error handling for WebSocket events

### API Client

- [x] Authentication methods (login, register, logout, refresh)
- [x] Conversation methods (create, get, list, update, delete)
- [x] Message methods (get, edit, delete)
- [x] OAuth methods (Google, Microsoft)
- [x] Profile management

### Frontend Components

- [x] ChatPage with full UI
- [x] MessageList with streaming support
- [x] MessageInput with attachments/voice
- [x] ConnectionStatus indicator
- [x] Clinical context sidebar
- [x] Citation sidebar
- [x] Branch sidebar
- [x] Export/Share dialogs

---

## 🧪 Manual Testing Steps

### 1. Authentication Testing

#### Register New User

```
1. Navigate to http://localhost:5173/register
2. Fill in:
   - Name: Test User
   - Email: test+[timestamp]@example.com
   - Password: TestPassword123!
3. Click "Create Account"
4. Verify: Redirects to home page ("/")
5. Check: User is logged in (profile icon appears)
```

#### Login Existing User

```
1. Logout if logged in
2. Navigate to http://localhost:5173/login
3. Fill in credentials
4. Click "Sign In"
5. Verify: Redirects to home page
6. Check: User is logged in
```

#### Protected Routes

```
1. Logout
2. Try to navigate to /chat
3. Verify: Redirects to /login
4. Login
5. Try to navigate to /chat again
6. Verify: Loads chat page
```

### 2. Chat Testing

#### Create New Conversation

```
1. Login
2. Navigate to /chat (no ID)
3. Verify: Auto-creates conversation and redirects to /chat/[id]
4. Check console: Should see "Creating conversation..."
5. Check network: POST to /api/conversations
```

#### Send Message

```
1. In chat page, type "Hello, test message"
2. Press Enter or click Send
3. Check browser console:
   - "[WebSocket] Connected"
   - WebSocket connection to wss://localhost:8000/api/realtime/ws?conversationId=...
4. Check network WebSocket tab:
   - Should see WS connection established
   - Should see outgoing message: {"type":"message","content":"Hello, test message",...}
5. Verify: User message appears in chat
6. Wait for response:
   - Should see typing indicator
   - Should see assistant response streaming in
   - Response should finalize when complete
```

#### Message Streaming

```
1. Send a message that will generate a long response
2. Watch for:
   - Typing indicator appears
   - Message text streams in word by word
   - Message finalizes (typing indicator disappears)
   - Message is saved to conversation
```

#### Connection Status

```
1. Check connection indicator in header
2. Should show "Connected" (green)
3. Close backend or docker container
4. Should show "Disconnected" (red)
5. Restart backend
6. Should auto-reconnect and show "Connected"
```

### 3. WebSocket Events Testing

Check browser console for these WebSocket events:

#### Successful Connection

```
[WebSocket] Connected
connectionStatus: "connected"
```

#### Message Delta (Streaming)

```
Incoming: {"type":"delta","delta":" Hello",...}
Incoming: {"type":"delta","delta":" there",...}
Incoming: {"type":"message.done","message":{...}}
```

#### Error Handling

```
Send invalid message → Should see error toast
Backend returns error → Should display in UI
Connection drops → Should attempt reconnection
```

---

## 🐛 Known Issues & Expected Behavior

### Backend Not Running

**Symptom:** Registration/login fails with network error
**Expected:** "Network error" toast or connection refused
**Fix:** Start backend with `docker-compose up -d`

### WebSocket Connection Fails

**Symptom:** "Connecting..." status persists, never reaches "Connected"
**Possible Causes:**

1. Backend WebSocket endpoint not available
2. CORS not allowing wss://localhost:5173
3. Token not being passed correctly

**Debug Steps:**

```
1. Open browser DevTools → Network → WS tab
2. Check WebSocket connection attempt
3. Check query params: conversationId and token should be present
4. Check response: Should be 101 Switching Protocols
5. If fails: Check backend logs for WebSocket errors
```

### Message Not Sending

**Symptom:** Message doesn't appear or no response
**Check:**

1. Connection status is "Connected"
2. Browser console for WebSocket errors
3. Network tab for outgoing WS message
4. Backend logs for message processing

---

## 🔍 Backend Verification

### Check Backend Health

```bash
# Check if backend is running
docker ps | grep voiceassist

# Check backend logs
docker logs voiceassist-server --tail 50 -f

# Test auth endpoint
curl http://localhost:8000/api/auth/health
```

### Test WebSocket Manually (using wscat)

```bash
# Install wscat if needed
npm install -g wscat

# Connect to WebSocket (replace TOKEN and CONV_ID)
wscat -c "wss://localhost:8000/api/realtime/ws?conversationId=CONV_ID&token=TOKEN"

# Send message
{"type":"message","content":"test"}

# Should receive responses
```

---

## 📊 Success Criteria

### Authentication

- ✅ User can register successfully
- ✅ User can login successfully
- ✅ Protected routes redirect to login
- ✅ Logout clears tokens and redirects

### Chat

- ⏳ WebSocket connection establishes successfully
- ⏳ Messages send and receive properly
- ⏳ Streaming works (delta events)
- ⏳ Connection status updates correctly
- ⏳ Auto-reconnection works on disconnect

### UI/UX

- ✅ No console errors (except expected backend unavailable)
- ✅ Theme toggle works
- ✅ Responsive design
- ✅ Loading states display

---

## 🚀 Next Steps After Testing

1. **If WebSocket fails:**
   - Check backend WebSocket implementation
   - Verify CORS settings include localhost:5173
   - Check token authentication on WS endpoint

2. **If messages don't stream:**
   - Verify backend sends delta events
   - Check event type matching (frontend expects "delta", "chunk", "message.done")
   - Validate message format matches types

3. **Once chat works:**
   - Test conversation history loading
   - Test message editing
   - Test message deletion
   - Test regeneration

4. **Additional Features:**
   - File attachments
   - Voice input/output
   - Citations display
   - Clinical context
   - Templates
   - Export/Share

---

## 📝 Test Log Template

```
Date: 2025-11-24
Tester:
Browser: Chrome/Firefox/Safari
OS: macOS/Windows/Linux

Test Results:
[ ] Registration works
[ ] Login works
[ ] Chat page loads
[ ] WebSocket connects
[ ] Messages send
[ ] Messages receive
[ ] Streaming works
[ ] Reconnection works

Issues Found:
1.
2.

Notes:

```
