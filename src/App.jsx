import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { FORMATS, canRedo, canUndo, emptyProject, historyReducer, initialHistory, normalizeProject, projectDuration, uid, videoClipAt, videoLayout } from './store.js';
import { flattenWords, groupWords } from './captions.js';
import { TEMPLATES } from './templates.js';
import { useShortcuts } from './shortcuts.js';
import MediaLibrary from './components/MediaLibrary.jsx';
import Preview from './components/Preview.jsx';
import Timeline from './components/Timeline.jsx';
import Inspector from './components/Inspector.jsx';
import ExportDialog from './components/ExportDialog.jsx';
import { LangSwitch, useT } from './i18n.jsx';
import Icon, { Logo } from './components/Icon.jsx';

// What the home screen shows for a project.
export function projectMeta(id, p) {
  const firstVisual = p.media.find((m) => m.thumb && !m.sticker);
  return {
    id, name: p.name, format: p.format || `${p.width}×${p.height}`, duration: projectDuration(p),
    clips: p.videoClips.length, thumb: firstVisual?.thumb || null,
  };
}

// Runs a main-process job while forwarding its progress events.
async function trackJob(subscribe, run, onProgress) {
  const unsubscribe = subscribe(onProgress);
  try {
    return await run();
  } finally {
    unsubscribe();
  }
}

