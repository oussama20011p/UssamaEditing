import React, { useState } from 'react';
import { useT } from '../i18n.jsx';
import { exportDuration, formatTime } from '../store.js';

const QUALITY_KEYS = { high: 'qualityHigh', medium: 'qualityMedium', small: 'qualitySmall' };

// Export flow in one modal: settings -> progress -> done / failed.
export default function ExportDialog({ state, project, onStart, onCancel, onClose, onShow }) {
  const t = useT();
  const [quality, setQuality] = useState('high');
  const phase = state.ask ? 'ask' : state.error ? 'failed' : state.done ? 'done' : 'running';
  const pct = Math.round((state.progress || 0) * 1000) / 10;

  const screens = {
    ask: (
      <>
        <h3>{t('exportTitle')}</h3>
        <dl className="export-meta">
          <div><dt className="dim">{t('format')}</dt><dd>{project.format || 'Custom'} · {project.width}×{project.height}</dd></div>
          <div><dt className="dim">{t('duration')}</dt><dd>{formatTime(exportDuration(project))}</dd></div>
          <div><dt className="dim">{t('laneCaptions')}</dt><dd>{project.captions?.length ? t('yes') : t('no')}</dd></div>
        </dl>
        <div className="seg full">
          {Object.entries(QUALITY_KEYS).map(([id, key]) => (
            <button key={id} className={quality === id ? 'on' : ''} onClick={() => setQuality(id)}>{t(key)}</button>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>{t('cancel')}</button>
          <button className="primary" onClick={() => onStart(quality)}>{t('export')}</button>
        </div>
      </>
    ),
    running: (
      <>
        <h3>{t('exportTitle')}…</h3>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        <p>{Math.round(pct)}%</p>
        <button onClick={onCancel}>{t('cancel')}</button>
      </>
    ),
    done: (
      <>
        <h3>{t('exportDone')}</h3>
        <p className="dim">{state.file}</p>
        <div className="modal-actions">
          <button onClick={onShow}>{t('showInFolder')}</button>
          <button className="primary" onClick={onClose}>OK</button>
        </div>
      </>
    ),
    failed: (
      <>
        <h3>{t('exportFailed')}</h3>
        <pre className="error">{state.error}</pre>
        <button onClick={onClose}>{t('close')}</button>
      </>
    ),
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">{screens[phase]}</div>
    </div>
  );
}
