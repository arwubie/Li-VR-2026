// Pure dataset/layout/input helpers shared by the scene and offline checks.
export const CITATION_STEP = 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const citationCount = p => Number.isFinite(p.citationCount) ? Math.max(0, p.citationCount) : 0;
export const paperYear = p => Number.isFinite(p.year) ? p.year : 0;
export const passesFilters = (p, f) => citationCount(p) >= f.minCitations && paperYear(p) >= f.minYear;

export function prepareCorpus(data) {
   if (!Array.isArray(data.papers) || !data.papers.length) throw new Error('No papers in local dataset');
   const papers = data.papers, ids = new Set(papers.map(p => p.id));
   if (ids.size !== papers.length || papers.some(p => typeof p.id !== 'string')) throw new Error('Invalid paper IDs');
   const years = papers.map(paperYear), minYear = Math.min(...years), maxYear = Math.max(...years);
   const maxCitations = Math.max(1, ...papers.map(citationCount));
   const layout = new Map();
   for (const year of [...new Set(years)].sort()) {
      const group = papers.filter(p => paperYear(p) === year).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const cols = Math.min(5, group.length), rows = Math.ceil(group.length / cols);
      group.forEach((p, i) => layout.set(p.id, {
         position: [(i % cols - (cols - 1) / 2) * .62, 1.55 + ((rows - 1) / 2 - Math.floor(i / cols)) * .48,
                    -1.5 - (maxYear - year) * .85],
         radius: .055 + .075 * Math.log1p(citationCount(p)) / Math.log1p(maxCitations),
      }));
   }
   // citationEdges is authoritative: source cites target, including same-year links.
   const edges = (data.citationEdges || []).filter(e => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
   return { papers, edges, layout, minYear, maxYear, maxCitations };
}

export const initialFilters = corpus => ({ minCitations: 0, minYear: corpus.minYear });
// Only horizontal/vertical edits travel over the wire. Year depth is immutable.
export function normalizePositions(positions, corpus) {
   const result = {};
   for (const p of corpus.papers) {
      const xy = positions?.[p.id];
      if (Array.isArray(xy) && xy.length === 2 && xy.every(Number.isFinite))
         result[p.id] = [clamp(xy[0], -3.5, 3.5), clamp(xy[1], .4, 3.2)];
   }
   return result;
}
export function pointOnYearPlane(ray, z) {
   if (!ray || Math.abs(ray.direction[2]) < .00001) return null;
   const t = (z - ray.origin[2]) / ray.direction[2];
   if (!Number.isFinite(t) || t < 0) return null;
   const p = ray.origin.map((v, i) => v + t * ray.direction[i]);
   return p.every(Number.isFinite) ? [p[0], p[1], z] : null;
}
export function normalizeFilters(f, corpus) {
   const defaults = initialFilters(corpus);
   return {
      minCitations: clamp(Number.isFinite(f?.minCitations) ? f.minCitations : defaults.minCitations, 0,
                          Math.ceil(corpus.maxCitations / CITATION_STEP) * CITATION_STEP),
      minYear: clamp(Number.isFinite(f?.minYear) ? Math.round(f.minYear) : defaults.minYear, corpus.minYear, corpus.maxYear + 1),
   };
}
export function filterKey(f, key, corpus) {
   f = normalizeFilters(f, corpus);
   switch (key.toLowerCase()) {
      case '[': return normalizeFilters({ ...f, minCitations: f.minCitations - CITATION_STEP }, corpus);
      case ']': return normalizeFilters({ ...f, minCitations: f.minCitations + CITATION_STEP }, corpus);
      case ',': return normalizeFilters({ ...f, minYear: f.minYear - 1 }, corpus);
      case '.': return normalizeFilters({ ...f, minYear: f.minYear + 1 }, corpus);
      case 'r': return initialFilters(corpus);
      default: return null;
   }
}

// Returns the nearest forward sphere intersection, not distance to an infinite line.
export function pickPaper(origin, direction, candidates) {
   const length = Math.hypot(...direction);
   if (!length) return null;
   const d = direction.map(x => x / length);
   let nearest = Infinity, id = null;
   for (const p of candidates) {
      const q = origin.map((x,i) => x - p.position[i]);
      const b = q.reduce((s,x,i) => s + x * d[i], 0);
      const c = q.reduce((s,x) => s + x*x, 0) - p.radius*p.radius;
      const disc = b*b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc), exit = -b + Math.sqrt(disc);
      const distance = t >= 0 ? t : exit;
      if (distance >= 0 && distance < nearest) { nearest = distance; id = p.id; }
   }
   return id;
}

export const edgeKind = (e, selected) => e.source === selected ? 'outgoing' : e.target === selected ? 'incoming' : 'other';
export const paperURL = p => [p?.arxivUrl, p?.paperUrl].find(u => typeof u === 'string' && /^https?:\/\//i.test(u)) || null;
const PAPER_COLORS = {
   'agent-foundations': [.25, .78, 1],
   'self-improvement': [.78, .49, 1],
   'agent-framework': [.25, .88, .69],
   'tool-use': [1, .51, .37],
   'harness': [.98, .48, .72],
   'benchmark': [.70, .85, .30],
};
export const paperColor = p => PAPER_COLORS[p.category] || [.48, .69, .84];
export const paperName = p => labelText(p.title?.split(':')[0] || p.id);
export function previewURL(p) {
   const supplied = paperURL(p);
   if (!supplied) return null;
   const url = new URL(supplied);
   // Derive the PDF endpoint only from a supplied arXiv identifier.
   if (url.hostname === 'arxiv.org' && url.pathname.startsWith('/abs/')) {
      url.pathname = url.pathname.replace('/abs/', '/pdf/');
      return url.href;
   }
   return supplied;
}
// Clay's built-in atlas is ASCII. Keep original metadata untouched.
export const labelText = text => String(text ?? '').replace(/τ/g, 'tau').replace(/[—–]/g, '-').replace(/[^\x20-\x7e]/g, '?');
export function wrapText(text, width = 54) {
   const lines = [''];
   for (const word of labelText(text).split(/\s+/)) {
      if (lines[lines.length - 1].length + word.length + 1 > width) lines.push('');
      lines[lines.length - 1] += (lines[lines.length - 1] ? ' ' : '') + word;
   }
   return lines;
}
