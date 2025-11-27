export type ConnectionStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface WebSocketEvent {
  type: string;
  payload?: unknown;
}

type StatusListener = (status: ConnectionStatus) => void;
type MessageListener = (event: WebSocketEvent) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = "closed";
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30000;
  private readonly baseDelay = 1000;
  private readonly listeners = new Set<StatusListener>();
  private readonly messageListeners = new Set<MessageListener>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly url: string;

  constructor(path = "/ws/admin") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    this.url = `${protocol}://${window.location.host}${path}`;
  }

  getStatus() {
    return this.status;
  }

  connect() {
    if (this.socket &&
      (this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    this.updateStatus("connecting");
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.updateStatus("open");
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketEvent;
        this.messageListeners.forEach((listener) => listener(data));
      } catch (err) {
        console.warn("Failed to parse websocket message", err);
      }
    };

    this.socket.onerror = () => {
      this.updateStatus("error");
    };

    this.socket.onclose = () => {
      this.updateStatus("closed");
      this.scheduleReconnect();
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.socket?.close();
    this.socket = null;
    this.updateStatus("closed");
  }

  send(event: WebSocketEvent) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }

  forceReconnect() {
    this.disconnect();
    this.reconnectAttempts = 0;
    this.connect();
  }

  subscribeStatus(listener: StatusListener) {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  subscribeMessages(listener: MessageListener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private updateStatus(status: ConnectionStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  private scheduleReconnect() {
    const delay = Math.min(
      this.maxReconnectDelay,
      this.baseDelay * 2 ** this.reconnectAttempts +
        Math.random() * this.baseDelay,
    );

    this.reconnectAttempts += 1;
    this.updateStatus("reconnecting");

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }
}

export const websocketService = new WebSocketService();
