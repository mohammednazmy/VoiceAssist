/**
 * Calibration Dialog Component
 *
 * Provides a step-by-step guided calibration process for personalizing
 * voice activity detection thresholds to the user's voice characteristics.
 *
 * Phase 8: Adaptive Personalization UI
 */

import { useState, useCallback, useEffect } from "react";
import { usePersonalization } from "../../hooks/usePersonalization";
import { useVoiceSettingsStore } from "../../stores/voiceSettingsStore";

export interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (result: { vadThreshold: number; success: boolean }) => void;
}

type CalibrationStep = "intro" | "calibrating" | "complete" | "error";

export function CalibrationDialog({
  isOpen,
  onClose,
  onComplete,
}: CalibrationDialogProps) {
  const [step, setStep] = useState<CalibrationStep>("intro");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    setVadCalibrated,
    setLastCalibrationDate,
    setPersonalizedVadThreshold,
  } = useVoiceSettingsStore();

  const personalization = usePersonalization({
    onCalibrationProgress: (calibrationProgress) => {
      // progress is 0-100
      setProgress(calibrationProgress.progress);
    },
    onCalibrationComplete: (result) => {
      // If we get a result, calibration was successful
      setStep("complete");
      // Update store with calibration results
      setVadCalibrated(true);
      setLastCalibrationDate(Date.now());
      setPersonalizedVadThreshold(result.recommendedVadThreshold);
      onComplete?.({
        vadThreshold: result.recommendedVadThreshold,
        success: true,
      });
    },
  });

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep("intro");
      setProgress(0);
      setErrorMessage(null);
    }
  }, [isOpen]);

  const handleStartCalibration = useCallback(async () => {
    setStep("calibrating");
    setProgress(0);
    setErrorMessage(null);

    try {
      await personalization.runCalibration();
    } catch (error) {
      setStep("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Calibration failed",
      );
    }
  }, [personalization]);

  const handleCancel = useCallback(() => {
    if (step === "calibrating") {
      personalization.cancelCalibration();
    }
    onClose();
  }, [step, personalization, onClose]);

  const handleRetry = useCallback(() => {
    setStep("intro");
    setProgress(0);
    setErrorMessage(null);
  }, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calibration-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
          <h2
            id="calibration-title"
            className="text-xl font-semibold text-white flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
            Voice Calibration
          </h2>
          <p className="text-primary-100 text-sm mt-1">
            Optimize voice detection for your unique voice
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {step === "intro" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                  />
                </svg>
                <div>
                  <h3 className="font-medium text-blue-900">
                    What is calibration?
                  </h3>
                  <p className="text-sm text-blue-800 mt-1">
                    Calibration analyzes your voice characteristics to
                    personalize voice activity detection. This helps us better
                    recognize when you're speaking vs background noise.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-neutral-800">
                  Before you begin:
                </h4>
                <ul className="space-y-2 text-sm text-neutral-600">
                  <li className="flex items-start gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    Find a quiet environment with minimal background noise
                  </li>
                  <li className="flex items-start gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    Position your microphone at your normal speaking distance
                  </li>
                  <li className="flex items-start gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    Speak at your normal volume and pace
                  </li>
                </ul>
              </div>

              <p className="text-sm text-neutral-500">
                The process takes about 30 seconds and will ask you to speak a
                few sample phrases.
              </p>
            </div>
          )}

          {step === "calibrating" && (
            <div className="space-y-6 py-4">
              <div className="flex flex-col items-center">
                {/* Animated microphone */}
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-12 h-12 text-primary-600 animate-pulse"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                      />
                    </svg>
                  </div>
                  {/* Pulse rings */}
                  <div className="absolute inset-0 rounded-full border-2 border-primary-300 animate-ping opacity-30" />
                  <div
                    className="absolute inset-0 rounded-full border-2 border-primary-300 animate-ping opacity-20"
                    style={{ animationDelay: "0.5s" }}
                  />
                </div>

                <p className="text-lg font-medium text-neutral-800 mt-6">
                  Listening to your voice...
                </p>
                <p className="text-sm text-neutral-500 mt-1">
                  Please speak naturally as if in a conversation
                </p>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-600">Progress</span>
                  <span className="font-medium text-primary-600">
                    {progress}%
                  </span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-sm text-amber-800 text-center">
                  Try saying: "Hello, how are you today?" or count from 1 to 10
                </p>
              </div>
            </div>
          )}

          {step === "complete" && (
            <div className="space-y-4 py-4 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-10 h-10 text-green-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-neutral-900">
                  Calibration Complete!
                </h3>
                <p className="text-neutral-600 mt-2">
                  Your voice settings have been personalized for optimal
                  detection.
                </p>
              </div>

              <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-left">
                <h4 className="font-medium text-green-900 mb-2">
                  What's improved:
                </h4>
                <ul className="space-y-1 text-sm text-green-800">
                  <li>• Better voice activity detection tuned to your voice</li>
                  <li>• Reduced false activations from background noise</li>
                  <li>• More natural conversation flow during voice mode</li>
                </ul>
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-4 py-4 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-10 h-10 text-red-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-neutral-900">
                  Calibration Failed
                </h3>
                <p className="text-neutral-600 mt-2">
                  {errorMessage ||
                    "Something went wrong during calibration. Please try again."}
                </p>
              </div>

              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-left">
                <h4 className="font-medium text-neutral-800 mb-2">
                  Troubleshooting tips:
                </h4>
                <ul className="space-y-1 text-sm text-neutral-600">
                  <li>• Check that your microphone is working properly</li>
                  <li>• Make sure you have granted microphone permission</li>
                  <li>• Try moving to a quieter environment</li>
                  <li>• Speak clearly and at a consistent volume</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-between">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors"
          >
            {step === "complete" ? "Close" : "Cancel"}
          </button>

          {step === "intro" && (
            <button
              type="button"
              onClick={handleStartCalibration}
              className="px-6 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                />
              </svg>
              Start Calibration
            </button>
          )}

          {step === "error" && (
            <button
              type="button"
              onClick={handleRetry}
              className="px-6 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
            >
              Try Again
            </button>
          )}

          {step === "complete" && (
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CalibrationDialog;
