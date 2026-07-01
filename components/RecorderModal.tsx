import { useEffect, useRef, useState } from 'react';
import { Modal, Field } from '@/components/Modal';
import { Icon } from '@/components/ui';
import { toast } from '@/lib/toast';
import { uploadScreenRecording, RECORDING_MAX_SEC, RECORDING_MAX_BYTES, ScreenRecording } from '@/lib/db';

type Phase = 'idle' | 'recording' | 'preview' | 'saving';

function pickMime(): string {
  const c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of c) { try { if ((window as any).MediaRecorder?.isTypeSupported?.(m)) return m; } catch { /* */ } }
  return 'video/webm';
}
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Screen recorder: getDisplayMedia -> MediaRecorder -> preview -> upload (fully client-side). */
export default function RecorderModal({ orgId, userId, onClose, onSaved }: {
  orgId: string; userId: string; onClose: () => void; onSaved: (r: ScreenRecording) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [mic, setMic] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');
  const [title, setTitle] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);      // all raw streams to stop
  const acRef = useRef<AudioContext | null>(null);
  const mimeRef = useRef<string>('video/webm');
  const timerRef = useRef<any>(null);

  const stopStreams = () => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (acRef.current) { try { acRef.current.close(); } catch { /* */ } acRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  useEffect(() => () => { stopStreams(); if (previewUrl) URL.revokeObjectURL(previewUrl); }, []); // eslint-disable-line

  const start = async () => {
    setErr('');
    if (!navigator.mediaDevices?.getDisplayMedia) { setErr('Screen recording is not supported in this browser.'); return; }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } as any, audio: true });
      streamsRef.current.push(display);
      const videoTrack = display.getVideoTracks()[0];
      let audioTracks = display.getAudioTracks();

      // Optionally mix in the microphone alongside any captured system audio.
      if (mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsRef.current.push(micStream);
          const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
          const ac: AudioContext = new AC();
          acRef.current = ac;
          const dest = ac.createMediaStreamDestination();
          if (audioTracks.length) ac.createMediaStreamSource(new MediaStream(audioTracks)).connect(dest);
          ac.createMediaStreamSource(micStream).connect(dest);
          audioTracks = dest.stream.getAudioTracks();
        } catch { /* mic denied -> keep system audio only */ }
      }

      const mixed = new MediaStream([videoTrack, ...audioTracks]);
      mimeRef.current = pickMime();
      const mr = new MediaRecorder(mixed, { mimeType: mimeRef.current });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mimeRef.current });
        stopStreams();
        setBlob(b); setPreviewUrl(URL.createObjectURL(b)); setPhase('preview');
        if (b.size > RECORDING_MAX_BYTES) setErr(`Recording is ${(b.size / 1048576).toFixed(0)} MB — over the ${Math.round(RECORDING_MAX_BYTES / 1048576)} MB limit. Please record a shorter clip.`);
      };
      // User ends the browser "stop sharing" -> finish the recording.
      videoTrack.addEventListener('ended', () => { if (recRef.current?.state === 'recording') recRef.current.stop(); });

      recRef.current = mr;
      mr.start(1000);
      setElapsed(0); setPhase('recording');
      timerRef.current = setInterval(() => setElapsed((e) => {
        const n = e + 1;
        if (n >= RECORDING_MAX_SEC && recRef.current?.state === 'recording') recRef.current.stop();
        return n;
      }), 1000);
    } catch (e: any) {
      stopStreams();
      setErr(e?.name === 'NotAllowedError' ? 'Screen capture permission was denied.' : (e?.message || 'Could not start recording.'));
      setPhase('idle');
    }
  };

  const stop = () => { if (recRef.current?.state === 'recording') recRef.current.stop(); };
  const discard = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); setBlob(null); setPreviewUrl(''); setElapsed(0); setErr(''); setPhase('idle'); };

  const save = async () => {
    if (!blob || phase === 'saving') return;
    if (blob.size > RECORDING_MAX_BYTES) return;
    setPhase('saving'); setErr('');
    try {
      const rec = await uploadScreenRecording({
        org_id: orgId, created_by: userId,
        title: title.trim() || `Screen recording ${new Date().toLocaleString()}`,
        blob, duration_sec: elapsed, mime: mimeRef.current.split(';')[0],
      });
      toast('Recording saved', 'success');
      onSaved(rec);
    } catch (e: any) { setErr(e.message || 'Upload failed.'); setPhase('preview'); }
  };

  return (
    <Modal open onClose={onClose} size="lg" icon="ti-video" title="Record your screen"
      footer={
        phase === 'idle' ? (<>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={start}><Icon name="ti-player-record" />Start recording</button>
        </>) : phase === 'recording' ? (
          <button className="btn btn-danger mx-auto" onClick={stop}><Icon name="ti-player-stop" />Stop recording</button>
        ) : (<>
          <button className="btn mr-auto" disabled={phase === 'saving'} onClick={discard}><Icon name="ti-refresh" />Re-record</button>
          <button className="btn" disabled={phase === 'saving'} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={phase === 'saving' || !blob || blob.size > RECORDING_MAX_BYTES} onClick={save}>{phase === 'saving' ? 'Saving…' : 'Save recording'}</button>
        </>)
      }>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      {phase === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Capture a tab, window, or your whole screen — great for demos, bug reports, and quick walkthroughs. Max {Math.round(RECORDING_MAX_SEC / 60)} min · {Math.round(RECORDING_MAX_BYTES / 1048576)} MB.</p>
          <label className="flex items-center gap-2 text-sm text-content cursor-pointer">
            <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} />
            <Icon name="ti-microphone" className="text-muted2" />Include microphone (narrate over the recording)
          </label>
        </div>
      )}

      {phase === 'recording' && (
        <div className="grid place-items-center py-8 gap-3">
          <span className="inline-flex items-center gap-2 text-rose-600 font-semibold"><span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />Recording</span>
          <span className="text-3xl font-mono text-content tabular-nums">{fmtDur(elapsed)}</span>
          <span className="text-2xs text-muted2">Auto-stops at {fmtDur(RECORDING_MAX_SEC)}. You can also use the browser's “Stop sharing”.</span>
        </div>
      )}

      {phase !== 'idle' && phase !== 'recording' && (
        <div className="space-y-3">
          {previewUrl && <video src={previewUrl} controls className="w-full rounded-lg bg-black max-h-[50vh]" />}
          <div className="flex items-center gap-3 text-2xs text-muted2">
            <span><Icon name="ti-clock" className="text-sm" /> {fmtDur(elapsed)}</span>
            {blob && <span><Icon name="ti-database" className="text-sm" /> {(blob.size / 1048576).toFixed(1)} MB</span>}
          </div>
          <Field label="Title"><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Screen recording ${new Date().toLocaleDateString()}`} /></Field>
        </div>
      )}
    </Modal>
  );
}
