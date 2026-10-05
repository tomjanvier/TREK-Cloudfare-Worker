import { useCallback, useEffect, useState } from "react";
import { auth, getToken, type User } from "./api";
import { Login } from "./pages/Login";
import { Trips } from "./pages/Trips";
import { TripDetail } from "./pages/TripDetail";
import { SharedTrip } from "./pages/SharedTrip";

type Route =
  | { name: "trips" }
  | { name: "trip"; id: number }
  | { name: "shared"; token: string };

function parse(): Route {
  const path = window.location.pathname;
  const shared = path.match(/^\/shared\/([A-Za-z0-9_-]+)$/);
  if (shared?.[1]) return { name: "shared", token: shared[1] };
  const trip = path.match(/^\/trips\/(\d+)$/);
  if (trip?.[1]) return { name: "trip", id: Number(trip[1]) };
  return { name: "trips" };
}

export function navigate(to: string): void {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [route, setRoute] = useState<Route>(parse);
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const onPop = () => setRoute(parse());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setChecked(true);
      return;
    }
    try {
      setUser(await auth.me());
    } catch {
      setUser(null);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!checked) {
    return <main style={{ padding: 40, color: "#94a3c4" }}>Chargement…</main>;
  }

  // Page publique : aucun compte requis.
  if (route.name === "shared") {
    return <SharedTrip token={route.token} />;
  }

  if (!user) {
    return <Login onDone={() => void refresh()} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>TREK</h1>
        <span className="spacer" />
        <span className="muted">{user.username}</span>
        <button
          className="ghost"
          onClick={() => {
            void auth.logout().then(() => {
              setUser(null);
              navigate("/");
            });
          }}
        >
          Déconnexion
        </button>
      </header>
      <main>
        {route.name === "trips" ? <Trips user={user} /> : <TripDetail id={route.id} />}
      </main>
    </div>
  );
}