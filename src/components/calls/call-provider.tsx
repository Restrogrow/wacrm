'use client';

// ============================================================
// CallProvider — WhatsApp voice calls in the browser.
//
// Mounted once in the dashboard shell so calls ring and keep going on
// every page. Listens to whatsapp_calls through Realtime:
//   * a new inbound 'ringing' row → incoming call card + ringtone for
//     every agent; the first to Answer gets it (server claims it);
//   * our outbound call's row gets Meta's SDP answer / status changes.
// Audio is WebRTC between this browser and Meta (lib/calls/webrtc.ts).
// API: /api/whatsapp/calls, /api/whatsapp/calls/[id].
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  createAnswerSdp,
  createOfferSdp,
  createPeer,
  getMicrophone,
  isCallingSupported,
  startRingtone,
  stopStream,
} from '@/lib/calls/webrtc';
import { CallOverlay } from './call-overlay';

export type CallStatus = 'ringing' | 'answering' | 'connected' | 'ended' | 'missed' | 'rejected' | 'failed';

export interface CallRow {
  id: string;
  call_id: string;
  direction: 'inbound' | 'outbound';
  status: CallStatus;
  conversation_id: string | null;
  contact_id: string | null;
  customer_number: string | null;
  customer_name: string | null;
  sdp_offer: string | null;
  sdp_answer: string | null;
  started_by: string | null;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
}

export interface ActiveCall {
  rowId: string | null;
  direction: 'inbound' | 'outbound';
  /** UI phase — 'calling' until Meta reports ringing for outbound calls. */
  phase: 'calling' | 'ringing' | 'connecting' | 'connected';
  label: string;
  conversationId: string | null;
  connectedAt: number | null;
}

export type StartCallResult = { ok: true } | { ok: false; needsPermission?: boolean; error: string };

/** AI call notes: off, recording this call, or turning the recording into notes. */
export type AiNotesState = 'off' | 'recording' | 'saving';

interface CallContextValue {
  supported: boolean;
  incoming: CallRow | null;
  active: ActiveCall | null;
  muted: boolean;
  startCall: (conversationId: string, label: string) => Promise<StartCallResult>;
  answer: () => Promise<void>;
  decline: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  aiNotes: AiNotesState;
  /** Start recording both sides for AI notes (connected calls only). */
  startAiNotes: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCalls(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls must be used inside CallProvider');
  return ctx;
}

/** Ignore ringing rows older than this (Meta gives ~30–60 s to answer). */
const RING_WINDOW_MS = 60_000;
const FINISHED: CallStatus[] = ['ended', 'missed', 'rejected', 'failed'];

/** Same encoder the voice-note recorder uses (served from /public). */
const OPUS_ENCODER_PATH = '/opus/encoderWorker.min.js';
/** Stop recording after an hour; notes are written from what was captured. */
const AI_NOTES_MAX_MS = 60 * 60_000;

const FINISH_MESSAGE: Partial<Record<CallStatus, string>> = {
  rejected: 'The customer declined the call.',
  missed: 'No answer.',
  failed: 'The call could not be connected.',
};

function labelFor(row: Pick<CallRow, 'customer_name' | 'customer_number'>): string {
  return row.customer_name || (row.customer_number ? `+${row.customer_number}` : 'WhatsApp caller');
}

async function postAction(rowId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/whatsapp/calls/${rowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? 'Something went wrong with the call.');
  return json;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, canSendMessages } = useAuth();
  const [incoming, setIncoming] = useState<CallRow | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [aiNotes, setAiNotes] = useState<AiNotesState>('off');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringRef = useRef<{ stop: () => void } | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<CallRow | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<import('opus-recorder').default | null>(null);
  const notesCtxRef = useRef<AudioContext | null>(null);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesBytesRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  const supported = useMemo(() => isCallingSupported(), []);
  const enabled = supported && !!user && canSendMessages;

  const stopRinging = useCallback(() => {
    ringRef.current?.stop();
    ringRef.current = null;
  }, []);

