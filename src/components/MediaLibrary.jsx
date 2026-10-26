import React, { useEffect, useRef, useState } from 'react';
import { CAPTION_PRESETS, TRANSITIONS, formatTime, toFileUrl } from '../store.js';
import { FILTERS, FILTER_IDS, presetCss } from '../look.jsx';
import Icon from './Icon.jsx';
import { useT } from '../i18n.jsx';

const TABS = [
  { id: 'media', icon: 'media', label: 'tabMedia' },
  { id: 'audio', icon: 'audio', label: 'tabAudio' },
  { id: 'text', icon: 'text', label: 'tabText' },
  { id: 'stickers', icon: 'sticker', label: 'tabStickers' },
  { id: 'filters', icon: 'filter', label: 'tabFilters' },
  { id: 'transitions', icon: 'transition', label: 'tabTransitions' },
  { id: 'captions', icon: 'captions', label: 'tabCaptions' },
  { id: 'templates', icon: 'template', label: 'tabTemplates' },
];

const TEXT_PRESETS = [
  { id: 'title', label: 'Titre', sample: 'Titre kbir', cls: 'p-title' },
  { id: 'hook', label: 'Hook (boîte)', sample: 'Hook dyalk', cls: 'p-hook' },
  { id: 'sub', label: 'Sous-titre', sample: 'Sous-titre', cls: 'p-sub' },
];

const LANGS = { ar: 'Darija / 3arbiya', fr: 'Français', en: 'English', auto: 'Auto' };

// Drag payload for dropping library items on the timeline.
const dragMedia = (e, m) => {
  e.dataTransfer.setData('application/x-ussama-media', m.id);
  e.dataTransfer.effectAllowed = 'copy';
};

export default function MediaLibrary({ project, tab, onTab: setTab, onImport, onAdd, onAddText, onRemove, captions, look, transition, tools }) {
  const t = useT();

  return (
    <aside className="library">
      <nav className="rail">
        {TABS.map((tb) => (
          <button key={tb.id} className={tab === tb.id ? 'on' : ''} onClick={() => setTab(tb.id)} title={t(tb.label)}>
            <Icon name={tb.icon} size={20} />
            <span>{t(tb.label)}</span>
          </button>
        ))}
      </nav>
      <div className="panel lib-panel">
        {tab === 'media' && <MediaPanel media={project.media.filter((m) => (m.type === 'video' || m.type === 'image') && !m.sticker)} onImport={onImport} onAdd={onAdd} onRemove={onRemove} kind="video" onPip={tools.addOverlay} />}
        {tab === 'audio' && (
          <>
            <MediaPanel media={project.media.filter((m) => m.type === 'audio' && !m.sfx)} onImport={onImport} onAdd={onAdd} onRemove={onRemove} kind="audio" />
            <SfxPanel tools={tools} />
            <VoicePanel tools={tools} />
          </>
        )}
        {tab === 'stickers' && <StickersPanel tools={tools} />}
        {tab === 'templates' && <TemplatesPanel tools={tools} />}
        {tab === 'text' && <TextPanel onAddText={onAddText} />}
        {tab === 'filters' && <FiltersPanel project={project} {...look} />}
        {tab === 'transitions' && <TransitionsPanel {...transition} />}
        {tab === 'captions' && <CaptionsPanel project={project} {...captions} />}
      </div>
    </aside>
  );
}

const resLabel = (m) => (Math.min(m.width, m.height) >= 2000 ? '4K' : Math.min(m.width, m.height) >= 1000 ? '1080p' : Math.min(m.width, m.height) >= 700 ? '720p' : `${Math.min(m.width, m.height)}p`);
const ratioLabel = (m) => {
  const r = m.width / m.height;
  return Math.abs(r - 9 / 16) < 0.03 ? '9:16' : Math.abs(r - 16 / 9) < 0.03 ? '16:9' : Math.abs(r - 1) < 0.03 ? '1:1' : Math.abs(r - 0.8) < 0.03 ? '4:5' : r < 1 ? 'Vertical' : 'Paysage';
};

