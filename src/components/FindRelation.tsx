import React, { useState, useMemo } from 'react';
import type { PersonNode } from '../logic/types';
import { findPath, getDisambiguationInfo, buildPathTree } from '../logic/relationshipUtils';
import { TreeView } from './TreeView';
import { CloseButton } from './CloseButton';
import './FindRelation.css';

interface FindRelationProps {
    nodes: Record<string, PersonNode>;
    onMemberClick: (nodeId: string) => void;
    onClose: () => void;
}

interface PersonOption {
    node: PersonNode;
    label: string;
    disambiguationInfo: string;
}

export const FindRelation: React.FC<FindRelationProps> = ({ nodes, onMemberClick, onClose }) => {
    const [person1Search, setPerson1Search] = useState('');
    const [person2Search, setPerson2Search] = useState('');
    const [selectedPerson1, setSelectedPerson1] = useState<string | null>(null);
    const [selectedPerson2, setSelectedPerson2] = useState<string | null>(null);
    const [showPerson1Suggestions, setShowPerson1Suggestions] = useState(false);
    const [showPerson2Suggestions, setShowPerson2Suggestions] = useState(false);

    const nodeList = useMemo(() => Object.values(nodes), [nodes]);

    // Get filtered and labeled person options
    const getPersonOptions = (searchTerm: string): PersonOption[] => {
        if (!searchTerm.trim()) return [];

        const lowerSearch = searchTerm.toLowerCase();
        return nodeList
            .filter(node => {
                const name = node.name?.toLowerCase() || '';
                return name.includes(lowerSearch);
            })
            .map(node => ({
                node,
                label: node.name || 'Unknown',
                disambiguationInfo: getDisambiguationInfo(node, nodes)
            }))
            .slice(0, 10); // Limit to 10 results
    };

    const person1Options = useMemo(() => getPersonOptions(person1Search), [person1Search, nodes]);
    const person2Options = useMemo(() => getPersonOptions(person2Search), [person2Search, nodes]);

    const selectedPerson1Node = selectedPerson1 ? nodes[selectedPerson1] : null;
    const selectedPerson2Node = selectedPerson2 ? nodes[selectedPerson2] : null;

    // Calculate path
    const path = useMemo(() => {
        if (!selectedPerson1 || !selectedPerson2) return null;
        return findPath(nodes, selectedPerson1, selectedPerson2);
    }, [selectedPerson1, selectedPerson2, nodes]);

    // Build tree structure for rendering
    const pathTreeData = useMemo(() => {
        if (!path || path.length === 0) return null;
        const { rootId, filteredNodes } = buildPathTree(nodes, path);

        return {
            schemaVersion: 1,
            treeId: 'path-tree',
            treeName: 'Relationship Path',
            versionIndex: 0,
            timestamp: new Date().toISOString(),
            rootNodeId: rootId,
            nodes: filteredNodes,
            marriages: [],
            summary: [],
            meta: {
                createdBy: '',
                createdTime: '',
                nodeCount: path.length
            }
        };
    }, [path, nodes]);

    const handleSelectPerson1 = (nodeId: string, label: string) => {
        setSelectedPerson1(nodeId);
        setPerson1Search(label);
        setShowPerson1Suggestions(false);
    };

    const handleSelectPerson2 = (nodeId: string, label: string) => {
        setSelectedPerson2(nodeId);
        setPerson2Search(label);
        setShowPerson2Suggestions(false);
    };

    const handleReset = () => {
        setPerson1Search('');
        setPerson2Search('');
        setSelectedPerson1(null);
        setSelectedPerson2(null);
        setShowPerson1Suggestions(false);
        setShowPerson2Suggestions(false);
    };

    return (
        <div className="find-relation-container">
            <div className="find-relation-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>Find Relation</h2>
                    <CloseButton onClick={onClose} />
                </div>

                <div className="search-inputs">
                    <div className="input-group">
                        <label>Person 1</label>
                        <div className="autocomplete-wrapper">
                            <input
                                type="text"
                                placeholder="Search by name..."
                                value={person1Search}
                                onChange={(e) => {
                                    setPerson1Search(e.target.value);
                                    setSelectedPerson1(null);
                                    setShowPerson1Suggestions(true);
                                }}
                                onFocus={() => setShowPerson1Suggestions(true)}
                                autoComplete="off"
                            />
                            {showPerson1Suggestions && person1Options.length > 0 && (
                                <div className="suggestions-dropdown">
                                    {person1Options.map(option => (
                                        <div
                                            key={option.node.nodeId}
                                            className="suggestion-item"
                                            onClick={() => handleSelectPerson1(option.node.nodeId, option.label)}
                                        >
                                            <div className="suggestion-name">{option.label}</div>
                                            <div className="suggestion-info">{option.disambiguationInfo}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Person 2</label>
                        <div className="autocomplete-wrapper">
                            <input
                                type="text"
                                placeholder="Search by name..."
                                value={person2Search}
                                onChange={(e) => {
                                    setPerson2Search(e.target.value);
                                    setSelectedPerson2(null);
                                    setShowPerson2Suggestions(true);
                                }}
                                onFocus={() => setShowPerson2Suggestions(true)}
                                autoComplete="off"
                            />
                            {showPerson2Suggestions && person2Options.length > 0 && (
                                <div className="suggestions-dropdown">
                                    {person2Options.map(option => (
                                        <div
                                            key={option.node.nodeId}
                                            className="suggestion-item"
                                            onClick={() => handleSelectPerson2(option.node.nodeId, option.label)}
                                        >
                                            <div className="suggestion-name">{option.label}</div>
                                            <div className="suggestion-info">{option.disambiguationInfo}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <button onClick={handleReset} className="reset-button">
                        Reset
                    </button>
                </div>

                {selectedPerson1Node && selectedPerson2Node && (
                    <div className="selected-persons">
                        <div className="selected-person">
                            <strong>{selectedPerson1Node.name}</strong>
                            <span>{getDisambiguationInfo(selectedPerson1Node, nodes)}</span>
                        </div>
                        <span className="arrow">→</span>
                        <div className="selected-person">
                            <strong>{selectedPerson2Node.name}</strong>
                            <span>{getDisambiguationInfo(selectedPerson2Node, nodes)}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="path-result">
                {selectedPerson1 && selectedPerson2 && path === null && (
                    <div className="no-path-message">
                        <p>❌ No relationship path found</p>
                        <p className="hint">These people are not connected in the family tree.</p>
                    </div>
                )}

                {path && path.length > 0 && (
                    <div className="path-found">
                        <div className="path-info">
                            ✅ Path found! Connection through {path.length} {path.length === 1 ? 'person' : 'people'}
                        </div>
                        {pathTreeData && (
                            <div className="path-tree-view">
                                <TreeView
                                    data={pathTreeData}
                                    onNodeClick={(nodeId) => {
                                        onMemberClick(nodeId);
                                        onClose();
                                    }}
                                    onNodeLongPress={() => { }}
                                    maxDepth={null}
                                />
                            </div>
                        )}
                    </div>
                )}

                {!selectedPerson1 && !selectedPerson2 && (
                    <div className="empty-state">
                        <p>👨‍👩‍👧‍👦 Select two people to find their relationship</p>
                        <p className="hint">Start typing names in the fields above</p>
                    </div>
                )}
            </div>
        </div>
    );
};
