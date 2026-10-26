// Transcribes a short speech clip through the real pipeline (FFmpeg audio extract -> whisper-cli),
// then checks word timings and caption grouping. Skips when whisper-cli or a model is missing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ffmpegPath, probe } = require('../electron/ffmpeg.cjs');
const whisper = require('../electron/whisper.cjs');

(async () => {
  const { groupWords, retimeText, activeWord } = await import('../src/captions.js');

  // Grouping rules work without Whisper.
  const words = [
    { text: 'واش', start: 0, end: 0.3 }, { text: 'عارف', start: 0.3, end: 0.7 }, { text: 'شنو', start: 0.7, end: 1 },
    { text: 'هو', start: 1, end: 1.2 }, { text: 'AI؟', start: 1.2, end: 1.6 }, { text: 'Salam', start: 3, end: 3.5 },
  ];
  const g3 = groupWords(words, 'bold');
  if (g3.length !== 3 || g3[0].words.length !== 3 || g3[2].words[0].text !== 'Salam') throw new Error('groupWords(bold) wrong: ' + JSON.stringify(g3.map((g) => g.words.map((w) => w.text))));
  if (groupWords(words, 'word').length !== 6) throw new Error('groupWords(word) wrong');
  const re = retimeText(g3[0], 'a bb ccc dddd');
  if (re.words.length !== 4 || Math.abs(re.words[3].end - g3[0].end) > 1e-9) throw new Error('retimeText wrong');
  if (activeWord(g3[0], 0.5) !== 1) throw new Error('activeWord wrong');
  console.log('grouping OK');

  const st = whisper.status();
  const sample = ['/opt/homebrew/share/whisper.cpp/jfk.wav', '/usr/local/share/whisper.cpp/jfk.wav'].find((p) => fs.existsSync(p));
  if (!st.binary || !st.model || !sample) return console.log('whisper-cli/model/sample missing: transcription test SKIPPED');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ussama-asr-test-'));
  const video = path.join(dir, 'speech.mp4');
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=640x360:r=30', '-i', sample, '-shortest', '-c:v', 'libx264', '-c:a', 'aac', video]);
  const info = await probe(video);
  const project = {
    width: 1080, height: 1920, fps: 30,
    media: [{ id: 'm1', path: video, name: 'speech.mp4', type: 'video', ...info }],
    // Start 1s in: word times must still land on the timeline (offset 0).
    videoClips: [{ id: 'c1', mediaId: 'm1', in: 1, out: info.duration }],
    textClips: [], audioClips: [],
  };
  const t0 = Date.now();
  const job = whisper.transcribe(project, 'en', (p) => process.stdout.write(`\rasr ${(p * 100).toFixed(0)}%`));
  const out = await job.promise;
  console.log(`\n${out.length} words in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, out.map((w) => w.text).join(' '));
  const text = out.map((w) => w.text.toLowerCase()).join(' ');
  if (!text.includes('country') || !out.every((w, i) => w.end > w.start && (i === 0 || w.start >= out[i - 1].start - 0.01))) throw new Error('Unexpected transcription');
  if (out[out.length - 1].end > info.duration - 1 + 0.5) throw new Error('Word times not on the timeline');
  console.log('CAPTIONS OK');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
