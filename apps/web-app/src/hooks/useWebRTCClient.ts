import { useCallback, useEffect, useRef, useState } from "react";
import { captureVoiceError } from "../lib/sentry";
import { voiceLog } from "../lib/logger";

interface WebRTCOptions {
  sessionId: string;
  token?: string;
  onRemoteTrack?: (stream: MediaStream) => void;
}

export type WebRTCState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export function useWebRTCClient(options: WebRTCOptions) {
  const { sessionId, token, onRemoteTrack } = options;
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const [state, setState] = useState<WebRTCState>("idle");
  const [vadState, setVadState] = useState<"silence" | "speaking">("silence");
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);

  const teardown = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    analyserRef.current?.disconnect();
    peerRef.current?.close();
    peerRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setState("disconnected");
  }, []);

  const startVadLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const sourceStream = mediaStreamRef.current;
    if (!analyser || !sourceStream) return;

    const dataArray = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      const rms = Math.sqrt(
        dataArray.reduce((sum, value) => {
          const centered = value - 128;
          return sum + centered * centered;
        }, 0) / dataArray.length,
      );
      setVadState(rms > 8 ? "speaking" : "silence");
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
  }, []);

  const connect = useCallback(async () => {
    try {
      setState("connecting");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = media;
      setNoiseSuppressionEnabled(true);

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerRef.current = peer;

      // Attach tracks
      media.getTracks().forEach((track) => peer.addTrack(track, media));

      // Monitor remote track
      peer.ontrack = (event) => {
        if (event.streams?.[0] && onRemoteTrack) {
          onRemoteTrack(event.streams[0]);
        }
      };

      // ICE candidates -> backend
      peer.onicecandidate = async (evt) => {
        if (!evt.candidate) return;
        try {
          await fetch("/api/realtime/webrtc/candidate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              session_id: sessionId,
              candidate: evt.candidate.toJSON(),
            }),
          });
        } catch (err) {
          captureVoiceError(err);
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const response = await fetch("/api/realtime/webrtc/offer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ session_id: sessionId, sdp: offer.sdp }),
      });

      if (response.ok) {
        const payload = await response.json();
        if (payload.answer) {
          await peer.setRemoteDescription({ type: "answer", sdp: payload.answer });
        }
        voiceLog("webrtc:offer:ok", payload);
      }

      // Setup VAD visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(media);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      startVadLoop();

      setState("connected");
    } catch (error) {
      setState("failed");
      captureVoiceError(error);
    }
  }, [sessionId, startVadLoop, token, onRemoteTrack]);

  const bargeIn = useCallback(() => {
    voiceLog("webrtc:barge-in");
    teardown();
    void connect();
  }, [connect, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  return {
    state,
    vadState,
    noiseSuppressionEnabled,
    connect,
    disconnect: teardown,
    bargeIn,
  } as const;
}

