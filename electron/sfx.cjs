// Built-in sound effects, synthesised with FFmpeg the first time they are needed (no downloads, no licences).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { ffmpegPath } = require('./ffmpeg.cjs');

// name -> [label, lavfi source, audio filters, duration]
const SFX = {
  whoosh: ['Whoosh', 'anoisesrc=color=pink:amplitude=0.8', 'highpass=f=300,lowpass=f=3000,afade=t=in:d=0.25,afade=t=out:st=0.25:d=0.35,volume=1.6', 0.6],
  swoosh: ['Swoosh', 'anoisesrc=color=white:amplitude=0.6', 'bandpass=f=2500:t=h:w=2000,afade=t=in:d=0.08,afade=t=out:st=0.08:d=0.25', 0.35],
  pop: ['Pop', 'sine=f=900', "volume='exp(-t*30)':eval=frame,afade=t=in:d=0.005", 0.15],
  click: ['Click', 'anoisesrc=color=white:amplitude=1', "highpass=f=2000,volume='exp(-t*120)':eval=frame", 0.05],
  ding: ['Ding', 'sine=f=1318', "volume='0.7*exp(-t*4)':eval=frame,afade=t=in:d=0.005", 1.2],
  notif: ['Notification', 'sine=f=880', "volume='0.6*exp(-t*8)':eval=frame,aecho=0.8:0.6:120:0.5", 0.6],
  boom: ['Boom', 'sine=f=55', "volume='1.8*exp(-t*3)':eval=frame,afade=t=in:d=0.01,lowpass=f=200", 1.2],
  riser: ['Riser', "aevalsrc='0.5*sin(2*PI*(200*t+300*t*t))':s=48000", 'afade=t=in:d=1.4,afade=t=out:st=1.8:d=0.2', 2],
  drop: ['Drop', "aevalsrc='0.6*sin(2*PI*(900*t-350*t*t))':s=48000", 'afade=t=out:st=0.4:d=0.4', 0.8],
  shutter: ['Camera', 'anoisesrc=color=white:amplitude=1', "highpass=f=1500,volume='if(lt(t,0.03),1,if(lt(t,0.09),0,if(lt(t,0.12),0.7,0)))':eval=frame", 0.15],
  ting: ['Ting ✨', 'sine=f=2093', "volume='0.5*exp(-t*6)':eval=frame,aecho=0.8:0.7:60:0.4", 0.8],
  bass: ['Bass hit', 'sine=f=80', "volume='1.4*exp(-t*6)':eval=frame,afade=t=in:d=0.005", 0.6],
  typing: ['Typing', 'anoisesrc=color=white:amplitude=0.8:nb_samples=128', "highpass=f=1500,volume='exp(-mod(t,0.11)*90)':eval=frame", 1.1],
  glitch: ['Glitch', "aevalsrc='0.4*sgn(sin(2*PI*(220+880*floor(mod(t*12,4)))*t))*lt(mod(t,0.25),0.12)':s=48000", 'lowpass=f=5000', 0.8],
  cash: ['Cha-ching 💰', "aevalsrc='0.35*(sin(2*PI*1568*t)+sin(2*PI*2093*t))*exp(-t*5)':s=48000", 'afade=t=in:d=0.005,aecho=0.8:0.5:40:0.3', 1],
  error: ['Erreur', "aevalsrc='0.35*sgn(sin(2*PI*140*t))*lt(mod(t,0.22),0.16)':s=48000", 'lowpass=f=1200', 0.5],
  success: ['Succès', "aevalsrc='0.4*sin(2*PI*if(lt(t,0.12),523,if(lt(t,0.24),659,784))*t)*exp(-mod(t,0.12)*4)':s=48000", 'afade=t=out:st=0.45:d=0.25', 0.7],
  heartbeat: ['Battement', "aevalsrc='0.9*sin(2*PI*55*t)*(exp(-mod(t,0.8)*25)+0.7*gte(mod(t,0.8),0.18)*exp(-(mod(t,0.8)-0.18)*30))':s=48000", 'lowpass=f=180,volume=1.8', 1.6],
  tick: ['Tic-tac', 'anoisesrc=color=white:amplitude=0.9:nb_samples=64', "highpass=f=2500,volume='exp(-mod(t,0.5)*200)':eval=frame", 2],
  bubble: ['Bulle', "aevalsrc='0.6*sin(2*PI*(300*t+3000*t*t))*exp(-t*18)':s=48000", 'afade=t=in:d=0.003', 0.25],
  laser: ['Laser', "aevalsrc='0.35*sgn(sin(2*PI*(1800*t-2400*t*t)))*exp(-t*6)':s=48000", 'lowpass=f=4000', 0.4],
  thud: ['Thud', "aevalsrc='0.9*sin(2*PI*70*t)*exp(-t*14)':s=48000", 'lowpass=f=400,volume=1.5', 0.5],
  magic: ['Magie ✨', "aevalsrc='0.25*sin(2*PI*(1046+523*floor(mod(t*16,6)))*t)*exp(-mod(t,0.0625)*20)*exp(-t*1.5)':s=48000", 'aecho=0.8:0.6:90:0.4', 1.4],
  alarm: ['Alarme', "aevalsrc='0.3*sgn(sin(2*PI*if(lt(mod(t,0.5),0.25),880,660)*t))':s=48000", 'lowpass=f=3000', 1.5],
  scratch: ['Scratch', 'anoisesrc=color=white:amplitude=0.9:nb_samples=128', "bandpass=f=1200:t=h:w=1500,volume='2*abs(sin(2*PI*6*t))':eval=frame", 0.5],
  wind: ['Vent', 'anoisesrc=color=brown:amplitude=0.7', 'lowpass=f=500,tremolo=f=0.4:d=0.6,afade=t=in:d=0.8,afade=t=out:st=2.2:d=0.8', 3],
  applause: ['Applaudissements', 'anoisesrc=color=white:amplitude=0.5', 'bandpass=f=2500:t=h:w=3000,tremolo=f=11:d=0.8,afade=t=in:d=0.3,afade=t=out:st=1.8:d=0.7', 2.5],
  drumroll: ['Roulement', 'anoisesrc=color=white:amplitude=0.8:nb_samples=64', "lowpass=f=2500,volume='exp(-mod(t,0.05)*80)*min(1,t+0.2)':eval=frame,afade=t=out:st=1.8:d=0.2", 2],
  transition: ['Transition FX', 'anoisesrc=color=pink:amplitude=0.9:nb_samples=256', "bandpass=f=1800:t=h:w=2500,volume='1.5*min(1,t/0.4)*exp(-max(0,t-0.4)*10)':eval=frame", 0.8],
  sub: ['Sub drop', "aevalsrc='0.9*sin(2*PI*(120*t-60*t*t))*exp(-t*1.5)':s=48000", 'lowpass=f=200,volume=1.6', 1.5],
};

