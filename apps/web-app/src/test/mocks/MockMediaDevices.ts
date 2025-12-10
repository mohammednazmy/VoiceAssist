/**
 * MockMediaDevices for Voice Feature Testing
 *
 * Comprehensive MediaDevices mock with:
 * - getUserMedia simulation with permission handling
 * - enumerateDevices with configurable device list
 * - MediaStream and MediaStreamTrack mocks
 * - Permission state simulation
 * - Device change events
 *
 * Phase: Voice Feature Hardening
 */

import { vi } from "vitest";

// ============================================================================
// Types
// ============================================================================

export interface MockMediaDevicesOptions {
  /** List of available devices */
  devices?: MediaDeviceInfo[];
  /** Simulate permission denied */
  permissionDenied?: boolean;
  /** Simulate device not found */
  deviceNotFound?: boolean;
  /** Simulate getUserMedia delay (ms) */
  getUserMediaDelay?: number;
  /** Custom permission state */
  permissionState?: PermissionState;
}

export interface MockMediaStreamTrackOptions {
  kind: "audio" | "video";
  label?: string;
  deviceId?: string;
  enabled?: boolean;
  muted?: boolean;
  readyState?: MediaStreamTrackState;
}

// ============================================================================
// Mock MediaStreamTrack
// ============================================================================

export class MockMediaStreamTrack implements MediaStreamTrack {
  id: string;
  kind: "audio" | "video";
  label: string;
  enabled: boolean;
  muted: boolean;
  readyState: MediaStreamTrackState;
  contentHint: string = "";

  // Event handlers
  onended: ((event: Event) => void) | null = null;
  onmute: ((event: Event) => void) | null = null;
  onunmute: ((event: Event) => void) | null = null;
  onisolationchange: ((event: Event) => void) | null = null;

  private _eventListeners: Map<string, Set<EventListener>> = new Map();
  private _constraints: MediaTrackConstraints;
  private _deviceId: string;

  constructor(options: MockMediaStreamTrackOptions) {
    this.id = `track-${Math.random().toString(36).substr(2, 9)}`;
    this.kind = options.kind;
    this.label = options.label ?? `Mock ${options.kind} track`;
    this.enabled = options.enabled ?? true;
    this.muted = options.muted ?? false;
    this.readyState = options.readyState ?? "live";
    this._deviceId = options.deviceId ?? "default";
    this._constraints = {};
  }

  // Track methods
  stop = vi.fn(() => {
    this.readyState = "ended";
    const event = new Event("ended");
    this.dispatchEvent(event);
  });

  clone = vi.fn((): MockMediaStreamTrack => {
    return new MockMediaStreamTrack({
      kind: this.kind,
      label: this.label,
      deviceId: this._deviceId,
      enabled: this.enabled,
      muted: this.muted,
      readyState: "live",
    });
  });

  applyConstraints = vi.fn(
    async (constraints?: MediaTrackConstraints): Promise<void> => {
      if (constraints) {
        this._constraints = { ...this._constraints, ...constraints };
      }
    },
  );

  getConstraints = vi.fn((): MediaTrackConstraints => {
    return { ...this._constraints };
  });

  getSettings = vi.fn((): MediaTrackSettings => {
    return {
      deviceId: this._deviceId,
      groupId: "group-1",
      ...(this.kind === "audio"
        ? {
            sampleRate: 48000,
            sampleSize: 16,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : {
            width: 640,
            height: 480,
            frameRate: 30,
          }),
    };
  });

  getCapabilities = vi.fn((): MediaTrackCapabilities => {
    if (this.kind === "audio") {
      return {
        deviceId: this._deviceId,
        groupId: "group-1",
        sampleRate: { min: 8000, max: 96000 },
        sampleSize: { min: 8, max: 32 },
        channelCount: { min: 1, max: 2 },
        echoCancellation: [true, false],
        noiseSuppression: [true, false],
        autoGainControl: [true, false],
      };
    }
    return {
      deviceId: this._deviceId,
      groupId: "group-1",
      width: { min: 320, max: 1920 },
      height: { min: 240, max: 1080 },
      frameRate: { min: 1, max: 60 },
    };
  });

  // Event handling
  addEventListener(type: string, listener: EventListener): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this._eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }

    // Call on* handler
    const handler = this[`on${event.type}` as keyof this];
    if (typeof handler === "function") {
      (handler as EventListener)(event);
    }

    return !event.defaultPrevented;
  }

  // Test helpers
  simulateMute(): void {
    this.muted = true;
    this.dispatchEvent(new Event("mute"));
  }

  simulateUnmute(): void {
    this.muted = false;
    this.dispatchEvent(new Event("unmute"));
  }

  simulateEnd(): void {
    this.stop();
  }

  // Required by interface but not commonly used
  isolated = false;
}

