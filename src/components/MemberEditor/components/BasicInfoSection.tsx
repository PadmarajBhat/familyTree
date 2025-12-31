import React from 'react';
import type { SearchResult } from '../../../services/GlobalTreeService';
import { getPhotoUrl } from '../../../services/drive';

interface BasicInfoSectionProps {
    name: string;
    setName: (val: string) => void;
    onNameBlur: () => void;
    onNameFocus: () => void;

    translations: Record<string, string | undefined>;
    setTranslations: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;

    gender: 'male' | 'female' | 'other' | null;
    setGender: (val: 'male' | 'female' | 'other') => void;

    // Duplicate Suggestions
    nameSuggestions: SearchResult[];
    showNameSuggestions: boolean;
    onDuplicateSelect: (res: SearchResult) => void;

    disabled?: boolean;
}

export const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
    name, setName, onNameBlur, onNameFocus,
    translations, setTranslations,
    gender, setGender,
    nameSuggestions, showNameSuggestions, onDuplicateSelect,
    disabled
}) => {
    return (
        <>
            {/* 1. Name */}
            <div className="form-group" style={{ position: 'relative' }}>
                <label>Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onFocus={onNameFocus}
                    onBlur={onNameBlur}
                    required
                    disabled={disabled}
                />
                {showNameSuggestions && nameSuggestions.length > 0 && (
                    <div className="suggestions-dropdown">
                        <div className="suggestions-header">Possible Duplicates (Click to Populate)</div>
                        {nameSuggestions.map(curr => (
                            <div
                                key={`${curr.treeId}-${curr.node.nodeId}`}
                                className="suggestion-item"
                                onClick={() => onDuplicateSelect(curr)}
                            >
                                <div className="suggestion-avatar member-avatar-sm" style={{ backgroundImage: curr.node.imageUrl ? `url(${getPhotoUrl(curr.node.imageUrl)})` : 'none' }}>
                                    {!curr.node.imageUrl && '?'}
                                </div>
                                <div className="suggestion-info">
                                    <div className="suggestion-name">{curr.node.name} <span className="tree-badge">({curr.treeName})</span></div>
                                    <div className="suggestion-details">
                                        {curr.parentName ? `${curr.node.gender === 'female' ? 'D/o' : 'S/o'} ${curr.parentName}` : 'No parent info'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 1.1 Name Translations */}
            {(Object.keys(translations).length > 0 || name.length > 2) && (
                <div className="form-group">
                    <label style={{ fontSize: '0.9em', color: '#666' }}>Translations (Auto-filled)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {['ta', 'ml', 'hi', 'kn'].map(lang => (
                            <div key={lang}>
                                <input
                                    type="text"
                                    value={translations[lang] || ''}
                                    onChange={e => setTranslations(prev => ({ ...prev, [lang]: e.target.value }))}
                                    placeholder={lang.toUpperCase()}
                                    style={{ fontSize: '0.9em', padding: '4px 8px' }}
                                    disabled={disabled}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. Gender */}
            <div className="form-group">
                <label>Gender</label>
                <div className="toggle-group">
                    <label>
                        <input
                            type="radio"
                            name="gender"
                            checked={gender === 'male'}
                            onChange={() => setGender('male')}
                            disabled={disabled}
                        /> Male
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="gender"
                            checked={gender === 'female'}
                            onChange={() => setGender('female')}
                            disabled={disabled}
                        /> Female
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="gender"
                            checked={gender === 'other'}
                            onChange={() => setGender('other')}
                            disabled={disabled}
                        /> Other
                    </label>
                </div>
            </div>
        </>
    );
};
