import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFaqs } from "../api.js";
import { answerQuestion } from "../faqMatch.js";
import { nextClass } from "../schedule.js";
import { useSwipeDown } from "../useSwipeDown.js";

const WELCOME = {
  id: 0,
  from: "bot",
  text: "Hi! I'm the MavMap helper. Ask where things are (“where can I play basketball?”, “where is ERB?”), type a room like NH 106, or ask “where is my next class?”. Type help to see everything I can do.",
};

// "Starbucks (University Center)" → "Starbucks (UC)"; codes for buildings that have them.
function shortName(b) {
  if (b.abbr?.[0] && b.abbr[0].length <= 5) return b.abbr[0];
  return b.name.replace("(University Center)", "(UC)");
}

function formatWhen(start) {
  if (!start) return "";
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isPhone() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
}

export default function FaqChat({
  buildings,
  classes = [],
  events = [], // upcoming UTA events, so the chat can answer "what's happening?" and "any club meetings?"
  onShowBuilding,
  onNavigate,
  detailOpen = false,
  hidden = false,
  open: openProp, // optional: the app controls open/closed (phones keep one panel open at a time)
  onOpenChange,
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (v) => {
      setOpenState(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const windowRef = useRef(null);
  const [faqs, setFaqs] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const inputRef = useRef(null);
  const bubbleRef = useRef(null);
  const listRef = useRef(null);

  // Load FAQs the first time the window opens.
  useEffect(() => {
    if (!open || faqs || loadError) return;
    let cancelled = false;
    fetchFaqs()
      .then((data) => !cancelled && setFaqs(data))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [open, faqs, loadError]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const close = useCallback(() => {
    setOpen(false);
    bubbleRef.current?.focus();
  }, [setOpen]);

  useSwipeDown(windowRef, close, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const ask = (text) => {
    const question = text.trim();
    if (!question) return;
    const reply = answerQuestion(question, { faqs: faqs ?? [], buildings, classes, events, nextClassFn: nextClass });
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, from: "user", text: question },
      { id: nextId.current++, from: "bot", ...reply },
    ]);
    setDraft("");
  };

  const showOnMap = (building) => {
    onShowBuilding(building);
    if (isPhone()) setOpen(false);
  };

  const walkThere = (building) => {
    setOpen(false);
    onNavigate(building);
  };

  const featured = (faqs ?? []).filter((f) => f.featured);
  const asked = messages.length > 1;

  return (
    <div
      className={`faq-root${detailOpen ? " faq-root--detail-open" : ""}${open ? " faq-root--open" : ""}`}
      hidden={hidden}
    >
      {open && (
        <section ref={windowRef} className="faq-window" role="dialog" aria-label="Campus FAQs" aria-modal="false">
          <div className="sheet-handle" aria-hidden="true" />
          <header className="faq-header">
            <div>
              <p className="faq-title">Campus FAQs</p>
              <p className="faq-subtitle">Questions, rooms and buildings</p>
            </div>
            <button type="button" className="faq-close" onClick={close} aria-label="Close FAQs">
              ×
            </button>
          </header>

          <div className="faq-messages" ref={listRef} aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={`faq-msg faq-msg--${m.from}`}>
                <p>{m.text}</p>
                {m.events?.length > 0 && (
                  <ul className="faq-events">
                    {m.events.map((e) => (
                      <li key={e.id}>
                        {e.url ? (
                          <a href={e.url} target="_blank" rel="noreferrer">
                            {e.title}
                          </a>
                        ) : (
                          <strong>{e.title}</strong>
                        )}
                        <span>
                          {formatWhen(e.start)}
                          {e.location ? ` · ${e.location}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {(m.building || m.link || m.places?.length > 0) && (
                  <div className="faq-actions">
                    {m.building && (
                      <button type="button" className="faq-action" onClick={() => showOnMap(m.building)}>
                        Show {m.building.abbr?.[0] ?? m.building.name} on map
                      </button>
                    )}
                    {m.building && onNavigate && (
                      <button type="button" className="faq-action faq-action--go" onClick={() => walkThere(m.building)}>
                        ➤ Get directions
                      </button>
                    )}
                    {!m.building &&
                      m.places?.map((p) => (
                        <button key={p.id} type="button" className="faq-action" onClick={() => showOnMap(p)}>
                          Show {shortName(p)}
                        </button>
                      ))}
                    {m.link && (
                      <a className="faq-action" href={m.link} target="_blank" rel="noreferrer">
                        {m.linkLabel || `Open ${new URL(m.link).hostname.replace(/^www\./, "")}`}
                      </a>
                    )}
                  </div>
                )}
                {m.suggestions?.length > 0 && (
                  <div className="faq-suggestions">
                    {m.suggestions.map((f) => (
                      <button key={f.id} type="button" className="faq-chip" onClick={() => ask(f.question)}>
                        {f.question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loadError && (
              <div className="faq-msg faq-msg--bot faq-msg--error">
                <p>
                  I couldn't load the FAQ list. Is the backend running on port 8000? Room and building lookups
                  still work.
                </p>
              </div>
            )}
          </div>

          {!asked && featured.length > 0 && (
            <div className="faq-featured" aria-label="Common questions">
              {featured.map((f) => (
                <button key={f.id} type="button" className="faq-chip" onClick={() => ask(f.question)}>
                  {f.question}
                </button>
              ))}
            </div>
          )}

          <form
            className="faq-composer"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <input
              ref={inputRef}
              className="faq-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask anything: “where can I eat?”, “ERB 228”"
              aria-label="Ask a question"
              autoComplete="off"
            />
            <button type="submit" className="faq-send" disabled={!draft.trim()}>
              Ask
            </button>
          </form>
        </section>
      )}

      <button
        ref={bubbleRef}
        type="button"
        className="faq-bubble"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={open ? "Close campus FAQs" : "Open campus FAQs"}
        title="Campus FAQs"
      >
        {open ? (
          <span className="faq-bubble-x" aria-hidden="true">×</span>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />
            <text x="12" y="12.6" textAnchor="middle" fontSize="9" fontWeight="700">?</text>
          </svg>
        )}
      </button>
    </div>
  );
}
