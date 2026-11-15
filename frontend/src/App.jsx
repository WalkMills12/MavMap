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
import SwordCursor from "./components/SwordCursor.jsx";
import NavPanel from "./components/NavPanel.jsx";
import { useNavigation } from "./navigation.js";
import { fetchBuildings, fetchEvents, fetchTraffic, fetchTransit } from "./api.js";
import { nearbyEvents } from "./geo.js";
import { hasEnded } from "./calendar.js";
import { usePreferences } from "./prefs.js";
import { useFavorites } from "./favorites.js";
import { clearInterests, markSeen, markSuggested, pickSuggestions, recordInterest } from "./interests.js";

const UTA_CENTER = { lat: 32.7296, lng: -97.1135 };
const EMPTY_TRAFFIC = [];
// Official UTA A-star logo (frontend/public/uta-logo.png). If the file is missing, the header falls back to "MavMap".
const LOGO_SRC = "/uta-logo.png";
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
  const favorites = useFavorites();
  const theme = useResolvedTheme(prefs.theme);

  const [buildings, setBuildings] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
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
  const [logoOk, setLogoOk] = useState(true);
  const navigation = useNavigation(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "");
  const [following, setFollowing] = useState(true);
  const navigating = Boolean(navigation.nav);
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

  // Events reload whenever the "Show events for" preference changes.
  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);
    fetchEvents(prefs.eventDays)
      .then((data) => {
        if (cancelled) return;
        setEvents(data);
        setEventsError(null);
      })
      .catch((err) => !cancelled && setEventsError(err.message || "Failed to load events"))
      .finally(() => !cancelled && setEventsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [prefs.eventDays]);

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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return buildings;
    return buildings.filter((b) => {
      const hay = [b.name, b.id, ...(b.abbr || [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [buildings, query]);

  const upcomingEvents = useMemo(() => events.filter((e) => !hasEnded(e)), [events]);

  const selectedNearby = useMemo(
    () => (selected ? nearbyEvents(selected, upcomingEvents, 280) : []),
    [selected, upcomingEvents],
  );

  const showBuilding = useCallback((building) => {
    setFocusStop(null);
    setSelected(building);
    // On phones the menu covers the map, so get it out of the way.
    if (isPhone()) setMenuOpen(false);
  }, []);

  // Walk me there: live location + turn-by-turn directions inside the app.
  const startNav = useCallback(
    (building) => {
      setFocusStop(null);
      setSelected(building);
      setFollowing(true);
      if (isPhone()) setMenuOpen(false);
      navigation.start(building);
    },
    [navigation.start],
  );

  const showStop = useCallback((stop) => {
    setFocusStop(stop);
    if (stop) setSelected(null);
    if (stop && isPhone()) setMenuOpen(false);
  }, []);

  // Bus routes are off until the student picks them.
  const mappableRouteIds = useMemo(() => (transit?.routes || []).filter((r) => r.stops.length).map((r) => r.id), [transit]);

  const toggleRoute = useCallback(
    (id) => {
      const shown = prefs.shownRoutes.includes(id)
        ? prefs.shownRoutes.filter((r) => r !== id)
        : [...prefs.shownRoutes, id];
      updatePrefs({ shownRoutes: shown });
    },
    [prefs.shownRoutes, updatePrefs],
  );

  const setAllRoutes = useCallback((on) => updatePrefs({ shownRoutes: on ? mappableRouteIds : [] }), [mappableRouteIds, updatePrefs]);

  // Picking a stop from a route's list counts as choosing that route, so show it.
  const showRouteStop = useCallback(
    (stop, routeId) => {
      if (routeId && !prefs.shownRoutes.includes(routeId)) updatePrefs({ shownRoutes: [...prefs.shownRoutes, routeId] });
      showStop(stop);
    },
    [prefs.shownRoutes, updatePrefs, showStop],
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);
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
        shownRoutes={prefs.shownRoutes}
        onSetAll={setAllRoutes}
        onToggleRoute={toggleRoute}
        onFocusStop={showRouteStop}
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
    <div className="app-shell">
      <header className="top-bar">
        {odyssey && <StormLayer />}
        <div className="top-left">
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
            {logoOk ? (
              <img
                className="brand-logo"
                src={LOGO_SRC}
                alt="UTA MavMap"
                onError={() => setLogoOk(false)}
              />
            ) : (
              <p className="brand">MavMap</p>
            )}
            {odyssey && <p className="tagline">Begin your odyssey across campus</p>}
          </div>
        </div>
        <BuildingSearch
          query={query}
          onQueryChange={setQuery}
          results={filtered}
          onSelect={(building) => {
            showBuilding(building);
            setQuery(""); // clear the box (and close the results) once a building is picked
          }}
        />
        <PreferencesMenu
          prefs={prefs}
          onChange={updatePrefs}
          onReset={resetPrefs}
          trafficCount={traffic?.points?.length}
          onClearInterests={clearInterests}
          onClearFavorites={favorites.clear}
          routesOn={prefs.shownRoutes.length > 0}
          onToggleRoutes={setAllRoutes}
          favoriteCount={favoriteCount}
        />
      </header>

      <div className={`map-area${menuOpen ? " map-area--menu" : ""}`}>
        <SideMenu
          open={menuOpen}
          tab={menuTab}
          onTabChange={setMenuTab}
          onClose={closeMenu}
          counts={{
            directory: buildings.length,
            events: upcomingEvents.length,
            transit: transit ? transit.routes.length : undefined,
          }}
        >
          {tabContent}
        </SideMenu>

        <main className="map-stage">
          {loading && <div className="status-banner">Loading campus map…</div>}
          {error && <div className="status-banner error">{error}</div>}
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
            shownRoutes={prefs.shownRoutes}
            focusStop={focusStop}
            onFocusStop={showStop}
            navigating={navigating}
            navPath={navigation.nav?.route?.path ?? null}
            userPos={navigation.pos}
            following={following}
            onUserPan={() => navigating && setFollowing(false)}
          />
          {selected && !navigating && (
            <BuildingDetail
              building={selected}
              nearbyEvents={selectedNearby}
              onClose={() => setSelected(null)}
              isFavorite={favorites.isBuildingFav(selected.id)}
              onToggleFavorite={favorites.toggleBuilding}
              onNavigate={startNav}
            />
          )}
          {navigating && (
            <NavPanel
              nav={navigation.nav}
              following={following}
              onRecenter={() => setFollowing(true)}
              onEnd={navigation.stop}
              onRetry={navigation.retry}
              onSimulate={navigation.simulate}
            />
          )}
          {/* Hidden (not unmounted) while navigating, so the chat history survives. */}
          <FaqChat
            buildings={buildings}
            detailOpen={Boolean(selected)}
            onShowBuilding={showBuilding}
            onNavigate={startNav}
            hidden={navigating}
          />
        </main>
      </div>

      {odyssey && <SwordCursor />}

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
