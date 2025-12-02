/**
 * Voice Feature Test Mocks - Index
 *
 * Export all voice feature test mocks for easy import.
 *
 * Usage:
 *   import { MockWebSocket, MockAudioContext, MockMediaDevices } from '@/test/mocks';
 *
 * Phase: Voice Feature Hardening
 */

export { MockWebSocket } from "./MockWebSocket";
export type { MockWebSocketOptions } from "./MockWebSocket";

export {
  MockAudioContext,
  MockAudioWorkletNode,
  MockAudioBufferSourceNode,
  MockGainNode,
  MockMediaStreamAudioSourceNode,
  MockAudioWorklet,
} from "./MockAudioContext";
export type { MockAudioContextOptions } from "./MockAudioContext";

export {
  MockMediaDevices,
  MockMediaStream,
  MockMediaStreamTrack,
} from "./MockMediaDevices";
export type {
  MockMediaDevicesOptions,
  MockMediaStreamTrackOptions,
} from "./MockMediaDevices";

/**
 * Install all voice mocks globally
 *
 * Call this in your test setup to enable all voice mocks.
 */
export function installVoiceMocks(): void {
  // Import dynamically to avoid circular dependencies
  const { MockWebSocket } = require("./MockWebSocket");
  const { MockAudioContext } = require("./MockAudioContext");
  const { MockMediaDevices } = require("./MockMediaDevices");

  MockWebSocket.install();
  MockAudioContext.install();
  MockMediaDevices.install();
}

/**
 * Reset all voice mocks
 *
 * Call this in afterEach to clean up mock state.
 */
export function resetVoiceMocks(): void {
  const { MockWebSocket } = require("./MockWebSocket");
  MockWebSocket.clearInstances();
}
