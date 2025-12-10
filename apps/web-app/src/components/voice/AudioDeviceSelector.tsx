/**
 * Audio Device Selector Component
 * Allows users to select their preferred microphone
 *
 * Phase 9.3: Enhanced Voice Features
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface AudioDeviceSelectorProps {
  /** Currently selected device ID */
  selectedDeviceId?: string;
  /** Called when user selects a device */
  onDeviceSelect: (deviceId: string) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

export function AudioDeviceSelector({
  selectedDeviceId,
  onDeviceSelect,
  disabled = false,
  className = "",
}: AudioDeviceSelectorProps) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasPermissionRef = useRef(false);

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First, request permission if we don't have it
      if (!hasPermissionRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // Stop the stream immediately - we just needed permission
        stream.getTracks().forEach((track) => track.stop());
        hasPermissionRef.current = true;
      }

      // Now enumerate devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
          kind: device.kind,
        }));

      setDevices(audioInputs);

      // Auto-select first device if none selected
      if (!selectedDeviceId && audioInputs.length > 0) {
        onDeviceSelect(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.error("[AudioDeviceSelector] Failed to load devices:", err);
      setError("Unable to access microphone devices");
    } finally {
      setIsLoading(false);
    }
  }, [selectedDeviceId, onDeviceSelect]);

  // Load devices on mount
  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Listen for device changes
  useEffect(() => {
    const handleDeviceChange = () => {
      loadDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [loadDevices]);

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-4 h-4 border-2 border-neutral-300 border-t-primary-500 rounded-full animate-spin" />
        <span className="text-sm text-neutral-500">Loading devices...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-4 h-4 text-red-500"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <span className="text-sm text-red-600">{error}</span>
        <button
          type="button"
          onClick={loadDevices}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <label
        htmlFor="audio-device-select"
        className="block text-sm font-medium text-neutral-700"
      >
        Microphone
      </label>
      <div className="relative">
        <select
          id="audio-device-select"
          value={selectedDeviceId || ""}
          onChange={(e) => onDeviceSelect(e.target.value)}
          disabled={disabled || devices.length === 0}
          className="block w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-neutral-100 disabled:cursor-not-allowed"
        >
          {devices.length === 0 ? (
            <option value="">No microphones found</option>
          ) : (
            devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))
          )}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4 text-neutral-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        {devices.length} microphone{devices.length !== 1 ? "s" : ""} available
      </p>
    </div>
  );
}