function MediaPanel({ media, onImport, onAdd, onRemove, kind, onPip }) {
  const t = useT();
  return (
    <>
      <div className="panel-title">
        {kind === 'video' ? t('videosImages') : t('music')}
        <button className="primary small" onClick={onImport}><Icon name="plus" size={14} /> {t('import')}</button>
      </div>
      {!media.length && (
        <div className="empty drop" onClick={onImport}>
          <Icon name="upload" size={30} className="accent" />
          <b>{t('import')} · {kind === 'video' ? t('videosImages') : t('music')}</b>
          <span>{t('importHint')}</span>
        </div>
      )}
      {kind === 'video' ? (
        <div className="media-grid">
          {media.map((m) => (
            <figure key={m.id} className="media-card" draggable onDragStart={(e) => dragMedia(e, m)} onDoubleClick={() => onAdd(m.id)} title={m.path}>
              <div className="media-shot" style={m.thumb ? { backgroundImage: `url(${m.thumb})` } : undefined}>
                {!m.thumb && <Icon name="media" />}
                {m.type !== 'image' && <time>{formatTime(m.duration).slice(0, 5)}</time>}
                <div className="media-actions">
                  <button onClick={() => onAdd(m.id)} title={t('addToTimeline')}><Icon name="plus" size={14} /></button>
                  {onPip && <button onClick={() => onPip(m.id)} title={t('addAsPip')}><Icon name="layers" size={13} /></button>}
                  <button className="danger" onClick={() => onRemove(m.id)} title={t('delete')}><Icon name="trash" size={13} /></button>
                </div>
              </div>
              <figcaption>
                <span className="media-name">{m.name}</span>
                <span className="chips">
                  <span>{m.type === 'image' ? 'IMG' : resLabel(m)}</span>
                  {m.width > 0 && <span>{ratioLabel(m)}</span>}
                  {m.alpha && <span className="gold">ALPHA</span>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="audio-list">
          {media.map((m) => (
            <div key={m.id} className="audio-item" draggable onDragStart={(e) => dragMedia(e, m)} onDoubleClick={() => onAdd(m.id)} title={m.path}>
              <div className="audio-ico"><Icon name="audio" /></div>
              <div className="audio-meta">
                <div className="media-name">{m.name}</div>
                {m.peaks && <MiniWave peaks={m.peaks} />}
              </div>
              <span className="dim">{formatTime(m.duration).slice(0, 5)}</span>
              <button className="icon-btn" onClick={() => onAdd(m.id)} title={t('addToTimeline')}><Icon name="plus" size={14} /></button>
              <button className="icon-btn" onClick={() => onRemove(m.id)} title={t('delete')}>×</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function MiniWave({ peaks }) {
  const n = 60;
  const step = peaks.length / n;
  const bars = Array.from({ length: n }, (_, i) => peaks[Math.floor(i * step)] || 0);
  return (
    <div className="mini-wave">
      {bars.map((v, i) => <i key={i} style={{ height: `${Math.max(8, v)}%` }} />)}
    </div>
  );
}

function TextPanel({ onAddText }) {
  const t = useT();
  return (
    <>
      <div className="panel-title">{t('text')}</div>
      <div className="presets">
        {TEXT_PRESETS.map((p) => (
          <button key={p.id} className={`text-preset ${p.cls}`} onClick={() => onAddText(p.id)}>
            <span>{p.sample}</span>
            <small>{p.label}</small>
          </button>
        ))}
      </div>
      <div className="hint dim">Kayt-zad f blasat l-playhead. Jerr texte f l-écran bach tbeddel blasto.</div>
    </>
  );
}

function FiltersPanel({ project, target, onApply, onIntensity }) {
  const t = useT();
  const media = target ? project.media.find((m) => m.id === target.mediaId) : project.media.find((m) => m.thumb);
  const current = target?.filter || 'none';
  return (
    <>
      <div className="panel-title">{t('filters')}</div>
      {!target && <div className="hint dim">Khtar clip vidéo (wla 7et l-playhead fo9o) bach t-appliqui filtre.</div>}
      <div className="filter-grid">
        {FILTER_IDS.map((k) => (
          <button key={k} className={`filter-tile ${current === k ? 'on' : ''}`} disabled={!target} onClick={() => onApply(k)}>
            <div className="ft-img" style={{ backgroundImage: media?.thumb ? `url(${media.thumb})` : undefined, filter: presetCss(k) }} />
            <span>{FILTERS[k].label}</span>
          </button>
        ))}
      </div>
      {target && current !== 'none' && (
        <div className="fields">
          <label className="field">
            <span>Intensité <b>{Math.round((target.filterIntensity ?? 1) * 100)}%</b></span>
            <input type="range" min="0" max="1" step="0.01" value={target.filterIntensity ?? 1} onChange={(e) => onIntensity(Number(e.target.value))} />
          </label>
        </div>
      )}
    </>
  );
}

function TransitionsPanel({ target, onApply, onApplyAll }) {
  const t = useT();
  const current = target?.transition?.type || 'none';
  return (
    <>
      <div className="panel-title">{t('transitions')}</div>
      <div className="hint dim">{target ? 'Kat-tappliqua 3la l-coupure 9bel l-clip li mkhtar.' : 'Khtar clip (machi l-lowel) wla 7et l-playhead 9rib mn chi coupure.'}</div>
      <div className="filter-grid">
        {Object.entries(TRANSITIONS).map(([k, v]) => (
          <button key={k} className={`filter-tile tr-tile tr-${k} ${current === k ? 'on' : ''}`} disabled={!target} onClick={() => onApply(k)}>
            <div className="ft-img"><i className="a" /><i className="b" /><i className="veil" /></div>
            <span>{v}</span>
          </button>
        ))}
      </div>
      {target && current !== 'none' && (
        <div className="fields"><button onClick={onApplyAll}><Icon name="copy" size={14} /> {t('applyAllCuts')}</button></div>
      )}
    </>
  );
}

function CaptionsPanel({ project, onGenerate, onCancel, onPreset, onClear, busy }) {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [lang, setLang] = useState('ar');
  useEffect(() => {
    window.api.captionsStatus().then(setStatus);
  }, []);
  const ready = status?.binary && status?.model;
  const preset = project.captionStyle.preset;

  return (
    <>
      <div className="panel-title">{t('captions')}</div>
      <div className="fields">
        <div className="hint dim">
          {t('captionsHint')}
        </div>
        {status && !ready && (
          <div className="warn">
            {!status.binary ? <>Khass <code>whisper-cli</code>: f Terminal kteb <code>brew install whisper-cpp</code>.</> : null}
            {status.binary && !status.model ? <>Khass model Whisper f <code>~/.cache/whisper</code> (ra README).</> : null}
          </div>
        )}

        <label className="field">
          <span>Lougha</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>

        <div className="field">
          <span>{t('look')}</span>
          <div className="cap-presets">
            {Object.entries(CAPTION_PRESETS).map(([k, v]) => (
              <button key={k} className={`cap-preset cp-${k} ${preset === k ? 'on' : ''}`} onClick={() => onPreset(k)}>
                <span className="cp-demo">{k === 'word' ? <b>كلمة</b> : <>واش <b>عارف</b> AI</>}</span>
                <small>{v.label}</small>
              </button>
            ))}
          </div>
        </div>

        {busy ? (
          <>
            <div className="progress"><div style={{ width: `${(busy.progress * 100).toFixed(1)}%` }} /></div>
            <div className="dim center">{busy.progress < 0.1 ? 'Kan-extracti l-son…' : `Kan-transcrire… ${(busy.progress * 100).toFixed(0)}%`}</div>
            <button onClick={onCancel}>Annuler</button>
          </>
        ) : (
          <button className="primary big-btn" disabled={!ready || !project.videoClips.length} onClick={() => onGenerate(lang)}>
            <Icon name="sparkles" size={16} /> {t('captionsGo')}
          </button>
        )}
        {ready && <div className="ok dim center">Model: {status.model.split('/').pop()}</div>}
        {!project.videoClips.length && <div className="hint dim">Zid vidéo l-timeline 9bel.</div>}
        {project.captions.length > 0 && !busy && (
          <button onClick={onClear}><Icon name="trash" size={14} /> 7yed les captions ({project.captions.length})</button>
        )}
      </div>
    </>
  );
}

// Built-in sound effects with a quick listen button.
function SfxPanel({ tools }) {
  const t = useT();
  const [list, setList] = useState(null);
  const audio = useRef(null);
  useEffect(() => {
    window.api.listSfx().then((l) => setList(l.map((m) => ({ ...m, id: 'sfx-' + m.sfx })))).catch(() => setList([]));
  }, []);
  const listen = (m) => {
    if (!audio.current) audio.current = new Audio();
    audio.current.src = toFileUrl(m.path);
    audio.current.play().catch(() => {});
  };
  return (
    <>
      <div className="panel-title">{t('sfx')}</div>
      {!list && <div className="hint dim">Kan-wajjed les sons…</div>}
      <div className="sfx-grid">
        {(list || []).map((m) => (
          <div key={m.sfx} className="sfx" draggable onDragStart={(e) => { tools.registerMedia(m); e.dataTransfer.setData('application/x-ussama-media', m.id); }}>
            <button className="sfx-play" onClick={() => listen(m)} title="Sme3"><Icon name="play" size={12} className="fill" /></button>
            <span onDoubleClick={() => tools.addAudioItem(m)}>{m.name}</span>
            <button className="icon-btn" onClick={() => tools.addAudioItem(m)} title={t('addToTimeline')}><Icon name="plus" size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

function VoicePanel({ tools }) {
  const t = useT();
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.api.ttsVoices().then((v) => {
      const pick = v.filter((x) => /^(ar|fr|en)_/.test(x.lang) && !/(Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Albert|Fred|Junior|Ralph|Kathy|Rocko|Grandpa|Grandma|Eddy|Flo|Reed|Sandy|Shelley)/.test(x.name));
      setVoices(pick);
      setVoice((pick.find((x) => x.lang.startsWith('ar')) || pick[0])?.name || '');
    });
  }, []);
  useEffect(() => {
    if (!rec) return;
    const t0 = Date.now();
    const id = setInterval(() => setSecs((Date.now() - t0) / 1000), 200);
    return () => clearInterval(id);
  }, [rec]);

  const start = async () => {
    if (!(await window.api.micAccess())) return alert('Khass t-autorisi l-micro f Réglages Système → Confidentialité → Micro.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    const chunks = [];
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const buf = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
      const item = await window.api.saveVoice(new Uint8Array(buf));
      tools.addAudioItem({ ...item, name: `🎙 Voix off ${new Date().toLocaleTimeString().slice(0, 5)}` });
    };
    mr.start();
    setSecs(0);
    setRec({ mr, startAt: tools.time() });
  };
  const stop = () => {
    rec.mr.stop();
    setRec(null);
  };
  const speak = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      tools.addAudioItem(await window.api.makeTts(text, voice));
    } catch (e) {
      alert('TTS fchel: ' + e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <div className="panel-title">{t('voiceOver')}</div>
      <div className="fields">
        {rec ? (
          <button className="rec on" onClick={stop}><i /> {t('stop')} ({secs.toFixed(0)}s)</button>
        ) : (
          <button className="rec" onClick={start}><Icon name="mic" size={16} /> {t('record')}</button>
        )}
        <div className="hint dim">Kaytzad f l-piste musique f blasat l-playhead.</div>
        {voices.length > 0 && (
          <div className="section">
            <div className="section-title">{t('ttsTitle')}</div>
            <textarea rows={3} dir="auto" placeholder="Kteb chi jomla…" value={text} onChange={(e) => setText(e.target.value)} />
            <select value={voice} onChange={(e) => setVoice(e.target.value)}>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} · {v.lang}</option>)}
            </select>
            <button className="primary" disabled={busy || !text.trim()} onClick={speak}><Icon name="sparkles" size={14} /> {busy ? '…' : t('ttsGenerate')}</button>
          </div>
        )}
      </div>
    </>
  );
}

const STICKERS = ['🔥', '😂', '😍', '🤯', '😱', '😎', '🤔', '👀', '👍', '👏', '🙏', '💪', '❤️', '💯', '✅', '❌', '⭐', '✨', '🎉', '🚀', '💡', '💰', '📈', '🎁', '⚡', '👇', '👉', '☝️', '📌', '⏰', '🤖', '🇲🇦'];

// Emoji are drawn with the system emoji font into a PNG, so the export shows the same colour emoji.
function StickersPanel({ tools }) {
  const t = useT();
  const [busy, setBusy] = useState(null);
  const add = async (emoji) => {
    setBusy(emoji);
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '420px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText(emoji, 256, 280);
    const name = 'emoji_' + [...emoji].map((ch) => ch.codePointAt(0).toString(16)).join('_');
    const item = await window.api.saveSticker(name, c.toDataURL('image/png'));
    tools.addSticker({ ...item, sticker: emoji, name: emoji });
    setBusy(null);
  };
  return (
    <>
      <div className="panel-title">{t('stickers')}</div>
      <div className="sticker-grid">
        {STICKERS.map((e) => (
          <button key={e} className={busy === e ? 'busy' : ''} onClick={() => add(e)} title={t('addToTimeline')}>{e}</button>
        ))}
      </div>
      <div className="hint dim">Kayt-zad ka overlay b animation pop. Jerro f l-écran, w kebbro mn l-coin.</div>
    </>
  );
}

function TemplatesPanel({ tools }) {
  const t = useT();
  return (
    <>
      <div className="panel-title">{t('templates')}</div>
      <div className="presets">
        {tools.templates.map((t) => (
          <button key={t.id} className="template" onClick={() => tools.applyTemplate(t.id)}>
            <span className="tpl-emoji">{t.emoji}</span>
            <span className="tpl-meta"><b>{t.label}</b><small>{t.desc}</small></span>
          </button>
        ))}
      </div>
      <div className="hint dim">Template kayzid texte, style dyal captions w format l l-projet dyalk. L-vidéos dyalk kayb9aw.</div>
    </>
  );
}
