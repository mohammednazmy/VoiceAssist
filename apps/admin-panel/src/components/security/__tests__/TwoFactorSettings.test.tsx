/**
 * Tests for TwoFactorSettings component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TwoFactorSettings } from "../TwoFactorSettings";

// Mock the use2FA hook
vi.mock("../../../hooks/use2FA", () => ({
  use2FA: vi.fn(),
}));

import { use2FA } from "../../../hooks/use2FA";

const mockStartSetup = vi.fn();
const mockVerifyAndEnable = vi.fn();
const mockDisable = vi.fn();
const mockRegenerateBackupCodes = vi.fn();
const mockClearSetupData = vi.fn();

const defaultMockHook = {
  status: { enabled: false, verified_at: null, backup_codes_remaining: 0 },
  loading: false,
  error: null,
  setupData: null,
  setupLoading: false,
  verifyLoading: false,
  disableLoading: false,
  refreshStatus: vi.fn(),
  startSetup: mockStartSetup,
  verifyAndEnable: mockVerifyAndEnable,
  disable: mockDisable,
  regenerateBackupCodes: mockRegenerateBackupCodes,
  clearSetupData: mockClearSetupData,
};

const enabledMockHook = {
  ...defaultMockHook,
  status: {
    enabled: true,
    verified_at: "2024-01-15T12:00:00Z",
    backup_codes_remaining: 8,
  },
};

const setupDataMock = {
  qr_code: "data:image/png;base64,mockQRCode",
  manual_entry_key: "ABCD1234EFGH5678",
  backup_codes: [
    "1111-2222",
    "3333-4444",
    "5555-6666",
    "7777-8888",
    "9999-0000",
    "aaaa-bbbb",
    "cccc-dddd",
    "eeee-ffff",
  ],
};

describe("TwoFactorSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(use2FA).mockReturnValue(defaultMockHook);
  });

  describe("loading state", () => {
    it("renders loading skeleton when loading", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        loading: true,
      });

      render(<TwoFactorSettings />);

      // Should show skeleton animation
      expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    });
  });

  describe("disabled state (2FA not enabled)", () => {
    it("renders 2FA Not Enabled status", () => {
      render(<TwoFactorSettings />);

      expect(screen.getByText("2FA Not Enabled")).toBeInTheDocument();
      expect(screen.getByText("Two-Factor Authentication")).toBeInTheDocument();
    });

    it("renders Enable 2FA button", () => {
      render(<TwoFactorSettings />);

      expect(screen.getByText("Enable 2FA")).toBeInTheDocument();
    });

    it("calls startSetup when Enable 2FA button is clicked", async () => {
      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Enable 2FA"));

      expect(mockStartSetup).toHaveBeenCalledTimes(1);
    });

    it("shows Setting up... when setupLoading is true", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupLoading: true,
      });

      render(<TwoFactorSettings />);

      expect(screen.getByText("Setting up...")).toBeInTheDocument();
    });
  });

  describe("enabled state", () => {
    it("renders 2FA Enabled status", () => {
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      expect(screen.getByText("2FA Enabled")).toBeInTheDocument();
    });

    it("shows enabled date", () => {
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      expect(screen.getByText(/Enabled on/)).toBeInTheDocument();
    });

    it("shows backup codes remaining count", () => {
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      expect(screen.getByText("8 backup codes remaining")).toBeInTheDocument();
    });

    it("renders Regenerate Codes and Disable 2FA buttons", () => {
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      expect(screen.getByText("Regenerate Codes")).toBeInTheDocument();
      expect(screen.getByText("Disable 2FA")).toBeInTheDocument();
    });
  });

  describe("setup flow", () => {
    it("displays QR code when setup data is available", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      expect(screen.getByText("Scan QR Code")).toBeInTheDocument();
      expect(screen.getByAltText("2FA QR Code")).toBeInTheDocument();
    });

    it("displays manual entry key", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      expect(
        screen.getByText("Or enter this code manually:"),
      ).toBeInTheDocument();
      expect(screen.getByText("ABCD1234EFGH5678")).toBeInTheDocument();
    });

    it("displays backup codes", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      expect(screen.getByText("Backup Codes")).toBeInTheDocument();
      expect(screen.getByText("1111-2222")).toBeInTheDocument();
      expect(screen.getByText("eeee-ffff")).toBeInTheDocument();
    });

    it("shows verification input", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
      expect(screen.getByText("Verify & Enable")).toBeInTheDocument();
    });

    it("calls verifyAndEnable when form is submitted", async () => {
      mockVerifyAndEnable.mockResolvedValue(true);
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      const input = screen.getByPlaceholderText("000000");
      await userEvent.type(input, "123456");

      await userEvent.click(screen.getByText("Verify & Enable"));

      expect(mockVerifyAndEnable).toHaveBeenCalledWith("123456");
    });

    it("only allows numeric input in verification field", async () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      const input = screen.getByPlaceholderText("000000");
      await userEvent.type(input, "abc123def456");

      expect(input).toHaveValue("123456");
    });

    it("limits verification code to 6 digits", async () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      const input = screen.getByPlaceholderText("000000");
      await userEvent.type(input, "12345678");

      expect(input).toHaveValue("123456");
    });

    it("calls clearSetupData when Cancel is clicked", async () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Cancel"));

      expect(mockClearSetupData).toHaveBeenCalledTimes(1);
    });

    it("disables Verify button when code is incomplete", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
      });

      render(<TwoFactorSettings />);

      const verifyButton = screen.getByText("Verify & Enable");
      expect(verifyButton).toBeDisabled();
    });

    it("shows Verifying... when verifyLoading is true", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        setupData: setupDataMock,
        verifyLoading: true,
      });

      render(<TwoFactorSettings />);

      expect(screen.getByText("Verifying...")).toBeInTheDocument();
    });
  });

  describe("disable flow", () => {
    it("shows disable form when Disable 2FA is clicked", async () => {
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Disable 2FA"));

      expect(
        screen.getByText("Disable Two-Factor Authentication"),
      ).toBeInTheDocument();
      expect(screen.getByText("Password")).toBeInTheDocument();
      expect(
        screen.getByText("Authenticator Code (or Backup Code)"),
      ).toBeInTheDocument();
    });

    it("calls disable with password and code when form is submitted", async () => {
      mockDisable.mockResolvedValue(true);
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Disable 2FA"));

      // Get the inputs by their type/placeholder within the disable form
      const passwordInput = document.querySelector(
        'input[type="password"]',
      ) as HTMLInputElement;
      const codeInput = screen.getByPlaceholderText("000000 or XXXX-XXXX");

      await userEvent.type(passwordInput, "mypassword");
      await userEvent.type(codeInput, "123456");

      // Find the submit button within the disable form
      const disableButton = screen
        .getAllByText("Disable 2FA")
        .find(
          (el) =>
            el.tagName === "BUTTON" && el.getAttribute("type") === "submit",
        );

      if (disableButton) {
        await userEvent.click(disableButton);
      }

      expect(mockDisable).toHaveBeenCalledWith("mypassword", "123456");
    });

    it("hides disable form when Cancel is clicked", async () => {
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Disable 2FA"));

      expect(
        screen.getByText("Disable Two-Factor Authentication"),
      ).toBeInTheDocument();

      // Find the cancel button in the disable form
      const cancelButtons = screen.getAllByText("Cancel");
      await userEvent.click(cancelButtons[cancelButtons.length - 1]);

      expect(
        screen.queryByText("Disable Two-Factor Authentication"),
      ).not.toBeInTheDocument();
    });

    it("shows Disabling... when disableLoading is true", async () => {
      vi.mocked(use2FA).mockReturnValue({
        ...enabledMockHook,
        disableLoading: true,
      });

      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Disable 2FA"));

      expect(screen.getByText("Disabling...")).toBeInTheDocument();
    });
  });

  describe("regenerate backup codes flow", () => {
    it("shows regenerate form when Regenerate Codes is clicked", async () => {
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Regenerate Codes"));

      expect(screen.getByText("Regenerate Backup Codes")).toBeInTheDocument();
      expect(
        screen.getByText("Enter your authenticator code to confirm"),
      ).toBeInTheDocument();
    });

    it("calls regenerateBackupCodes when form is submitted", async () => {
      const newCodes = ["new1-code", "new2-code", "new3-code", "new4-code"];
      mockRegenerateBackupCodes.mockResolvedValue(newCodes);
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Regenerate Codes"));

      const input = screen.getByPlaceholderText("000000");
      await userEvent.type(input, "123456");

      const regenerateButton = screen
        .getAllByText("Regenerate Codes")
        .find(
          (el) =>
            el.tagName === "BUTTON" && el.getAttribute("type") === "submit",
        );

      if (regenerateButton) {
        await userEvent.click(regenerateButton);
      }

      expect(mockRegenerateBackupCodes).toHaveBeenCalledWith("123456");
    });

    it("hides regenerate form when Cancel is clicked", async () => {
      vi.mocked(use2FA).mockReturnValue(enabledMockHook);

      render(<TwoFactorSettings />);

      await userEvent.click(screen.getByText("Regenerate Codes"));

      expect(screen.getByText("Regenerate Backup Codes")).toBeInTheDocument();

      const cancelButtons = screen.getAllByText("Cancel");
      await userEvent.click(cancelButtons[cancelButtons.length - 1]);

      expect(
        screen.queryByText("Regenerate Backup Codes"),
      ).not.toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("displays error message when error is present", () => {
      vi.mocked(use2FA).mockReturnValue({
        ...defaultMockHook,
        error: "Failed to enable 2FA",
      });

      render(<TwoFactorSettings />);

      expect(screen.getByText("Failed to enable 2FA")).toBeInTheDocument();
    });
  });
});
