import { useCallback, useEffect, useState } from "react";

let sessionLocation = null;
const listeners = new Set();

function publish(location) {
  sessionLocation = location;
  listeners.forEach((listener) => listener(location));
}

export default function useCurrentLocation() {
  const [location, setLocation] = useState(sessionLocation);
  const [status, setStatus] = useState(sessionLocation ? "granted" : "idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    listeners.add(setLocation);
    return () => listeners.delete(setLocation);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      setMessage("Current location unavailable.");
      return;
    }

    setStatus("loading");
    setMessage("Getting your location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        publish(next);
        setStatus("granted");
        setMessage("");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus("denied");
          setMessage("Location permission denied.");
        } else if (error.code === error.TIMEOUT) {
          setStatus("timeout");
          setMessage("Unable to determine location. Try again.");
        } else {
          setStatus("unavailable");
          setMessage("Current location unavailable.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  return { location, status, message, requestLocation };
}
