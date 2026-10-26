// Preview side of colour looks: CSS filter strings + SVG colour matrices (see shared/look.cjs).
import React from 'react';
import lookModule from '../shared/look.cjs';

export const { FILTERS, clipLook } = lookModule;
export const FILTER_IDS = Object.keys(FILTERS).filter((k) => !k.startsWith('_'));

// FFmpeg eq brightness is additive; CSS brightness is multiplicative. Close enough for a preview.
export function lookCss(look, svgId) {
  const { eq, matrix } = look;
  const parts = [`brightness(${(1 + eq.b).toFixed(3)})`, `contrast(${eq.c.toFixed(3)})`, `saturate(${eq.s.toFixed(3)})`];
  if (matrix && svgId) parts.push(`url(#${svgId})`);
  return parts.join(' ');
}

const matrixValues = (m) => [...m.map((r) => [...r, 0, 0]), [0, 0, 0, 1, 0]].flat().map((v) => v.toFixed(4)).join(' ');

// Hidden SVG holding one filter per preset (for thumbnails) plus the matrices of the clips on screen.
export function LookDefs({ lives = [] }) {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {FILTER_IDS.filter((k) => FILTERS[k].matrix).map((k) => (
          <filter key={k} id={`f-${k}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={matrixValues(FILTERS[k].matrix)} />
          </filter>
        ))}
        {lives.map((live, k) => live?.matrix && (
          <filter key={'live' + k} id={`f-live${k}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={matrixValues(live.matrix)} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

export const presetCss = (k) => lookCss(clipLook({ filter: k, filterIntensity: 1 }), `f-${k}`);
