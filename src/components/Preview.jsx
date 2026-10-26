import React, { useEffect, useRef } from 'react';
import { follow, halt, useFitScale, usePlayhead } from '../playback.js';
import { clamp, startDrag } from '../pointer.js';
import { clipSpeed, formatTime, overlayLength, toFileUrl, veilAt, videoLayout } from '../store.js';
import kfModule from '../../shared/keyframes.cjs';
import { captionView, textClipStyle } from '../textStyle.js';
import { LookDefs, clipLook, lookCss } from '../look.jsx';
import { useT } from '../i18n.jsx';
import Icon, { Logo } from './Icon.jsx';

const { valueAt, popAt } = kfModule;

// Same zoom curve as the export (electron/ffmpeg.cjs).
function zoomAt(clip, progress) {
  if (clip.motion === 'zoomIn') return 1 + 0.15 * progress;
  if (clip.motion === 'zoomOut') return 1.15 - 0.15 * progress;
  return 1;
}

// CSS for the outgoing (a) and incoming (b) clip at progress p of an xfade transition.
// Approximates FFmpeg's xfade so the preview reads like the export.
function transitionStyles(type, p) {
  const q = (1 - p) * 100;
  switch (type) {
    case 'slideleft': return { a: { transform: `translateX(${-p * 100}%)` }, b: { transform: `translateX(${q}%)` } };
    case 'slideright': return { a: { transform: `translateX(${p * 100}%)` }, b: { transform: `translateX(${-q}%)` } };
    case 'slideup': return { a: { transform: `translateY(${-p * 100}%)` }, b: { transform: `translateY(${q}%)` } };
    case 'slidedown': return { a: { transform: `translateY(${p * 100}%)` }, b: { transform: `translateY(${-q}%)` } };
    case 'wipeleft': return { a: {}, b: { clipPath: `inset(0 0 0 ${q}%)` } };
    case 'wiperight': return { a: {}, b: { clipPath: `inset(0 ${q}% 0 0)` } };
    case 'circleopen': return { a: {}, b: { clipPath: `circle(${p * 75}% at 50% 50%)` } };
    case 'zoomin': return { a: { transform: `scale(${1 + p * 0.6})`, opacity: 1 - p }, b: { opacity: p } };
    case 'hblur': return { a: { blur: Math.sin(Math.PI * p) * 18 }, b: { opacity: p, blur: Math.sin(Math.PI * p) * 18 } };
    case 'squeezeh': return { a: { transform: `scaleY(${1 - p})` }, b: { opacity: p } };
    default: return { a: {}, b: { opacity: p } }; // fade, dissolve, pixelize, radial
  }
}

