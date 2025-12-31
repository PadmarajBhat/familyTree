import React, { useState, useEffect } from 'react';
import type { PersonNode } from '../../logic/types';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import { getDisambiguationInfo } from '../../logic/relationshipUtils';

interface PersonOption {
    node: PersonNode;
    label: string;
    treeName: string;
    parentName?: string | null;
    imageUrl?: string;
    gender?: string;
    disambiguationInfo: string;
}

interface PersonSearchInputProps {
    placeholder: string;
    value: string;
    nodes: Record<string, PersonNode>;
    onSelect: (nodeId: string, label: string) => void;
    onChange: (value: string) => void;
}

export const PersonSearchInput: React.FC<PersonSearchInputProps> = ({
    placeholder,
    value,
    nodes,
    onSelect,
    onChange
}) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [options, setOptions] = useState<PersonOption[]>([]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (value && value.length > 2) {
                const results = GlobalTreeService.searchAllTrees(value);
                const searchOptions: PersonOption[] = results.map(res => ({
                    node: res.node,
                    label: res.node.name || 'Unknown',
                    treeName: res.treeName,
                    parentName: res.parentName || undefined,
                    imageUrl: res.node.imageUrl || undefined,
                    gender: res.node.gender || undefined,
                    disambiguationInfo: getDisambiguationInfo(res.node, nodes)
                })).slice(0, 10);

                setOptions(searchOptions);
            } else {
                setOptions([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [value, nodes]);

    return (
        <div className="input-group">
            <div className="autocomplete-wrapper">
                <input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    autoComplete="off"
                />
                {showSuggestions && options.length > 0 && (
                    <div className="suggestions-dropdown">
                        {options.map(option => (
                            <div
                                key={option.node.nodeId}
                                className="suggestion-item"
                                onClick={() => {
                                    onSelect(option.node.nodeId, option.label);
                                    setShowSuggestions(false);
                                }}
                            >
                                <div className="suggestion-avatar" style={{
                                    backgroundImage: option.imageUrl ? `url(${option.imageUrl})` : 'none',
                                    backgroundColor: option.imageUrl ? 'transparent' : (option.gender === 'female' ? '#fce4ec' : '#e3f2fd')
                                }}>
                                    {!option.imageUrl && (
                                        <span>{option.label.charAt(0)}</span>
                                    )}
                                </div>
                                <div className="suggestion-details">
                                    <div className="suggestion-main">{option.label}</div>
                                    <div className="suggestion-sub">
                                        {option.treeName}
                                        {option.parentName && ` • Father: ${option.parentName}`}
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
