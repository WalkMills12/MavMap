import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CampusMap from "./components/CampusMap.jsx";
import BuildingSearch from "./components/BuildingSearch.jsx";
import BuildingDetail from "./components/BuildingDetail.jsx";
import FaqChat from "./components/FaqChat.jsx";
import SideMenu from "./components/SideMenu.jsx";
import DirectoryTab from "./components/DirectoryTab.jsx";
import EventsTab from "./components/EventsTab.jsx";
import TransitTab from "./components/TransitTab.jsx";
import PreferencesMenu from "./components/PreferencesMenu.jsx";
import SuggestionPopup from "./components/SuggestionPopup.jsx";
import StormLayer from "./components/StormLayer.jsx";
import OdysseyFx from "./components/OdysseyFx.jsx";
import { fetchBuildings, fetchEvents, fetchTraffic, fetchTransit } from "./api.js";
import { nearbyEvents } from "./geo.js";
import { hasEnded } from "./calendar.js";
import { usePreferences } from "./prefs.js";
import { buildIndex } from "./search.js";
import { useGeolocation } from "./useGeolocation.js";
import { useWalkingNav } from "./useWalkingNav.js";
import NavBanner from "./components/NavBanner.jsx";
import GpsStatus from "./components/GpsStatus.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import BottomNav from "./components/BottomNav.jsx";
import MobileSheet from "./components/MobileSheet.jsx";
import { useIsMobile } from "./useIsMobile.js";
import { useFavorites } from "./favorites.js";
import { clearInterests, markSeen, markSuggested, pickSuggestions, recordInterest } from "./interests.js";

const UTA_CENTER = { lat: 32.7296, lng: -97.1135 };
const EMPTY_TRAFFIC = [];
const EVENTS_REFRESH_MS = 60_000;
const SHEET_TITLES = { directory: "Places", events: "Events", transit: "Transit" };
const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;

function useResolvedTheme(theme) {
  const [resolved, setResolved] = useState("dark");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = next;
      setResolved(next);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return resolved;
}

