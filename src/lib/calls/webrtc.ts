// Browser-side WebRTC helpers for WhatsApp calls (client only).
//
// Meta's Calling API uses non-trickle ICE: every SDP we send must
// already contain our ICE candidates, so we wait for gathering to
// finish (or a short timeout) before handing the SDP to the server.

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

/** How long to wait for ICE gathering before sending what we have. */
const ICE_TIMEOUT_MS = 3000

export function isCallingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.RTCPeerConnection !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

export async function getMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('Allow microphone access in your browser to make and answer calls.')
    }
    if (name === 'NotFoundError') throw new Error('No microphone found. Plug one in and try again.')
    throw new Error('Could not start your microphone.')
  }
}

export function createPeer(
  mic: MediaStream,
  onRemoteStream: (stream: MediaStream) => void,
  onConnectionLost: () => void,
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  for (const track of mic.getAudioTracks()) pc.addTrack(track, mic)
  pc.ontrack = (event) => {
    const [stream] = event.streams
    onRemoteStream(stream ?? new MediaStream([event.track]))
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') onConnectionLost()
  }
  return pc
}

export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      clearTimeout(timer)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    const timer = setTimeout(done, ICE_TIMEOUT_MS)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

/** Create our offer (outbound calls) with ICE candidates included. */
export async function createOfferSdp(pc: RTCPeerConnection): Promise<string> {
  const offer = await pc.createOffer({ offerToReceiveAudio: true })
  await pc.setLocalDescription(offer)
  await waitForIceGathering(pc)
  const sdp = pc.localDescription?.sdp
  if (!sdp) throw new Error('Could not prepare the call.')
  return sdp
}

/** Answer the customer's offer (inbound calls) with ICE candidates included. */
export async function createAnswerSdp(pc: RTCPeerConnection, offerSdp: string): Promise<string> {
  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  await waitForIceGathering(pc)
  const sdp = pc.localDescription?.sdp
  if (!sdp) throw new Error('Could not answer the call.')
  return sdp
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop())
}

/** A soft two-tone ring, looped until stop() is called. No audio file needed. */
export function startRingtone(): { stop: () => void } {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return { stop: () => {} }
  let ctx: AudioContext | null = null
  try {
    ctx = new AudioContext()
  } catch {
    return { stop: () => {} }
  }
  const ring = () => {
    if (!ctx) return
    const now = ctx.currentTime
    for (const [offset, freq] of [
      [0, 440],
      [0.25, 480],
      [1, 440],
      [1.25, 480],
    ] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.25)
    }
  }
  ring()
  const timer = setInterval(ring, 3000)
  return {
    stop: () => {
      clearInterval(timer)
      void ctx?.close().catch(() => {})
      ctx = null
    },
  }
}
