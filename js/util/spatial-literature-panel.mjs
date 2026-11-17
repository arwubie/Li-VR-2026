import { paperURL, previewURL, citationCount, paperYear } from './spatial-literature.mjs';

// Desktop-only paper reader, created on demand from an explicit canvas click.
export function createPaperPanel(doc, onClose = () => {}) {
   let dialog, frame, title, metadata, link, empty, style;
   const close = () => dialog?.close();
   const build = () => {
      style = doc.createElement('style');
      style.textContent = `
         .literature-reader {box-sizing:border-box;width:min(1120px,94vw);height:90vh;max-width:none;max-height:none;
            padding:0;border:1px solid #334659;border-radius:20px;background:#101b29;color:#edf5ff;
            box-shadow:0 30px 100px #0009;font:15px/1.5 system-ui,sans-serif;overflow:hidden;}
         .literature-reader::backdrop {background:#030b16aa;backdrop-filter:blur(5px);}
         .literature-reader[open] {display:flex;flex-direction:column;}
         .literature-reader header {padding:20px 24px 16px;display:flex;gap:20px;align-items:flex-start;}
         .literature-reader header div {flex:1;min-width:0;}
         .literature-reader h2 {margin:0 0 6px;font-size:23px;line-height:1.3;}
         .literature-reader p {margin:0;color:#9fb3c8;}
         .literature-reader button {border:1px solid #42556b;border-radius:10px;background:#1b2b3d;color:white;
            padding:6px 12px;font-size:22px;cursor:pointer;}
         .literature-reader iframe {flex:1;width:100%;min-height:0;border:0;background:#eef1f5;}
         .literature-reader footer {padding:10px 24px;border-top:1px solid #2a3b4e;color:#9fb3c8;font-size:13px;}
         .literature-reader a {color:#7edcff;text-decoration:none;margin-left:12px;}
         .literature-reader .empty {padding:30px 24px;flex:1;}
      `;
      dialog = doc.createElement('dialog'); dialog.className = 'literature-reader';
      dialog.setAttribute('aria-label', '论文阅读器');
      const header = doc.createElement('header'), heading = doc.createElement('div');
      title = doc.createElement('h2'); metadata = doc.createElement('p');
      heading.append(title, metadata);
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = '×';
      button.setAttribute('aria-label', '关闭论文'); button.addEventListener('click', close);
      header.append(heading, button);
      frame = doc.createElement('iframe'); frame.title = '论文原文预览'; frame.referrerPolicy = 'no-referrer';
      empty = doc.createElement('p'); empty.className = 'empty';
      const footer = doc.createElement('footer');
      footer.textContent = '若预览未显示，可直接打开原文。';
      link = doc.createElement('a'); link.textContent = '在新标签页打开 ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer';
      footer.append(link); dialog.append(header, frame, empty, footer);
      dialog.addEventListener('click', e => { if (e.target === dialog) {
         const r = dialog.getBoundingClientRect();
         if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
      } });
      dialog.addEventListener('close', () => { frame.removeAttribute('src'); onClose(); });
      // Keep typing and Escape inside the reader, away from scene shortcuts.
      dialog.addEventListener('keydown', e => e.stopPropagation());
      dialog.addEventListener('keyup', e => e.stopPropagation());
      doc.head.append(style); doc.body.append(dialog);
   };
   return {
      get isOpen() { return !!dialog?.open; },
      show(paper) {
         if (!dialog) build();
         title.textContent = paper.title || paper.id;
         metadata.textContent = `${paperYear(paper)} · ${citationCount(paper)} 次引用（数据快照） · ${paper.category || ''}`;
         const url = paperURL(paper);
         frame.hidden = !url; empty.hidden = !!url; link.hidden = !url;
         if (url) { frame.src = previewURL(paper); link.href = url; }
         else { frame.removeAttribute('src'); empty.textContent = '数据中未提供这篇论文的原文链接。'; }
         if (!dialog.open) dialog.showModal();
      },
      close,
      dispose() { frame?.removeAttribute('src'); dialog?.remove(); style?.remove(); },
   };
}