export default function Editor({ projectId, initialProject, onHome }) {
  const t = useT();
  const [history, dispatch] = useReducer(historyReducer, null, () => initialHistory(normalizeProject(initialProject || emptyProject())));
  const project = history.project;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState(null); // { track, id }
  const [exporting, setExporting] = useState(null);
  const [transcribing, setTranscribing] = useState(null);
  const [libTab, setLibTab] = useState('media');
  const [toast, setToast] = useState(null);
  const [fileDrag, setFileDrag] = useState(false);
  const [cutoutBusy, setCutoutBusy] = useState(null);
  const duration = projectDuration(project);

  const [seekVer, setSeekVer] = useState(0);
  const seek = useCallback((t) => {
    setTime(Math.max(0, t));
    setSeekVer((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // Autosave (debounced) into the project library, so a crash or a closed window never loses work.
  const latest = useRef(project);
  latest.current = project;
  const persist = () => window.api.storeProject(projectMeta(projectId, latest.current), latest.current);
  useEffect(() => {
    const id = setTimeout(persist, 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);
  const goHome = async () => {
    setPlaying(false);
    await persist();
    onHome();
  };

  // Play from the start again when the playhead sits at the end.
  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!duration) return;
    if (duration - time < 0.05) setTime(0);
    setPlaying(true);
  }, [playing, time, duration]);

  const addImported = (items) => {
    const ok = items.filter((i) => !i.error).map((i) => ({ ...i, id: uid() }));
    const bad = items.filter((i) => i.error);
    if (bad.length) alert('Ma t9drch tdkhol:\n' + bad.map((b) => `${b.name}: ${b.error}`).join('\n'));
    if (!ok.length) return;
    dispatch({ type: 'addMedia', items: ok });
    // First video of an empty project goes straight to the timeline.
    const firstVideo = ok.find((m) => m.type === 'video');
    if (firstVideo && !project.videoClips.length) dispatch({ type: 'addToTimeline', mediaId: firstVideo.id, clipId: uid(), at: 0 });
    setLibTab(ok.every((m) => m.type === 'audio') ? 'audio' : 'media');
    setToast(`${ok.length} fichier${ok.length > 1 ? 's' : ''} importé${ok.length > 1 ? 's' : ''} ✓`);
  };

  const importMedia = async () => addImported(await window.api.importMedia());

  // Adds a library item to its track (main video, or music for audio) and selects the new clip.
  const addToTimeline = (mediaId, at = time, index) => {
    const media = project.media.find((m) => m.id === mediaId);
    if (!media) return;
    const id = uid();
    dispatch({ type: 'addToTimeline', mediaId, clipId: id, at, index });
    setSelection({ track: media.type === 'audio' ? 'audio' : 'video', id });
  };

  const addOverlay = (mediaId, at = time) => {
    const clipId = uid();
    dispatch({ type: 'addOverlay', mediaId, clipId, at });
    setSelection({ track: 'overlay', id: clipId });
  };

  // Media made inside the app (SFX, voice, stickers) is added to the library once, then used.
  const registerMedia = (item) => {
    if (!project.media.some((m) => m.id === item.id || m.path === item.path)) dispatch({ type: 'addMedia', items: [item] });
  };
  const withId = (item) => ({ ...item, id: project.media.find((m) => m.path === item.path)?.id || item.id || uid() });

  const tools = {
    time: () => time,
    addOverlay: (mediaId) => addOverlay(mediaId),
    registerMedia: (item) => registerMedia(item),
    addAudioItem: (raw) => {
      const item = withId(raw);
      registerMedia(item);
      const clipId = uid();
      dispatch({ type: 'addToTimeline', mediaId: item.id, clipId, at: time });
      setSelection({ track: 'audio', id: clipId });
    },
    addSticker: (raw) => {
      const item = withId(raw);
      registerMedia(item);
      addOverlay(item.id);
    },
    templates: TEMPLATES,
    applyTemplate: (id) => {
      const t = TEMPLATES.find((x) => x.id === id);
      const d = Math.max(3, projectDuration(project) || 10);
      dispatch({ type: 'applyTemplate', format: t.format, captions: t.captions, texts: t.texts(d, uid) });
      setToast(`Template « ${t.label} » ✓`);
    },
    cutoutBusy,
    cutout: async (clip) => {
      const m = project.media.find((x) => x.id === clip.mediaId);
      setCutoutBusy({ progress: 0 });
      const res = await trackJob(window.api.onCutoutProgress, () => window.api.removeBackground(m), (progress) => setCutoutBusy({ progress }));
      setCutoutBusy(null);
      if (res.canceled) return;
      if (!res.ok) return alert('Détourage fchel:\n' + res.error);
      const item = { ...res.item, id: uid() };
      dispatch({ type: 'addMedia', items: [item] });
      dispatch({ type: 'update', track: 'overlay', id: clip.id, patch: { mediaId: item.id, shape: 'none', ring: 0, chroma: { ...clip.chroma, on: false } } });
      setToast('Fond m7ayed ✓');
    },
    cancelCutout: () => window.api.cancelCutout(),
  };

  const addText = (preset = 'title') => {
    const id = uid();
    dispatch({ type: 'addText', clipId: id, at: time, preset: typeof preset === 'string' ? preset : 'title' });
    setSelection({ track: 'text', id });
  };

  // The clip an action applies to: the selection, or the video clip under the playhead.
  const target = useCallback(() => {
    if (selection && selection.track !== 'caption') return selection;
    const v = videoClipAt(project, time);
    return v ? { track: 'video', id: v.clip.id } : null;
  }, [selection, project, time]);

  // Cut actions work on the selected clip, or on the main-track clip under the playhead.
  const cutAction = useCallback((type, extra) => {
    const at = target();
    if (at) dispatch({ type, track: at.track, id: at.id, t: time, ...extra });
  }, [target, time]);
  const split = useCallback(() => cutAction('split', { newId: uid() }), [cutAction]);
  const trimSide = useCallback((side) => cutAction('trimSide', { side }), [cutAction]);

  const remove = useCallback(() => {
    if (selection) {
      dispatch({ type: 'delete', track: selection.track, id: selection.id });
      setSelection(null);
    }
  }, [selection]);

  const duplicate = useCallback(() => {
    if (!selection || selection.track === 'caption') return;
    const newId = uid();
    dispatch({ type: 'duplicate', ...selection, newId });
    setSelection({ track: selection.track, id: newId });
  }, [selection]);

  // Freeze frame: still of the frame under the playhead, inserted for 3 s (CapCut "Figer").
  const freezeFrame = async () => {
    const v = videoClipAt(project, time);
    const m = v && project.media.find((x) => x.id === v.clip.mediaId);
    if (!m || m.type !== 'video') return;
    const srcT = v.clip.in + (time - v.start) * (v.clip.speed || 1);
    const item = { ...(await window.api.freezeFrame(m, srcT)), id: uid() };
    dispatch({ type: 'addMedia', items: [item] });
    const atStart = time - v.start < 0.1;
    if (!atStart) dispatch({ type: 'split', track: 'video', id: v.clip.id, t: time, newId: uid() });
    const idx = project.videoClips.findIndex((c) => c.id === v.clip.id) + (atStart ? 0 : 1);
    const clipId = uid();
    dispatch({ type: 'addToTimeline', mediaId: item.id, clipId, at: time, index: idx });
    setSelection({ track: 'video', id: clipId });
    setToast('Freeze frame ✓');
  };

  const reverseSelected = async () => {
    const t = target();
    if (t?.track !== 'video') return;
    const c = project.videoClips.find((x) => x.id === t.id);
    const m = project.media.find((x) => x.id === c.mediaId);
    if (m?.type !== 'video') return;
    setToast('Kan-reversi…');
    try {
      const item = { ...(await window.api.reverseClip(m, c.in, c.out)), id: uid() };
      dispatch({ type: 'addMedia', items: [item] });
      dispatch({ type: 'update', track: 'video', id: c.id, patch: { mediaId: item.id, in: 0, out: item.duration } });
      setToast('Reverse ✓');
    } catch (e) {
      alert('Reverse fchel: ' + e.message);
    }
  };

  // Saves a copy of the project as a .json file chosen by the user.
  const save = async () => {
    if (await window.api.saveProject(JSON.stringify(project, null, 2))) setToast('Projet sauvé ✓');
  };

  // Replaces the open project with one read from a .json file.
  const open = async () => {
    const text = await window.api.openProject();
    if (!text) return;
    let loaded;
    try {
      loaded = JSON.parse(text);
    } catch (e) {
      alert(`Fichier ghalat: ${e.message}`);
      return;
    }
    dispatch({ type: 'load', project: loaded });
    setSelection(null);
    setTime(0);
  };

  const openExport = () => {
    if (!project.videoClips.length) {
      alert('Zid chi vidéo l-timeline 9bel l-export.');
      return;
    }
    setPlaying(false);
    setExporting({ ask: true });
  };

  const startExport = async (quality) => {
    setPlaying(false);
    setExporting({ progress: 0 });
    const res = await trackJob(window.api.onExportProgress, () => window.api.exportVideo(project, quality),
      (progress) => setExporting((cur) => cur && { ...cur, progress }));
    if (res.canceled) setExporting(null);
    else if (res.ok) setExporting({ done: true, file: res.file, progress: 1 });
    else setExporting({ error: res.error });
  };

  const captions = {
    busy: transcribing,
    onGenerate: async (language) => {
      setPlaying(false);
      setTranscribing({ progress: 0 });
      const res = await trackJob(window.api.onCaptionsProgress, () => window.api.generateCaptions(project, language), (progress) => setTranscribing({ progress }));
      setTranscribing(null);
      if (res.canceled) return;
      if (!res.ok) return alert('Captions fchlo:\n' + res.error);
      if (!res.words.length) return alert('Ma tsme3 ta klam f l-vidéo.');
      dispatch({ type: 'setCaptions', captions: groupWords(res.words, project.captionStyle.preset) });
      setToast(`${res.words.length} kelma ✓`);
    },
    onCancel: () => window.api.cancelCaptions(),
    onPreset: (preset) => {
      dispatch({ type: 'setCaptionStyle', patch: { preset } });
      if (project.captions.length) dispatch({ type: 'setCaptions', captions: groupWords(flattenWords(project.captions), preset) });
    },
    onClear: () => {
      dispatch({ type: 'setCaptions', captions: [] });
      if (selection?.track === 'caption') setSelection(null);
    },
  };

  // Filters panel acts on the selected video clip, or the one under the playhead.
  const videoTarget = (() => {
    const t = target();
    return t?.track === 'video' ? project.videoClips.find((c) => c.id === t.id) : null;
  })();
  const look = {
    target: videoTarget,
    onApply: (filter) => videoTarget && dispatch({ type: 'update', track: 'video', id: videoTarget.id, patch: { filter, filterIntensity: videoTarget.filterIntensity ?? 1 } }),
    onIntensity: (filterIntensity) => videoTarget && dispatch({ type: 'update', track: 'video', id: videoTarget.id, patch: { filterIntensity } }),
  };

  // Transitions sit on the cut before a clip: the selected clip, else the cut nearest the playhead.
  const transitionTarget = (() => {
    if (videoTarget && project.videoClips.indexOf(videoTarget) > 0) {
      if (selection?.track === 'video') return videoTarget;
    }
    const layout = videoLayout(project.videoClips).slice(1);
    if (!layout.length) return null;
    const near = layout.reduce((a, b) => (Math.abs(b.start - time) < Math.abs(a.start - time) ? b : a));
    return near.clip;
  })();
  const transition = {
    target: transitionTarget,
    onApply: (type) => transitionTarget && dispatch({ type: 'update', track: 'video', id: transitionTarget.id, patch: { transition: { duration: 0.5, ...transitionTarget.transition, type } } }),
    onApplyAll: () => transitionTarget && dispatch({ type: 'updateAllVideo', skipFirst: true, patch: { transition: transitionTarget.transition } }),
  };

  // Hook used by the automated smoke test (electron/smoke.cjs).
  useEffect(() => {
    window.__ussama = {
      load: (p) => dispatch({ type: 'load', project: p }),
      seek,
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      select: setSelection,
      tab: setLibTab,
      dispatch,
    };
  }, [seek]);

  useShortcuts({
    togglePlay, split, remove, trimSide, duplicate,
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    seekBy: (d) => seek(time + d),
    seekTo: seek,
  });

  // Files dragged in from Finder / Explorer.
  const isFileDrag = (e) => e.dataTransfer?.types?.includes('Files');
  const onWindowDragOver = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setFileDrag(true);
  };
  const onWindowDrop = async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setFileDrag(false);
    addImported(await window.api.importFiles(e.dataTransfer.files));
  };

  return (
    <div className={`app ${window.api?.platform === 'darwin' ? 'mac' : ''}`}
      onDragOver={onWindowDragOver} onDrop={onWindowDrop} onDragLeave={(e) => !e.relatedTarget && setFileDrag(false)}>
      <header className="topbar">
        <div className="brand" onClick={goHome} title={t('home')} role="button"><Logo size={30} /><span className="brand-word">USSAMA<b>EDITING</b></span></div>
        <div className="file-actions">
          <button className="ghost" onClick={goHome} title={t('home')}><Icon name="home" size={16} /></button>
          <button className="ghost" onClick={open} title={t('openFile')}><Icon name="folder" size={16} /></button>
          <button className="ghost" onClick={save} title={t('save')}><Icon name="save" size={16} /></button>
          <span className="proj-name">{project.name}</span>
        </div>
        <div className="format-pick">
          {Object.entries(FORMATS).map(([k, f]) => (
            <button key={k} className={project.format === k ? 'on' : ''} title={f.label} onClick={() => dispatch({ type: 'setFormat', format: k })}>
              <i className={`ratio r${k.replace(':', '-')}`} />{k}
            </button>
          ))}
        </div>
        <div className="actions">
          <LangSwitch compact />
          <button className="primary export-btn" onClick={openExport}><Icon name="export" size={16} /> {t('export')}</button>
        </div>
      </header>

      <div className="workspace">
        <MediaLibrary project={project} tab={libTab} onTab={setLibTab} onImport={importMedia} onAdd={(id) => addToTimeline(id)} onAddText={addText}
          onRemove={(id) => dispatch({ type: 'removeMedia', id })} captions={captions} look={look} transition={transition} tools={tools} />
        <Preview project={project} time={time} seekVer={seekVer} playing={playing} duration={duration}
          onTime={setTime} onEnd={() => setPlaying(false)} onTogglePlay={togglePlay} onSeek={seek}
          selection={selection} onSelect={setSelection} dispatch={dispatch} />
        <Inspector project={project} selection={selection} dispatch={dispatch} time={time} onSeek={seek} tools={tools} />
      </div>

      <Timeline project={project} time={time} duration={duration} selection={selection}
        onSelect={setSelection} onSeek={seek} dispatch={dispatch} canUndo={canUndo(history)} canRedo={canRedo(history)}
        onDropMedia={(id, t, index, lane) => {
          const m = project.media.find((x) => x.id === id);
          if (!m) return;
          if (lane === 'overlay' && m.type !== 'audio') addOverlay(id, t);
          else addToTimeline(id, t, index);
        }}
        actions={{
          undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }),
          split, trimSide, remove, duplicate, addText, openTransitions: () => setLibTab('transitions'), freezeFrame, reverse: reverseSelected,
        }} />

      {fileDrag && (
        <div className="file-drop">
          <Icon name="upload" size={42} />
          <b>{t('dropFiles')}</b>
          <span>Vidéos (MP4, MOV…) wla musique (MP3, WAV…)</span>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}

      {exporting && <ExportDialog state={exporting} project={project} onStart={startExport} onCancel={() => window.api.cancelExport()}
        onClose={() => setExporting(null)} onShow={() => window.api.showInFolder(exporting.file)} />}
    </div>
  );
}
