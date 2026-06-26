"use strict";

/**
 * modules/measurements/measurementSvg.js
 *
 * Generic SVG drawing engine. Produces SVG from geometric objects only — no
 * business logic. Designed to be consumed by measurement modules which provide
 * plain drawing data.
 *
 * Features:
 * - layers
 * - styles and stroke widths
 * - arrows/markers
 * - dimensions (cotes)
 * - grid and axes
 * - A4/A3 export presets
 * - no external dependencies
 */

/**
 * @typedef {Object} SvgOptions
 * @property {string} [units] - units for exported width/height (default 'mm')
 * @property {number} [scale] - user scale factor applied to coordinates (default 1)
 */

const DEFAULT_UNITS = 'mm';
const PAGE_SIZES = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

function _fmt(n) { return Number.parseFloat(n).toFixed(3).replace(/\.000$/, ''); }

function _escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Create a new SVG document instance. */
function createDocument(options = {}) {
  const units = options.units || DEFAULT_UNITS;
  let scale = typeof options.scale === 'number' ? options.scale : 1;
  let viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
  const defs = new Map();
  const layers = new Map();
  const styles = new Map();
  let nextId = 1;
  const meta = { units, scale };

  function _id(prefix = 'id') { return `${prefix}-${nextId++}`; }

  /** Set viewBox */
  function setViewBox(x, y, w, h) { viewBox = { x: +x, y: +y, w: +w, h: +h }; }

  /** Set global scale (multiplies input coordinates). */
  function setScale(s) { scale = Number(s) || 1; meta.scale = scale; }

  /** Ensure layer exists and return its array of elements */
  function _ensureLayer(name) { if (!layers.has(name)) layers.set(name, []); return layers.get(name); }

  /** Add raw element to layer (object with tag and attrs or raw string) */
  function _addToLayer(layer, el) { const arr = _ensureLayer(layer || 'default'); arr.push(el); return el; }

  /** Add a <line> */
  function addLine({ x1, y1, x2, y2, stroke = '#000', strokeWidth = 1, className, layer } = {}) {
    const a = {
      tag: 'line',
      attrs: { x1: _fmt(x1 * scale), y1: _fmt(y1 * scale), x2: _fmt(x2 * scale), y2: _fmt(y2 * scale), stroke, 'stroke-width': _fmt(strokeWidth), 'class': className || undefined }
    };
    return _addToLayer(layer, a);
  }

  /** Add a polyline */
  function addPolyline({ points = [], stroke = '#000', strokeWidth = 1, fill = 'none', className, layer } = {}) {
    const pts = points.map(p => `${_fmt(p[0]*scale)},${_fmt(p[1]*scale)}`).join(' ');
    const a = { tag: 'polyline', attrs: { points: pts, stroke, 'stroke-width': _fmt(strokeWidth), fill, 'class': className || undefined } };
    return _addToLayer(layer, a);
  }

  /** Add a polygon */
  function addPolygon({ points = [], stroke = '#000', strokeWidth = 1, fill = 'none', className, layer } = {}) {
    const pts = points.map(p => `${_fmt(p[0]*scale)},${_fmt(p[1]*scale)}`).join(' ');
    const a = { tag: 'polygon', attrs: { points: pts, stroke, 'stroke-width': _fmt(strokeWidth), fill, 'class': className || undefined } };
    return _addToLayer(layer, a);
  }

  /** Add rectangle */
  function addRectangle({ x, y, width, height, rx, ry, stroke = '#000', strokeWidth = 1, fill = 'none', className, layer } = {}) {
    const attrs = { x: _fmt(x*scale), y: _fmt(y*scale), width: _fmt(width*scale), height: _fmt(height*scale), stroke, 'stroke-width': _fmt(strokeWidth), fill };
    if (rx != null) attrs.rx = _fmt(rx*scale);
    if (ry != null) attrs.ry = _fmt(ry*scale);
    if (className) attrs.class = className;
    return _addToLayer(layer, { tag: 'rect', attrs });
  }

  /** Add circle */
  function addCircle({ cx, cy, r, stroke = '#000', strokeWidth = 1, fill = 'none', className, layer } = {}) {
    const attrs = { cx: _fmt(cx*scale), cy: _fmt(cy*scale), r: _fmt(r*scale), stroke, 'stroke-width': _fmt(strokeWidth), fill };
    if (className) attrs.class = className;
    return _addToLayer(layer, { tag: 'circle', attrs });
  }

  /** Add arc as path (SVG arc command) */
  function addArc({ x1, y1, x2, y2, rx, ry, largeArc=false, sweep=false, stroke = '#000', strokeWidth = 1, fill='none', className, layer } = {}) {
    const sx = _fmt(x1*scale), sy = _fmt(y1*scale), ex = _fmt(x2*scale), ey = _fmt(y2*scale);
    const rxs = _fmt(rx*scale), rys = _fmt(ry*scale);
    const laf = largeArc ? 1 : 0; const sw = sweep ? 1 : 0;
    const d = `M ${sx} ${sy} A ${rxs} ${rys} 0 ${laf} ${sw} ${ex} ${ey}`;
    return _addToLayer(layer, { tag: 'path', attrs: { d, stroke, 'stroke-width': _fmt(strokeWidth), fill, 'class': className || undefined } });
  }

  /** Add text */
  function addText({ x, y, text, fontSize = 12, anchor = 'start', className, layer } = {}) {
    const attrs = { x: _fmt(x*scale), y: _fmt(y*scale), 'font-size': _fmt(fontSize), 'text-anchor': anchor };
    if (className) attrs.class = className;
    return _addToLayer(layer, { tag: 'text', attrs, text: String(text || '') });
  }

  /** Add arrow as a line with marker-end */
  function addArrow({ x1, y1, x2, y2, stroke = '#000', strokeWidth = 1, markerId, className, layer } = {}) {
    const marker = markerId || _ensureDefaultArrow();
    const attrs = { x1: _fmt(x1*scale), y1: _fmt(y1*scale), x2: _fmt(x2*scale), y2: _fmt(y2*scale), stroke, 'stroke-width': _fmt(strokeWidth), 'marker-end': `url(#${marker})` };
    if (className) attrs.class = className;
    return _addToLayer(layer, { tag: 'line', attrs });
  }

  function _ensureDefaultArrow() {
    const key = 'arrow';
    if (!defs.has(key)) {
      const id = _id('marker');
      defs.set(key, { tag: 'marker', id, content: `<path d="M0,0 L0,6 L9,3 z" fill="black" />`, attrs: { id, markerWidth: 9, markerHeight: 9, refX: 9, refY: 3, orient: 'auto' } });
    }
    return defs.get(key).id;
  }

  /** Add a dimension (cote) between two points with optional offset and text */
  function addDimension({ x1, y1, x2, y2, offset = 10, text, stroke = '#000', strokeWidth = 0.8, fontSize = 10, layer, className } = {}) {
    // compute normal vector
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy/len, ny = dx/len; // outward normal
    const ox = nx * offset, oy = ny * offset;
    // dimension line
    addLine({ x1: x1 + ox, y1: y1 + oy, x2: x2 + ox, y2: y2 + oy, stroke, strokeWidth, layer, className });
    // extension lines
    addLine({ x1: x1, y1: y1, x2: x1 + ox, y2: y1 + oy, stroke, strokeWidth, layer, className });
    addLine({ x1: x2, y1: y2, x2: x2 + ox, y2: y2 + oy, stroke, strokeWidth, layer, className });
    // arrows
    const marker = _ensureDefaultArrow();
    addArrow({ x1: x1 + ox, y1: y1 + oy, x2: x1 + ox + (dx*0.05), y2: y1 + oy + (dy*0.05), stroke, strokeWidth, markerId: marker, layer, className });
    addArrow({ x1: x2 + ox, y1: y2 + oy, x2: x2 + ox - (dx*0.05), y2: y2 + oy - (dy*0.05), stroke, strokeWidth, markerId: marker, layer, className });
    // text
    const midx = (x1 + x2)/2 + ox; const midy = (y1 + y2)/2 + oy;
    const val = text != null ? text : `${_fmt(len)} ${meta.units}`;
    addText({ x: midx, y: midy, text: val, fontSize, anchor: 'middle', layer, className });
  }

  /** Add grid */
  function addGrid({ spacing = 50, width = viewBox.w, height = viewBox.h, stroke = '#ddd', strokeWidth = 0.5, layer } = {}) {
    for (let x = 0; x <= width; x += spacing) addLine({ x1: x, y1: 0, x2: x, y2: height, stroke, strokeWidth, layer });
    for (let y = 0; y <= height; y += spacing) addLine({ x1: 0, y1: y, x2: width, y2: y, stroke, strokeWidth, layer });
  }

  /** Add marker/def - low level */
  function addMarker(id, content, attrs = {}) { defs.set(id, { tag: 'custom', id, content, attrs }); return id; }

  /** Add or ensure layer - returns layer object */
  function addLayer(name, options = {}) { _ensureLayer(name); return { name, options }; }

  /** Group elements into a virtual group (returns object handle) */
  function group(elements = [], opts = {}) {
    return { tag: 'g', attrs: opts.attrs || {}, children: elements };
  }

  /** Export SVG string. options: {page:'A4'|'A3', includeDefs:true} */
  function exportSvg(opts = {}) {
    const page = opts.page || null;
    let width = viewBox.w, height = viewBox.h;
    if (page && PAGE_SIZES[page]) { width = PAGE_SIZES[page].w; height = PAGE_SIZES[page].h; }
    const unit = meta.units || units;
    const vb = `${_fmt(viewBox.x)} ${_fmt(viewBox.y)} ${_fmt(viewBox.w*scale)} ${_fmt(viewBox.h*scale)}`;
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${_fmt(width)}${unit}" height="${_fmt(height)}${unit}" viewBox="${vb}" preserveAspectRatio="xMinYMin meet">`);
    // defs
    if (defs.size > 0) {
      parts.push('<defs>');
      for (const d of defs.values()) {
        if (d.tag === 'marker') {
          const a = d.attrs;
          parts.push(`<marker id="${_escapeXml(d.id)}" markerWidth="${_escapeXml(String(a.markerWidth))}" markerHeight="${_escapeXml(String(a.markerHeight))}" refX="${_escapeXml(String(a.refX))}" refY="${_escapeXml(String(a.refY))}" orient="${_escapeXml(String(a.orient))}">`);
          parts.push(d.content);
          parts.push('</marker>');
        } else if (d.tag === 'custom') {
          parts.push(d.content);
        }
      }
      parts.push('</defs>');
    }
    // layers
    for (const [name, elements] of layers.entries()) {
      parts.push(`<g data-layer="${_escapeXml(name)}">`);
      for (const el of elements) {
        if (typeof el === 'string') { parts.push(el); continue; }
        if (el.tag === 'text') {
          const t = el; const attrs = Object.entries(t.attrs || {}).filter(([,v])=>v!=null).map(([k,v])=>`${k}="${_escapeXml(String(v))}"`).join(' ');
          parts.push(`<text ${attrs}>${_escapeXml(t.text)}</text>`);
          continue;
        }
        if (el.tag === 'path') { const attrs = Object.entries(el.attrs || {}).filter(([,v])=>v!=null).map(([k,v])=>`${k}="${_escapeXml(String(v))}"`).join(' '); parts.push(`<path ${attrs} />`); continue; }
        const attrs = Object.entries(el.attrs || {}).filter(([,v])=>v!=null).map(([k,v])=>`${k}="${_escapeXml(String(v))}"`).join(' ');
        parts.push(`<${el.tag} ${attrs} />`);
      }
      parts.push('</g>');
    }
    parts.push('</svg>');
    return parts.join('\n');
  }

  /** Clear document */
  function clear() { defs.clear(); layers.clear(); styles.clear(); }

  return {
    // metadata
    meta,
    setViewBox,
    setScale,
    addLine,
    addPolyline,
    addPolygon,
    addRectangle,
    addCircle,
    addArc,
    addText,
    addArrow,
    addDimension,
    addGrid,
    addMarker,
    addLayer,
    group,
    exportSvg,
    clear,
  };
}

