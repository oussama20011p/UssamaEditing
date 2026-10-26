// Overlay keyframes: linear interpolation of x, y and scale over a clip's local time.
// valueAt drives the preview; expr builds the same curve as an FFmpeg expression of `t` for the export.

const n = (v) => Number(v).toFixed(4);

function valueAt(clip, prop, lt) {
  const kfs = clip.keyframes || [];
  if (!kfs.length) return clip[prop];
  if (lt <= kfs[0].t) return kfs[0][prop];
  for (let i = 1; i < kfs.length; i++) {
    const a = kfs[i - 1];
    const b = kfs[i];
    if (lt <= b.t) return a[prop] + ((b[prop] - a[prop]) * (lt - a.t)) / Math.max(1e-6, b.t - a.t);
  }
  return kfs[kfs.length - 1][prop];
}

// Entrance "pop" for stickers, same curve as text clips.
function popAt(clip, lt) {
  if (clip.anim !== 'pop') return 1;
  if (lt < 0.14) return 0.6 + 0.52 * (lt / 0.14);
  if (lt < 0.24) return 1.12 - 0.12 * ((lt - 0.14) / 0.1);
  return 1;
}

// FFmpeg expression for prop as a function of timeline time t; `start` is the clip's timeline start.
function expr(clip, prop, start) {
  const kfs = clip.keyframes || [];
  if (!kfs.length) return n(clip[prop]);
  let e = n(kfs[kfs.length - 1][prop]);
  for (let i = kfs.length - 1; i >= 1; i--) {
    const a = kfs[i - 1];
    const b = kfs[i];
    const ta = start + a.t;
    const tb = start + b.t;
    const seg = `${n(a[prop])}+(${n(b[prop] - a[prop])})*(t-${n(ta)})/${n(Math.max(1e-6, tb - ta))}`;
    e = `if(lt(t,${n(tb)}),${seg},${e})`;
  }
  return `if(lt(t,${n(start + kfs[0].t)}),${n(kfs[0][prop])},${e})`;
}

function popExpr(clip, start) {
  if (clip.anim !== 'pop') return '1';
  const lt = `(t-${n(start)})`;
  return `if(lt(${lt},0.14),0.6+0.52*${lt}/0.14,if(lt(${lt},0.24),1.12-0.12*(${lt}-0.14)/0.1,1))`;
}

module.exports = { valueAt, popAt, expr, popExpr };
