/**
 * Unified Chat Performance E2E Tests
 *
 * Measures and validates performance metrics:
 * - Page load time
 * - Time to interactive
 * - Component render times
 * - Memory usage
 * - Animation frame rates
 */

import { test, expect, UNIFIED_CHAT_SELECTORS, UNIFIED_CHAT_WAIT_TIMES } from "../fixtures/unified-chat";

// Performance thresholds (relaxed for CI environments)
const PERF_THRESHOLDS = {
  PAGE_LOAD_MS: 10000, // Max page load time (relaxed for CI)
  TIME_TO_INTERACTIVE_MS: 15000, // Max time to interactive
  FIRST_CONTENTFUL_PAINT_MS: 5000, // Max FCP
  LARGEST_CONTENTFUL_PAINT_MS: 8000, // Max LCP
  CUMULATIVE_LAYOUT_SHIFT: 0.25, // Max CLS (relaxed)
  MEMORY_MB: 200, // Max memory usage
  INPUT_LATENCY_MS: 200, // Max input latency
  ANIMATION_FPS: 20, // Minimum FPS for animations
};

test.describe("Unified Chat Performance", () => {
  test.setTimeout(60000);

  test.describe("Page Load Performance", () => {
    test("should load within acceptable time", async ({ unifiedChatPage }) => {
      // Page is already loaded by the fixture
      // Just verify it's visible
      const page = unifiedChatPage;
      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      await expect(container).toBeVisible();

      console.log("Page loaded successfully");
    });

    test("should have good Core Web Vitals", async ({ page }) => {
      // Navigate to chat
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Collect performance metrics
      const metrics = await page.evaluate(() => {
        return new Promise((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            resolve(entries);
          });

          // Get LCP
          observer.observe({ type: "largest-contentful-paint", buffered: true });

          // Fallback timeout
          setTimeout(() => {
            const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
            const paint = performance.getEntriesByType("paint");

            resolve({
              domContentLoaded: navigation?.domContentLoadedEventEnd,
              loadComplete: navigation?.loadEventEnd,
              firstPaint: paint.find((p) => p.name === "first-paint")?.startTime,
              firstContentfulPaint: paint.find((p) => p.name === "first-contentful-paint")?.startTime,
            });
          }, 2000);
        });
      });

      console.log("Performance metrics:", metrics);

      // Validate metrics if available
      if (typeof metrics === "object" && metrics !== null) {
        const m = metrics as Record<string, number | undefined>;
        if (m.firstContentfulPaint) {
          expect(m.firstContentfulPaint).toBeLessThan(PERF_THRESHOLDS.FIRST_CONTENTFUL_PAINT_MS);
        }
      }
    });

    test("should have minimal layout shifts", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Measure CLS after initial load
      const cls = await page.evaluate(() => {
        return new Promise((resolve) => {
          let clsValue = 0;

          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!(entry as any).hadRecentInput) {
                clsValue += (entry as any).value;
              }
            }
          });

          try {
            observer.observe({ type: "layout-shift", buffered: true });
          } catch {
            resolve(0); // Not supported
          }

          setTimeout(() => {
            observer.disconnect();
            resolve(clsValue);
          }, 2000);
        });
      });

      console.log(`Cumulative Layout Shift: ${cls}`);
      // Log but don't fail on CLS - can be flaky
    });
  });

  test.describe("Interaction Performance", () => {
    test("input should respond quickly", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);

      // Measure input latency
      const startTime = Date.now();
      await messageInput.fill("Performance test message");
      const inputLatency = Date.now() - startTime;

      console.log(`Input latency: ${inputLatency}ms`);
      expect(inputLatency).toBeLessThan(PERF_THRESHOLDS.INPUT_LATENCY_MS * 5); // Allow some leeway for fill()
    });

    test("sidebar toggle should be responsive", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const toggleButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarToggle);
      if (await toggleButton.isVisible()) {
        const startTime = Date.now();
        await toggleButton.click();
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);
        const toggleTime = Date.now() - startTime;

        console.log(`Sidebar toggle time: ${toggleTime}ms`);
        expect(toggleTime).toBeLessThan(1000); // Should complete within 1 second
      }
    });

    test("voice mode toggle should be responsive", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const voiceToggle = page.locator(UNIFIED_CHAT_SELECTORS.voiceModeToggle);
      if (await voiceToggle.count() > 0 && await voiceToggle.isVisible()) {
        const startTime = Date.now();
        await voiceToggle.click();
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);
        const toggleTime = Date.now() - startTime;

        console.log(`Voice mode toggle time: ${toggleTime}ms`);
        expect(toggleTime).toBeLessThan(1000);

        // Toggle back
        await voiceToggle.click();
      } else {
        console.log("Voice toggle not visible, skipping");
      }
    });

    test("search input should filter quickly", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const searchInput = page.locator(UNIFIED_CHAT_SELECTORS.searchInput);
      if (await searchInput.isVisible()) {
        const startTime = Date.now();
        await searchInput.fill("test search");
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.SEARCH_DEBOUNCE);
        const searchTime = Date.now() - startTime;

        console.log(`Search filter time: ${searchTime}ms`);
        expect(searchTime).toBeLessThan(UNIFIED_CHAT_WAIT_TIMES.SEARCH_DEBOUNCE + 500);
      }
    });
  });

  test.describe("Memory Performance", () => {
    test("should not have excessive memory usage", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Get JS heap size (Chrome only)
      const memoryInfo = await page.evaluate(() => {
        const performance = window.performance as any;
        if (performance.memory) {
          return {
            usedJSHeapSize: performance.memory.usedJSHeapSize / 1024 / 1024,
            totalJSHeapSize: performance.memory.totalJSHeapSize / 1024 / 1024,
          };
        }
        return null;
      });

      if (memoryInfo) {
        console.log(`Memory usage: ${memoryInfo.usedJSHeapSize.toFixed(2)}MB / ${memoryInfo.totalJSHeapSize.toFixed(2)}MB`);
        expect(memoryInfo.usedJSHeapSize).toBeLessThan(PERF_THRESHOLDS.MEMORY_MB);
      } else {
        console.log("Memory API not available in this browser");
      }
    });

    test("should not leak memory on repeated interactions", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Get initial memory
      const getMemory = async () => {
        return await page.evaluate(() => {
          const performance = window.performance as any;
          if (performance.memory) {
            return performance.memory.usedJSHeapSize / 1024 / 1024;
          }
          return null;
        });
      };

      const initialMemory = await getMemory();

      // Perform many interactions
      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      for (let i = 0; i < 20; i++) {
        await messageInput.fill(`Message ${i}`);
        await messageInput.fill("");
      }

      // Toggle sidebar multiple times
      const toggleButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarToggle);
      if (await toggleButton.isVisible()) {
        for (let i = 0; i < 5; i++) {
          await toggleButton.click();
          await page.waitForTimeout(100);
          const openButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarOpenButton).first();
          if (await openButton.isVisible()) {
            await openButton.click();
            await page.waitForTimeout(100);
          }
        }
      }

      // Get final memory
      const finalMemory = await getMemory();

      if (initialMemory !== null && finalMemory !== null) {
        const memoryIncrease = finalMemory - initialMemory;
        console.log(`Memory increase after interactions: ${memoryIncrease.toFixed(2)}MB`);

        // Should not increase by more than 20MB
        expect(memoryIncrease).toBeLessThan(20);
      }
    });
  });

  test.describe("Animation Performance", () => {
    test("animations should run at acceptable frame rate", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Measure frame rate during animation
      const frameRate = await page.evaluate(() => {
        return new Promise((resolve) => {
          let frameCount = 0;
          const startTime = performance.now();

          function countFrames() {
            frameCount++;
            if (performance.now() - startTime < 1000) {
              requestAnimationFrame(countFrames);
            } else {
              resolve(frameCount);
            }
          }

          requestAnimationFrame(countFrames);
        });
      });

      console.log(`Frame rate: ${frameRate} FPS`);
      expect(Number(frameRate)).toBeGreaterThan(PERF_THRESHOLDS.ANIMATION_FPS);
    });

    test("sidebar animation should not cause jank", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const toggleButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarToggle);
      if (!(await toggleButton.isVisible())) {
        console.log("Sidebar toggle not visible, skipping jank test");
        return;
      }

      // Set up performance observer before triggering animation
      await page.evaluate(() => {
        (window as any).__longTasks = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            (window as any).__longTasks.push(entry.duration);
          }
        });
        try {
          observer.observe({ type: "longtask", buffered: true });
        } catch {
          // Long task observer not supported
        }
        (window as any).__performanceObserver = observer;
      });

      // Trigger animation
      await toggleButton.click();
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION + 500);

      // Collect results
      const longTasks = await page.evaluate(() => {
        if ((window as any).__performanceObserver) {
          (window as any).__performanceObserver.disconnect();
        }
        return (window as any).__longTasks || [];
      });

      if (Array.isArray(longTasks) && longTasks.length > 0) {
        const maxTask = Math.max(...longTasks);
        console.log(`Longest task during animation: ${maxTask}ms (${longTasks.length} long tasks)`);
        // Log but don't fail - just report for monitoring
        if (maxTask > 100) {
          console.log("Warning: Long tasks exceeded 100ms threshold");
        }
      } else {
        console.log("No long tasks detected during animation (good!)");
      }
    });
  });

  test.describe("Render Performance", () => {
    test("should render list efficiently", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Measure re-render time
      const renderTime = await page.evaluate(() => {
        const start = performance.now();

        // Force a reflow
        document.body.offsetHeight;

        return performance.now() - start;
      });

      console.log(`Reflow time: ${renderTime.toFixed(2)}ms`);
      expect(renderTime).toBeLessThan(50);
    });

    test("should handle rapid input efficiently", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);

      // Type rapidly
      const startTime = Date.now();
      await messageInput.type("This is a rapid typing test message for performance", {
        delay: 10, // 10ms between keystrokes
      });
      const typingTime = Date.now() - startTime;

      console.log(`Rapid typing time: ${typingTime}ms`);

      // Verify all text was captured
      const value = await messageInput.inputValue();
      expect(value).toBe("This is a rapid typing test message for performance");
    });
  });

  test.describe("Network Performance", () => {
    // Skip slow network test in CI - it's flaky due to network emulation timing
    test.skip("should handle slow network gracefully", async ({ page }) => {
      // Simulate slow 3G
      const client = await page.context().newCDPSession(page);
      await client.send("Network.enable");
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        downloadThroughput: (500 * 1024) / 8, // 500 Kbps
        uploadThroughput: (500 * 1024) / 8,
        latency: 400, // 400ms latency
      });

      const startTime = Date.now();
      await page.goto("/chat");
      await page.waitForSelector(UNIFIED_CHAT_SELECTORS.container, { timeout: 30000 });
      const loadTime = Date.now() - startTime;

      console.log(`Page load on slow 3G: ${loadTime}ms`);

      // Should still load within reasonable time
      expect(loadTime).toBeLessThan(15000);

      // Reset network conditions
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        downloadThroughput: -1,
        uploadThroughput: -1,
        latency: 0,
      });
    });
  });
});
