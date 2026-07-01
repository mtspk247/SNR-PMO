import { useEffect, useRef, useState } from 'react';
import { Modal, Field } from '@/components/Modal';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';

// Client-side, canvas-based recording editor — no ffmpeg. Re-records the source clip through a
// canvas (trim/timelapse/brightness/crop/watermark) into WebM, or samples frames into a GIF.
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const loadScript = (src: string) => new Promise<void>((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) return res();
  const el = document.createElement('script'); el.src = src; el.onload = () => res(); el.onerror = () => rej(new Error('load failed')); document.head.appendChild(el);
});

export default function RecordingEditor({ src, onCancel, onDone }: { src: Blob; onCancel: () => void; onDone: (b: Blob, ext: string) => void }) {
  const vref = useRef<HTMLVideoElement | null>(null);
  const [url] = useState(() => URL.createObjectURL(src));
  const [dur, setDur] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [bright, setBright] = useState(1);
  const [crop, setCrop] = useState<'none' | '16:9' | '1:1' | '4:3'>('none');
  const [wm, setWm] = useState('');
  const [audio, setAudio] = useState(true);
  const [fmtOut, setFmtOut] = useState<'webm' | 'gif'>('webm');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => () => { try { URL.revokeObjectURL(url); } catch { /* */ } }, [url]);
  const onMeta = () => { const v = vref.current!; const d = isFinite(v.duration) ? v.duration : 0; setDur(d); setEnd(d || 0); };

  const cropDims = (w: number, h: number) => {
    if (crop === 'none') return { sx: 0, sy: 0, sw: w, sh: h };
    const [aw, ah] = crop.split(':').map(Number); const target = aw / ah; const cur = w / h;
    if (cur > target) { const sw = Math.round(h * target); return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h }; }
    const sh = Math.round(w / target); return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh };
  };
  const drawWm = (ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    if (!wm.trim()) return;
    const fs = Math.max(14, Math.round(cw * 0.03)); ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textBaseline = 'bottom'; const pad = Math.round(fs * 0.6); const tw = ctx.measureText(wm).width;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cw - tw - pad * 2.4, ch - fs - pad * 1.8, tw + pad * 1.6, fs + pad * 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillText(wm, cw - tw - pad * 1.6, ch - pad);
  };

  const exportWebm = async (): Promise<Blob> => {
    const v = vref.current!; const { sx, sy, sw, sh } = cropDims(v.videoWidth, v.videoHeight);
    const canvas = document.createElement('canvas'); canvas.width = sw; canvas.height = sh; const ctx = canvas.getContext('2d')!;
    const stream = (canvas as any).captureStream(30) as MediaStream;
    let ac: AudioContext | null = null;
    if (audio && speed === 1) {
      try { const AC = (window as any).AudioContext || (window as any).webkitAudioContext; ac = new AC();
        const s = ac.createMediaElementSource(v); const dest = ac.createMediaStreamDestination(); s.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); } catch { /* no audio */ }
    }
    const mime = (window as any).MediaRecorder?.isTypeSupported?.('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    const mr = new MediaRecorder(stream, { mimeType: mime }); const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>((res) => { mr.onstop = () => res(new Blob(chunks, { type: 'video/webm' })); });
    v.currentTime = start; await new Promise((r) => { v.onseeked = () => r(null); });
    v.muted = !(audio && speed === 1); v.playbackRate = speed; mr.start();
    await v.play().catch(() => {});
    await new Promise<void>((res) => {
      const step = () => {
        if (v.currentTime >= end || v.ended) { res(); return; }
        (ctx as any).filter = `brightness(${bright})`; ctx.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh); (ctx as any).filter = 'none'; drawWm(ctx, sw, sh);
        setProg(`${Math.min(100, Math.round(((v.currentTime - start) / Math.max(0.1, end - start)) * 100))}%`);
        requestAnimationFrame(step);
      };
      step();
    });
    v.pause(); mr.stop(); if (ac) { try { ac.close(); } catch { /* */ } }
    return done;
  };

  const exportGif = async (): Promise<Blob> => {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js');
    const GIF = (window as any).GIF; if (!GIF) throw new Error('GIF encoder unavailable');
    const v = vref.current!; const { sx, sy, sw, sh } = cropDims(v.videoWidth, v.videoHeight);
    const scale = Math.min(1, 480 / sw); const gw = Math.round(sw * scale), gh = Math.round(sh * scale);
    const canvas = document.createElement('canvas'); canvas.width = gw; canvas.height = gh; const ctx = canvas.getContext('2d')!;
    const gif = new GIF({ workers: 2, quality: 10, width: gw, height: gh, workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js' });
    const fps = 8; const step = (1 / fps) * speed; const frames: number[] = [];
    for (let t = start; t < end; t += step) frames.push(t);
    for (let i = 0; i < frames.length; i++) {
      v.currentTime = frames[i]; await new Promise((r) => { v.onseeked = () => r(null); });
      (ctx as any).filter = `brightness(${bright})`; ctx.drawImage(v, sx, sy, sw, sh, 0, 0, gw, gh); (ctx as any).filter = 'none'; drawWm(ctx, gw, gh);
      gif.addFrame(ctx, { copy: true, delay: Math.round(1000 / fps) });
      setProg(`${Math.round(((i + 1) / frames.length) * 100)}% (frames)`);
    }
    return new Promise<Blob>((res, rej) => { gif.on('finished', (b: Blob) => res(b)); gif.on('abort', () => rej(new Error('gif aborted'))); gif.render(); });
  };

  const run = async () => {
    if (busy) return; setBusy(true); setErr(''); setProg('starting…');
    try {
      const out = fmtOut === 'gif' ? await exportGif() : await exportWebm();
      onDone(out, fmtOut);
    } catch (e: any) { setErr(e?.message || 'Processing failed. Try WebM, a shorter trim, or fewer effects.'); setBusy(false); setProg(''); }
  };

  const clampEnd = Math.max(start + 0.5, end);
  return (
    <Modal open onClose={busy ? () => {} : onCancel} size="lg" icon="ti-scissors" title="Edit recording"
      footer={<>
        <button className="btn mr-auto" disabled={busy} onClick={onCancel}>Cancel</button>
        <span className="text-2xs text-muted2 self-center">{busy ? `Processing ${prog}` : `${fmt(clampEnd - start)} · ${fmtOut.toUpperCase()}`}</span>
        <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Processing…' : 'Apply & use'}</button>
      </>}>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <video ref={vref} src={url} onLoadedMetadata={onMeta} controls className="w-full rounded-lg bg-black max-h-[38vh] mb-3" />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={`Trim start — ${fmt(start)}`}><input type="range" className="w-full" min={0} max={dur || 0} step={0.1} value={start} onChange={(e) => { const n = Math.min(Number(e.target.value), clampEnd - 0.5); setStart(n); }} /></Field>
        <Field label={`Trim end — ${fmt(clampEnd)}`}><input type="range" className="w-full" min={0} max={dur || 0} step={0.1} value={clampEnd} onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.5))} /></Field>
        <Field label="Speed (timelapse)"><Select value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={[{ value: '1', label: '1× (normal)' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }, { value: '8', label: '8× timelapse' }]} /></Field>
        <Field label={`Brightness — ${bright.toFixed(2)}×`}><input type="range" className="w-full" min={0.5} max={1.6} step={0.05} value={bright} onChange={(e) => setBright(Number(e.target.value))} /></Field>
        <Field label="Crop"><Select value={crop} onChange={(v) => setCrop(v as any)} options={[{ value: 'none', label: 'Original' }, { value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '1:1', label: 'Square 1:1' }]} /></Field>
        <Field label="Export as"><Select value={fmtOut} onChange={(v) => setFmtOut(v as any)} options={[{ value: 'webm', label: 'Video (WebM)' }, { value: 'gif', label: 'Animated GIF' }]} /></Field>
        <Field label="Watermark text" hint="Shown bottom-right; leave blank for none"><input className="input" value={wm} onChange={(e) => setWm(e.target.value)} placeholder="© Your Company" /></Field>
        <Field label="Audio"><label className="flex items-center gap-2 text-sm text-content h-9"><input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />Keep audio (1× WebM only)</label></Field>
      </div>
      <p className="text-2xs text-muted2 mt-2">Processing runs in your browser and re-encodes the trimmed range. Timelapse/GIF drop audio. Longer clips take longer.</p>
    </Modal>
  );
}
