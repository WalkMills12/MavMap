import { useState } from "react";

/**
 * A cover photo that hides itself if the image fails to load.
 * `credit` (optional): { text, href } shown as a small caption, e.g. the photographer and license.
 */
export default function Photo({ src, alt = "", className = "", credit }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <figure className={`photo ${className}`}>
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      {credit?.text && (
        <figcaption className="photo-credit">
          {credit.href ? (
            <a href={credit.href} target="_blank" rel="noreferrer">
              {credit.text}
            </a>
          ) : (
            credit.text
          )}
        </figcaption>
      )}
    </figure>
  );
}
