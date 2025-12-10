/**
 * Voice Settings Component
 * Configure voice input/output preferences
 */

import { useState } from "react";
import {
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@voiceassist/ui";

interface VoiceSettingsProps {
  onSettingsChange?: (settings: VoiceSettings) => void;
}

export interface VoiceSettings {
  voiceId?: string;
  speed: number; // 0.5 to 2.0
  volume: number; // 0 to 1
  autoPlay: boolean;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  voiceId: undefined,
  speed: 1.0,
  volume: 0.8,
  autoPlay: true,
};

export function VoiceSettingsComponent({
  onSettingsChange,
}: VoiceSettingsProps) {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);

  const updateSetting = <K extends keyof VoiceSettings>(
    key: K,
    value: VoiceSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Voice Speed */}
        <div className="space-y-2">
          <Label htmlFor="voice-speed">
            Speech Speed: {settings.speed.toFixed(1)}x
          </Label>
          <input
            id="voice-speed"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={settings.speed}
            onChange={(e) => updateSetting("speed", parseFloat(e.target.value))}
            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
            aria-label="Speech speed"
          />
          <div className="flex justify-between text-xs text-neutral-500">
            <span>0.5x (Slower)</span>
            <span>2.0x (Faster)</span>
          </div>
        </div>

        {/* Volume */}
        <div className="space-y-2">
          <Label htmlFor="voice-volume">
            Volume: {Math.round(settings.volume * 100)}%
          </Label>
          <input
            id="voice-volume"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.volume}
            onChange={(e) =>
              updateSetting("volume", parseFloat(e.target.value))
            }
            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
            aria-label="Volume"
          />
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Mute</span>
            <span>100%</span>
          </div>
        </div>

        {/* Auto-play */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label htmlFor="auto-play" className="font-medium">
              Auto-play Responses
            </Label>
            <p className="text-sm text-neutral-600 mt-1">
              Automatically play audio responses when received
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-4">
            <input
              id="auto-play"
              type="checkbox"
              checked={settings.autoPlay}
              onChange={(e) => updateSetting("autoPlay", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
          </label>
        </div>

        {/* Voice Selection (Future) */}
        <div className="space-y-2 opacity-50 pointer-events-none">
          <Label htmlFor="voice-id">Voice (Coming Soon)</Label>
          <select
            id="voice-id"
            disabled
            className="w-full px-3 py-2 border border-neutral-300 rounded-md bg-neutral-50 text-neutral-500"
          >
            <option>Default Voice</option>
          </select>
          <p className="text-xs text-neutral-500">
            Multiple voice options will be available in a future update
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
