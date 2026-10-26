// UI check run inside the real app: USSAMA_SMOKE=<dir> electron .
// Opens a project from <dir>/project.json, walks through a few states, saves screenshots and
// <dir>/result.json (timecode, console errors, state of the preview's video elements), then quits.
const fs = require('fs');
const path = require('path');

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

module.exports = async function smoke(win, app, dir) {
  const page = win.webContents;
  const errors = [];
  page.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  const js = (code) => page.executeJavaScript(code);
  const snap = async (name) => fs.writeFileSync(path.join(dir, name), (await win.capturePage()).toPNG());
  const report = (data) => fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ ...data, errors }, null, 2));

  const steps = [
    // Home screen in English, then a new 9:16 project.
    [`document.querySelector('.lang-switch button:last-child').click()`, 1500, '0-home.png'],
    [`window.__home && window.__home.create('9:16')`, 600],
    [() => `window.__ussama.load(${fs.readFileSync(path.join(dir, 'project.json'), 'utf8')}); window.__ussama.seek(0.6);`, 1500, '1-loaded.png'],
    [`window.__ussama.select({ track: 'text', id: 't1' }); window.__ussama.seek(0.5);`, 800, '2-text.png'],
    [`(() => {
        const hasOverlay = !!document.querySelector('.clip.overlay');
        window.__ussama.select(hasOverlay ? { track: 'overlay', id: 'o1' } : { track: 'video', id: 'c2' });
        window.__ussama.seek(2.2);
        window.__ussama.tab(hasOverlay ? 'transitions' : 'filters');
      })()`, 800, '3-video.png'],
    [`window.__ussama.select(null); window.__ussama.tab('captions'); window.__ussama.seek(0.8); window.__ussama.play();`, 1500],
    [`window.__ussama.pause()`, 400, '4-played.png'],
  ];

  try {
    await pause(800);
    for (const [code, wait, shot] of steps) {
      await js(typeof code === 'function' ? code() : code);
      await pause(wait);
      if (shot) await snap(shot);
    }
    report({
      timecode: await js(`document.querySelector('.tc').textContent`),
      videos: await js(`[...document.querySelectorAll('.stage video')].map((v) => ({
        cls: v.className, visible: v.style.visibility, ready: v.readyState, width: v.videoWidth,
        error: v.error && v.error.code, src: (v.currentSrc || '').slice(-30), transform: v.style.transform, filter: v.style.filter,
      }))`),
    });
  } catch (e) {
    report({ error: e.message });
  }
  app.quit();
};
