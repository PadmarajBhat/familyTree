import React from 'react';

interface LocationSectionProps {
    searchText: string;
    setSearchText: (val: string) => void;
    onFocus: () => void;
    onBlur: () => void;

    suggestions: any[];
    showSuggestions: boolean;
    onSelect: (place: any) => void;

    locationData: {
        district: string | null;
        state: string | null;
        country: string | null;
    };
    zipcode: string;
    disabled?: boolean;
}

export const LocationSection: React.FC<LocationSectionProps> = ({
    searchText, setSearchText, onFocus, onBlur,
    suggestions, showSuggestions, onSelect,
    locationData, zipcode, disabled
}) => {
    return (
        <div className="form-group" style={{ position: 'relative' }}>
            <label>Location (City/Village or Zipcode)</label>
            <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
                placeholder="e.g. Mulgund or 582117"
                disabled={disabled}
            />
            {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions-dropdown">
                    <div className="suggestions-header">Locations (OpenStreetMap)</div>
                    {suggestions.map((place, idx) => (
                        <div
                            key={idx}
                            className="suggestion-item"
                            onClick={() => onSelect(place)}
                        >
                            <div className="suggestion-info">
                                <div className="suggestion-name">{place.display_name}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {(locationData.district || zipcode) && (
                <div style={{ marginTop: '5px', fontSize: '0.85em', color: '#666' }}>
                    <strong>Stored:</strong> {locationData.district}{locationData.state ? `, ${locationData.state}` : ''}{locationData.country ? `, ${locationData.country}` : ''}
                    {zipcode ? ` (${zipcode})` : ''}
                </div>
            )}
        </div>
    );
};
