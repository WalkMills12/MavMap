import { useEffect, useRef, useState } from "react";

/**
 * Photo header for a card. Darkens the bottom so caption text stays readable, and falls back to
 * a colored panel with `fallbackLabel` when there is no photo or it fails to load.
 *
 * Pass `src` for a known image URL, or `load` (async () => {url, author, authorUrl} | null) to
 * fetch the photo only once the card scrolls near the screen.
 * Children are layered on top (caption, star button, click target).
 */
export default function CardPhoto({ src, load, fallbackLabel, className = "", children }) {
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(null); // {url, author, authorUrl} from `load`
  const [failedUrl, setFailedUrl] = useState(null);

  useEffect(() => {
    setLoaded(null);
    if (!load || !ref.current) return;
    let cancelled = false;
    const run = () =>
      load().then((photo) => {
        if (!cancelled) setLoaded(photo);
      });
    if (typeof IntersectionObserver === "undefined") {
      run();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(ref.current);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [load]);

  const url = src || loaded?.url || null;
  const show = url && failedUrl !== url;

  return (
    <div ref={ref} className={`card-photo${show ? "" : " card-photo--empty"} ${className}`}>
      {show ? (
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      ) : (
        <span className="card-photo-fallback" aria-hidden="true">
          {fallbackLabel}
        </span>
      )}
      <span className="card-photo-shade" aria-hidden="true" />
      {show && loaded?.author && (
        <span className="card-photo-credit">
          Photo:{" "}
          {loaded.authorUrl ? (
            <a href={loaded.authorUrl} target="_blank" rel="noreferrer">
              {loaded.author}
            </a>
          ) : (
            loaded.author
          )}
        </span>
      )}
      {children}
    </div>
  );
}