module.exports = { createDocument };

/* Self-tests */
if (require.main === module) {
  (async function runTests(){
    const assert = (c, m) => { if (!c) throw new Error(m || 'Assertion failed'); };
    const doc = createDocument({ units: 'mm', scale: 1 });
    doc.setViewBox(0,0,200,200);
    // layers
    doc.addLayer('base');
    doc.addLayer('annotations');
    // add line
    doc.addLine({ x1:10, y1:10, x2:190, y2:10, stroke:'#f00', strokeWidth:2, layer:'base' });
    // add text
    doc.addText({ x:100, y:20, text:'Test', fontSize:14, anchor:'middle', layer:'annotations' });
    // dimension
    doc.addDimension({ x1:10, y1:30, x2:190, y2:30, offset:8, layer:'annotations' });
    // grid
    doc.addGrid({ spacing:50, width:200, height:200, layer:'base' });
    const svg = doc.exportSvg({ page: 'A4' });
    // basic checks
    assert(typeof svg === 'string', 'exported svg is string');
    assert(svg.includes('<svg'), 'svg tag present');
    assert(svg.includes('data-layer="base"'), 'base layer present');
    assert(svg.includes('<line'), 'line present');
    assert(svg.includes('<text'), 'text present');
    assert(svg.includes('marker') || svg.includes('<defs'), 'marker/defs present');
    console.log('measurementSvg.js self-tests: OK');
  })().catch((e) => { console.error(e); process.exit(1); });
}
