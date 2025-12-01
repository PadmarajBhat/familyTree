import React, { useState, useMemo } from 'react';
import type { PersonNode } from '../logic/types';
import { searchMembers, sortMembers, type SortOption, type SortOrder } from '../logic/searchUtils';
import { getPhotoUrl } from '../services/drive';
import { CloseButton } from './CloseButton';
import './MemberSearch.css';

interface MemberSearchProps {
    nodes: Record<string, PersonNode>;
    onMemberClick: (nodeId: string) => void;
    onClose: () => void;
}

export const MemberSearch: React.FC<MemberSearchProps> = ({ nodes, onMemberClick, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    const nodeList = useMemo(() => Object.values(nodes), [nodes]);

    const filteredAndSortedMembers = useMemo(() => {
        let result = searchMembers(nodeList, searchTerm);
        result = sortMembers(result, sortBy, sortOrder);
        return result;
    }, [nodeList, searchTerm, sortBy, sortOrder]);

    const toggleSortOrder = () => {
        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    };

    return (
        <div className="member-search-container">
            <div className="search-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>Search Members ({filteredAndSortedMembers.length})</h2>
                    <CloseButton onClick={onClose} />
                </div>

                <div className="search-bar">
                    <input
                        type="text"
                        placeholder="Search by name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="sort-controls">
                    <label>Sort by:</label>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
                        <option value="name">Name</option>
                        <option value="age">Age</option>
                        <option value="dateAdded">Date Added</option>
                    </select>
                    <button onClick={toggleSortOrder}>
                        {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
                    </button>
                </div>
            </div>

            <div className="members-grid">
                {filteredAndSortedMembers.length > 0 ? (
                    filteredAndSortedMembers.map(member => (
                        <div key={member.nodeId} className="member-card" onClick={() => onMemberClick(member.nodeId)}>
                            <div
                                className="member-avatar"
                                style={{ backgroundImage: member.imageUrl ? `url(${getPhotoUrl(member.imageUrl)})` : 'none' }}
                            >
                                {!member.imageUrl && <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#aaa', fontSize: '24px' }}>?</span>}
                            </div>
                            <div className="member-info">
                                <div className="member-name">
                                    {member.name || "Unknown"}
                                    {!member.parentId && (!member.childrenIds || member.childrenIds.length === 0) && <span className="orphan-badge" title="No parent or children linked">Orphan</span>}
                                </div>
                                <div className="member-details">
                                    <span>
                                        {member.ageProvided ? `${member.ageProvided} years` :
                                            member.dob ? `Born: ${member.dob}` : 'Age unknown'}
                                    </span>
                                    {member.parentId && nodes[member.parentId] && (
                                        <span>Child of: {nodes[member.parentId].name}</span>
                                    )}
                                    {member.editedTime && (
                                        <span style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                                            Added: {new Date(member.editedTime).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="no-results">
                        No members found matching "{searchTerm}"
                    </div>
                )}
            </div>
        </div>
    );
};
