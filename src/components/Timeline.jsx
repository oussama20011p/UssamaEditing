import React, { useRef, useState } from 'react';
import { clipSpeed, formatTime, overlayLength, videoLayout } from '../store.js';
import { editFree, reorderIndex, rulerStep, trimMain } from '../timelineEdits.js';
import { clamp, startDrag } from '../pointer.js';
import { useT } from '../i18n.jsx';
import Icon from './Icon.jsx';

const GUTTER = 96; // width of the sticky track names column
const SNAP_RADIUS = 8; // px
const MEDIA_MIME = 'application/x-ussama-media';
const ZOOM = { min: 10, max: 300 };

const lengthOn = (track, c) => (track === 'text' ? c.duration : track === 'overlay' ? overlayLength(c) : c.out - c.in);

export default function Timeline({ project, time, duration, selection, onSelect, onSeek, dispatch, actions, canUndo, canRedo, onDropMedia }) {
  const t = useT();
  const [pxPerSec, setPxPerSec] = useState(60);
  const [magnet, setMagnet] = useState(true);
  const [dropAt, setDropAt] = useState(null); // { lane, time }
  const scroller = useRef(null);
  const mediaById = Object.fromEntries(project.media.map((m) => [m.id, m]));
  const main = videoLayout(project.videoClips);
  const lists = { text: project.textClips, overlay: project.overlayClips || [], audio: project.audioClips };
  const laneCount = (track) => 1 + Math.max(0, ...lists[track].map((c) => c.lane || 0));
  const contentWidth = Math.max((duration + 15) * pxPerSec, 800);
  const zoomBy = (k) => setPxPerSec((v) => clamp(v * k, ZOOM.min, ZOOM.max));

  const timeAt = (clientX) => {
    const box = scroller.current.getBoundingClientRect();
    return Math.max(0, (clientX - box.left - GUTTER + scroller.current.scrollLeft) / pxPerSec);
  };

  // Snap targets: start, playhead, main-track cuts and the edges of other free clips.
  const snapperFor = (skipId) => {
    const points = [0, time, ...main.map((m) => m.end)];
    for (const [track, list] of Object.entries(lists)) {
      for (const c of list) if (c.id !== skipId) points.push(c.start, c.start + lengthOn(track, c));
    }
    const reach = SNAP_RADIUS / pxPerSec;
    return (v) => {
      if (!magnet) return v;
      const near = points.reduce((best, p) => (Math.abs(p - v) < Math.abs(best - v) ? p : best), Infinity);
      return Math.abs(near - v) <= reach ? near : v;
    };
  };

  const scrub = (e) => {
    onSelect(null);
    onSeek(timeAt(e.clientX));
    startDrag(e, { onMove: (_dx, _dy, ev) => onSeek(timeAt(ev.clientX)) });
  };

  const grabMain = (e, clip, edge) => {
    onSelect({ track: 'video', id: clip.id });
    const before = { ...clip };
    const media = mediaById[clip.mediaId];
    startDrag(e, {
      history: dispatch,
      onMove: (dx, _dy, ev) => {
        if (edge) dispatch({ type: 'update', track: 'video', id: clip.id, patch: trimMain(before, edge, dx / pxPerSec, media) });
        else dispatch({ type: 'moveVideo', id: clip.id, toIndex: reorderIndex(project.videoClips, clip.id, timeAt(ev.clientX)) });
      },
    });
  };

  const grabFree = (e, track, clip, edge) => {
    onSelect({ track, id: clip.id });
    const before = { ...clip };
    const snap = snapperFor(clip.id);
    const rowHeight = e.currentTarget.closest('.tl-row')?.offsetHeight || 44;
    const topLane = laneCount(track);
    startDrag(e, {
      history: dispatch,
      onMove: (dx, dy) => {
        const patch = editFree(track, before, edge, dx / pxPerSec, mediaById[clip.mediaId], snap);
        if (!edge) {
          // Vertical moves change lane. Audio lanes stack downwards, the others upwards.
          const steps = Math.round(dy / rowHeight) * (track === 'audio' ? 1 : -1);
          patch.lane = clamp((before.lane || 0) + steps, 0, topLane);
        }
        dispatch({ type: 'update', track, id: clip.id, patch });
      },
    });
  };

  const grabCaption = (e, group) => {
    onSelect({ track: 'caption', id: group.id });
    const before = group;
    startDrag(e, {
      history: dispatch,
      onMove: (dx) => {
        const shift = Math.max(-before.start, dx / pxPerSec);
        const words = before.words.map((w) => ({ ...w, start: w.start + shift, end: w.end + shift }));
        dispatch({ type: 'update', track: 'caption', id: group.id, patch: { start: before.start + shift, end: before.end + shift, words } });
      },
    });
  };

  // Drops from the media library.
  const dropZone = (lane) => ({
    'data-lane': lane,
    onPointerDown: scrub,
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(MEDIA_MIME)) return;
      e.preventDefault();
      setDropAt({ lane, time: timeAt(e.clientX) });
    },
    onDragLeave: () => setDropAt(null),
    onDrop: (e) => {
      const id = e.dataTransfer.getData(MEDIA_MIME);
      setDropAt(null);
      if (!id) return;
      e.preventDefault();
      const at = timeAt(e.clientX);
      onDropMedia(id, at, main.filter((m) => (m.start + m.end) / 2 < at).length, lane);
    },
  });
  const dropLine = (lane) => dropAt?.lane === lane && <div className="drop-line" style={{ left: dropAt.time * pxPerSec }} />;

  const fitAll = () => setPxPerSec(clamp(((scroller.current?.clientWidth || 1000) - GUTTER - 40) / Math.max(duration, 1), ZOOM.min, ZOOM.max));

  const step = rulerStep(pxPerSec);
  const ticks = Array.from({ length: Math.ceil(contentWidth / pxPerSec / step) }, (_, i) => i * step);

  const isSelected = (track, id) => selection?.track === track && selection.id === id;
  const block = (track, clip, props) => (
    <Block key={clip.id} track={track} clip={clip} pxPerSec={pxPerSec} selected={isSelected(track, clip.id)} {...props} />
  );

  // Lanes are listed top to bottom: text, captions, overlays, main video, audio.
  const freeLanes = (track) => Array.from({ length: laneCount(track) }, (_, i) => i);
  const textLanes = freeLanes('text').reverse();
  const overlayLanes = freeLanes('overlay').reverse();
  const audioLanes = freeLanes('audio');
  const laneName = (key, n) => `${t(key)}${n ? ` ${n + 1}` : ''}`;

  const tools = [
    ['undo', actions.undo, t('undo'), !canUndo],
    ['redo', actions.redo, t('redo'), !canRedo],
    null,
    ['scissors', actions.split, t('split')],
    ['trimLeft', () => actions.trimSide('left'), t('trimLeft')],
    ['trimRight', () => actions.trimSide('right'), t('trimRight')],
    ['trash', actions.remove, t('deleteClip'), !selection],
    ['copy', actions.duplicate, t('duplicate'), !selection || selection.track === 'caption'],
    ['freeze', actions.freezeFrame, t('freeze')],
    ['reverse', actions.reverse, t('reverse')],
    null,
    ['text', () => actions.addText('title'), t('addText')],
  ];

  return (
    <section className="timeline">
      <div className="tl-toolbar">
        {tools.map((tool, i) => (tool
          ? <button key={tool[0]} className="icon-btn" onClick={tool[1]} title={tool[2]} disabled={tool[3]}><Icon name={tool[0]} /></button>
          : <span key={`sep${i}`} className="sep" />))}
        <div className="spacer" />
        <button className={`icon-btn ${magnet ? 'on' : ''}`} onClick={() => setMagnet(!magnet)} title={t('snapping')}><Icon name="magnet" /></button>
        <span className="sep" />
        <button className="icon-btn" onClick={() => zoomBy(1 / 1.4)} title="Zoom −"><Icon name="zoomOut" /></button>
        <input type="range" min={ZOOM.min} max={ZOOM.max} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} />
        <button className="icon-btn" onClick={() => zoomBy(1.4)} title="Zoom +"><Icon name="zoomIn" /></button>
        <button className="small" onClick={fitAll}>{t('fit')}</button>
      </div>

      <div className="tl-scroll" ref={scroller}>
        <div className="tl-content" style={{ width: contentWidth + GUTTER }}>
          <div className="tl-row ruler" onPointerDown={scrub}>
            <div className="tl-head" />
            <div className="tl-lane">
              {ticks.map((s) => <div key={s} className="tick" style={{ left: s * pxPerSec }}>{formatTime(s).slice(0, 5)}</div>)}
            </div>
          </div>

          {textLanes.map((n) => (
            <div className="tl-row" key={`text${n}`}>
              <div className="tl-head"><Icon name="text" size={15} /> {laneName('laneText', n)}</div>
              <div className="tl-lane" {...dropZone('text')}>
                {project.textClips.filter((c) => (c.lane || 0) === n).map((c) =>
                  block('text', c, { start: c.start, length: c.duration, label: c.text, icon: 'text', onGrab: (e, edge) => grabFree(e, 'text', c, edge) }))}
              </div>
            </div>
          ))}

          {project.captions?.length > 0 && (
            <div className="tl-row caption-row">
              <div className="tl-head"><Icon name="captions" size={15} /> {t('laneCaptions')}</div>
              <div className="tl-lane" onPointerDown={scrub}>
                {project.captions.map((g) =>
                  block('caption', g, { start: g.start, length: g.end - g.start, label: g.words.map((w) => w.text).join(' '), onGrab: (e) => grabCaption(e, g) }))}
              </div>
            </div>
          )}

          {overlayLanes.map((n) => (
            <div className="tl-row overlay-row" key={`ov${n}`}>
              <div className="tl-head"><Icon name="layers" size={15} /> {laneName('laneOverlay', n)}</div>
              <div className={`tl-lane ${dropAt?.lane === 'overlay' ? 'drop' : ''}`} {...dropZone('overlay')}>
                {n === 0 && !lists.overlay.length && <div className="lane-empty small">{t('dropPipHere')}</div>}
                {lists.overlay.filter((o) => (o.lane || 0) === n).map((o) => {
                  const m = mediaById[o.mediaId];
                  return block('overlay', o, {
                    start: o.start, length: overlayLength(o), media: m, keyframes: o.keyframes,
                    label: m?.sticker ? `${m.sticker} Sticker` : m?.name ?? '?', icon: m?.sticker ? null : 'layers',
                    onGrab: (e, edge) => grabFree(e, 'overlay', o, edge),
                  });
                })}
                {n === 0 && dropLine('overlay')}
              </div>
            </div>
          ))}

          <div className="tl-row main">
            <div className="tl-head"><Icon name="media" size={15} /> {t('laneVideo')}</div>
            <div className={`tl-lane ${dropAt?.lane === 'video' ? 'drop' : ''}`} {...dropZone('video')}>
              {!main.length && <div className="lane-empty">{t('dropVideoHere')}</div>}
              {main.map(({ clip, start, end }) => {
                const m = mediaById[clip.mediaId];
                const flags = [clip.filter && clip.filter !== 'none' && '🎨', clip.motion && clip.motion !== 'none' && '🔍', clip.muted && '🔇'].filter(Boolean);
                return block('video', clip, {
                  start, length: end - start, media: m, flags, showLength: true,
                  label: `${clipSpeed(clip) !== 1 ? `${clipSpeed(clip)}× · ` : ''}${m?.name ?? '?'}`,
                  onGrab: (e, edge) => grabMain(e, clip, edge),
                });
              })}
              {main.slice(1).map(({ clip, start, overlap }) => (
                <button key={`cut${clip.id}`} className={`tr-mark ${clip.transition?.type && clip.transition.type !== 'none' ? 'set' : ''}`}
                  style={{ left: (start + (overlap || 0) / 2) * pxPerSec }} title={clip.transition?.type || 'Transition'}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect({ track: 'video', id: clip.id });
                    actions.openTransitions();
                  }}>
                  <Icon name="transition" size={12} />
                </button>
              ))}
              {dropLine('video')}
            </div>
          </div>

          {audioLanes.map((n) => (
            <div className="tl-row audio-row" key={`au${n}`}>
              <div className="tl-head"><Icon name="audio" size={15} /> {n ? `Audio ${n + 1}` : t('laneMusic')}</div>
              <div className={`tl-lane ${dropAt?.lane === 'audio' ? 'drop' : ''}`} {...dropZone('audio')}>
                {project.audioClips.filter((c) => (c.lane || 0) === n).map((c) =>
                  block('audio', c, { start: c.start, length: c.out - c.in, media: mediaById[c.mediaId], label: mediaById[c.mediaId]?.name ?? '?', icon: 'audio', onGrab: (e, edge) => grabFree(e, 'audio', c, edge) }))}
                {n === 0 && dropLine('audio')}
              </div>
            </div>
          ))}

          <div className="playhead" style={{ left: GUTTER + time * pxPerSec }} />
        </div>
      </div>
    </section>
  );
}

