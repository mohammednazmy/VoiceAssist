/**
 * mapPipelineStateToVoiceState Helper Tests
 *
 * These tests cover the pure mapping logic from backend PipelineState
 * to the canonical VoiceState used by the unified conversation store.
 * Keeping this mapping tested separately avoids needing to render the
 * full useThinkerTalkerVoiceMode hook in Vitest.
 */

import { describe, it, expect } from "vitest";
import { mapPipelineStateToVoiceState } from "../useThinkerTalkerVoiceMode";

describe("mapPipelineStateToVoiceState", () => {
  it("maps listening/processing/speaking to corresponding voice states", () => {
    expect(mapPipelineStateToVoiceState("listening")).toBe("listening");
    expect(mapPipelineStateToVoiceState("processing")).toBe("processing");
    // speaking maps to responding in the unified state model
    expect(mapPipelineStateToVoiceState("speaking")).toBe("responding");
  });

  it("maps idle/cancelled to idle", () => {
    expect(mapPipelineStateToVoiceState("idle")).toBe("idle");
    expect(mapPipelineStateToVoiceState("cancelled")).toBe("idle");
  });

  it("maps error to error", () => {
    expect(mapPipelineStateToVoiceState("error")).toBe("error");
  });
});

