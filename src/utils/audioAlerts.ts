/**
 * Authentic Bike Computer Beeper / Buzzer using Web Audio API
 */
class BikeBeeper {
  private audioCtx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
  }

  /**
   * Short crisp beep for button clicks / page turn
   */
  public beep(frequency = 2400, duration = 0.08) {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'square'; // Classic digital piezo buzzer timbre
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Two-tone chirp for Climb Approaching or Starting
   */
  public climbAlert() {
    if (!this.enabled) return;
    this.beep(2000, 0.07);
    setTimeout(() => this.beep(2600, 0.1), 100);
  }

  /**
   * Victory chime for reaching climb summit
   */
  public summitChime() {
    if (!this.enabled) return;
    this.beep(1800, 0.08);
    setTimeout(() => this.beep(2400, 0.08), 120);
    setTimeout(() => this.beep(3000, 0.16), 240);
  }

  /**
   * Distinct two-tone chime for Auto-Lap and Manual Lap marker
   */
  public lapChime() {
    if (!this.enabled) return;
    this.beep(2800, 0.08);
    setTimeout(() => this.beep(3400, 0.12), 110);
  }
}

export const bikeBeeper = new BikeBeeper();