// ============================================================================
// Mock MediaStream
// ============================================================================

export class MockMediaStream implements MediaStream {
  id: string;
  active: boolean = true;

  // Event handlers
  onaddtrack: ((event: MediaStreamTrackEvent) => void) | null = null;
  onremovetrack: ((event: MediaStreamTrackEvent) => void) | null = null;

  private _tracks: MockMediaStreamTrack[] = [];
  private _eventListeners: Map<string, Set<EventListener>> = new Map();

  constructor(tracksOrStream?: MockMediaStreamTrack[] | MockMediaStream) {
    this.id = `stream-${Math.random().toString(36).substr(2, 9)}`;

    if (tracksOrStream instanceof MockMediaStream) {
      this._tracks = tracksOrStream
        .getTracks()
        .map((t) => t.clone() as MockMediaStreamTrack);
    } else if (Array.isArray(tracksOrStream)) {
      this._tracks = [...tracksOrStream];
    }
  }

  // Track methods
  getTracks(): MockMediaStreamTrack[] {
    return [...this._tracks];
  }

  getAudioTracks(): MockMediaStreamTrack[] {
    return this._tracks.filter((t) => t.kind === "audio");
  }

  getVideoTracks(): MockMediaStreamTrack[] {
    return this._tracks.filter((t) => t.kind === "video");
  }

  getTrackById(trackId: string): MockMediaStreamTrack | null {
    return this._tracks.find((t) => t.id === trackId) ?? null;
  }

  addTrack(track: MediaStreamTrack): void {
    const mockTrack = track as MockMediaStreamTrack;
    if (!this._tracks.includes(mockTrack)) {
      this._tracks.push(mockTrack);
      const event = new MediaStreamTrackEvent("addtrack", { track: mockTrack });
      this.dispatchEvent(event);
    }
  }

  removeTrack(track: MediaStreamTrack): void {
    const index = this._tracks.indexOf(track as MockMediaStreamTrack);
    if (index !== -1) {
      this._tracks.splice(index, 1);
      const event = new MediaStreamTrackEvent("removetrack", { track });
      this.dispatchEvent(event);
    }
  }

  clone(): MockMediaStream {
    const clonedTracks = this._tracks.map((t) => t.clone());
    return new MockMediaStream(clonedTracks);
  }

  // Event handling
  addEventListener(type: string, listener: EventListener): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this._eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }

    // Call on* handler
    const handler = this[`on${event.type}` as keyof this];
    if (typeof handler === "function") {
      (handler as EventListener)(event);
    }

    return !event.defaultPrevented;
  }

  // Test helpers
  stopAllTracks(): void {
    this._tracks.forEach((track) => track.stop());
    this.active = false;
  }
}

// ============================================================================
// Mock MediaDevices
// ============================================================================

export class MockMediaDevices {
  private _options: MockMediaDevicesOptions;
  private _eventListeners: Map<string, Set<EventListener>> = new Map();
  private _devices: MediaDeviceInfo[];

  ondevicechange: ((event: Event) => void) | null = null;

  constructor(options: MockMediaDevicesOptions = {}) {
    this._options = options;
    this._devices = options.devices ?? MockMediaDevices.getDefaultDevices();
  }

  // getUserMedia implementation
  getUserMedia = vi.fn(
    async (constraints?: MediaStreamConstraints): Promise<MockMediaStream> => {
      const {
        permissionDenied,
        deviceNotFound,
        getUserMediaDelay = 0,
      } = this._options;

      // Simulate delay
      if (getUserMediaDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, getUserMediaDelay));
      }

      // Simulate permission denied
      if (permissionDenied) {
        const error = new DOMException(
          "Permission denied: getUserMedia",
          "NotAllowedError",
        );
        throw error;
      }

      // Simulate device not found
      if (deviceNotFound) {
        const error = new DOMException(
          "Requested device not found",
          "NotFoundError",
        );
        throw error;
      }

      const tracks: MockMediaStreamTrack[] = [];

      // Create audio track if requested
      if (constraints?.audio) {
        const audioDevice =
          typeof constraints.audio === "object" && constraints.audio.deviceId
            ? this._findDevice(
                this._extractDeviceId(constraints.audio.deviceId),
                "audioinput",
              )
            : this._devices.find((d) => d.kind === "audioinput");

        if (audioDevice) {
          tracks.push(
            new MockMediaStreamTrack({
              kind: "audio",
              label: audioDevice.label,
              deviceId: audioDevice.deviceId,
            }),
          );
        }
      }