// One clip on a lane: body drags it, the two edges trim it.
function Block({ track, clip, start, length, label, icon, media, flags, keyframes, showLength, selected, pxPerSec, onGrab }) {
  const width = Math.max(4, length * pxPerSec);
  const visual = (track === 'video' || track === 'overlay') && media?.thumb;
  const audible = (track === 'video' || track === 'audio') && media?.peaks && !clip.muted;
  return (
    <div className={`clip ${track}${selected ? ' selected' : ''}`} dir="auto" title={label}
      style={{ left: start * pxPerSec, width }} onPointerDown={(e) => onGrab(e, null)}>
      {visual && <div className="clip-thumbs" style={{ backgroundImage: `url(${media.thumb})` }} />}
      {keyframes?.map((k) => <i key={k.t} className="kf" style={{ left: k.t * pxPerSec }} />)}
      {audible && <Waveform peaks={media.peaks} perSecond={media.peaksPerSec || 20} from={clip.in} to={clip.out} width={width} kind={track} />}
      <span className="edge start" onPointerDown={(e) => onGrab(e, 'start')} />
      <span className="clip-label">
        {icon && <Icon name={icon} size={12} />}
        {label}
        {flags?.length > 0 && <span className="badges">{flags.join(' ')}</span>}
      </span>
      {showLength && <span className="clip-dur">{formatTime(length).slice(0, 5)}</span>}
      <span className="edge end" onPointerDown={(e) => onGrab(e, 'end')} />
    </div>
  );
}

// Peak bars for the part of the source the clip plays (from..to seconds), ~one bar per 3 px.
function Waveform({ peaks, perSecond, from, to, width, kind }) {
  const first = Math.floor(from * perSecond);
  const last = Math.min(peaks.length, Math.ceil(to * perSecond));
  const bars = Math.max(1, Math.min(Math.floor(width / 3), last - first));
  const span = (last - first) / bars;
  const d = Array.from({ length: bars }, (_, i) => {
    const slice = peaks.slice(Math.floor(first + i * span), Math.max(Math.floor(first + (i + 1) * span), Math.floor(first + i * span) + 1));
    const level = Math.max(2, ...slice);
    return `M${((i * 100) / bars).toFixed(2)} ${100 - level}V100`;
  }).join('');
  return (
    <svg className={`wave ${kind}`} viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
