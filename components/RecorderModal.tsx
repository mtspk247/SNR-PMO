import { useEffect, useRef, useState } from 'react';
import { Modal, Field } from '@/components/Modal';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import { toast } from '@/lib/toast';
import { uploadScreenRecording, RECORDING_MAX_SEC, RECORDING_MAX_BYTES, ScreenRecording } from '@/lib/db';

type Phase = 'idle' | 'countdown' | 'recording' | 'paused' | 'preview' | 'saving';

const QUALITY: Record<string, { fps: number; bitrate: number; scale: number; label: string }> = {
  high: { fps: 30, bitrate: 8_000_000, scale: 1, label: 'High — best quality' },
  balanced: { fps: 30, bitrate: 4_000_000, scale: 1, label: 'Balanced' },
  light: { fps: 15, bitrate: 2_000_000, scale: 0.66, label: 'Light — smaller file' },
};
function pickMime(): string {
  const c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of c) { try { if ((window as any).MediaRecorder?.isTypeSupported?.(m)) return m; } catch { /* */ } }
  return 'video/webm';
}
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function captureThumb(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const v = document.createElement('video'); v.muted = true; (v as any).playsInline = true; v.preload = 'auto';
      const url = URL.createObjectURL(blob); v.src = url;
      const done = (b: Blob | null) => { try { URL.revokeObjectURL(url); } catch { /* */ } resolve(b); };
      const safety = setTimeout(() => done(null), 5000);
      v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch { clearTimeout(safety); done(null); } };
      v.onseeked = () => {
        try {
          const w = Math.min(640, v.videoWidth || 640); const scale = w / (v.videoWidth || w);
          const c = document.createElement('canvas'); c.width = w; c.height = Math.max(1, Math.round((v.videoHeight || 360) * scale));
          const ctx = c.getContext('2d'); if (!ctx) { clearTimeout(safety); return done(null); }
          ctx.drawImage(v, 0, 0, c.width, c.height);
          c.toBlob((b) => { clearTimeout(safety); done(b); }, 'image/jpeg', 0.7);
        } catch { clearTimeout(safety); done(null); }
      };
      v.onerror = () => { clearTimeout(safety); done(null); };
    } catch { resolve(null); }
  });
}