export default function Preview({ project, time, seekVer, playing, duration, onTime, onEnd, onTogglePlay, onSeek, selection, onSelect, dispatch }) {
  const t = useT();
  // Two picture slots: even clips use slot 0, odd clips slot 1, so a transition never swaps an element's source.
  const videoRefs = [useRef(null), useRef(null)];
  const imageRefs = [useRef(null), useRef(null)];
  const veilRef = useRef(null);
  const audioEls = useRef({});
  const overlayEls = useRef({});
  const stageRef = useRef(null);
  const wrapRef = useRef(null);
  const mediaById = Object.fromEntries(project.media.map((m) => [m.id, m]));
  const layout = videoLayout(project.videoClips);
  const activeNow = layout.map((l, i) => ({ ...l, i })).filter((l) => time >= l.start && time < l.end);
  const lives = [0, 1].map((k) => {
    const it = activeNow.find((l) => l.i % 2 === k);
    return it ? clipLook(it.clip) : null;
  });

  const apply = (t, isPlaying) => {
    const active = videoLayout(project.videoClips).map((l, i) => ({ ...l, i })).filter((l) => t >= l.start && t < l.end);
    const tr = active.length === 2
      ? transitionStyles(active[1].clip.transition?.type, (t - active[1].start) / Math.max(1e-3, active[0].end - active[1].start))
      : null;
    [0, 1].forEach((k) => {
      const v = videoRefs[k].current;
      const img = imageRefs[k].current;
      const it = active.find((l) => l.i % 2 === k);
      const m = it && mediaById[it.clip.mediaId];
      if (!m) {
        v.style.visibility = 'hidden';
        img.style.visibility = 'hidden';
        halt(v);
        return;
      }
      const c = it.clip;
      const extra = tr ? (it === active[1] ? tr.b : tr.a) : {};
      const z = zoomAt(c, (t - it.start) / (it.end - it.start));
      const el = m.type === 'image' ? img : v;
      const other = m.type === 'image' ? v : img;
      other.style.visibility = 'hidden';
      if (m.type === 'image') halt(v);
      el.style.visibility = 'visible';
      // The incoming clip sits on top only while a transition runs.
      el.style.zIndex = tr ? String(it.i + 1) : '';
      el.style.objectFit = c.fit === 'fit' ? 'contain' : 'cover';
      el.style.filter = lookCss(clipLook(c), `f-live${k}`) + (extra.blur ? ` blur(${extra.blur}px)` : '');
      el.style.transform = `${extra.transform || ''} scale(${c.mirror ? -z : z}, ${z})`;
      el.style.opacity = extra.opacity ?? 1;
      el.style.clipPath = extra.clipPath || 'none';
      if (m.type === 'image') {
        const url = toFileUrl(m.path);
        if (img.dataset.src !== url) { img.dataset.src = url; img.src = url; }
      } else {
        const sp = clipSpeed(c);
        follow(v, { src: toFileUrl(m.path), at: c.in + (t - it.start) * sp, playing: isPlaying, volume: c.muted ? 0 : c.volume ?? 1, rate: sp });
      }
    });
    const veil = veilAt(project, t);
    veilRef.current.style.opacity = veil.a;
    veilRef.current.style.background = veil.color;
    (project.overlayClips || []).forEach((o) => {
      const el = overlayEls.current[o.id];
      const m = mediaById[o.mediaId];
      if (!el || !m || m.type !== 'video') return;
      const len = overlayLength(o);
      if (t >= o.start && t < o.start + len) follow(el, { src: toFileUrl(m.path), at: o.in + (t - o.start) * clipSpeed(o), playing: isPlaying, volume: o.muted ? 0 : o.volume ?? 1, rate: clipSpeed(o) });
      else halt(el);
    });
    project.audioClips.forEach((c) => {
      const el = audioEls.current[c.id];
      const m = mediaById[c.mediaId];
      if (!el || !m) return;
      const len = c.out - c.in;
      const lt = t - c.start;
      if (t >= c.start && t < c.start + len) {
        let vol = c.volume ?? 1;
        if (c.fadeIn && lt < c.fadeIn) vol *= lt / c.fadeIn;
        if (c.fadeOut && len - lt < c.fadeOut) vol *= (len - lt) / c.fadeOut;
        follow(el, { src: toFileUrl(m.path), at: c.in + lt, playing: isPlaying, volume: vol });
      } else halt(el);
    });
  };

  usePlayhead({ time, playing, end: duration, restartKey: seekVer, render: apply, onTime, onEnd });
  const scale = useFitScale(stageRef, project.width);

  // Pull values within ~1.5% of the frame centre onto it.
  const centred = (v, reach) => (Math.abs(v - 0.5) < reach ? 0.5 : v);
  const frameDelta = (dx, dy) => {
    const box = stageRef.current.getBoundingClientRect();
    return [dx / box.width, dy / box.height];
  };

  // Text: drag to place it (one undo step per drag).
  const grabText = (e, clip) => {
    onSelect({ track: 'text', id: clip.id });
    const from = { x: clip.x, y: clip.y };
    startDrag(e, {
      history: dispatch,
      onMove: (dx, dy) => {
        const [fx, fy] = frameDelta(dx, dy);
        dispatch({ type: 'update', track: 'text', id: clip.id, patch: { x: clamp(centred(from.x + fx, 0.015), 0, 1), y: clamp(centred(from.y + fy, 0.012), 0, 1) } });
      },
    });
  };

  // Overlay: drag to move, corner handle to resize. A keyframed overlay gets a keyframe at the playhead.
  const grabOverlay = (e, clip, resize) => {
    onSelect({ track: 'overlay', id: clip.id });
    const local = Math.max(0, time - clip.start);
    const from = { x: valueAt(clip, 'x', local), y: valueAt(clip, 'y', local), scale: valueAt(clip, 'scale', local) };
    const keyed = (clip.keyframes || []).length > 0;
    startDrag(e, {
      history: dispatch,
      onMove: (dx, dy) => {
        const [fx, fy] = frameDelta(dx, dy);
        const values = resize ? { scale: clamp(from.scale + fx * 2, 0.05, 2) } : { x: centred(from.x + fx, 0.015), y: centred(from.y + fy, 0.012) };
        if (keyed) dispatch({ type: 'setKeyframe', id: clip.id, t: local, values: { ...from, ...values } });
        else dispatch({ type: 'update', track: 'overlay', id: clip.id, patch: values });
      },
    });
  };

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current.requestFullscreen?.();
  };

  const cuts = [0, ...layout.map((l) => l.end)];
  const prevCut = () => onSeek([...cuts].reverse().find((c) => c < time - 0.05) ?? 0);
  const nextCut = () => onSeek(cuts.find((c) => c > time + 0.05) ?? duration);

  const texts = project.textClips.filter((c) => time >= c.start && time < c.start + c.duration).sort((a, b) => (a.lane || 0) - (b.lane || 0));
  const cap = captionView(project.captions || [], project.captionStyle, time, scale);
  const selectedText = selection?.track === 'text' ? selection.id : null;
  const byLane = (a, b) => (a.lane || 0) - (b.lane || 0);
  const overlays = (project.overlayClips || []).filter((o) => time >= o.start && time < o.start + overlayLength(o)).sort(byLane);

  return (
    <section className="preview">
      <LookDefs lives={lives} />
      <div className="player-head">
        <span className="label">{t('player')}</span>
        <span className="chips"><span>{project.format || 'Custom'}</span><span>{project.width}×{project.height}</span><span>{project.fps} FPS</span></span>
      </div>
      <div className="stage-wrap" ref={wrapRef} onPointerDown={() => selectedText && onSelect(null)}>
        <div className="stage" ref={stageRef} style={{ aspectRatio: `${project.width} / ${project.height}`, width: `min(100cqw, calc(100cqh * ${project.width / project.height}))` }}>
          {[0, 1].map((k) => (
            <React.Fragment key={k}>
              <video ref={videoRefs[k]} className="main-video" preload="auto" playsInline />
              <img ref={imageRefs[k]} className="main-image" alt="" draggable={false} />
            </React.Fragment>
          ))}
          <div className="veil" ref={veilRef} />
          {project.audioClips.map((c) => (
            <audio key={c.id} ref={(el) => { if (el) audioEls.current[c.id] = el; else delete audioEls.current[c.id]; }} preload="auto" />
          ))}
          {overlays.map((o) => {
            const m = mediaById[o.mediaId];
            if (!m) return null;
            const lt = time - o.start;
            const sc = valueAt(o, 'scale', lt) * popAt(o, lt);
            const square = o.shape === 'circle';
            const ratio = square ? 1 : (m.width || 1) / (m.height || 1);
            const style = {
              left: `${valueAt(o, 'x', lt) * 100}%`, top: `${valueAt(o, 'y', lt) * 100}%`,
              width: `${sc * 100}%`, aspectRatio: String(ratio), opacity: o.opacity ?? 1,
              transform: `translate(-50%, -50%) rotate(${o.rotation || 0}deg)`,
              borderRadius: o.shape === 'circle' ? '50%' : o.shape === 'rounded' ? `${12 / Math.max(1, ratio)}% / ${12 * Math.min(1, ratio)}%` : 0,
              border: o.shape === 'circle' && o.ring ? `${o.ring * scale}px solid ${o.ringColor}` : 'none',
            };
            const sel = selection?.track === 'overlay' && selection.id === o.id;
            return (
              <div key={o.id} className={`overlay-media ${sel ? 'selected' : ''}`} style={style} onPointerDown={(e) => grabOverlay(e, o, false)}>
                {m.type === 'video' ? (
                  o.chroma?.on
                    ? <ChromaVideo innerRef={(el) => { if (el) overlayEls.current[o.id] = el; else delete overlayEls.current[o.id]; }} chroma={o.chroma} />
                    : <video ref={(el) => { if (el) overlayEls.current[o.id] = el; else delete overlayEls.current[o.id]; }} preload="auto" playsInline muted={false} />
                ) : <img src={toFileUrl(m.path)} alt="" draggable={false} />}
                {sel && <div className="resize-handle" onPointerDown={(e) => grabOverlay(e, o, true)} />}
              </div>
            );
          })}
          {cap && (
            <div className="overlay-text caption" dir="auto" style={cap.style}>
              {cap.words.map((w, i) => (
                <React.Fragment key={i}>
                  {i > 0 && ' '}
                  <span style={w.style}>{w.text}</span>
                </React.Fragment>
              ))}
            </div>
          )}
          {texts.map((t) => (
            <div key={t.id} className={`overlay-text draggable ${selectedText === t.id ? 'selected' : ''}`} dir="auto"
              style={textClipStyle(t, time - t.start, scale, project.height)} onPointerDown={(e) => grabText(e, t)}>{t.text}</div>
          ))}
          {!project.videoClips.length && (
            <div className="stage-empty">
              <Logo size={72} className="empty-logo" />
              <b>{t('startEditing')}</b>
              <span>{t('importOrDrop')}</span>
            </div>
          )}
        </div>
      </div>
      <div className="transport">
        <span className="tc lcd"><b>{formatTime(time)}</b><i>/ {formatTime(duration)}</i></span>
        <div className="transport-mid">
          <button className="icon-btn" onClick={prevCut} title="Coupure li 9bel"><Icon name="prev" /></button>
          <button className="play" onClick={onTogglePlay} title="Space"><Icon name={playing ? 'pause' : 'play'} className="fill" /></button>
          <button className="icon-btn" onClick={nextCut} title="Coupure jaya"><Icon name="next" /></button>
        </div>
        <button className="icon-btn" onClick={fullscreen} title="Plein écran"><Icon name="maximize" /></button>
      </div>
    </section>
  );
}


