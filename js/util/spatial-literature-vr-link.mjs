import { paperURL, paperYear, citationCount, wrapText } from './spatial-literature.mjs';

// Open synchronously inside the native XR select gesture, before ending XR.
// If the browser blocks a new tab, end XR and use this tab instead.
export function openPaperInBrowser(url, { openWindow, endSession, navigate }) {
   if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
   let tab;
   try {
      tab = openWindow('about:blank', '_blank');
      if (tab) {
         tab.opener = null;
         tab.location.replace(url);
      }
   } catch (_) { tab = null; }
   const end = async () => { try { await endSession?.(); } catch (_) {} };
   if (tab) void end();
   else void end().then(() => navigate(url));
   return true;
}

export function createVRPaperLink(model, cg, { beamForHand,
   openURL = (url, session) => openPaperInBrowser(url, {
      openWindow: (...args) => window.open(...args),
      endSession: () => session?.end(), navigate: url => window.location.assign(url),
   }) } = {}) {
   const root = model.add().scale(0);
   let open = false, disposed = false, session = null, armed = null, url = null;
   const label = (text, x, y, size = .015) => root.add('label').info(text).move(x, y, .025).scale(size).color(.88, .95, 1);
   root.add('cube').scale(.53, .25, .015).color(.035, .065, .10).dull();
   const titles = [label('', 0, .17), label('', 0, .115), label('', 0, .06)];
   const metadata = label('', 0, -.005, .014);
   const openButton = root.add('cube').move(-.19, -.105, .019).scale(.17, .038, .008).color(.10, .34, .44).dull();
   const openLabel = label('OPEN PAPER', -.19, -.105);
   root.add('cube').move(.24, -.105, .019).scale(.10, .038, .008).color(.13, .21, .30).dull();
   label('CLOSE', .24, -.105);
   const note = label('Open original in headset browser', 0, -.195, .011);
   const close = () => { open = false; armed = null; root.identity().scale(0); };
   const hit = worldBeam => {
      if (!open || !worldBeam) return null;
      const m = cg.mMultiply(cg.mInverse(root.getGlobalMatrix()), worldBeam);
      if (Math.abs(m[10]) < .00001) return null;
      const t = m[14] / m[10];
      if (t < 0) return null;
      const x = m[12] - t * m[8], y = m[13] - t * m[9];
      if (Math.abs(y + .105) > .05) return null;
      if (Math.abs(x + .19) <= .17 && url) return 'open';
      if (Math.abs(x - .24) <= .10) return 'close';
      return null;
   };
   const activate = action => {
      if (!open) return;
      if (action === 'close') close();
      else if (action === 'open' && url) {
         const target = url;
         close();
         openURL(target, session);
      }
   };
   const nativeStart = e => {
      const hand = e.inputSource?.handedness;
      // Remember which card was already visible when this gesture started.
      // The click that selects a sphere cannot also activate its new card.
      armed = open ? { hand, action: hit(beamForHand?.(hand)) } : null;
   };
   const nativeSelect = e => {
      if (!open || !armed || armed.hand !== e.inputSource?.handedness) return;
      const action = armed.action; armed = null;
      if (action && action === hit(beamForHand?.(e.inputSource.handedness))) activate(action);
   };
   const nativeEnd = () => { armed = null; };
   const bindSession = next => {
      if (session === next) return;
      session?.removeEventListener('selectstart', nativeStart);
      session?.removeEventListener('select', nativeSelect);
      session?.removeEventListener('selectend', nativeEnd);
      session = next; armed = null;
      session?.addEventListener('selectstart', nativeStart);
      session?.addEventListener('select', nativeSelect);
      session?.addEventListener('selectend', nativeEnd);
   };
   return {
      root,
      get isOpen() { return open; },
      show(p, headMatrix) {
         if (disposed) return;
         open = true; armed = null; url = paperURL(p);
         const lines = wrapText(p.title || p.id, 58);
         titles.forEach((n, i) => n.info(lines[i] || ''));
         metadata.info(`${paperYear(p)} | ${citationCount(p)} citations`);
         openLabel.info(url ? 'OPEN PAPER' : 'NO URL');
         openButton.color(url ? [.10, .34, .44] : [.12, .15, .19]);
         note.info(url ? 'Open original in headset browser' : 'No original URL supplied');
         root.setMatrix(cg.mMultiply(cg.mInverse(model.getGlobalMatrix()), headMatrix)).move(0, -.06, -1.15);
      },
      press(worldBeam) {
         if (!open) return false;
         const action = hit(worldBeam);
         // Close needs no browser activation. Opening is handled only by the
         // native select listener when an XRSession is available.
         if (action === 'close' || !session) activate(action);
         return true;
      },
      bindSession,
      close,
      dispose() { disposed = true; close(); bindSession(null); },
   };
}
