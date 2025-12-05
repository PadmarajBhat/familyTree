import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PersonNode } from '../logic/types';
import { getCoordinates } from '../logic/geocoding';

interface MapChartProps {
    nodes: PersonNode[];
}

interface LocationData {
    name: string;
    lat: number;
    lon: number;
    members: PersonNode[];
}

// Component to update map view bounds
const ChangeView = ({ bounds }: { bounds: L.LatLngBoundsExpression | null }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [bounds, map]);
    return null;
};

export const MapChart: React.FC<MapChartProps> = ({ nodes }) => {
    const [locations, setLocations] = useState<LocationData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLocations = async () => {
            setLoading(true);
            const locMap: Record<string, PersonNode[]> = {};

            // Group members by location key
            nodes.forEach(node => {
                const loc = node.location;
                if (loc) {
                    // Construct a more specific query
                    // Try to include as much context as possible: Zipcode, City, State, Country
                    const parts = [];
                    if (loc.zipcode) parts.push(loc.zipcode);
                    if (loc.district) parts.push(loc.district);
                    if (loc.state) parts.push(loc.state);
                    if (loc.country) parts.push(loc.country);

                    // If we have a zipcode but no country, and it looks like an Indian PIN code (6 digits), append India
                    // This is a heuristic to help with the user's specific issue
                    if (loc.zipcode && /^\d{6}$/.test(loc.zipcode) && !loc.country) {
                        parts.push("India");
                    }

                    const key = parts.join(', ');
                    if (key) {
                        if (!locMap[key]) locMap[key] = [];
                        locMap[key].push(node);
                    }
                } else if (node.address?.freeform) {
                    // Fallback to freeform address if structured location is missing
                    // This might be less accurate but worth trying
                    const key = node.address.freeform;
                    if (!locMap[key]) locMap[key] = [];
                    locMap[key].push(node);
                }
            });

            const processedLocations: LocationData[] = [];
            const keys = Object.keys(locMap);

            // Process sequentially to respect rate limiting in getCoordinates
            for (const key of keys) {
                const coords = await getCoordinates(key);
                if (coords) {
                    processedLocations.push({
                        name: coords.displayName.split(',')[0], // Shorten name
                        lat: coords.lat,
                        lon: coords.lon,
                        members: locMap[key]
                    });
                }
            }

            setLocations(processedLocations);
            setLoading(false);
        };

        fetchLocations();
    }, [nodes]);

    const bounds = useMemo(() => {
        if (locations.length === 0) return null;
        return L.latLngBounds(locations.map(l => [l.lat, l.lon]));
    }, [locations]);

    const center: [number, number] = [20.5937, 78.9629]; // Default to India if no data

    if (loading) {
        return <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Map Data...</div>;
    }

    if (locations.length === 0) {
        return <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No location data found.</div>;
    }

    return (
        <div style={{ height: '400px', width: '100%', borderRadius: '8px', overflow: 'hidden' }}>
            <MapContainer center={center} zoom={4} style={{ height: '100%', width: '100%' }}>
                <ChangeView bounds={bounds} />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {locations.map((loc, idx) => (
                    <Marker
                        key={idx}
                        position={[loc.lat, loc.lon]}
                        icon={createCustomIcon(loc.members)}
                    >
                        <Popup>
                            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                <strong>{loc.name}</strong>
                                <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                    {loc.members.map(m => (
                                        <div key={m.nodeId} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                                            {m.imageUrl ? (
                                                <img src={m.imageUrl} alt={m.name || '?'} style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                                                    {m.name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                            <span>{m.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
};

const createCustomIcon = (members: PersonNode[]) => {
    // Show the first person's image or initials, with a badge if multiple
    const firstMember = members[0];
    const count = members.length;

    const html = `
        <div style="position: relative; width: 40px; height: 40px;">
            ${firstMember.imageUrl
            ? `<div style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); background-image: url('${firstMember.imageUrl}'); background-size: cover; background-position: center;"></div>`
            : `<div style="width: 40px; height: 40px; border-radius: 50%; background: #2196f3; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${firstMember.name?.charAt(0) || '?'}</div>`
        }
            ${count > 1
            ? `<div style="position: absolute; top: -5px; right: -5px; background: red; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 1px solid white;">${count}</div>`
            : ''
        }
        </div>
    `;

    return L.divIcon({
        html: html,
        className: 'custom-map-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40], // Bottom centerish? No, center center is [20, 20], bottom center is [20, 40]
        popupAnchor: [0, -40]
    });
};
