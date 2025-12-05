/**
 * Voice Mode Onboarding Tutorial Component
 *
 * Phase 3 Deliverable: Onboarding > Tutorial flow, tooltips
 *
 * Provides:
 * - Step-by-step voice mode tutorial
 * - Interactive tooltips
 * - Permission request guidance
 * - Voice mode feature highlights
 * - Progress tracking
 *
 * @example
 * ```tsx
 * <VoiceOnboardingTutorial
 *   onComplete={() => setShowTutorial(false)}
 *   onSkip={() => setShowTutorial(false)}
 * />
 * ```
 */

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  Keyboard,
  Settings,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  X,
  HelpCircle,
  Zap,
} from "lucide-react";

/**
 * Tutorial step definition
 */
interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: "request_mic" | "test_voice" | "none";
  highlight?: string; // CSS selector for element to highlight
  position?: "center" | "bottom" | "top";
}

/**
 * Props for VoiceOnboardingTutorial
 */
export interface VoiceOnboardingTutorialProps {
  /** Callback when tutorial is completed */
  onComplete: () => void;
  /** Callback when tutorial is skipped */
  onSkip: () => void;
  /** Whether to show the full tutorial or just tooltips */
  mode?: "full" | "tooltips";
  /** Starting step index */
  startStep?: number;
}

/**
 * Tutorial steps configuration
 */
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Voice Mode",
    description:
      "VoiceAssist lets you have natural conversations using your voice. This quick tutorial will show you how to get started.",
    icon: <Volume2 className="w-8 h-8" />,
    position: "center",
  },
  {
    id: "microphone",
    title: "Microphone Permission",
    description:
      "Voice mode requires access to your microphone. Your audio is processed securely and never stored without your consent.",
    icon: <Mic className="w-8 h-8" />,
    action: "request_mic",
    position: "center",
  },
  {
    id: "voice_modes",
    title: "Voice Input Modes",
    description:
      "Choose between Push-to-Talk (hold to speak) or Always-On mode (continuous listening). You can switch anytime.",
    icon: <Keyboard className="w-8 h-8" />,
    highlight: '[data-testid="voice-mode-tabs"]',
    position: "bottom",
  },
  {
    id: "push_to_talk",
    title: "Push-to-Talk",
    description:
      "Hold the spacebar or tap the microphone button to speak. Release when done. Great for noisy environments.",
    icon: <Mic className="w-8 h-8" />,
    position: "center",
  },
  {
    id: "always_on",
    title: "Always-On Mode",
    description:
      "In Always-On mode, just start speaking naturally. The system will automatically detect when you're done.",
    icon: <Zap className="w-8 h-8" />,
    position: "center",
  },
  {
    id: "thinking_feedback",
    title: "Thinking Feedback",
    description:
      "You'll hear gentle audio cues while the AI is processing your request. This can be customized in settings.",
    icon: <Volume2 className="w-8 h-8" />,
    position: "center",
  },
  {
    id: "settings",
    title: "Customize Your Experience",
    description:
      "Adjust voice sensitivity, choose your preferred language, and customize audio feedback in the settings.",
    icon: <Settings className="w-8 h-8" />,
    highlight: '[data-testid="settings-button"]',
    position: "bottom",
  },
  {
    id: "complete",
    title: "You're All Set!",
    description:
      'You\'re ready to start using voice mode. Try saying "Hello" to test it out. You can always access this tutorial from the help menu.',
    icon: <CheckCircle className="w-8 h-8 text-green-500" />,
    action: "test_voice",
    position: "center",
  },
];

/**
 * Combine class names
 */
function cn(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Progress indicator component
 */
function ProgressIndicator({
  steps,
  currentStep,
  onStepClick,
}: {
  steps: TutorialStep[];
  currentStep: number;
  onStepClick: (index: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, index) => (
        <button
          key={step.id}
          onClick={() => onStepClick(index)}
          disabled={index > currentStep}
          className={cn(
            "w-2.5 h-2.5 rounded-full transition-all duration-300",
            index === currentStep && "w-8 bg-primary-500",
            index < currentStep && "bg-primary-400",
            index > currentStep && "bg-neutral-300",
          )}
          aria-label={`Go to step ${index + 1}: ${step.title}`}
        />
      ))}
    </div>
  );
}

/**
 * Microphone permission request component
 */
