// AI voice agent on a WhatsApp call, run in the agent's browser (client only).
//
//   customer audio (WebRTC from Meta) → AudioWorklet → 16 kHz PCM → Gemini Live
//   Gemini Live → 24 kHz PCM → `output` node → the call (and the agent's speakers)
//
// The server hands us a single-use token and the setup message
// (POST /api/whatsapp/calls/[id]/ai-session); the API key never reaches
// the browser. Protocol: https://ai.google.dev/api/live

const LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'
const WORKLET_PATH = '/calls/pcm-capture-worklet.js'
const OUTPUT_RATE = 24000

export const END_CALL_TOOL = 'end_call'
export const HANDOFF_TOOL = 'transfer_to_human'

export type AgentState = 'connecting' | 'listening' | 'speaking'

export interface TranscriptLine {
  who: 'ai' | 'customer'
  text: string
}

export interface LiveAgentOptions {
  ctx: AudioContext
  /** The customer's audio from the call. */
  remote: MediaStream
  /** Where the AI's voice goes (the call's outgoing audio + speakers). */
  output: AudioNode
  token: string
  setup: unknown
  onState: (state: AgentState) => void
  onTranscript: (line: TranscriptLine) => void
  /** The AI said goodbye; hang up once it has finished speaking. */
  onEndCall: () => void
  /** The AI asked for a person to take over. */
  onHandoff: (reason: string) => void
  /** The session failed or closed unexpectedly. */
  onError: (message: string) => void
}

interface ServerMessage {
  setupComplete?: unknown
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] }
    interrupted?: boolean
    turnComplete?: boolean
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
  }
  toolCall?: { functionCalls?: { id?: string; name?: string; args?: Record<string, unknown> }[] }
  goAway?: { timeLeft?: string }
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function pcm16ToFloat(b64: string): Float32Array {
  const bin = atob(b64)
  const n = bin.length >> 1
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
    if (v >= 0x8000) v -= 0x10000
    out[i] = v / 0x8000
  }
  return out
}

export class LiveAgent {
  private ws: WebSocket | null = null
  private capture: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private sink: GainNode | null = null
  private playing = new Set<AudioBufferSourceNode>()
  private playhead = 0
  private stopped = false
  private ready = false
  /** Transcription arrives in pieces; flush a line when the speaker changes. */
  private pending: TranscriptLine | null = null

  constructor(private o: LiveAgentOptions) {}

  async start(): Promise<void> {
    const { ctx } = this.o
    await ctx.audioWorklet.addModule(WORKLET_PATH)
    if (this.stopped) return

    const ws = new WebSocket(`${LIVE_WS}?access_token=${encodeURIComponent(this.o.token)}`)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.o.onState('connecting')

    ws.onopen = () => ws.send(JSON.stringify(this.o.setup))
    ws.onmessage = (event) => {
      const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer)
      let msg: ServerMessage
      try {
        msg = JSON.parse(text) as ServerMessage
      } catch {
        return
      }
      this.handle(msg)
    }
    ws.onclose = (event) => {
      if (this.stopped) return
      this.stop()
      this.o.onError(
        event.code === 1000
          ? 'The AI agent disconnected.'
          : `The AI agent disconnected${event.reason ? `: ${event.reason}` : ''}.`,
      )
    }
  }

  private handle(msg: ServerMessage) {
    if (msg.setupComplete !== undefined && !this.ready) {
      this.ready = true
      this.startCapture()
      // The call is connected: the AI speaks first.
      this.send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: '(The call is connected. Greet the customer now.)' }] }],
          turnComplete: true,
        },
      })
      this.o.onState('speaking')
      return
    }

    const sc = msg.serverContent
    if (sc) {
      if (sc.interrupted) this.flushPlayback()
      for (const part of sc.modelTurn?.parts ?? []) {
        if (part.inlineData?.data && (part.inlineData.mimeType ?? 'audio/pcm').startsWith('audio/pcm')) {
          this.play(part.inlineData.data)
        }
      }
      if (sc.inputTranscription?.text) this.addTranscript('customer', sc.inputTranscription.text)
      if (sc.outputTranscription?.text) this.addTranscript('ai', sc.outputTranscription.text)
      if (sc.turnComplete) this.flushTranscript()
    }

    for (const call of msg.toolCall?.functionCalls ?? []) {
      this.send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }] } })
      if (call.name === END_CALL_TOOL) {
        // Let the goodbye finish playing first.
        const left = Math.max(0, this.playhead - this.o.ctx.currentTime)
        setTimeout(() => this.o.onEndCall(), left * 1000 + 600)
      } else if (call.name === HANDOFF_TOOL) {
        this.o.onHandoff(typeof call.args?.reason === 'string' ? call.args.reason : '')
      }
    }

    if (msg.goAway) {
      // Sessions are capped by Google; the call cap (10 min) is below it.
      console.warn('[live-agent] session ending soon', msg.goAway.timeLeft)
    }
  }

  private startCapture() {
    const { ctx } = this.o
    const source = ctx.createMediaStreamSource(this.o.remote)
    const capture = new AudioWorkletNode(ctx, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1 })
    capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      this.send({ realtimeInput: { audio: { data: toBase64(event.data), mimeType: 'audio/pcm;rate=16000' } } })
    }
    // A silent path to the destination keeps the worklet running.
    const sink = ctx.createGain()
    sink.gain.value = 0
    source.connect(capture).connect(sink).connect(ctx.destination)
    this.source = source
    this.capture = capture
    this.sink = sink
  }

  private play(b64: string) {
    const { ctx, output } = this.o
    const samples = pcm16ToFloat(b64)
    if (samples.length === 0) return
    const buffer = ctx.createBuffer(1, samples.length, OUTPUT_RATE)
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const node = ctx.createBufferSource()
    node.buffer = buffer
    node.connect(output)
    const at = Math.max(ctx.currentTime + 0.02, this.playhead)
    node.start(at)
    this.playhead = at + buffer.duration
    this.playing.add(node)
    this.o.onState('speaking')
    node.onended = () => {
      this.playing.delete(node)
      if (this.playing.size === 0 && !this.stopped) this.o.onState('listening')
    }
  }

  /** The customer spoke over the AI: stop talking right away. */
  private flushPlayback() {
    for (const node of this.playing) {
      try {
        node.stop()
      } catch {
        // not started yet
      }
    }
    this.playing.clear()
    this.playhead = 0
    this.flushTranscript()
    if (!this.stopped) this.o.onState('listening')
  }

  private addTranscript(who: TranscriptLine['who'], text: string) {
    if (this.pending && this.pending.who !== who) this.flushTranscript()
    this.pending = { who, text: (this.pending?.text ?? '') + text }
  }

  private flushTranscript() {
    const line = this.pending
    this.pending = null
    if (line && line.text.trim()) this.o.onTranscript({ who: line.who, text: line.text.trim() })
  }

  /** Tell the AI something mid-call (e.g. "wrap up now"). */
  say(text: string) {
    this.send({ realtimeInput: { text } })
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    this.flushPlayback()
    this.capture?.port.close()
    this.source?.disconnect()
    this.capture?.disconnect()
    this.sink?.disconnect()
    const ws = this.ws
    this.ws = null
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000)
  }
}
