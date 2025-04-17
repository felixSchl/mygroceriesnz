import SuperJSON from "superjson";

export type LocationData = {
  lat: number;
  lng: number;
  source: "browser" | "geojs";
  timestamp: number;
};

// resolve user location
// TODO move all this guff into cart.ts?
export async function resolveLocationAsync(
  signal?: AbortSignal,
): Promise<LocationData | null> {
  // check local storage cache
  const cached = localStorage.getItem("mg/location");

  let hasPrompted = false;
  if (cached) {
    hasPrompted = true; // we must have!
    // TODO use a decoder here...
    const data = SuperJSON.parse(cached) as LocationData;
    // stale time
    const staleTime = 1000 * 60 * 60 * 24; // 24 hours
    if (Date.now() - data.timestamp < staleTime) {
      return data;
    }
  }

  try {
    // Try browser geolocation first
    if ("geolocation" in navigator) {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            maximumAge: 24 * 60 * 60 * 1000, // 24 hours
          });
        },
      );

      const locationData: LocationData = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: "browser",
        timestamp: Date.now(),
      };

      localStorage.setItem("mg/location", SuperJSON.stringify(locationData));

      return locationData;
    }
  } catch (e) {
    console.warn("Browser geolocation failed:", e);
  }

  if (signal?.aborted) {
    return null;
  }

  try {
    // Fall back to GeoJS IP-based location
    const res = await fetch("https://get.geojs.io/v1/ip/geo.json");
    const data = await res.json();

    const locationData: LocationData = {
      lat: parseFloat(data.latitude),
      lng: parseFloat(data.longitude),
      source: "geojs",
      timestamp: Date.now(),
    };

    localStorage.setItem("mg/location", SuperJSON.stringify(locationData));

    return locationData;
  } catch (e) {
    console.warn("GeoJS location failed:", e);
  }

  console.error("Failed to resolve location");
  return null;
}