/** Screen recorder v2: countdown, pause/resume, quality presets, optional mic + webcam PiP. */
export default function RecorderModal({ orgId, userId, onClose, onSaved }: {
  orgId: string; userId: string; onClose: () => void; onSaved: (r: ScreenRecording) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [mic, setMic] = useState(false);
  const [webcam, setWebcam] = useState(false);
  const [quality, setQuality] = useState<'high' | 'balanced' | 'light'>('balanced');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');
  const [title, setTitle] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const mimeRef = useRef<string>('video/webm');
  const timerRef = useRef<any>(null);

  const stopAll = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop())); streamsRef.current = [];
    if (acRef.current) { try { acRef.current.close(); } catch { /* */ } acRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  useEffect(() => () => { stopAll(); if (previewUrl) URL.revokeObjectURL(previewUrl); }, []); // eslint-disable-line

  const startTimer = () => { timerRef.current = setInterval(() => setElapsed((e) => {
    const n = e + 1; if (n >= RECORDING_MAX_SEC && recRef.current?.state === 'recording') recRef.current.stop(); return n;
  }), 1000); };

  const begin = async () => {
    setErr('');
    if (!navigator.mediaDevices?.getDisplayMedia) { setErr('Screen recording is not supported in this browser.'); return; }
    const q = QUALITY[quality];
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: q.fps } as any, audio: true });
      streamsRef.current.push(display);
      const dTrack = display.getVideoTracks()[0];
      let audioTracks = display.getAudioTracks();

      // microphone (mixed with any system audio)
      if (mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsRef.current.push(micStream);
          const AC = (window as any).AudioContext || (window as any).webkitAudioContext; const ac: AudioContext = new AC(); acRef.current = ac;
          const dest = ac.createMediaStreamDestination();
          if (audioTracks.length) ac.createMediaStreamSource(new MediaStream(audioTracks)).connect(dest);
          ac.createMediaStreamSource(micStream).connect(dest);
          audioTracks = dest.stream.getAudioTracks();
        } catch { /* mic denied → keep system audio */ }
      }

      // webcam picture-in-picture and/or downscale → canvas pipeline; else record display directly
      let videoTrack = dTrack;
      let cam: HTMLVideoElement | null = null;
      const useCanvas = webcam || q.scale < 1;
      if (useCanvas) {
        const settings = dTrack.getSettings();
        const sw = (settings.width as number) || 1280, sh = (settings.height as number) || 720;
        const cw = Math.round(sw * q.scale), ch = Math.round(sh * q.scale);
        const dv = document.createElement('video'); dv.muted = true; (dv as any).playsInline = true; dv.srcObject = new MediaStream([dTrack]); await dv.play().catch(() => {});
        if (webcam) {
          try {
            const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
            streamsRef.current.push(camStream);
            cam = document.createElement('video'); cam.muted = true; (cam as any).playsInline = true; cam.srcObject = camStream; await cam.play().catch(() => {});
          } catch { cam = null; }
        }
        const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d')!;
        const draw = () => {
          try {
            ctx.drawImage(dv, 0, 0, cw, ch);
            if (cam && cam.videoWidth) {
              const d = Math.round(cw * 0.2), r = d / 2, cx = cw - d - 16, cy = ch - d - 16;
              ctx.save(); ctx.beginPath(); ctx.arc(cx + r, cy + r, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
              const ar = cam.videoWidth / cam.videoHeight; let sw2 = cam.videoWidth, sh2 = cam.videoHeight;
              if (ar > 1) { sw2 = cam.videoHeight; } else { sh2 = cam.videoWidth; }
              ctx.drawImage(cam, (cam.videoWidth - sw2) / 2, (cam.videoHeight - sh2) / 2, sw2, sh2, cx, cy, d, d);
              ctx.restore(); ctx.beginPath(); ctx.arc(cx + r, cy + r, r, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
            }
          } catch { /* */ }
          rafRef.current = requestAnimationFrame(draw);
        };
        draw();
        videoTrack = (canvas as any).captureStream(q.fps).getVideoTracks()[0];
      }

      const mixed = new MediaStream([videoTrack, ...audioTracks]);
      mimeRef.current = pickMime();
      const mr = new MediaRecorder(mixed, { mimeType: mimeRef.current, videoBitsPerSecond: q.bitrate });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mimeRef.current });
        stopAll(); setBlob(b); setPreviewUrl(URL.createObjectURL(b)); setPhase('preview');
        if (b.size > RECORDING_MAX_BYTES) setErr(`Recording is ${(b.size / 1048576).toFixed(0)} MB — over the ${Math.round(RECORDING_MAX_BYTES / 1048576)} MB limit. Record a shorter clip or use Light quality.`);
      };
      dTrack.addEventListener('ended', () => { const st = recRef.current?.state; if (st === 'recording' || st === 'paused') recRef.current!.stop(); });
      recRef.current = mr;

      // 3-2-1 countdown, then record
      setPhase('countdown'); setCount(3);
      await new Promise<void>((res) => { let n = 3; const iv = setInterval(() => { n -= 1; setCount(n); if (n <= 0) { clearInterval(iv); res(); } }, 1000); });
      if (!recRef.current) return; // closed during countdown
      mr.start(1000); setElapsed(0); setPhase('recording'); startTimer();
    } catch (e: any) {
      stopAll(); setErr(e?.name === 'NotAllowedError' ? 'Screen capture permission was denied.' : (e?.message || 'Could not start recording.')); setPhase('idle');
    }
  };

  const pause = () => { if (recRef.current?.state === 'recording') { recRef.current.pause(); if (timerRef.current) clearInterval(timerRef.current); setPhase('paused'); } };
  const resume = () => { if (recRef.current?.state === 'paused') { recRef.current.resume(); startTimer(); setPhase('recording'); } };
  const stop = () => { const st = recRef.current?.state; if (st === 'recording' || st === 'paused') recRef.current!.stop(); };
  const discard = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); setBlob(null); setPreviewUrl(''); setElapsed(0); setErr(''); setPhase('idle'); };

  const save = async () => {
    if (!blob || phase === 'saving' || blob.size > RECORDING_MAX_BYTES) return;
    setPhase('saving'); setErr('');
    try {
      const thumb = await captureThumb(blob).catch(() => null);
      const rec = await uploadScreenRecording({ org_id: orgId, created_by: userId, title: title.trim() || `Screen recording ${new Date().toLocaleString()}`, blob, duration_sec: elapsed, mime: mimeRef.current.split(';')[0], thumb });
      toast('Recording saved', 'success'); onSaved(rec);
    } catch (e: any) { setErr(e.message || 'Upload failed.'); setPhase('preview'); }
  };

  const recording = phase === 'recording' || phase === 'paused';
  return (
    <Modal open onClose={onClose} size="lg" icon="ti-video" title="Record your screen"
      footer={
        phase === 'idle' ? (<>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={begin}><Icon name="ti-player-record" />Start recording</button>
        </>) : phase === 'countdown' ? (<span className="mx-auto text-sm text-muted">Starting…</span>
        ) : recording ? (<>
          {phase === 'recording'
            ? <button className="btn mr-auto" onClick={pause}><Icon name="ti-player-pause" />Pause</button>
            : <button className="btn btn-primary mr-auto" onClick={resume}><Icon name="ti-player-play" />Resume</button>}
          <button className="btn btn-danger" onClick={stop}><Icon name="ti-player-stop" />Stop</button>
        </>) : phase === 'preview' || phase === 'saving' ? (<>
          <button className="btn mr-auto" disabled={phase === 'saving'} onClick={discard}><Icon name="ti-refresh" />Re-record</button>
          <button className="btn" disabled={phase === 'saving'} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={phase === 'saving' || !blob || blob.size > RECORDING_MAX_BYTES} onClick={save}>{phase === 'saving' ? 'Saving…' : 'Save recording'}</button>
        </>) : null
      }>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      {phase === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Capture a tab, window, or your whole screen. Max {Math.round(RECORDING_MAX_SEC / 60)} min · {Math.round(RECORDING_MAX_BYTES / 1048576)} MB.</p>
          <Field label="Quality"><Select value={quality} onChange={(v) => setQuality(v as any)} options={Object.entries(QUALITY).map(([k, q]) => ({ value: k, label: q.label }))} /></Field>
          <label className="flex items-center gap-2 text-sm text-content cursor-pointer"><input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} /><Icon name="ti-microphone" className="text-muted2" />Include microphone (narrate)</label>
          <label className="flex items-center gap-2 text-sm text-content cursor-pointer"><input type="checkbox" checked={webcam} onChange={(e) => setWebcam(e.target.checked)} /><Icon name="ti-user-circle" className="text-muted2" />Show webcam bubble (picture-in-picture)</label>
        </div>
      )}

      {phase === 'countdown' && <div className="grid place-items-center py-12"><span className="text-6xl font-mono font-semibold text-accentstrong tabular-nums">{count > 0 ? count : 'Go'}</span></div>}

      {recording && (
        <div className="grid place-items-center py-8 gap-3">
          <span className={`inline-flex items-center gap-2 font-semibold ${phase === 'paused' ? 'text-muted2' : 'text-rose-600'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${phase === 'paused' ? 'bg-muted2' : 'bg-rose-600 animate-pulse'}`} />{phase === 'paused' ? 'Paused' : 'Recording'}
            {webcam && <span className="text-2xs text-muted2">· webcam</span>}{mic && <span className="text-2xs text-muted2">· mic</span>}
          </span>
          <span className="text-3xl font-mono text-content tabular-nums">{fmtDur(elapsed)}</span>
          <span className="text-2xs text-muted2">Auto-stops at {fmtDur(RECORDING_MAX_SEC)}. You can also use the browser’s “Stop sharing”.</span>
        </div>
      )}

      {(phase === 'preview' || phase === 'saving') && (
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