// Peak level (dB) of an audio file, from FFmpeg's volumedetect.
function peakDb(file) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], (err, _o, stderr) => {
      if (err) return reject(err);
      const m = /max_volume: (-?[\d.]+) dB/.exec(stderr);
      resolve(m ? Number(m[1]) : 0);
    });
  });
}

const run = (args) => new Promise((resolve, reject) => {
  execFile(ffmpegPath, ['-y', '-loglevel', 'error', ...args], (err, _o, stderr) => (err ? reject(new Error(stderr)) : resolve()));
});

// Each effect is rendered, then peak-normalised to -1 dB so they all play at a similar level.
function ensureSfx(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return Promise.all(
    Object.entries(SFX).map(async ([id, [label, src, af, dur]]) => {
      const file = path.join(dir, `${id}.m4a`);
      const item = { id, label, path: file };
      if (fs.existsSync(file)) return item;
      const raw = path.join(dir, `${id}.raw.wav`);
      try {
        await run(['-f', 'lavfi', '-t', String(dur), '-i', src, '-af', `${af},aformat=channel_layouts=stereo`, '-ar', '48000', raw]);
        const gain = Math.min(30, -1 - (await peakDb(raw)));
        await run(['-i', raw, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '160k', file]);
      } catch (e) {
        throw new Error(`${id}: ${e.message}`);
      } finally {
        fs.rmSync(raw, { force: true });
      }
      return item;
    })
  );
}

module.exports = { SFX, ensureSfx };