  // Stop the AI-notes recording (if any) and send it for notes. Runs on
  // every call end; the upload continues after the call UI closes.
  const finishAiNotes = useCallback((rowId: string | null | undefined) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = null;
    setAiNotes('saving');
    void (async () => {
      try {
        await recorder.stop();
      } catch {
        // already stopped
      }
      void notesCtxRef.current?.close().catch(() => {});
      notesCtxRef.current = null;
      const bytes = notesBytesRef.current;
      notesBytesRef.current = null;
      if (!rowId || !bytes || bytes.byteLength < 2000) {
        setAiNotes('off');
        if (rowId) toast.error('The call was too short for AI notes.');
        return;
      }
      const pending = toast.loading('Writing AI call notes…');
      try {
        const res = await fetch(`/api/whatsapp/calls/${rowId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/ogg' },
          body: new Blob([bytes as BlobPart], { type: 'audio/ogg' }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(json?.error ?? 'Could not write call notes.', { id: pending });
        } else {
          toast.success(
            json?.note_id ? 'AI call notes saved to the contact’s notes.' : 'AI call notes are ready.',
            {
              id: pending,
              description: json?.notes?.summary?.slice(0, 160),
              duration: 15000,
              action: { label: 'View', onClick: () => router.push(`/calls?call=${rowId}`) },
            },
          );
        }
      } catch {
        toast.error('Could not write call notes.', { id: pending });
      } finally {
        setAiNotes('off');
      }
    })();
  }, [router]);

  const cleanupMedia = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    stopStream(micRef.current);
    micRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    remoteStreamRef.current = null;
    setMuted(false);
  }, []);

  const endLocally = useCallback(
    (message?: string) => {
      finishAiNotes(activeRef.current?.rowId);
      cleanupMedia();
      setActive(null);
      if (message) toast(message);
    },
    [cleanupMedia, finishAiNotes],
  );

  const onRemoteStream = useCallback((stream: MediaStream) => {
    remoteStreamRef.current = stream;
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
      void audioRef.current.play().catch(() => {});
    }
  }, []);

  // ---- Realtime: incoming calls and updates to our call ----
  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    const channel = supabase
      .channel('whatsapp-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_calls' }, (payload) => {
        const row = payload.new as CallRow;
        if (!row?.id) return;

        // Our current call.
        const current = activeRef.current;
        if (current?.rowId === row.id) {
          if (FINISHED.includes(row.status)) {
            endLocally(current.phase === 'connected' ? 'Call ended.' : FINISH_MESSAGE[row.status]);
            return;
          }
          const pc = pcRef.current;
          if (row.direction === 'outbound' && row.sdp_answer && pc && !pc.remoteDescription) {
            void pc.setRemoteDescription({ type: 'answer', sdp: row.sdp_answer }).catch(() => {
              toast.error('Could not connect the call audio.');
            });
          }
          if (row.status === 'ringing' && current.phase === 'calling') {
            setActive({ ...current, phase: 'ringing' });
          }
          if (row.status === 'connected' && current.phase !== 'connected') {
            setActive({ ...current, phase: 'connected', connectedAt: Date.now() });
          }
          return;
        }

        // A customer is calling.
        const ringing = incomingRef.current;
        if (row.direction === 'inbound' && row.status === 'ringing' && row.sdp_offer) {
          const fresh = Date.now() - new Date(row.created_at).getTime() < RING_WINDOW_MS;
          if (fresh && !activeRef.current && !ringing) {
            setIncoming(row);
            ringRef.current?.stop();
            ringRef.current = startRingtone();
          }
          return;
        }

        // The ringing call was answered elsewhere, declined or ended.
        if (ringing?.id === row.id && row.status !== 'ringing') {
          stopRinging();
          setIncoming(null);
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, endLocally, stopRinging]);

  // Stop ringing on its own if nobody answers.
  useEffect(() => {
    if (!incoming) return;
    const left = RING_WINDOW_MS - (Date.now() - new Date(incoming.created_at).getTime());
    const timer = setTimeout(() => {
      stopRinging();
      setIncoming((cur) => (cur?.id === incoming.id ? null : cur));
    }, Math.max(left, 0));
    return () => clearTimeout(timer);
  }, [incoming, stopRinging]);

  // Hang up if the tab is closed mid-call.
  useEffect(() => {
    const onUnload = () => {
      const rowId = activeRef.current?.rowId;
      if (rowId) {
        navigator.sendBeacon(
          `/api/whatsapp/calls/${rowId}`,
          new Blob([JSON.stringify({ action: 'hangup' })], { type: 'application/json' }),
        );
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  useEffect(() => () => {
    stopRinging();
    cleanupMedia();
  }, [stopRinging, cleanupMedia]);

  // ---- Actions ----
  const answer = useCallback(async () => {
    const call = incomingRef.current;
    if (!call?.sdp_offer) return;
    stopRinging();
    setIncoming(null);
    setActive({
      rowId: call.id,
      direction: 'inbound',
      phase: 'connecting',
      label: labelFor(call),
      conversationId: call.conversation_id,
      connectedAt: null,
    });
    try {
      const mic = await getMicrophone();
      micRef.current = mic;
      const pc = createPeer(mic, onRemoteStream, () => endLocally('The call connection was lost.'));
      pcRef.current = pc;
      const sdp = await createAnswerSdp(pc, call.sdp_offer);
      await postAction(call.id, { action: 'answer', sdp });
      setActive((cur) => (cur?.rowId === call.id ? { ...cur, phase: 'connected', connectedAt: Date.now() } : cur));
    } catch (err) {
      endLocally();
      toast.error(err instanceof Error ? err.message : 'Could not answer the call.');
    }
  }, [endLocally, onRemoteStream, stopRinging]);

  const decline = useCallback(async () => {
    const call = incomingRef.current;
    stopRinging();
    setIncoming(null);
    if (!call) return;
    try {
      await postAction(call.id, { action: 'reject' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline the call.');
    }
  }, [stopRinging]);

  const hangup = useCallback(async () => {
    const rowId = activeRef.current?.rowId;
    endLocally();
    if (!rowId) return;
    try {
      await postAction(rowId, { action: 'hangup' });
    } catch {
      // Already ended on WhatsApp's side.
    }
  }, [endLocally]);

  const startCall = useCallback(
    async (conversationId: string, label: string): Promise<StartCallResult> => {
      if (!supported) return { ok: false, error: 'Your browser can’t make calls. Try Chrome, Edge or Safari.' };
      if (activeRef.current) return { ok: false, error: 'Finish your current call first.' };
      setActive({ rowId: null, direction: 'outbound', phase: 'calling', label, conversationId, connectedAt: null });
      try {
        const mic = await getMicrophone();
        micRef.current = mic;
        const pc = createPeer(mic, onRemoteStream, () => endLocally('The call connection was lost.'));
        pcRef.current = pc;
        const sdp = await createOfferSdp(pc);

        const res = await fetch('/api/whatsapp/calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId, sdp }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          endLocally();
          return { ok: false, needsPermission: json?.code === 'no_permission', error: json?.error ?? 'Could not place the call.' };
        }
        const row = json.call as Pick<CallRow, 'id' | 'status' | 'sdp_answer'>;
        if (row.sdp_answer && !pc.remoteDescription) {
          await pc.setRemoteDescription({ type: 'answer', sdp: row.sdp_answer });
        }
        setActive((cur) => (cur && cur.rowId === null ? { ...cur, rowId: row.id } : cur));

        // Catch up on anything Meta reported before we knew the row id.
        const { data: latest } = await createClient()
          .from('whatsapp_calls')
          .select('status, sdp_answer')
          .eq('id', row.id)
          .maybeSingle();
        if (latest?.sdp_answer && !pc.remoteDescription) {
          await pc.setRemoteDescription({ type: 'answer', sdp: latest.sdp_answer });
        }
        if (latest && FINISHED.includes(latest.status as CallStatus)) {
          endLocally(FINISH_MESSAGE[latest.status as CallStatus]);
        } else if (latest?.status === 'connected') {
          setActive((cur) => (cur?.rowId === row.id ? { ...cur, phase: 'connected', connectedAt: Date.now() } : cur));
        } else if (latest?.status === 'ringing') {
          setActive((cur) => (cur?.rowId === row.id && cur.phase === 'calling' ? { ...cur, phase: 'ringing' } : cur));
        }
        return { ok: true };
      } catch (err) {
        endLocally();
        return { ok: false, error: err instanceof Error ? err.message : 'Could not place the call.' };
      }
    },
    [endLocally, onRemoteStream, supported],
  );

  const toggleMute = useCallback(() => {
    const track = micRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  // Record both sides of the connected call (mic + customer) as Ogg/Opus
  // in this browser, for AI notes when the call ends. Opt-in per call.
  const startAiNotes = useCallback(async () => {
    const mic = micRef.current;
    const remote = remoteStreamRef.current;
    if (recorderRef.current || !mic || !remote || activeRef.current?.phase !== 'connected') {
      toast.error('AI notes can start once the call is connected.');
      return;
    }
    try {
      const { default: Recorder } = await import('opus-recorder');
      const ctx = new AudioContext();
      const mix = ctx.createGain();
      ctx.createMediaStreamSource(mic).connect(mix);
      ctx.createMediaStreamSource(remote).connect(mix);
      const recorder = new Recorder({
        encoderPath: OPUS_ENCODER_PATH,
        sourceNode: mix,
        numberOfChannels: 1,
        encoderApplication: 2048, // speech
        encoderSampleRate: 16000, // small files; plenty for speech
        streamPages: false,
      });
      notesBytesRef.current = null;
      recorder.ondataavailable = (bytes) => {
        notesBytesRef.current = bytes;
      };
      await recorder.start();
      notesCtxRef.current = ctx;
      recorderRef.current = recorder;
      setAiNotes('recording');
      notesTimerRef.current = setTimeout(() => {
        // Keep the call going; just stop capturing after the cap.
        const r = recorderRef.current;
        if (r) void r.stop().catch(() => {});
        toast('AI notes stopped recording after 60 minutes.');
      }, AI_NOTES_MAX_MS);
      toast.success('AI notes on. Let the customer know the call is being recorded.');
    } catch {
      void notesCtxRef.current?.close().catch(() => {});
      notesCtxRef.current = null;
      recorderRef.current = null;
      setAiNotes('off');
      toast.error('Could not start recording for AI notes in this browser.');
    }
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({ supported, incoming, active, muted, startCall, answer, decline, hangup, toggleMute, aiNotes, startAiNotes }),
    [supported, incoming, active, muted, startCall, answer, decline, hangup, toggleMute, aiNotes, startAiNotes],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {/* Remote audio. Hidden; plays the customer's voice. */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      {enabled && <CallOverlay />}
    </CallContext.Provider>
  );
}
