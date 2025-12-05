
interface Coordinates {
    lat: number;
    lon: number;
    displayName: string;
}

const CACHE_KEY = 'geocoding_cache';
const RATE_LIMIT_DELAY = 1200; // 1.2 seconds to be safe (Nominatim limit is 1s)

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

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
    }

    try {
        lastRequestTime = Date.now();
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=1`);
        if (!response.ok) {
            throw new Error(`Geocoding failed: ${response.statusText}`);
        }

        const data = await response.json();
        if (data && data.length > 0) {
            const item = data[0];
            const address = item.address || {};

            // Prefer City > Town > Village > County > State > Country
            const name = address.city || address.town || address.village || address.county || address.state || address.country || item.display_name.split(',')[0];

            const result = {
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                displayName: name
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
