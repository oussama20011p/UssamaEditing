import React, { useEffect, useState } from 'react';
import { FORMATS, emptyProject, formatTime, normalizeProject, uid } from './store.js';
import { projectMeta } from './App.jsx';
import Icon, { Logo } from './components/Icon.jsx';
import { LangSwitch, useT } from './i18n.jsx';

const LEGACY_KEY = 'ussama:autosave';

const FORMAT_CARDS = [
  { id: '9:16', title: 'Reel', sub: 'fmtReel' },
  { id: '4:5', title: 'Post', sub: 'fmtPost' },
  { id: '1:1', title: 'square', sub: 'fmtSquare', tr: true },
  { id: '16:9', title: 'YouTube', sub: 'fmtWide' },
];

function ago(ts, t) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return t('now');
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} j`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function Home({ onOpen }) {
  const t = useT();
  const [projects, setProjects] = useState(null);

  const refresh = () => window.api.listProjects().then(setProjects);

  useEffect(() => {
    (async () => {
      // One-time move of the old single autosave into the project library.
      try {
        const raw = localStorage.getItem(LEGACY_KEY);
        if (raw) {
          const p = normalizeProject(JSON.parse(raw));
          if (p.media.length) await window.api.storeProject(projectMeta(uid(), p), p);
          localStorage.removeItem(LEGACY_KEY);
        }
      } catch {
        // Nothing to migrate.
      }
      refresh();
    })();
  }, []);

  const create = (format) => {
    const f = FORMATS[format];
    const n = (projects?.length || 0) + 1;
    const project = { ...emptyProject(), name: `Projet ${n}`, format, width: f.width, height: f.height };
    onOpen({ id: uid(), project });
  };

  const open = async (meta) => onOpen({ id: meta.id, project: await window.api.loadProject(meta.id) });

  const importFile = async () => {
    const json = await window.api.openProject();
    if (!json) return;
    try {
      onOpen({ id: uid(), project: normalizeProject(JSON.parse(json)) });
    } catch (e) {
      alert('Fichier ghalat: ' + e.message);
    }
  };

  const remove = async (e, meta) => {
    e.stopPropagation();
    if (!confirm(`«${meta.name}» — ${t('confirmDelete')}`)) return;
    await window.api.deleteProject(meta.id);
    refresh();
  };

  // Hook used by the automated smoke test (electron/smoke.cjs).
  useEffect(() => {
    window.__home = { create };
  });

  return (
    <div className="home">
      <aside className="home-shelf" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${i * -0.37}s` }} />)}
      </aside>

      <section className="home-hero">
        <div className="hero-logo">
          <div className="hero-ring" />
          <div className="hero-mark"><Logo size={112} /></div>
        </div>
        <div>
        <h1 className="hero-title">
          {'USSAMA'.split('').map((c, i) => <span key={i} style={{ animationDelay: `${0.25 + i * 0.05}s` }}>{c}</span>)}
          <b>{'EDITING'.split('').map((c, i) => <span key={i} style={{ animationDelay: `${0.55 + i * 0.05}s` }}>{c}</span>)}</b>
        </h1>
        <p className="hero-tag">{t('tagline')}</p>
        </div>
        <LangSwitch />
      </section>

      <main className="home-main">
        <div className="home-block">
          <div className="home-head">
            <span className="home-idx">01</span>
            <h2>{t('newProject')}</h2>
            <button className="ghost" onClick={importFile}><Icon name="folder" size={15} /> {t('openFile')}</button>
          </div>
          <div className="format-cards">
            {FORMAT_CARDS.map((c, i) => (
              <button key={c.id} className="format-card" style={{ animationDelay: `${0.7 + i * 0.07}s` }} onClick={() => create(c.id)}>
                <span className={`fc-shape r${c.id.replace(':', '-')}`}><Icon name="plus" size={20} /></span>
                <span className="fc-ratio">{c.id}</span>
                <b>{c.tr ? t(c.title) : c.title}</b>
                <small>{t(c.sub)}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="home-block">
          <div className="home-head">
            <span className="home-idx">02</span>
            <h2>{t('recent')}</h2>
            <span className="home-count">{projects ? projects.length : '…'}</span>
          </div>
          {projects && !projects.length && (
            <div className="home-empty">
              <Icon name="clock" size={28} />
              <b>{t('noProjects')}</b>
              <span>{t('noProjectsHint')}</span>
            </div>
          )}
          <div className="recent-grid">
            {(projects || []).map((p, i) => (
              <div key={p.id} className="recent-card" style={{ animationDelay: `${0.8 + i * 0.05}s` }} onClick={() => open(p)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && open(p)}>
                <div className="rc-thumb" style={{ backgroundImage: p.thumb ? `url(${p.thumb})` : undefined }}>
                  {!p.thumb && <Logo size={44} />}
                  <span className="rc-open">{t('open')} <Icon name="next" size={12} /></span>
                </div>
                <div className="rc-meta">
                  <b>{p.name}</b>
                  <div className="chips">
                    <span>{p.format}</span>
                    <span>{formatTime(p.duration || 0).slice(0, 5)}</span>
                    <span>{p.clips} clip{p.clips === 1 ? '' : 's'}</span>
                  </div>
                  <small>{ago(p.updatedAt, t)}</small>
                </div>
                <button className="icon-btn rc-del" onClick={(e) => remove(e, p)} title={t('delete')}><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
