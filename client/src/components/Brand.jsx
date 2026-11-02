import logoUrl from '../assets/brand/bookleaf-logo.avif';

// The official logo file is used unmodified (180 x 79 px). Never stretch it beyond its natural width.
const LOGO_W = 180;
const LOGO_H = 79;
// The coral slash-square occupies this region of the same file (measured: x 4, y 9, 43 x 43 px).
const MARK = { x: 4, y: 9, size: 43 };

export function BrandLogo({ width = 150, className = '' }) {
  const w = Math.min(width, LOGO_W);
  return <img className={`brand-logo ${className}`} src={logoUrl} width={w} height={Math.round((w * LOGO_H) / LOGO_W)} alt="BookLeaf Publishing" />;
}

/** The logo's coral square, shown by cropping the official file with CSS (no new artwork). */
export function BrandMark({ size = 40 }) {
  const k = size / MARK.size;
  return (
    <span
      className="brand-mark" role="img" aria-label="BookLeaf Publishing"
      style={{ width: size, height: size, backgroundImage: `url(${logoUrl})`, backgroundSize: `${LOGO_W * k}px ${LOGO_H * k}px`, backgroundPosition: `${-MARK.x * k}px ${-MARK.y * k}px` }}
    />
  );
}