export default function App() {
  const [prefs, updatePrefs, resetPrefs] = usePreferences();
  const mobile = useIsMobile();
  const favorites = useFavorites();
  const theme = useResolvedTheme(prefs.theme);

  const [buildings, setBuildings] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [eventsUpdatedAt, setEventsUpdatedAt] = useState(null);
  const [transit, setTransit] = useState(null);
  const [transitError, setTransitError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [focusStop, setFocusStop] = useState(null);
  const [query, setQuery] = useState("");
  const [traffic, setTraffic] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(() => prefs.openMenuOnStart && !isPhone());
  const [menuTab, setMenuTab] = useState(prefs.defaultTab);
  const [suggestions, setSuggestions] = useState([]);
  const suggestionsChecked = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.text = prefs.textSize;
  }, [prefs.textSize]);

  // Buildings, transit and traffic load once. Optional layers failing shouldn't hide the buildings.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buildingData = await fetchBuildings();
        if (cancelled) return;
        setBuildings(buildingData);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load campus data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    fetchTransit()
      .then((data) => !cancelled && setTransit(data))
      .catch(() => !cancelled && setTransitError(true));
    fetchTraffic(3)
      .then((data) => !cancelled && setTraffic(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Live events: load when the "Show events for" preference changes, then refresh quietly every
  // minute and whenever the tab comes back into view. A failed refresh keeps the last good list.
  useEffect(() => {
    let cancelled = false;
    let lastFetch = 0;
    const load = (initial) => {
      lastFetch = Date.now();
      if (initial) setEventsLoading(true);
      return fetchEvents(prefs.eventDays)
        .then((data) => {
          if (cancelled) return;
          setEvents(data);
          setEventsError(null);
          setEventsUpdatedAt(Date.now());
        })
        .catch((err) => {
          if (!cancelled && initial) setEventsError(err.message || "Failed to load events");
        })
        .finally(() => !cancelled && initial && setEventsLoading(false));
    };
    load(true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(false);
    }, EVENTS_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch > 30_000) load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [prefs.eventDays]);

  // Event-traffic heat follows the live events too.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchTraffic(3).then(setTraffic).catch(() => {});
    }, 2 * EVENTS_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // Re-check "live now" / "ended" every 30 seconds even when the data hasn't changed.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Once per app start: suggest new events that match what this student likes, then remember what they've seen.
  useEffect(() => {
    if (suggestionsChecked.current || eventsLoading || eventsError || !events.length) return;
    suggestionsChecked.current = true;
    const picks = prefs.suggestions ? pickSuggestions(events, favorites.eventIds) : [];
    markSeen(events);
    if (picks.length) {
      markSuggested(picks.map((p) => p.event.id));
      setSuggestions(picks);
    }
  }, [events, eventsLoading, eventsError, prefs.suggestions, favorites.eventIds]);

  const searchIndex = useMemo(() => buildIndex(buildings), [buildings]);

  // Live GPS: "locate me" shows where you are; "Walk here (GPS)" also draws the walking route
  // and keeps it updated as you move.
  const [gpsOn, setGpsOn] = useState(false);
  const [navTarget, setNavTarget] = useState(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [following, setFollowing] = useState(false);
  const geo = useGeolocation(gpsOn || Boolean(navTarget));
  const nav = useWalkingNav(geo.position, navTarget);

  const { enableCompass } = geo;
  const startNav = useCallback((building) => {
    enableCompass(); // must run inside the tap (iPhone permission prompt)
    setNavTarget(building);
    setGpsOn(true);
    setRecenterKey((k) => k + 1);
    if (isPhone()) setMenuOpen(false);
  }, [enableCompass]);

  const stopNav = useCallback(() => setNavTarget(null), []);

  const locate = useCallback(() => {
    enableCompass();
    if (!gpsOn) setGpsOn(true);
    setRecenterKey((k) => k + 1);
  }, [gpsOn, enableCompass]);

  const upcomingEvents = useMemo(() => events.filter((e) => !hasEnded(e, new Date(clock))), [events, clock]);

  const selectedNearby = useMemo(
    () => (selected ? nearbyEvents(selected, upcomingEvents, 280) : []),
    [selected, upcomingEvents],
  );

  const showBuilding = useCallback((building) => {
    setFocusStop(null);
    setSelected(building);
    setQuery(building.name);
    // On phones the menu covers the map, so get it out of the way.
    if (isPhone()) setMenuOpen(false);
  }, []);

  const showStop = useCallback((stop) => {
    setFocusStop(stop);
    if (stop) setSelected(null);
    if (stop && isPhone()) setMenuOpen(false);
  }, []);

  const toggleRoute = useCallback(
    (id) => {
      const hidden = prefs.hiddenRoutes.includes(id)
        ? prefs.hiddenRoutes.filter((r) => r !== id)
        : [...prefs.hiddenRoutes, id];
      updatePrefs({ hiddenRoutes: hidden });
    },
    [prefs.hiddenRoutes, updatePrefs],
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const tabCounts = {
    directory: buildings.length,
    events: upcomingEvents.length,
    transit: transit ? transit.routes.length : undefined,
  };
  const closeSuggestions = useCallback(() => setSuggestions([]), []);

  const favoriteCount = favorites.buildingIds.size + favorites.eventIds.size;
  const odyssey = theme === "odyssey";
  const mapStyle = odyssey ? "odyssey" : theme === "dark" ? "dark" : null;

  let tabContent;
  if (menuTab === "events") {
    tabContent = (
      <EventsTab
        events={events}
        loading={eventsLoading}
        error={eventsError}
        updatedAt={eventsUpdatedAt}
        now={clock}
        days={prefs.eventDays}
        calendarPref={prefs.calendar}
        buildings={buildings}
        onShowBuilding={showBuilding}
        savedEvents={favorites.savedEvents}
        isEventFav={favorites.isEventFav}
        onToggleFavorite={favorites.toggleEvent}
      />
    );
  } else if (menuTab === "transit") {
    tabContent = (
      <TransitTab
        transit={transit}
        error={transitError}
        showTransit={prefs.showTransit}
        hiddenRoutes={prefs.hiddenRoutes}
        onToggleTransit={(on) => updatePrefs({ showTransit: on })}
        onToggleRoute={toggleRoute}
        onFocusStop={showStop}
      />
    );
  } else {
    tabContent = (
      <DirectoryTab
        buildings={buildings}
        selected={selected}
        onSelect={showBuilding}
        favoriteIds={favorites.buildingIds}
        onToggleFavorite={favorites.toggleBuilding}
      />
    );
  }

  return (
    <div className={`app-shell${mobile ? " app-shell--mobile" : ""}`}>
      <header className="top-bar">
        {odyssey && <StormLayer />}
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="side-menu"
          aria-label={menuOpen ? "Close side menu" : "Open directory, events and transit"}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <div className="brand-block">
          <span className="brand-logo">
            <img src="/uta-logomark.png" alt="UTA" width="330" height="292" />
          </span>
          <p className="brand">MavMap</p>
          <p className="tagline">{odyssey ? "Begin your odyssey across campus" : "Find every building on campus"}</p>
        </div>
        <BuildingSearch
          query={query}
          onQueryChange={setQuery}
          index={searchIndex}
          events={upcomingEvents}
          onSelect={showBuilding}
        />
        <PreferencesMenu
          prefs={prefs}
          onChange={updatePrefs}
          onReset={resetPrefs}
          trafficCount={traffic?.points?.length}
          onClearInterests={clearInterests}
          onClearFavorites={favorites.clear}
          favoriteCount={favoriteCount}
        />
      </header>

      <div className={`map-area${menuOpen ? " map-area--menu" : ""}`}>
        {mobile ? (
          <MobileSheet open={menuOpen} title={SHEET_TITLES[menuTab] || "Places"} onClose={closeMenu}>
            {tabContent}
          </MobileSheet>
        ) : (
          <SideMenu
            open={menuOpen}
            tab={menuTab}
            onTabChange={setMenuTab}
            onClose={closeMenu}
            counts={tabCounts}
          >
            {tabContent}
          </SideMenu>
        )}

        <main className="map-stage">
          {loading && <div className="status-banner">Loading campus map…</div>}
          {error && <div className="status-banner error">{error}</div>}
          <ErrorBoundary name="map" title="The map hit an error." compact>
          <CampusMap
            center={UTA_CENTER}
            buildings={buildings}
            selected={selected}
            onSelect={showBuilding}
            showTraffic={prefs.showTraffic}
            trafficPoints={traffic?.points ?? EMPTY_TRAFFIC}
            mapType={prefs.mapType}
            mapStyle={mapStyle}
            favoriteIds={favorites.buildingIds}
            transit={transit}
            showTransit={prefs.showTransit}
            hiddenRoutes={prefs.hiddenRoutes}
            focusStop={focusStop}
            onFocusStop={showStop}
            userPosition={geo.position}
            routePath={navTarget ? nav.route?.path : null}
            routeEnd={navTarget ? nav.route?.end : null}
            routeEndKind={navTarget ? nav.route?.endKind : null}
            navTargetId={navTarget?.id ?? null}
            navigating={Boolean(navTarget)}
            recenterKey={recenterKey}
            onFollowChange={setFollowing}
          />
          </ErrorBoundary>
          {gpsOn && geo.status === "ok" && (
            <GpsStatus accuracy={geo.position?.accuracy} updatedAt={geo.updatedAt} following={following} />
          )}
          <button
            type="button"
            className={`locate-btn${gpsOn ? " is-on" : ""}${gpsOn && following ? " is-following" : ""}`}
            onClick={locate}
            aria-pressed={gpsOn && following}
            aria-label={gpsOn ? (following ? "Following your location" : "Follow my location") : "Show my location"}
            title={gpsOn ? (following ? "Following you" : "Follow me") : "Show my location"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="8" fill="none" />
            </svg>
          </button>
          {(navTarget || (gpsOn && geo.status !== "ok")) && (
            <NavBanner
              target={navTarget}
              status={geo.status}
              error={geo.error}
              route={nav.route}
              remaining={nav.remaining_m}
              arrived={nav.arrived}
              onStop={() => {
                stopNav();
                if (geo.status !== "ok") setGpsOn(false);
              }}
            />
          )}
          {selected && (
            <BuildingDetail
              building={selected}
              nearbyEvents={selectedNearby}
              onClose={() => setSelected(null)}
              isFavorite={favorites.isBuildingFav(selected.id)}
              onToggleFavorite={favorites.toggleBuilding}
              onNavigate={startNav}
              navigating={navTarget?.id === selected.id}
            />
          )}
          <FaqChat buildings={buildings} detailOpen={Boolean(selected)} onShowBuilding={showBuilding} />
        </main>
      </div>

      {mobile && (
        <BottomNav
          active={menuOpen ? menuTab : "map"}
          counts={tabCounts}
          onSelect={(tab) => {
            if (tab === "map") {
              setMenuOpen(false);
              return;
            }
            setMenuTab(tab);
            setMenuOpen(true);
            setSelected(null);
          }}
        />
      )}

      {odyssey && <OdysseyFx />}

      {suggestions.length > 0 && (
        <SuggestionPopup
          suggestions={suggestions}
          calendarPref={prefs.calendar}
          isSaved={favorites.isEventFav}
          onSave={(e) => {
            const nowSaved = favorites.toggleEvent(e);
            recordInterest(e, nowSaved ? "favorite" : "unfavorite");
          }}
          onCalendar={(e) => recordInterest(e, "calendar")}
          onViewAll={() => {
            setMenuTab("events");
            setMenuOpen(true);
            closeSuggestions();
          }}
          onTurnOff={() => {
            updatePrefs({ suggestions: false });
            closeSuggestions();
          }}
          onClose={closeSuggestions}
        />
      )}
    </div>
  );
}
