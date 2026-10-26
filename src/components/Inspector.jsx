import React, { useEffect, useState } from 'react';
import { CAPTION_PRESETS, MOTIONS, SHAPES, TEXT_ANIMS, TEXT_STYLES, TRANSITIONS, clipLength, formatTime, mediaMax, overlayLength } from '../store.js';
import { retimeText } from '../captions.js';
import { FILTERS, FILTER_IDS } from '../look.jsx';
import Icon from './Icon.jsx';
import { useT } from '../i18n.jsx';

// Number box that ignores empty input while typing.
function Num({ label, value, onChange, step = 0.1, min, max }) {
  const shown = Math.round((value ?? 0) * 100) / 100;
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={shown} step={step} min={min} max={max}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (!Number.isNaN(v)) onChange(v);
        }} />
    </label>
  );
}

// Range slider with its value on the right; double-click the value to reset when onReset is given.
function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, fmt = String, onReset }) {
  return (
    <label className="field">
      <span>
        {label}
        <b onDoubleClick={onReset} title={onReset ? 'Double-click: reset' : undefined}>{fmt(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.valueAsNumber)} />
    </label>
  );
}

function Choice({ label, value, options, onChange }) {
  return (
    <div className="field">
      {label && <span>{label}</span>}
      <div className="seg">
        {Object.entries(options).map(([k, v]) => (
          <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{v}</button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="field row toggle">
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </label>
  );
}

function Color({ label, value, onChange }) {
  return (
    <label className="field row">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const Section = ({ title, children }) => (
  <div className="section">
    {title && <div className="section-title">{title}</div>}
    {children}
  </div>
);

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="insp-tabs">
      {Object.entries(tabs).map(([k, v]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{v}</button>
      ))}
    </div>
  );
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const pct = (v) => `${Math.round(v * 100)}%`;
const sec = (v) => `${v.toFixed(1)}s`;

const VIDEO_TABS = { base: 'Base', speed: 'Vitesse', color: 'Couleur', anim: 'Animation' };
const TEXT_TABS = { text: 'Texte', anim: 'Animation' };
const OVERLAY_TABS = { base: 'Base', cut: 'Détourage', kf: 'Keyframes', sound: 'Son' };

export default function Inspector({ project, selection, dispatch, time, onSeek, tools }) {
  const t = useT();
  const track = selection?.track;
  const lists = { video: project.videoClips, overlay: project.overlayClips || [], text: project.textClips, audio: project.audioClips, caption: project.captions };
  const clip = (lists[track] || []).find((c) => c.id === selection?.id);
  const set = (patch) => dispatch({ type: 'update', track, id: clip.id, patch });
  const media = clip?.mediaId && project.media.find((m) => m.id === clip.mediaId);
  const videoIndex = track === 'video' ? project.videoClips.findIndex((c) => c.id === clip?.id) : -1;
  const cs = project.captionStyle;
  const [tab, setTab] = useState('base');
  useEffect(() => setTab(track === 'text' ? 'text' : 'base'), [track]);

  const header = clip && (
    <div className="insp-head">
      <span className={`dot ${track}`} />
      <b>{{ video: 'Vidéo', overlay: 'Overlay', text: 'Texte', audio: 'Audio', caption: 'Caption' }[track]}</b>
      {media && <span className="dim ellipsis">{media.name}</span>}
    </div>
  );

  return (
    <aside className="panel inspector">
      {!clip && (
        <>
          <div className="panel-title">{t('project')}</div>
          <div className="fields">
            <Section>
              <label className="field">
                <span>{t('name')}</span>
                <input type="text" value={project.name} onChange={(e) => dispatch({ type: 'setName', name: e.target.value })} />
              </label>
              <div className="dim">{project.width}×{project.height} · {project.fps} fps</div>
            </Section>
            {project.captions?.length > 0 && <CaptionStyle cs={cs} dispatch={dispatch} />}
            <div className="empty small">
              <Icon name="sparkles" className="accent" />
              {t('pickClip')}
            </div>
          </div>
        </>
      )}

      {clip && track === 'text' && (
        <>
          {header}
          <Tabs tabs={TEXT_TABS} value={tab} onChange={setTab} />
          <div className="fields">
            {tab === 'text' && (
              <>
                <textarea rows={3} dir="auto" className="big-text" value={clip.text} onChange={(e) => set({ text: e.target.value })} />
                <Section title="Style">
                  <Choice value={clip.style || 'outline'} options={TEXT_STYLES} onChange={(style) => set({ style })} />
                  <Slider label="Taille" value={clip.size} min={16} max={220} step={1} onChange={(size) => set({ size })} />
                  <div className="swatches">
                    {['#ffffff', '#111111', '#e9b949', '#ff4d6d', '#4dd2ff', '#7cff6b'].map((c) => (
                      <button key={c} className={clip.color === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ color: c })} />
                    ))}
                    <input type="color" value={clip.color} onChange={(e) => set({ color: e.target.value })} />
                  </div>
                  {clip.style === 'box' && <Color label="Couleur boîte" value={clip.bg || '#000000'} onChange={(bg) => set({ bg })} />}
                  <Toggle label="Gras" checked={clip.bold !== false} onChange={(bold) => set({ bold })} />
                </Section>
                <Section title="Position">
                  <div className="row-btns">
                    <button onClick={() => set({ y: 0.2 })}>Fo9</button>
                    <button onClick={() => set({ x: 0.5, y: 0.5 })}>Wost</button>
                    <button onClick={() => set({ y: 0.82 })}>Te7t</button>
                  </div>
                  <div className="dim small-note">Wla jerr texte nichan f l-écran.</div>
                </Section>
              </>
            )}
            {tab === 'anim' && (
              <>
                <Section title="Entrée">
                  <Choice value={clip.anim || 'none'} options={TEXT_ANIMS} onChange={(anim) => set({ anim })} />
                </Section>
                <Section title="Temps">
                  <Num label="Début (s)" value={clip.start} min={0} onChange={(start) => set({ start: Math.max(0, start) })} />
                  <Num label="Durée (s)" value={clip.duration} min={0.1} onChange={(duration) => set({ duration: Math.max(0.1, duration) })} />
                </Section>
              </>
            )}
          </div>
        </>
      )}

      {clip && track === 'video' && (
        <>
          {header}
          <Tabs tabs={VIDEO_TABS} value={tab} onChange={setTab} />
          <div className="fields">
            {tab === 'base' && (
              <>
                <Section title="Cadre">
                  <Choice value={clip.fit || 'fill'} options={{ fill: 'Remplir', fit: 'Adapter' }} onChange={(fit) => set({ fit })} />
                  <Toggle label="Miroir" checked={clip.mirror} onChange={(mirror) => set({ mirror })} />
                </Section>
                <Section title="Son">
                  <Slider label="Volume" value={clip.volume ?? 1} max={2} fmt={pct} onReset={() => set({ volume: 1 })} onChange={(volume) => set({ volume })} />
                  <Toggle label="Muet" checked={clip.muted} onChange={(muted) => set({ muted })} />
                </Section>
                <Section title="Source">
                  <div className="dim">{media?.width}×{media?.height} · {formatTime(media?.duration ?? 0)} → {formatTime(clipLength(clip))}</div>
                  <div className="two">
                    <Num label="Début (s)" value={clip.in} min={0} onChange={(v) => set({ in: Math.max(0, Math.min(v, clip.out - 0.1)) })} />
                    <Num label="Fin (s)" value={clip.out} onChange={(v) => set({ out: Math.max(clip.in + 0.1, Math.min(v, mediaMax(media) || v)) })} />
                  </div>
                </Section>
              </>
            )}
            {tab === 'speed' && (
              <Section title="Vitesse">
                <div className="speed-grid">
                  {SPEEDS.map((s) => (
                    <button key={s} className={(clip.speed || 1) === s ? 'on' : ''} onClick={() => set({ speed: s })}>{s}×</button>
                  ))}
                </div>
                <div className="dim small-note">Durée: {formatTime(clipLength(clip))}. Sawt kayb9a b nafs l-ton.</div>
              </Section>
            )}
            {tab === 'color' && (
              <>
                <Section title="Filtre">
                  <select value={clip.filter || 'none'} onChange={(e) => set({ filter: e.target.value })}>
                    {FILTER_IDS.map((k) => <option key={k} value={k}>{FILTERS[k].label}</option>)}
                  </select>
                  {clip.filter && clip.filter !== 'none' && (
                    <Slider label="Intensité" value={clip.filterIntensity ?? 1} fmt={pct} onChange={(filterIntensity) => set({ filterIntensity })} />
                  )}
                </Section>
                <Section title="Ajuster">
                  <Slider label="Luminosité" value={clip.brightness || 0} min={-0.4} max={0.4} fmt={(v) => (v > 0 ? '+' : '') + Math.round(v * 100)} onReset={() => set({ brightness: 0 })} onChange={(brightness) => set({ brightness })} />
                  <Slider label="Contraste" value={clip.contrast ?? 1} min={0.5} max={1.8} fmt={pct} onReset={() => set({ contrast: 1 })} onChange={(contrast) => set({ contrast })} />
                  <Slider label="Saturation" value={clip.saturation ?? 1} min={0} max={2.5} fmt={pct} onReset={() => set({ saturation: 1 })} onChange={(saturation) => set({ saturation })} />
                  <button onClick={() => set({ brightness: 0, contrast: 1, saturation: 1, filter: 'none' })}>Reset</button>
                </Section>
              </>
            )}
            {tab === 'anim' && (
              <>
                <Section title="Mouvement">
                  <Choice value={clip.motion || 'none'} options={MOTIONS} onChange={(motion) => set({ motion })} />
                </Section>
                {videoIndex > 0 && (
                  <Section title="Transition (m3a clip li 9bel)">
                    <Choice value={clip.transition?.type || 'none'} options={TRANSITIONS}
                      onChange={(type) => set({ transition: { duration: 0.5, ...clip.transition, type } })} />
                    {clip.transition?.type && clip.transition.type !== 'none' && (
                      <Slider label="Durée" value={clip.transition.duration} min={0.2} max={1.5} fmt={sec}
                        onChange={(duration) => set({ transition: { ...clip.transition, duration } })} />
                    )}
                  </Section>
                )}
                <Section title="Fondu">
                  <Slider label="Fade in" value={clip.fadeIn || 0} max={2} step={0.05} fmt={sec} onChange={(fadeIn) => set({ fadeIn })} />
                  <Slider label="Fade out" value={clip.fadeOut || 0} max={2} step={0.05} fmt={sec} onChange={(fadeOut) => set({ fadeOut })} />
                </Section>
              </>
            )}
          </div>
        </>
      )}

      {clip && track === 'overlay' && (
        <>
          {header}
          <Tabs tabs={OVERLAY_TABS} value={tab} onChange={setTab} />
          <div className="fields">
            {tab === 'base' && (
              <>
                <Section title="Forme">
                  <Choice value={clip.shape || 'none'} options={SHAPES} onChange={(shape) => set({ shape })} />
                  {clip.shape === 'circle' && (
                    <>
                      <Slider label="Contour" value={clip.ring || 0} max={30} step={1} fmt={(v) => `${v}px`} onChange={(ring) => set({ ring })} />
                      <Color label="Couleur contour" value={clip.ringColor || '#e9b949'} onChange={(ringColor) => set({ ringColor })} />
                    </>
                  )}
                </Section>
                <Section title="Transform">
                  <Slider label="Taille" value={clip.scale} min={0.05} max={1.5} fmt={pct} onChange={(scale) => set({ scale })} />
                  <Slider label="Position X" value={clip.x} fmt={pct} onChange={(x) => set({ x })} />
                  <Slider label="Position Y" value={clip.y} fmt={pct} onChange={(y) => set({ y })} />
                  <Slider label="Rotation" value={clip.rotation || 0} min={-180} max={180} step={1} fmt={(v) => `${v}°`} onReset={() => set({ rotation: 0 })} onChange={(rotation) => set({ rotation })} />
                  <Slider label="Opacité" value={clip.opacity ?? 1} fmt={pct} onChange={(opacity) => set({ opacity })} />
                  <Toggle label="Animation pop" checked={clip.anim === 'pop'} onChange={(on) => set({ anim: on ? 'pop' : 'none' })} />
                  {(clip.keyframes || []).length > 0 && <div className="dim small-note">Had l-clip fih keyframes: jerro f l-écran bach t-modifi l-keyframe f l-playhead.</div>}
                </Section>
                <Section title="Temps">
                  <Num label="Début (s)" value={clip.start} min={0} onChange={(start) => set({ start: Math.max(0, start) })} />
                  {media?.type === 'image' && (
                    <Num label="Durée (s)" value={overlayLength(clip)} min={0.1} onChange={(d) => set({ out: clip.in + Math.max(0.1, d) })} />
                  )}
                </Section>
              </>
            )}
            {tab === 'cut' && (
              <>
                <Section title="Chroma key (fond vert)">
                  <Toggle label="Activer" checked={clip.chroma?.on} onChange={(on) => set({ chroma: { color: '#00ff00', similarity: 0.3, ...clip.chroma, on } })} />
                  {clip.chroma?.on && (
                    <>
                      <div className="swatches">
                        {['#00ff00', '#00b140', '#0047bb', '#ffffff', '#000000'].map((c) => (
                          <button key={c} className={clip.chroma.color === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ chroma: { ...clip.chroma, color: c } })} />
                        ))}
                        <input type="color" value={clip.chroma.color} onChange={(e) => set({ chroma: { ...clip.chroma, color: e.target.value } })} />
                      </div>
                      <Slider label="Tolérance" value={clip.chroma.similarity ?? 0.3} min={0.02} max={0.8} fmt={pct} onChange={(similarity) => set({ chroma: { ...clip.chroma, similarity } })} />
                    </>
                  )}
                </Section>
                {media?.type === 'video' && (
                  <Section title="Enlever le fond (AI)">
                    <div className="dim small-note">Kay-détouri l-personne f l-vidéo offline (Apple Vision). Kaykhod chwiya d l-wa9t.</div>
                    {tools?.cutoutBusy ? (
                      <>
                        <div className="progress"><div style={{ width: `${(tools.cutoutBusy.progress * 100).toFixed(1)}%` }} /></div>
                        <button onClick={tools.cancelCutout}>Annuler</button>
                      </>
                    ) : (
                      <button className="primary" onClick={() => tools.cutout(clip)}><Icon name="wand" size={15} /> Détourer la personne</button>
                    )}
                  </Section>
                )}
              </>
            )}
            {tab === 'kf' && (
              <Section title="Keyframes (position + taille)">
                <button className="primary" disabled={time < clip.start || time > clip.start + overlayLength(clip)}
                  onClick={() => dispatch({ type: 'setKeyframe', id: clip.id, t: time - clip.start, values: {} })}>
                  <Icon name="diamond" size={14} /> Zid keyframe f l-playhead
                </button>
                <div className="dim small-note">Zid keyframe, 7errek l-playhead, w jerr l-overlay f l-écran: kaytsayeb keyframe jdid w kayt-animi bin ljouj.</div>
                <div className="kf-list">
                  {(clip.keyframes || []).map((k) => (
                    <div key={k.t} className="kf-row">
                      <button className="link" onClick={() => onSeek(clip.start + k.t)}><Icon name="diamond" size={12} /> {formatTime(k.t)}</button>
                      <span className="dim">{pct(k.x)}, {pct(k.y)} · {pct(k.scale)}</span>
                      <button className="icon-btn" onClick={() => dispatch({ type: 'removeKeyframe', id: clip.id, t: k.t })}>×</button>
                    </div>
                  ))}
                </div>
                {(clip.keyframes || []).length > 0 && <button onClick={() => set({ keyframes: [] })}>7yed ga3 les keyframes</button>}
              </Section>
            )}
            {tab === 'sound' && (
              <Section title="Son">
                {media?.type === 'video' ? (
                  <>
                    <Slider label="Volume" value={clip.volume ?? 1} max={2} fmt={pct} onReset={() => set({ volume: 1 })} onChange={(volume) => set({ volume })} />
                    <Toggle label="Muet" checked={clip.muted} onChange={(muted) => set({ muted })} />
                  </>
                ) : <div className="dim">Had l-overlay ma fih ta son.</div>}
              </Section>
            )}
          </div>
        </>
      )}

      {clip && track === 'audio' && (
        <>
          {header}
          <div className="fields">
            <Section title="Son">
              <Slider label="Volume" value={clip.volume ?? 1} max={2} fmt={pct} onReset={() => set({ volume: 1 })} onChange={(volume) => set({ volume })} />
              <Slider label="Fade in" value={clip.fadeIn || 0} max={5} step={0.1} fmt={sec} onChange={(fadeIn) => set({ fadeIn })} />
              <Slider label="Fade out" value={clip.fadeOut || 0} max={5} step={0.1} fmt={sec} onChange={(fadeOut) => set({ fadeOut })} />
            </Section>
            <Section title="Temps">
              <Num label="Début timeline (s)" value={clip.start} min={0} onChange={(start) => set({ start: Math.max(0, start) })} />
            </Section>
          </div>
        </>
      )}

      {clip && track === 'caption' && (
        <>
          {header}
          <div className="fields">
            <textarea rows={3} dir="auto" className="big-text" value={clip.words.map((w) => w.text).join(' ')}
              onChange={(e) => {
                const next = retimeText(clip, e.target.value);
                dispatch({ type: 'update', track: 'caption', id: clip.id, patch: { words: next.words } });
              }} />
            <div className="dim">{formatTime(clip.start)} → {formatTime(clip.end)}</div>
            <CaptionStyle cs={cs} dispatch={dispatch} />
          </div>
        </>
      )}
    </aside>
  );
}

function CaptionStyle({ cs, dispatch }) {
  const set = (patch) => dispatch({ type: 'setCaptionStyle', patch });
  return (
    <Section title="Style dyal captions (kamlin)">
      <Slider label="Taille" value={cs.size} min={36} max={140} step={1} onChange={(size) => set({ size })} />
      <Slider label="Position Y" value={cs.y} fmt={pct} onChange={(y) => set({ y })} />
      <Color label="Couleur" value={cs.color} onChange={(color) => set({ color })} />
      <Color label="Kelma li kat-tqra" value={cs.highlight} onChange={(highlight) => set({ highlight })} />
      <div className="dim">Look: {CAPTION_PRESETS[cs.preset]?.label}</div>
    </Section>
  );
}
