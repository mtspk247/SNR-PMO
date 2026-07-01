import { useEffect, useRef, useState } from 'react';
import { Modal, Field } from '@/components/Modal';
import { Icon } from '@/components/ui';
import RecordingEditor from '@/components/RecordingEditor';
import { toast } from '@/lib/toast';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { uploadScreenRecording, RECORDING_MAX_SEC, RECORDING_MAX_BYTES } from '@/lib/db';

// Trigger the recorder from anywhere (survives route navigation because the controller lives in _app).
export function openRecorder() { try { window.dispatchEvent(new Event('snr:open-recorder')); } catch { /* */ } }

type Phase = 'closed' | 'idle' | 'countdown' | 'recording' | 'paused' | 'preview' | 'saving';
const RESO: Record<string, { h: number; br: number; label: string }> = {
  '720': { h: 720, br: 4_000_000, label: '720p' },
  '1080': { h: 1080, br: 8_000_000, label: '1080p' },
  '1440': { h: 1440, br: 12_000_000, label: '1440p' },
};
const mp4Supported = typeof window !== 'undefined' && !!(window as any).MediaRecorder?.isTypeSupported?.('video/mp4');
function pickMime(format: 'auto' | 'mp4' | 'webm'): string {
  const mp4 = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const c = format === 'mp4' ? [...mp4, ...webm] : format === 'webm' ? webm : [...mp4, ...webm];
  for (const m of c) { try { if ((window as any).MediaRecorder?.isTypeSupported?.(m)) return m; } catch { /* */ } }
  return 'video/webm';
}
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function ToggleRow({ icon, label, on, onToggle }: { icon: string; label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="w-full flex items-center justify-between py-1.5 text-left">
      <span className="text-sm text-content inline-flex items-center gap-2"><Icon name={icon} className="text-muted2 text-base" />{label}</span>
      <span className={`w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-accentstrong' : 'bg-surface2 border border-line'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'left-0.5'}`} /></span>
    </button>
  );
}
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

