import { getDocument, GlobalWorkerOptions } from './vendor/pdfjs/build/pdf.js';

GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/build/pdf.worker.js', import.meta.url).href;

export function renderRulesPdf(container, status, url, label = 'เอกสารระเบียบชุมชน') {
 const base = new URL('./vendor/pdfjs/', import.meta.url);
 const loading = getDocument({url, cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`});
 let disposed = false;
 (async () => {
  try {
   const document = await loading.promise;
   for (let number = 1; number <= document.numPages; number++) {
    if (disposed) return;
    const pdfPage = await document.getPage(number);
    if (disposed) return;
    const viewport = pdfPage.getViewport({scale: 1.5});
    const figure = window.document.createElement('figure');
    figure.className = 'rules-page';
    const canvas = window.document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    const caption = window.document.createElement('figcaption');
    caption.textContent = `หน้า ${number} / ${document.numPages}`;
    figure.append(canvas, caption);
    container.append(figure);
    await pdfPage.render({canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0]}).promise;
    if (disposed) return;
    const text = await pdfPage.getTextContent();
    const accessibleText = window.document.createElement('p');
    accessibleText.className = 'rules-accessible-text';
    accessibleText.textContent = text.items.map(item => item.str || '').join(' ');
    figure.append(accessibleText);
    pdfPage.cleanup();
   }
   status.textContent = `${label} · ${document.numPages} หน้า`;
  } catch (error) {
   if (!disposed) status.textContent = 'ไม่สามารถแสดงเอกสารได้ กรุณาโหลดหน้าใหม่ หรือกดดาวน์โหลด PDF เพื่ออ่าน';
  } finally {
   if (!disposed) container.setAttribute('aria-busy', 'false');
  }
 })();
 return () => { disposed = true; loading.destroy().catch(() => {}); };
}