function MicrophonePermissionRequest({
  onGranted,
  onDenied,
}: {
  onGranted: () => void;
  onDenied: () => void;
}) {
  const [status, setStatus] = useState<
    "idle" | "requesting" | "granted" | "denied"
  >("idle");

  const requestPermission = async () => {
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach((track) => track.stop());
      setStatus("granted");
      onGranted();
    } catch (error) {
      setStatus("denied");
      onDenied();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div
        className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center",
          status === "granted" && "bg-green-100",
          status === "denied" && "bg-red-100",
          status === "idle" && "bg-primary-100",
          status === "requesting" && "bg-yellow-100 animate-pulse",
        )}
      >
        {status === "granted" ? (
          <CheckCircle className="w-10 h-10 text-green-600" />
        ) : status === "denied" ? (
          <MicOff className="w-10 h-10 text-red-600" />
        ) : (
          <Mic className="w-10 h-10 text-primary-600" />
        )}
      </div>

      {status === "idle" && (
        <button
          onClick={requestPermission}
          className="px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
        >
          Allow Microphone Access
        </button>
      )}

      {status === "requesting" && (
        <p className="text-neutral-600">Requesting permission...</p>
      )}

      {status === "granted" && (
        <p className="text-green-600 font-medium">Microphone access granted!</p>
      )}

      {status === "denied" && (
        <div className="text-center">
          <p className="text-red-600 font-medium">Permission denied</p>
          <p className="text-sm text-neutral-500 mt-1">
            You can enable microphone access in your browser settings.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Voice test component
 */
function VoiceTestPrompt() {
  const [isListening, setIsListening] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <motion.button
        onClick={() => setIsListening(!isListening)}
        className={cn(
          "w-24 h-24 rounded-full flex items-center justify-center transition-colors",
          isListening
            ? "bg-red-500 text-white"
            : "bg-primary-100 text-primary-600 hover:bg-primary-200",
        )}
        whileTap={{ scale: 0.95 }}
        animate={isListening ? { scale: [1, 1.1, 1] } : {}}
        transition={{ repeat: isListening ? Infinity : 0, duration: 1.5 }}
      >
        <Mic className="w-12 h-12" />
      </motion.button>

      <p className="text-neutral-600">
        {isListening
          ? 'Listening... Say "Hello"'
          : "Tap to test your microphone"}
      </p>
    </div>
  );
}

/**
 * Voice Onboarding Tutorial Component
 */
export function VoiceOnboardingTutorial({
  onComplete,
  onSkip,
  mode = "full",
  startStep = 0,
}: VoiceOnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(startStep);
  const [micGranted, setMicGranted] = useState(false);

  const step = TUTORIAL_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSkip();
      } else if (e.key === "ArrowRight" && !isLastStep) {
        goToNextStep();
      } else if (e.key === "ArrowLeft" && !isFirstStep) {
        goToPreviousStep();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [currentStep, isFirstStep, isLastStep]);

  const goToNextStep = useCallback(() => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  }, [currentStep, onComplete]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const handleStepClick = useCallback(
    (index: number) => {
      if (index <= currentStep) {
        setCurrentStep(index);
      }
    },
    [currentStep],
  );

  // Store completion in localStorage
  useEffect(() => {
    if (isLastStep && micGranted) {
      localStorage.setItem("voice_tutorial_completed", "true");
    }
  }, [isLastStep, micGranted]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="tutorial-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
      >
        <motion.div
          key={step.id}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={onSkip}
            className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label="Skip tutorial"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="p-8">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center text-primary-600">
                {step.icon}
              </div>
            </div>

            {/* Title */}
            <h2
              id="tutorial-title"
              className="text-2xl font-semibold text-center text-neutral-900 mb-3"
            >
              {step.title}
            </h2>

            {/* Description */}
            <p className="text-center text-neutral-600 mb-6 leading-relaxed">
              {step.description}
            </p>

            {/* Action content */}
            {step.action === "request_mic" && (
              <MicrophonePermissionRequest
                onGranted={() => {
                  setMicGranted(true);
                  // Auto-advance after short delay
                  setTimeout(goToNextStep, 1000);
                }}
                onDenied={() => {
                  // Allow continuing even without mic permission
                }}
              />
            )}

            {step.action === "test_voice" && <VoiceTestPrompt />}

            {/* Progress */}
            <div className="mt-6">
              <ProgressIndicator
                steps={TUTORIAL_STEPS}
                currentStep={currentStep}
                onStepClick={handleStepClick}
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between px-8 py-4 bg-neutral-50 border-t border-neutral-100">
            <button
              onClick={goToPreviousStep}
              disabled={isFirstStep}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                isFirstStep
                  ? "text-neutral-300 cursor-not-allowed"
                  : "text-neutral-600 hover:bg-neutral-200",
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <span className="text-sm text-neutral-500">
              {currentStep + 1} of {TUTORIAL_STEPS.length}
            </span>

            <button
              onClick={isLastStep ? onComplete : goToNextStep}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              {isLastStep ? "Get Started" : "Next"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Tooltip component for highlighting specific features
 */
export interface VoiceTooltipProps {
  /** Target element selector */
  target: string;
  /** Tooltip title */
  title: string;
  /** Tooltip description */
  description: string;
  /** Position relative to target */
  position?: "top" | "bottom" | "left" | "right";
  /** Whether the tooltip is visible */
  isVisible: boolean;
  /** Callback when tooltip is dismissed */
  onDismiss: () => void;
}

/**
 * Voice Tooltip Component
 */
export function VoiceTooltip({
  target,
  title,
  description,
  position = "bottom",
  isVisible,
  onDismiss,
}: VoiceTooltipProps) {
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isVisible) return;

    const element = document.querySelector(target);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const offset = 12;

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = rect.top - offset;
        left = rect.left + rect.width / 2;
        break;
      case "bottom":
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2;
        left = rect.left - offset;
        break;
      case "right":
        top = rect.top + rect.height / 2;
        left = rect.right + offset;
        break;
    }

    setCoords({ top, left });
  }, [target, position, isVisible]);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed z-50 max-w-xs bg-neutral-900 text-white rounded-lg shadow-xl p-4"
      style={{
        top: coords.top,
        left: coords.left,
        transform:
          position === "bottom" || position === "top"
            ? "translateX(-50%)"
            : "translateY(-50%)",
      }}
    >
      <div className="flex items-start gap-3">
        <HelpCircle className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium mb-1">{title}</h4>
          <p className="text-sm text-neutral-300">{description}</p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 hover:bg-neutral-700 rounded transition-colors"
          aria-label="Dismiss tooltip"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Check if user has completed the tutorial
 */
export function hasCompletedVoiceTutorial(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem("voice_tutorial_completed") === "true";
}

/**
 * Reset tutorial completion status
 */
export function resetVoiceTutorial(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem("voice_tutorial_completed");
}

export default VoiceOnboardingTutorial;
