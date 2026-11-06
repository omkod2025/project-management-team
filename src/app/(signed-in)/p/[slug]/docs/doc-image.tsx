'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import styles from './doc-image.module.css';

/** Keep the original image markup intact for printing and document exports. */
export default function DocImage({ alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  // The address the image actually shows, caught when it is opened.
  const [preview, setPreview] = useState<string | null>(null);
  const trigger = useRef<HTMLImageElement>(null);
  const open = (image: HTMLImageElement) => setPreview(image.currentSrc || String(props.src ?? ''));
  return <>
    {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded document image of unknown size, kept as plain markup for print and export */}
    <img {...props} ref={trigger} alt={alt} className={styles.trigger}
      role="button" tabIndex={0} aria-haspopup="dialog" aria-label={alt ? `Enlarge image: ${alt}` : 'Enlarge image'}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); open(event.currentTarget); }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); event.stopPropagation(); open(event.currentTarget);
        }
      }} />
    {preview !== null && createPortal(<ImagePreview src={preview} alt={alt}
      onClose={() => { setPreview(null); trigger.current?.focus({ preventScroll: true }); }} />, document.body)}
  </>;
}

function ImagePreview({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const close = () => { dialog.current?.close(); onClose(); };
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-label="Image preview"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onKeyDown={(event) => event.stopPropagation()}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.panel}>
      <header className={styles.header}>
        <span>Image preview</span>
        <button type="button" autoFocus onClick={close} aria-label="Close image preview">Close</button>
      </header>
      <div className={styles.stage}>
        {!loaded && !failed && <p role="status">Loading image…</p>}
        {failed ? <p role="alert">Could not load this image. Close the preview and try again.</p>
          // eslint-disable-next-line @next/next/no-img-element -- the full-size preview of that same uploaded image
          : <img src={src} alt={alt} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
      </div>
      {alt && <p className={styles.caption}>{alt}</p>}
    </div>
  </dialog>;
}
