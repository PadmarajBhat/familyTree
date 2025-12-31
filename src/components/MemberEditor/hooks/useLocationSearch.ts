import { useState, useRef, useEffect } from 'react';

interface LocationData {
    district: string | null;
    state: string | null;
    country: string | null;
}

interface UseLocationSearchProps {
    initialLocation?: {
        district: string | null;
        state: string | null;
        country: string | null;
        zipcode?: string | null;
    } | null;
    disabled?: boolean;
}

export const useLocationSearch = ({ initialLocation, disabled }: UseLocationSearchProps) => {
    const [searchText, setSearchText] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [zipcode, setZipcode] = useState(initialLocation?.zipcode || '');
    const [locationData, setLocationData] = useState<LocationData>(
        initialLocation ? { ...initialLocation } : { district: null, state: null, country: null }
    );

    const isSelectingRef = useRef(false);

    // Initialize search text
    useEffect(() => {
        if (initialLocation) {
            isSelectingRef.current = true;
            const parts = [
                initialLocation.district,
                initialLocation.state,
                initialLocation.country
            ].filter(Boolean).join(', ');

            if (parts) {
                setSearchText(parts + (initialLocation.zipcode ? ` (${initialLocation.zipcode})` : ''));
            } else if (initialLocation.zipcode) {
                setSearchText(initialLocation.zipcode);
            }
        }
    }, [initialLocation]);

    // Debounced Search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (disabled || isSelectingRef.current) {
                isSelectingRef.current = false;
                return;
            }

            if (!searchText || searchText.length < 3) {
                setSuggestions([]);
                setShowSuggestions(false);
                return;
            }

            const cleanText = searchText.trim();
            const isSixDigitPincode = /^\d{6}$/.test(cleanText);

            try {
                if (isSixDigitPincode) {
                    const response = await fetch(`https://api.postalpincode.in/pincode/${cleanText}`);
                    const data = await response.json();
                    if (data && data[0].Status === "Success") {
                        const mapped = data[0].PostOffice.map((po: any) => ({
                            display_name: `${po.Name}, ${po.District}, ${po.State}, India`,
                            address: {
                                postcode: po.Pincode,
                                city: po.District,
                                town: po.Name,
                                village: po.Block,
                                state: po.State,
                                country: 'India'
                            }
                        }));
                        setSuggestions(mapped);
                        setShowSuggestions(true);
                        return;
                    }
                }

                const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(cleanText)}&limit=5`);

                if (response.ok) {
                    const data = await response.json();
                    const mapped = data.features.map((f: any) => {
                        const p = f.properties;
                        return {
                            display_name: [p.name, p.city, p.state, p.country].filter(Boolean).join(', '),
                            address: {
                                postcode: p.postcode,
                                city: p.city,
                                town: p.town,
                                village: p.village,
                                county: p.county,
                                state_district: p.state,
                                state: p.state,
                                country: p.country
                            }
                        };
                    });
                    setSuggestions(mapped);
                    setShowSuggestions(true);
                }
            } catch (err) {
                console.error("Location search failed", err);
            }

        }, 500);

        return () => clearTimeout(timer);
    }, [searchText, disabled]);

    const handleSelect = (place: any) => {
        isSelectingRef.current = true;

        const addr = place.address;
        const newZip = addr.postcode || '';
        const district = addr.city || addr.town || addr.village || addr.county || addr.state_district || '';
        const state = addr.state || '';
        const country = addr.country || '';

        setZipcode(newZip);
        setLocationData({ district, state, country });

        const displayParts = [district, state, country].filter(Boolean).join(', ');
        setSearchText(displayParts + (newZip ? ` (${newZip})` : ''));

        setShowSuggestions(false);
    };

    return {
        searchText, setSearchText,
        suggestions,
        showSuggestions, setShowSuggestions,
        zipcode, setZipcode,
        locationData, setLocationData,
        handleSelect
    };
};
