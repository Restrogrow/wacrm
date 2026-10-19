// AudioWorklet for the AI call agent (lib/calls/live-agent.ts).
//
// Takes the customer's call audio at the AudioContext's rate (usually
// 48 kHz), downsamples it to 16 kHz mono 16-bit PCM — what Gemini Live
// expects — and posts ~100 ms chunks (ArrayBuffer of Int16) to the page.

const TARGET_RATE = 16000
const CHUNK_SAMPLES = 1600 // 100 ms at 16 kHz

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / TARGET_RATE
    this.pos = 0 // fractional read position into the current input block
    this.out = new Int16Array(CHUNK_SAMPLES)
    this.outLen = 0
  }

  process(inputs) {
    const input = inputs[0]
    const ch = input && input[0]
    if (!ch || ch.length === 0) return true

    // Average every `ratio` input samples into one output sample (a box
    // filter: cheap, and good enough for speech).
    while (this.pos < ch.length) {
      const start = Math.floor(this.pos)
      const end = Math.min(ch.length, Math.floor(this.pos + this.ratio))
      let sum = 0
      for (let i = start; i < end; i++) sum += ch[i]
      const v = end > start ? sum / (end - start) : ch[start]
      const s = Math.max(-1, Math.min(1, v))
      this.out[this.outLen++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.outLen === CHUNK_SAMPLES) {
        const chunk = this.out.slice(0)
        this.port.postMessage(chunk.buffer, [chunk.buffer])
        this.outLen = 0
      }
      this.pos += this.ratio
    }
    this.pos -= ch.length
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
