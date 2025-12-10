/**
 * Console Logger Fixture for Playwright Tests
 *
 * This fixture automatically captures all browser console output during tests
 * and saves it to a file for debugging. It also prints important logs to the
 * terminal in real-time.
 *
 * Usage:
 *   import { test } from '../fixtures/console-logger';
 *   // OR merge with existing fixtures
 *
 * The logs are saved to: test-results/console-logs/<test-name>.log
 */

import { test as base, Page, ConsoleMessage } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

export interface ConsoleLogEntry {
  timestamp: string;
  type: string;
  text: string;
  location?: string;
  args?: string[];
}

export interface ConsoleLoggerOptions {
  /** Print all console logs to terminal (default: false, only errors/warnings) */
  verbose?: boolean;
  /** Filter logs by type (default: all) */
  types?: ("log" | "warn" | "error" | "info" | "debug")[];
  /** Filter logs containing these strings */
  includePatterns?: string[];
  /** Exclude logs containing these strings */
  excludePatterns?: string[];
  /** Save logs to file (default: true) */
  saveToFile?: boolean;
}

const DEFAULT_OPTIONS: ConsoleLoggerOptions = {
  verbose: false,
  types: ["log", "warn", "error", "info", "debug"],
  saveToFile: true,
  excludePatterns: [
    // Common noisy logs to exclude by default
    "[HMR]",
    "[vite]",
    "Download the React DevTools",
  ],
};

/**
 * Attaches console logging to a page.
 * Returns a function to get all captured logs.
 */
export function attachConsoleLogger(
  page: Page,
  testName: string,
  options: ConsoleLoggerOptions = {}
): {
  getLogs: () => ConsoleLogEntry[];
  saveLogs: () => string;
  printSummary: () => void;
} {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logs: ConsoleLogEntry[] = [];

  // Ensure log directory exists
  const logDir = path.join(process.cwd(), "test-results", "console-logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Console message handler
  const handleConsole = async (msg: ConsoleMessage) => {
    const type = msg.type();

    // Filter by type
    if (opts.types && !opts.types.includes(type as any)) {
      return;
    }

    const text = msg.text();

    // Apply exclude patterns
    if (opts.excludePatterns?.some((pattern) => text.includes(pattern))) {
      return;
    }

    // Apply include patterns if specified
    if (
      opts.includePatterns &&
      opts.includePatterns.length > 0 &&
      !opts.includePatterns.some((pattern) => text.includes(pattern))
    ) {
      return;
    }

    // Get location info
    const location = msg.location();
    const locationStr = location
      ? `${location.url}:${location.lineNumber}:${location.columnNumber}`
      : undefined;

    // Get args (limited to prevent huge logs)
    let argsStr: string[] | undefined;
    try {
      const args = msg.args();
      if (args.length > 0) {
        argsStr = await Promise.all(
          args.slice(0, 5).map(async (arg) => {
            try {
              const val = await arg.jsonValue();
              return JSON.stringify(val).substring(0, 500);
            } catch {
              return "[unserializable]";
            }
          })
        );
      }
    } catch {
      // Ignore serialization errors
    }

    const entry: ConsoleLogEntry = {
      timestamp: new Date().toISOString(),
      type,
      text: text.substring(0, 2000), // Limit text length
      location: locationStr,
      args: argsStr,
    };

    logs.push(entry);

    // Print to terminal based on verbosity
    const shouldPrint =
      opts.verbose || type === "error" || type === "warn" || text.includes("[Test]") || text.includes("[Voice]");

    if (shouldPrint) {
      const prefix = getLogPrefix(type);
      const truncatedText = text.length > 200 ? text.substring(0, 200) + "..." : text;
      console.log(`${prefix} ${truncatedText}`);
    }
  };

  // Page error handler (uncaught exceptions)
  const handlePageError = (error: Error) => {
    const entry: ConsoleLogEntry = {
      timestamp: new Date().toISOString(),
      type: "page-error",
      text: `UNCAUGHT: ${error.message}\n${error.stack || ""}`,
    };
    logs.push(entry);
    console.log(`\x1b[31m[PAGE ERROR]\x1b[0m ${error.message}`);
  };

  // Attach handlers
  page.on("console", handleConsole);
  page.on("pageerror", handlePageError);

  return {
    getLogs: () => logs,

    saveLogs: () => {
      if (!opts.saveToFile) return "";

      const sanitizedName = testName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${sanitizedName}-${timestamp}.log`;
      const filepath = path.join(logDir, filename);

      // Format logs
      const content = logs
        .map((log) => {
          let line = `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.text}`;
          if (log.location) {
            line += `\n  at ${log.location}`;
          }
          if (log.args && log.args.length > 0) {
            line += `\n  args: ${log.args.join(", ")}`;
          }
          return line;
        })
        .join("\n\n");

      fs.writeFileSync(filepath, content);
      console.log(`\x1b[36m[Console logs saved to: ${filepath}]\x1b[0m`);

      return filepath;
    },

    printSummary: () => {
      const errorCount = logs.filter((l) => l.type === "error" || l.type === "page-error").length;
      const warnCount = logs.filter((l) => l.type === "warn").length;
      const totalCount = logs.length;

      console.log("\n--- Console Log Summary ---");
      console.log(`Total: ${totalCount} | Errors: ${errorCount} | Warnings: ${warnCount}`);

      if (errorCount > 0) {
        console.log("\x1b[31mErrors found:\x1b[0m");
        logs
          .filter((l) => l.type === "error" || l.type === "page-error")
          .forEach((l) => {
            console.log(`  - ${l.text.substring(0, 100)}...`);
          });
      }
    },
  };
}

function getLogPrefix(type: string): string {
  switch (type) {
    case "error":
    case "page-error":
      return "\x1b[31m[ERROR]\x1b[0m";
    case "warn":
      return "\x1b[33m[WARN]\x1b[0m";
    case "info":
      return "\x1b[36m[INFO]\x1b[0m";
    case "debug":
      return "\x1b[90m[DEBUG]\x1b[0m";
    default:
      return "\x1b[37m[LOG]\x1b[0m";
  }
}

/**
 * Extended test fixture with console logging
 */
export const test = base.extend<{
  consoleLogger: ReturnType<typeof attachConsoleLogger>;
}>({
  consoleLogger: async ({ page }, use, testInfo) => {
    const logger = attachConsoleLogger(page, testInfo.title, {
      verbose: process.env.VERBOSE_CONSOLE === "1",
      saveToFile: true,
    });

    await use(logger);

    // After test: save logs and print summary
    logger.saveLogs();

    // Only print summary if test failed or verbose mode
    if (testInfo.status !== "passed" || process.env.VERBOSE_CONSOLE === "1") {
      logger.printSummary();
    }
  },
});

export { expect } from "@playwright/test";
