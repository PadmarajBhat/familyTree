import React from 'react';
import { getPhotoUrl } from '../../../services/drive';
import type { SearchResult } from '../../../services/GlobalTreeService';

interface RelationSelectProps {
    label: string;
    // Current selections (for list display)
    items?: { id: string; name: string }[];

    // Search & Autocomplete
    searchText: string;
    onSearchChange: (val: string) => void;
    onSearchFocus?: () => void;
    searchPlaceholder?: string;

    // Suggestions
    suggestions: SearchResult[];
    showSuggestions: boolean;
    onSelect: (result: SearchResult) => void;

    // Removal
    onRemove?: (id: string) => void;
    disabled?: boolean;

    // Additional UI
    emptyMessage?: string;
}

export const RelationSelect: React.FC<RelationSelectProps> = ({
    label,
    items = [],
    searchText,
    onSearchChange,
    onSearchFocus,
    searchPlaceholder = "Search...",
    suggestions,
    showSuggestions,
    onSelect,
    onRemove,
    disabled,
    emptyMessage
}) => {
    return (
        <div className="form-group">
            <label>{label}</label>

            {/* List of selected items (chips) */}
            {items.length > 0 && (
                <div className="children-list">
                    {items.map(item => (
                        <div key={item.id} className="child-tag">
                            <span>{item.name}</span>
                            {onRemove && <button type="button" onClick={() => onRemove(item.id)} disabled={disabled}>×</button>}
                        </div>
                    ))}
                </div>
            )}

            {/* Empty message if no items and message provided */}
            {items.length === 0 && emptyMessage && (
                <div className="info-text" style={{ color: '#666', fontStyle: 'italic', marginBottom: '5px' }}>
                    {emptyMessage}
                </div>
            )}

            {/* Search Input */}
            <div className="autocomplete">
                <input
                    type="text"
                    value={searchText}
                    onChange={e => onSearchChange(e.target.value)}
                    onFocus={onSearchFocus}
                    placeholder={searchPlaceholder}
                    disabled={disabled}
                />

                {showSuggestions && suggestions.length > 0 && (
                    <div className="suggestions-dropdown">
                        <div className="suggestions-header">Search Results</div>
                        {suggestions.map((res, idx) => (
                            <div
                                key={`${res.node.nodeId}-${idx}`}
                                className="suggestion-item"
                                onClick={() => onSelect(res)}
                            >
                                <div className="suggestion-avatar member-avatar-sm" style={{ backgroundImage: res.node.imageUrl ? `url(${getPhotoUrl(res.node.imageUrl)})` : 'none' }}>
                                    {!res.node.imageUrl && '?'}
                                </div>
                                <div className="suggestion-info">
                                    <div className="suggestion-name">{res.node.name} <span className="tree-badge">({res.treeName})</span></div>
                                    <div className="suggestion-details">
                                        {res.parentName ? `${res.node.gender === 'female' ? 'D/o' : 'S/o'} ${res.parentName}` : 'No parent info'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
