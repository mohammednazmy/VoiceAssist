/**
 * Tests for AudioDeviceSelector component
 *
 * Tests the microphone device selection dropdown with permission handling.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AudioDeviceSelector } from "../AudioDeviceSelector";

// ============================================================================
// Mock Setup
// ============================================================================

const mockDevices = [
  { deviceId: "device-1", label: "Built-in Microphone", kind: "audioinput" },
  { deviceId: "device-2", label: "External USB Mic", kind: "audioinput" },
  { deviceId: "device-3", label: "Headset", kind: "audioinput" },
];

const mockStream = {
  getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
};

// Store original navigator
const originalNavigator = globalThis.navigator;

let mockGetUserMedia: ReturnType<typeof vi.fn>;
let mockEnumerateDevices: ReturnType<typeof vi.fn>;
let deviceChangeListeners: Set<() => void>;

beforeEach(() => {
  vi.clearAllMocks();
  deviceChangeListeners = new Set();

  mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
  mockEnumerateDevices = vi.fn().mockResolvedValue(mockDevices);

  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
        enumerateDevices: mockEnumerateDevices,
        addEventListener: vi.fn((event: string, cb: () => void) => {
          if (event === "devicechange") {
            deviceChangeListeners.add(cb);
          }
        }),
        removeEventListener: vi.fn((event: string, cb: () => void) => {
          if (event === "devicechange") {
            deviceChangeListeners.delete(cb);
          }
        }),
      },
    },
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    writable: true,
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function renderSelector(props = {}) {
  const defaultProps = {
    onDeviceSelect: vi.fn(),
    ...props,
  };
  return render(<AudioDeviceSelector {...defaultProps} />);
}

// ============================================================================
// Test Suites
// ============================================================================

describe("AudioDeviceSelector", () => {
  describe("Loading State", () => {
    it("should show loading state initially", () => {
      // Make permission request hang
      mockGetUserMedia.mockImplementation(() => new Promise(() => {}));

      renderSelector();

      expect(screen.getByText("Loading devices...")).toBeInTheDocument();
    });

    it("should show spinner during loading", () => {
      mockGetUserMedia.mockImplementation(() => new Promise(() => {}));

      const { container } = renderSelector();

      expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  describe("Device Enumeration", () => {
    it("should request microphone permission on mount", async () => {
      renderSelector();

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
      });
    });

    it("should enumerate devices after getting permission", async () => {
      renderSelector();

      await waitFor(() => {
        expect(mockEnumerateDevices).toHaveBeenCalled();
      });
    });

    it("should stop the stream immediately after getting permission", async () => {
      renderSelector();

      await waitFor(() => {
        expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
      });
    });

    it("should display all audio input devices", async () => {
      renderSelector();

      await waitFor(() => {
        expect(screen.getByText("Built-in Microphone")).toBeInTheDocument();
        expect(screen.getByText("External USB Mic")).toBeInTheDocument();
        expect(screen.getByText("Headset")).toBeInTheDocument();
      });
    });

    it("should show device count", async () => {
      renderSelector();

      await waitFor(() => {
        expect(screen.getByText("3 microphones available")).toBeInTheDocument();
      });
    });

    it("should use fallback label for devices without labels", async () => {
      mockEnumerateDevices.mockResolvedValueOnce([
        { deviceId: "device-1", label: "", kind: "audioinput" },
        { deviceId: "device-2", label: "", kind: "audioinput" },
      ]);

      renderSelector();

      await waitFor(() => {
        expect(screen.getByText("Microphone 1")).toBeInTheDocument();
        expect(screen.getByText("Microphone 2")).toBeInTheDocument();
      });
    });
  });

  describe("Device Selection", () => {
    it("should auto-select first device if none selected", async () => {
      const onDeviceSelect = vi.fn();
      renderSelector({ onDeviceSelect });

      await waitFor(() => {
        expect(onDeviceSelect).toHaveBeenCalledWith("device-1");
      });
    });

    it("should not auto-select if device already selected", async () => {
      const onDeviceSelect = vi.fn();
      renderSelector({ onDeviceSelect, selectedDeviceId: "device-2" });

      await waitFor(() => {
        expect(screen.getByText("External USB Mic")).toBeInTheDocument();
      });

      // Should not have been called because device is already selected
      expect(onDeviceSelect).not.toHaveBeenCalled();
    });

    it("should call onDeviceSelect when user changes selection", async () => {
      const onDeviceSelect = vi.fn();
      renderSelector({ onDeviceSelect, selectedDeviceId: "device-1" });

      await waitFor(() => {
        expect(screen.getByLabelText("Microphone")).toBeInTheDocument();
      });

      const select = screen.getByLabelText("Microphone");
      fireEvent.change(select, { target: { value: "device-2" } });

      expect(onDeviceSelect).toHaveBeenCalledWith("device-2");
    });

    it("should display selected device value", async () => {
      renderSelector({ selectedDeviceId: "device-2" });

      await waitFor(() => {
        const select = screen.getByLabelText("Microphone") as HTMLSelectElement;
        expect(select.value).toBe("device-2");
      });
    });
  });

  describe("Error Handling", () => {
    it("should show error when microphone access is denied", async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error("Permission denied"));

      renderSelector();

      await waitFor(() => {
        expect(
          screen.getByText("Unable to access microphone devices"),
        ).toBeInTheDocument();
      });
    });

    it("should show retry button on error", async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error("Permission denied"));

      renderSelector();

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });
    });

    it("should retry loading devices when retry button clicked", async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error("Permission denied"));

      renderSelector();

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });

      // Now make it succeed
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      fireEvent.click(screen.getByText("Retry"));

      await waitFor(() => {
        expect(screen.getByText("Built-in Microphone")).toBeInTheDocument();
      });
    });
  });

  describe("No Devices", () => {
    it("should show 'No microphones found' when no devices available", async () => {
      mockEnumerateDevices.mockResolvedValueOnce([]);

      renderSelector();

      await waitFor(() => {
        expect(screen.getByText("No microphones found")).toBeInTheDocument();
      });
    });

    it("should show singular count for one microphone", async () => {
      mockEnumerateDevices.mockResolvedValueOnce([
        { deviceId: "device-1", label: "Mic", kind: "audioinput" },
      ]);

      renderSelector();

      await waitFor(() => {
        expect(screen.getByText("1 microphone available")).toBeInTheDocument();
      });
    });

    it("should disable select when no devices available", async () => {
      mockEnumerateDevices.mockResolvedValueOnce([]);

      renderSelector();

      await waitFor(() => {
        expect(screen.getByLabelText("Microphone")).toBeDisabled();
      });
    });
  });

  describe("Disabled State", () => {
    it("should disable select when disabled prop is true", async () => {
      renderSelector({ disabled: true });

      await waitFor(() => {
        expect(screen.getByLabelText("Microphone")).toBeDisabled();
      });
    });
  });

  describe("Device Change Events", () => {
    it("should listen for device changes", async () => {
      renderSelector();

      await waitFor(() => {
        expect(navigator.mediaDevices.addEventListener).toHaveBeenCalledWith(
          "devicechange",
          expect.any(Function),
        );
      });
    });

    it("should reload devices when devices change", async () => {
      renderSelector();

      await waitFor(() => {
        expect(mockEnumerateDevices).toHaveBeenCalledTimes(1);
      });

      // Simulate device change
      const newDevices = [
        ...mockDevices,
        { deviceId: "device-4", label: "New Mic", kind: "audioinput" },
      ];
      mockEnumerateDevices.mockResolvedValueOnce(newDevices);

      // Trigger device change
      deviceChangeListeners.forEach((cb) => cb());

      await waitFor(() => {
        expect(mockEnumerateDevices).toHaveBeenCalledTimes(2);
      });
    });

    it("should clean up event listener on unmount", async () => {
      const { unmount } = renderSelector();

      await waitFor(() => {
        expect(screen.getByLabelText("Microphone")).toBeInTheDocument();
      });

      unmount();

      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith(
        "devicechange",
        expect.any(Function),
      );
    });
  });

  describe("Custom Class Name", () => {
    it("should apply custom className", async () => {
      const { container } = renderSelector({ className: "custom-class" });

      await waitFor(() => {
        expect(container.firstChild).toHaveClass("custom-class");
      });
    });
  });
});
