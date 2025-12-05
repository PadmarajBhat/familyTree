
interface Coordinates {
    lat: number;
    lon: number;
    displayName: string;
}

const CACHE_KEY = 'geocoding_cache';
const RATE_LIMIT_DELAY = 1200; // 1.2 seconds to be safe

// Load cache from localStorage
const loadCache = (): Record<string, Coordinates> => {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error("Failed to load geocoding cache", e);
        return {};
    }
};

// Save cache to localStorage
const saveCache = (cache: Record<string, Coordinates>) => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error("Failed to save geocoding cache", e);
    }
};

const cache = loadCache();
let lastRequestTime = 0;

export const getCoordinates = async (query: string): Promise<Coordinates | null> => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return null;

    // Check cache
    if (cache[normalizedQuery]) {
        return cache[normalizedQuery];
    }

    // Rate limiting (still good to have even for Photon)
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
    }

    try {
        lastRequestTime = Date.now();
        // Use Photon API (Komoot) which is more lenient with CORS and usage
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`);
        if (!response.ok) {
            throw new Error(`Geocoding failed: ${response.statusText}`);
        }

        const data = await response.json();
        // Photon returns GeoJSON
        if (data && data.features && data.features.length > 0) {
            const feature = data.features[0];
            const props = feature.properties;
            const coords = feature.geometry.coordinates; // [lon, lat]

            // Construct display name from available properties
            const parts = [];
            if (props.name) parts.push(props.name);
            if (props.city && props.city !== props.name) parts.push(props.city);
            if (props.state) parts.push(props.state);
            if (props.country) parts.push(props.country);

            const displayName = parts.join(', ') || props.name || query;

            const result: Coordinates = {
                lat: coords[1], // Latitude is the second element
                lon: coords[0], // Longitude is the first element
                displayName: displayName
            };

            // Update cache
            cache[normalizedQuery] = result;
            saveCache(cache);

            return result;
        }
    } catch (error) {
        console.error("Error fetching coordinates for", query, error);
    }

    return null;
};