      // Create video track if requested
      if (constraints?.video) {
        const videoDevice =
          typeof constraints.video === "object" && constraints.video.deviceId
            ? this._findDevice(
                this._extractDeviceId(constraints.video.deviceId),
                "videoinput",
              )
            : this._devices.find((d) => d.kind === "videoinput");

        if (videoDevice) {
          tracks.push(
            new MockMediaStreamTrack({
              kind: "video",
              label: videoDevice.label,
              deviceId: videoDevice.deviceId,
            }),
          );
        }
      }

      return new MockMediaStream(tracks);
    },
  );

  // enumerateDevices implementation
  enumerateDevices = vi.fn(async (): Promise<MediaDeviceInfo[]> => {
    return [...this._devices];
  });

  // Get supported constraints
  getSupportedConstraints = vi.fn((): MediaTrackSupportedConstraints => {
    return {
      deviceId: true,
      groupId: true,
      autoGainControl: true,
      channelCount: true,
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: true,
      sampleSize: true,
      width: true,
      height: true,
      frameRate: true,
      facingMode: true,
      aspectRatio: true,
    };
  });

  // Get display media (screen sharing)
  getDisplayMedia = vi.fn(
    async (
      _constraints?: DisplayMediaStreamOptions,
    ): Promise<MockMediaStream> => {
      return new MockMediaStream([
        new MockMediaStreamTrack({
          kind: "video",
          label: "Screen",
          deviceId: "screen-1",
        }),
      ]);
    },
  );

  // Event handling
  addEventListener(type: string, listener: EventListener): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this._eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }

    if (event.type === "devicechange" && this.ondevicechange) {
      this.ondevicechange(event);
    }

    return !event.defaultPrevented;
  }

  // Private helpers
  private _findDevice(
    deviceId: string,
    kind: MediaDeviceKind,
  ): MediaDeviceInfo | undefined {
    return this._devices.find(
      (d) => d.deviceId === deviceId && d.kind === kind,
    );
  }

  private _extractDeviceId(constraint: ConstrainDOMString): string {
    if (typeof constraint === "string") {
      return constraint;
    }
    if (Array.isArray(constraint)) {
      return constraint[0] ?? "";
    }
    // Object with exact, ideal, or value
    const obj = constraint as { exact?: string; ideal?: string };
    return obj.exact ?? obj.ideal ?? "";
  }

  // ============================================================================
  // Test Helper Methods
  // ============================================================================

  /**
   * Update available devices
   */
  setDevices(devices: MediaDeviceInfo[]): void {
    this._devices = devices;
    this.dispatchEvent(new Event("devicechange"));
  }

  /**
   * Add a device
   */
  addDevice(device: MediaDeviceInfo): void {
    this._devices.push(device);
    this.dispatchEvent(new Event("devicechange"));
  }

  /**
   * Remove a device
   */
  removeDevice(deviceId: string): void {
    this._devices = this._devices.filter((d) => d.deviceId !== deviceId);
    this.dispatchEvent(new Event("devicechange"));
  }

  /**
   * Set permission state
   */
  setPermissionDenied(denied: boolean): void {
    this._options.permissionDenied = denied;
  }

  /**
   * Get default device list
   */
  static getDefaultDevices(): MediaDeviceInfo[] {
    return [
      {
        deviceId: "default",
        kind: "audioinput",
        label: "Default Microphone",
        groupId: "group-1",
        toJSON: () => ({}),
      },
      {
        deviceId: "mic-1",
        kind: "audioinput",
        label: "External Microphone",
        groupId: "group-2",
        toJSON: () => ({}),
      },
      {
        deviceId: "default",
        kind: "audiooutput",
        label: "Default Speaker",
        groupId: "group-1",
        toJSON: () => ({}),
      },
      {
        deviceId: "speaker-1",
        kind: "audiooutput",
        label: "External Speaker",
        groupId: "group-3",
        toJSON: () => ({}),
      },
      {
        deviceId: "camera-1",
        kind: "videoinput",
        label: "Default Camera",
        groupId: "group-4",
        toJSON: () => ({}),
      },
    ];
  }

  /**
   * Create a custom device
   */
  static createDevice(
    kind: MediaDeviceKind,
    label: string,
    deviceId?: string,
  ): MediaDeviceInfo {
    return {
      deviceId: deviceId ?? `device-${Math.random().toString(36).substr(2, 9)}`,
      kind,
      label,
      groupId: `group-${Math.random().toString(36).substr(2, 9)}`,
      toJSON: () => ({}),
    };
  }

  /**
   * Install MockMediaDevices globally
   */
  static install(options?: MockMediaDevicesOptions): MockMediaDevices {
    const mock = new MockMediaDevices(options);
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      configurable: true,
      value: mock,
    });
    return mock;
  }
}

export default MockMediaDevices;
