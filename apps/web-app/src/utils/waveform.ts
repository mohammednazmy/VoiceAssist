/**
 * Audio Waveform Visualization Utility
 * Renders real-time waveform visualization for voice input
 */

export interface WaveformConfig {
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** Waveform color */
  color: string;
  /** Background color */
  backgroundColor: string;
  /** Line width */
  lineWidth: number;
  /** FFT size for frequency analysis */
  fftSize: number;
  /** Smoothing time constant (0-1) */
  smoothingTimeConstant: number;
}

export const DEFAULT_WAVEFORM_CONFIG: WaveformConfig = {
  width: 600,
  height: 100,
  color: "#3b82f6", // Primary blue
  backgroundColor: "#f8fafc", // Neutral 50
  lineWidth: 2,
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
};

export class WaveformVisualizer {
  private canvas: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D;
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private dataArray: Uint8Array<ArrayBuffer>;
  private config: WaveformConfig;
  private rafId: number | null = null;
  private isActive: boolean = false;

  constructor(canvas: HTMLCanvasElement, config: Partial<WaveformConfig> = {}) {
    this.canvas = canvas;
    this.config = { ...DEFAULT_WAVEFORM_CONFIG, ...config };

    // Set canvas size
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;

    // Get 2D context
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }
    this.canvasCtx = ctx;

    // Create audio context and analyser
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.config.fftSize;
    this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;

    // Create data array for time domain data
    this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

    // Initialize canvas
    this.clearCanvas();
  }

  /**
   * Connect waveform to an audio stream
   */
  async connect(stream: MediaStream): Promise<void> {
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);
    this.isActive = true;
    this.startVisualization();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.isActive = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.audioContext.state !== "closed") {
      this.audioContext.close();
    }

    this.clearCanvas();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WaveformConfig>): void {
    this.config = { ...this.config, ...config };

    // Update canvas size if changed
    if (config.width !== undefined || config.height !== undefined) {
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;
    }

    // Update analyser if relevant config changed
    if (config.fftSize !== undefined) {
      this.analyser.fftSize = this.config.fftSize;
      this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    }

    if (config.smoothingTimeConstant !== undefined) {
      this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;
    }
  }

  /**
   * Start visualization loop
   */
  private startVisualization(): void {
    const draw = () => {
      if (!this.isActive) return;

      // Get time domain data (waveform)
      this.analyser.getByteTimeDomainData(this.dataArray);

      // Clear canvas
      this.clearCanvas();

      // Draw waveform
      this.drawWaveform();

      // Continue animation loop
      this.rafId = requestAnimationFrame(draw);
    };

    draw();
  }

  /**
   * Draw waveform on canvas
   */
  private drawWaveform(): void {
    const { width, height, color, lineWidth } = this.config;
    const bufferLength = this.dataArray.length;
    const sliceWidth = width / bufferLength;

    this.canvasCtx.lineWidth = lineWidth;
    this.canvasCtx.strokeStyle = color;
    this.canvasCtx.beginPath();

    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = this.dataArray[i] / 255.0; // Normalize to 0-1
      const y = v * height;

      if (i === 0) {
        this.canvasCtx.moveTo(x, y);
      } else {
        this.canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    this.canvasCtx.lineTo(width, height / 2);
    this.canvasCtx.stroke();
  }

  /**
   * Clear canvas with background color
   */
  private clearCanvas(): void {
    this.canvasCtx.fillStyle = this.config.backgroundColor;
    this.canvasCtx.fillRect(0, 0, this.config.width, this.config.height);
  }

  /**
   * Draw a static "idle" waveform (flat line)
   */
  drawIdle(): void {
    this.clearCanvas();

    const { width, height, color, lineWidth } = this.config;

    this.canvasCtx.lineWidth = lineWidth;
    this.canvasCtx.strokeStyle = color;
    this.canvasCtx.globalAlpha = 0.3; // Make it semi-transparent
    this.canvasCtx.beginPath();
    this.canvasCtx.moveTo(0, height / 2);
    this.canvasCtx.lineTo(width, height / 2);
    this.canvasCtx.stroke();
    this.canvasCtx.globalAlpha = 1.0;
  }

  /**
   * Draw frequency bars instead of waveform
   */
  drawFrequencyBars(): void {
    const { width, height, color } = this.config;

    // Get frequency data
    const bufferLength = this.analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(freqData);

    // Clear canvas
    this.clearCanvas();

    // Draw bars
    const barWidth = width / bufferLength;
    let x = 0;

    this.canvasCtx.fillStyle = color;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (freqData[i] / 255) * height;
      this.canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth;
    }
  }

  /**
   * Get current energy level (0-1)
   */
  getEnergyLevel(): number {
    // Calculate RMS energy from time domain data
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128; // Normalize to -1 to 1
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / this.dataArray.length);
  }
}

/**
 * Create a simple bar visualization for energy level
 */
export function drawEnergyBar(
  canvas: HTMLCanvasElement,
  energy: number,
  color = "#10b981", // Green
  backgroundColor = "#f3f4f6", // Gray-100
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;

  // Clear canvas
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Draw energy bar
  const barWidth = width * Math.min(energy, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, barWidth, height);

  // Draw border
  ctx.strokeStyle = "#d1d5db"; // Gray-300
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);
}

/**
 * Circular waveform visualization
 */
export class CircularWaveformVisualizer {
  private canvas: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D;
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private dataArray: Uint8Array<ArrayBuffer>;
  private rafId: number | null = null;
  private isActive: boolean = false;
  private radius: number;
  private centerX: number;
  private centerY: number;

  constructor(canvas: HTMLCanvasElement, radius = 40) {
    this.canvas = canvas;
    this.radius = radius;
    this.centerX = canvas.width / 2;
    this.centerY = canvas.height / 2;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context");
    }
    this.canvasCtx = ctx;

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.dataArray = new Uint8Array(
      new ArrayBuffer(this.analyser.frequencyBinCount),
    );
  }

  async connect(stream: MediaStream): Promise<void> {
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);
    this.isActive = true;
    this.startVisualization();
  }

  disconnect(): void {
    this.isActive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    if (this.audioContext.state !== "closed") {
      this.audioContext.close();
    }
  }

  private startVisualization(): void {
    const draw = () => {
      if (!this.isActive) return;

      this.analyser.getByteFrequencyData(this.dataArray);

      // Clear canvas
      this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw circular bars
      const barCount = 60;
      const angleStep = (Math.PI * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        const angle = angleStep * i - Math.PI / 2; // Start from top
        const dataIndex = Math.floor((i / barCount) * this.dataArray.length);
        const amplitude = this.dataArray[dataIndex] / 255;
        const barHeight = amplitude * 30; // Max bar height

        const x1 = this.centerX + Math.cos(angle) * this.radius;
        const y1 = this.centerY + Math.sin(angle) * this.radius;
        const x2 = this.centerX + Math.cos(angle) * (this.radius + barHeight);
        const y2 = this.centerY + Math.sin(angle) * (this.radius + barHeight);

        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(x1, y1);
        this.canvasCtx.lineTo(x2, y2);
        this.canvasCtx.strokeStyle = `hsl(${200 + amplitude * 60}, 70%, 50%)`;
        this.canvasCtx.lineWidth = 3;
        this.canvasCtx.stroke();
      }

      this.rafId = requestAnimationFrame(draw);
    };

    draw();
  }
}