// Live chroma key for the preview: the video is drawn to a canvas and pixels near the key colour are cleared.
// Matches FFmpeg colorkey (RGB distance, similarity + small blend) used at export.
function ChromaVideo({ innerRef, chroma }) {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => {
    let raf;
    const [kr, kg, kb] = [1, 3, 5].map((i) => parseInt((chroma.color || '#00ff00').slice(i, i + 2), 16));
    const sim = chroma.similarity ?? 0.3;
    const draw = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.videoWidth) {
        const w = 360;
        const h = Math.round((w * v.videoHeight) / v.videoWidth);
        if (c.width !== w) { c.width = w; c.height = h; }
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const dist = Math.sqrt(((d[i] - kr) ** 2 + (d[i + 1] - kg) ** 2 + (d[i + 2] - kb) ** 2) / 3) / 255;
          if (dist < sim) d[i + 3] = 0;
          else if (dist < sim + 0.08) d[i + 3] = Math.round(((dist - sim) / 0.08) * 255);
        }
        ctx.putImageData(img, 0, 0);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [chroma.color, chroma.similarity]);
  return (
    <>
      <video ref={(el) => { videoRef.current = el; innerRef(el); }} preload="auto" playsInline style={{ display: 'none' }} />
      <canvas ref={canvasRef} />
    </>
  );
}