// App-wide recording engine + non-blocking floating toolbar. Mounted once in _app.
export default function RecorderController() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [phase, setPhase] = useState<Phase>('closed');
  const [mic, setMic] = useState(false);
  const [sysAudio, setSysAudio] = useState(true);
  const [webcam, setWebcam] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [camPos, setCamPos] = useState<'tl' | 'tr' | 'bl' | 'br'>('br');
  const [camSize, setCamSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [resolution, setResolution] = useState<'720' | '1080' | '1440'>('1080');
  const [fps, setFps] = useState<30 | 60>(30);
  const [format, setFormat] = useState<'auto' | 'mp4' | 'webm'>('auto');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');
  const [title, setTitle] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [bar, setBar] = useState<{ x: number; y: number } | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const mimeRef = useRef<string>('video/webm');
  const timerRef = useRef<any>(null);
  const camPreviewRef = useRef<HTMLVideoElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const stopAll = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop())); streamsRef.current = [];
    if (acRef.current) { try { acRef.current.close(); } catch { /* */ } acRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  useEffect(() => () => { stopAll(); }, []); // eslint-disable-line

  useEffect(() => {
    const open = () => {
      if (!org?.id || !me?.id) { toast('Sign in to record', 'error'); return; }
      if (!hasFeature(org, 'recordings')) { toast('Screen recording is not in your plan', 'error'); return; }
      if (recRef.current && (recRef.current.state === 'recording' || recRef.current.state === 'paused')) { toast('A recording is already in progress', 'info'); return; }
      setErr(''); setBlob(null); setPreviewUrl(''); setTitle(''); setElapsed(0); setPhase('idle');
    };
    window.addEventListener('snr:open-recorder', open);
    return () => window.removeEventListener('snr:open-recorder', open);
  }, [org?.id, me?.id]); // eslint-disable-line

  // webcam live preview on the setup screen
  useEffect(() => {
    let stream: MediaStream | null = null; let alive = true;
    if (phase === 'idle' && webcam && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { width: 320 } }).then((s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s; if (camPreviewRef.current) { camPreviewRef.current.srcObject = s; camPreviewRef.current.play().catch(() => {}); }
      }).catch(() => {});
    }
    return () => { alive = false; if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [phase, webcam]);

  const startTimer = () => { timerRef.current = setInterval(() => setElapsed((e) => {
    const n = e + 1; if (n >= RECORDING_MAX_SEC && recRef.current?.state === 'recording') recRef.current.stop(); return n;
  }), 1000); };

  const begin = async () => {
    setErr('');
    if (!navigator.mediaDevices?.getDisplayMedia) { setErr('Screen recording is not supported in this browser.'); return; }
    const rz = RESO[resolution]; const br = rz.br;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps, height: { ideal: rz.h }, cursor: showCursor ? 'always' : 'never' } as any, audio: sysAudio });
      streamsRef.current.push(display);
      const dTrack = display.getVideoTracks()[0];
      let audioTracks = sysAudio ? display.getAudioTracks() : [];
      if (mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsRef.current.push(micStream);
          const AC = (window as any).AudioContext || (window as any).webkitAudioContext; const actx: AudioContext = new AC(); acRef.current = actx;
          const dest = actx.createMediaStreamDestination();
          if (audioTracks.length) actx.createMediaStreamSource(new MediaStream(audioTracks)).connect(dest);
          actx.createMediaStreamSource(micStream).connect(dest);
          audioTracks = dest.stream.getAudioTracks();
        } catch { /* mic denied */ }
      }
      let videoTrack = dTrack; let cam: HTMLVideoElement | null = null;
      const scale0 = Math.min(1, rz.h / (((dTrack.getSettings().height as number) || rz.h)));
      const useCanvas = webcam || scale0 < 1;
      if (useCanvas) {
        const st = dTrack.getSettings(); const sw = (st.width as number) || 1280, sh = (st.height as number) || 720;
        const scale = Math.min(1, rz.h / sh);
        const cw = Math.round(sw * scale), ch = Math.round(sh * scale);
        const dv = document.createElement('video'); dv.muted = true; (dv as any).playsInline = true; dv.srcObject = new MediaStream([dTrack]); await dv.play().catch(() => {});
        if (webcam) {
          try {
            const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
            streamsRef.current.push(camStream);
            cam = document.createElement('video'); cam.muted = true; (cam as any).playsInline = true; cam.srcObject = camStream; await cam.play().catch(() => {});
          } catch { cam = null; }
        }
        const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch; const ctx = canvas.getContext('2d')!;
        const draw = () => {
          try {
            ctx.drawImage(dv, 0, 0, cw, ch);
            if (cam && cam.videoWidth) {
              const frac = camSize === 'sm' ? 0.14 : camSize === 'lg' ? 0.28 : 0.2; const m = Math.max(12, Math.round(cw * 0.02));
              const d = Math.round(cw * frac), r = d / 2; const cx = camPos.includes('r') ? cw - d - m : m; const cy = camPos[0] === 'b' ? ch - d - m : m;
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
        videoTrack = (canvas as any).captureStream(fps).getVideoTracks()[0];
      }
      const mixed = new MediaStream([videoTrack, ...audioTracks]);
      mimeRef.current = pickMime(format);
      const mr = new MediaRecorder(mixed, { mimeType: mimeRef.current, videoBitsPerSecond: br });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mimeRef.current });
        stopAll(); setBlob(b); setPreviewUrl(URL.createObjectURL(b)); setPhase('preview');
        if (b.size > RECORDING_MAX_BYTES) setErr(`Recording is ${(b.size / 1048576).toFixed(0)} MB — over the ${Math.round(RECORDING_MAX_BYTES / 1048576)} MB limit. Record a shorter clip or use Light quality.`);
      };
      dTrack.addEventListener('ended', () => { const s = recRef.current?.state; if (s === 'recording' || s === 'paused') recRef.current!.stop(); });
      recRef.current = mr;
      setPhase('countdown'); setCount(3);
      await new Promise<void>((res) => { let n = 3; const iv = setInterval(() => { n -= 1; setCount(n); if (n <= 0) { clearInterval(iv); res(); } }, 1000); });
      mr.start(1000); setElapsed(0); setPhase('recording'); startTimer();
    } catch (e: any) {
      stopAll(); setErr(e?.name === 'NotAllowedError' ? 'Screen capture permission was denied.' : (e?.message || 'Could not start recording.')); setPhase('idle');
    }
  };

  const pause = () => { if (recRef.current?.state === 'recording') { recRef.current.pause(); if (timerRef.current) clearInterval(timerRef.current); setPhase('paused'); } };
  const resume = () => { if (recRef.current?.state === 'paused') { recRef.current.resume(); startTimer(); setPhase('recording'); } };
  const stop = () => { const s = recRef.current?.state; if (s === 'recording' || s === 'paused') recRef.current!.stop(); };
  const discard = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); setBlob(null); setPreviewUrl(''); setElapsed(0); setErr(''); setPhase('idle'); };
  const closeAll = () => { stopAll(); if (previewUrl) URL.revokeObjectURL(previewUrl); setBlob(null); setPreviewUrl(''); setEditing(false); setPhase('closed'); };

  const save = async () => {
    if (!blob || !org || !me || phase === 'saving' || blob.size > RECORDING_MAX_BYTES) return;
    setPhase('saving'); setErr('');
    try {
      const thumb = await captureThumb(blob).catch(() => null);
      await uploadScreenRecording({ org_id: org.id, created_by: me.id, title: title.trim() || `Screen recording ${new Date().toLocaleString()}`, blob, duration_sec: elapsed, mime: mimeRef.current.split(';')[0], thumb });
      toast('Recording saved', 'success');
      try { window.dispatchEvent(new Event('snr:recording-saved')); } catch { /* */ }
      closeAll();
    } catch (e: any) { setErr(e.message || 'Upload failed.'); setPhase('preview'); }
  };

  // Drag handling for the floating bar
  const onDrag = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - (bar?.x ?? (window.innerWidth / 2)), dy: e.clientY - (bar?.y ?? (window.innerHeight - 60)) };
    const move = (ev: PointerEvent) => { if (!dragRef.current) return; setBar({ x: ev.clientX - dragRef.current.dx, y: ev.clientY - dragRef.current.dy }); };
    const up = () => { dragRef.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  if (phase === 'closed') return null;

  // Floating, non-blocking toolbar while recording — app stays fully usable.
  if (phase === 'recording' || phase === 'paused') {
    const style: React.CSSProperties = bar
      ? { position: 'fixed', left: bar.x, top: bar.y, transform: 'translate(-50%, -50%)', zIndex: 9999 }
      : { position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 9999 };
    return (
      <div style={style} role="toolbar" aria-label="Recording controls">
        <div style={{ background: '#17171a' }} className="flex items-center gap-2.5 rounded-full px-3 py-2 shadow-lg">
          <span className="inline-flex items-center gap-1.5 text-white text-sm font-medium tabular-nums"><span className={`w-2.5 h-2.5 rounded-full ${phase === 'paused' ? 'bg-white/40' : 'bg-rose-500 animate-pulse'}`} />{fmtDur(elapsed)}</span>
          <span className="w-px h-5 bg-white/15" />
          {phase === 'recording'
            ? <button onClick={pause} title="Pause" aria-label="Pause" className="w-8 h-8 rounded-full grid place-items-center text-white" style={{ background: 'rgba(255,255,255,0.1)' }}><Icon name="ti-player-pause" className="text-base" /></button>
            : <button onClick={resume} title="Resume" aria-label="Resume" className="w-8 h-8 rounded-full grid place-items-center text-white" style={{ background: 'rgba(255,255,255,0.1)' }}><Icon name="ti-player-play" className="text-base" /></button>}
          <button onClick={stop} title="Stop" aria-label="Stop" className="w-8 h-8 rounded-full grid place-items-center text-white" style={{ background: '#e24b4a' }}><Icon name="ti-player-stop" className="text-base" /></button>
          <span className="w-px h-5 bg-white/15" />
          {mic && <span className="text-white/70" title="Microphone on"><Icon name="ti-microphone" className="text-sm" /></span>}
          {webcam && <span className="text-white/70" title="Webcam on"><Icon name="ti-video" className="text-sm" /></span>}
          <button onPointerDown={onDrag} title="Drag" aria-label="Move toolbar" className="w-7 h-8 grid place-items-center text-white/50 cursor-move touch-none"><Icon name="ti-grip-vertical" className="text-sm" /></button>
        </div>
      </div>
    );
  }

  return (
    <Modal open onClose={phase === 'saving' ? () => {} : closeAll} size="lg" icon="ti-video" title="Record your screen"
      footer={
        phase === 'idle' ? (<>
          <button className="btn" onClick={closeAll}>Cancel</button>
          <button className="btn btn-primary" onClick={begin}><Icon name="ti-player-record" />Start recording</button>
        </>) : phase === 'countdown' ? (<span className="mx-auto text-sm text-muted">Starting…</span>
        ) : (<>
          <button className="btn mr-auto" disabled={phase === 'saving'} onClick={discard}><Icon name="ti-refresh" />Re-record</button>
          <button className="btn" disabled={phase === 'saving' || !blob} onClick={() => setEditing(true)}><Icon name="ti-scissors" />Edit</button>
          <button className="btn" disabled={phase === 'saving'} onClick={closeAll}>Cancel</button>
          <button className="btn btn-primary" disabled={phase === 'saving' || !blob || (blob && blob.size > RECORDING_MAX_BYTES)} onClick={save}>{phase === 'saving' ? 'Saving…' : 'Save recording'}</button>
        </>)
      }>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {phase === 'idle' && (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-line" style={{ aspectRatio: '16 / 9', background: '#1c1c1f' }}>
            <div className="absolute inset-0 grid place-items-center text-center px-4" style={{ color: '#8a8a90' }}>
              <span className="text-xs"><Icon name="ti-device-desktop" className="text-3xl block mb-1" />You'll choose a screen, window, or tab when you press Start</span>
            </div>
            {webcam && <video ref={camPreviewRef} muted playsInline className="absolute right-3 bottom-3 w-20 h-20 rounded-full object-cover border-2 border-white" style={{ background: '#2b2b30' }} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3">
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Audio</p>
              <ToggleRow icon="ti-volume" label="System audio" on={sysAudio} onToggle={() => setSysAudio((v) => !v)} />
              <ToggleRow icon="ti-microphone" label="Microphone" on={mic} onToggle={() => setMic((v) => !v)} />
            </div>
            <div className="card p-3">
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Camera</p>
              <ToggleRow icon="ti-user-circle" label="Webcam bubble" on={webcam} onToggle={() => setWebcam((v) => !v)} />
              {webcam ? (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-4 gap-1">
                    {([['tl', 'ti-arrow-up-left'], ['tr', 'ti-arrow-up-right'], ['bl', 'ti-arrow-down-left'], ['br', 'ti-arrow-down-right']] as const).map(([p, ic]) => (
                      <button key={p} type="button" onClick={() => setCamPos(p)} className={`btn btn-sm ${camPos === p ? 'btn-primary' : ''}`} title="Corner"><Icon name={ic} className="text-sm" /></button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {([['sm', 'S'], ['md', 'M'], ['lg', 'L']] as const).map(([sz, lbl]) => (
                      <button key={sz} type="button" onClick={() => setCamSize(sz)} className={`flex-1 btn btn-sm ${camSize === sz ? 'btn-primary' : ''}`}>{lbl}</button>
                    ))}
                  </div>
                </div>
              ) : <p className="text-2xs text-muted2 mt-1">Round webcam overlay you can position and size.</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Resolution">
              <div className="flex gap-1">
                {(['720', '1080', '1440'] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setResolution(r)} className={`flex-1 btn btn-sm ${resolution === r ? 'btn-primary' : ''}`}>{RESO[r].label}</button>
                ))}
              </div>
            </Field>
            <Field label="Frame rate">
              <div className="flex gap-1">
                {([30, 60] as const).map((fr) => (
                  <button key={fr} type="button" onClick={() => setFps(fr)} className={`flex-1 btn btn-sm ${fps === fr ? 'btn-primary' : ''}`}>{fr} fps</button>
                ))}
              </div>
            </Field>
            <Field label="Format">
              <div className="flex gap-1">
                {([['auto', 'Auto'], ['mp4', 'MP4'], ['webm', 'WebM']] as const).map(([fm, lbl]) => (
                  <button key={fm} type="button" onClick={() => setFormat(fm)} className={`flex-1 btn btn-sm ${format === fm ? 'btn-primary' : ''}`}>{lbl}</button>
                ))}
              </div>
            </Field>
          </div>
          <div className="card p-3"><ToggleRow icon="ti-pointer" label="Show mouse cursor" on={showCursor} onToggle={() => setShowCursor((v) => !v)} /></div>
          <p className="text-2xs text-muted2">{RESO[resolution].label} · {fps} fps · {format === 'auto' ? (mp4Supported ? 'MP4' : 'WebM') : format.toUpperCase()} · 3-2-1 countdown · the recorder minimizes to a floating bar so you can keep using the app · max {Math.round(RECORDING_MAX_SEC / 60)} min / {Math.round(RECORDING_MAX_BYTES / 1048576)} MB.</p>
        </div>
      )}
      {phase === 'countdown' && <div className="grid place-items-center py-12"><span className="text-6xl font-mono font-semibold text-accentstrong tabular-nums">{count > 0 ? count : 'Go'}</span></div>}
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
      {editing && blob && (
        <RecordingEditor src={blob} onCancel={() => setEditing(false)}
          onDone={(b, ext) => {
            if (ext === 'gif') { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${(title.trim() || 'recording')}.gif`; document.body.appendChild(a); a.click(); a.remove(); setEditing(false); return; }
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setBlob(b); setPreviewUrl(URL.createObjectURL(b)); setEditing(false);
          }} />
      )}
    </Modal>
  );
}
