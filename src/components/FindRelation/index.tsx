import React, { useState, useMemo, useEffect } from 'react';
import type { PersonNode } from '../../logic/types';
import { findPath, getDisambiguationInfo, buildPathTree } from '../../logic/relationshipUtils';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import { TreeView } from '../TreeView';
import { CloseButton } from '../CloseButton';
import './FindRelation.css';

interface FindRelationProps {
    nodes: Record<string, PersonNode>;
    onMemberClick: (nodeId: string) => void;
    onClose: () => void;
    initialPerson1Id?: string | null;
    initialPerson2Id?: string | null;
}

interface PersonOption {
    node: PersonNode;
    label: string;
    treeName: string;
    parentName?: string | null;
    imageUrl?: string;
    gender?: string;
    disambiguationInfo: string;
}

export const FindRelation: React.FC<FindRelationProps> = ({ nodes, onMemberClick, onClose, initialPerson1Id, initialPerson2Id }) => {
    const [person1Search, setPerson1Search] = useState(initialPerson1Id && nodes[initialPerson1Id] ? (nodes[initialPerson1Id].name || '') : '');
    const [person2Search, setPerson2Search] = useState(initialPerson2Id && nodes[initialPerson2Id] ? (nodes[initialPerson2Id].name || '') : '');
    const [selectedPerson1, setSelectedPerson1] = useState<string | null>(initialPerson1Id || null);
    const [selectedPerson2, setSelectedPerson2] = useState<string | null>(initialPerson2Id || null);
    const [showPerson1Suggestions, setShowPerson1Suggestions] = useState(false);
    const [showPerson2Suggestions, setShowPerson2Suggestions] = useState(false);

    // Use Effects for search
    const [person1Options, setPerson1Options] = useState<PersonOption[]>([]);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (person1Search && person1Search.length > 2) {
                const results = GlobalTreeService.searchAllTrees(person1Search);
                const options: PersonOption[] = results.map(res => ({
                    node: res.node,
                    label: res.node.name || 'Unknown', // Just name here, we show tree separately
                    treeName: res.treeName,
                    parentName: res.parentName || undefined,
                    imageUrl: res.node.imageUrl || undefined,
                    gender: res.node.gender || undefined,
                    disambiguationInfo: getDisambiguationInfo(res.node, nodes)
                })).slice(0, 10);

                console.log(`Search for ${person1Search} found ${results.length} results`);
                setPerson1Options(options);
            } else {
                setPerson1Options([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [person1Search, nodes]);

    const [person2Options, setPerson2Options] = useState<PersonOption[]>([]);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (person2Search && person2Search.length > 2) {
                const results = GlobalTreeService.searchAllTrees(person2Search);
                const options: PersonOption[] = results.map(res => ({
                    node: res.node,
                    label: res.node.name || 'Unknown',
                    treeName: res.treeName,
                    parentName: res.parentName || undefined,
                    imageUrl: res.node.imageUrl || undefined,
                    gender: res.node.gender || undefined,
                    disambiguationInfo: getDisambiguationInfo(res.node, nodes)
                })).slice(0, 10);

                console.log(`Search for ${person2Search} found ${results.length} results`);
                setPerson2Options(options);
            } else {
                setPerson2Options([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [person2Search, nodes]);



    // Calculate path
    const path = useMemo(() => {
        if (!selectedPerson1 || !selectedPerson2) return null;
        const allNodes = GlobalTreeService.getAllNodesFlat();
        return findPath(allNodes, selectedPerson1, selectedPerson2);
    }, [selectedPerson1, selectedPerson2, nodes]);

    // Build tree structure for rendering
    const pathTreeData = useMemo(() => {
        if (!path || path.length === 0) return null;

        const allNodes = GlobalTreeService.getAllNodesFlat();
        const { rootId, filteredNodes } = buildPathTree(allNodes, path);

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h2>Find Relation</h2>
                    <div className="button-group">
                        <button onClick={handleReset} className="reset-button-small">
                            Reset
                        </button>
                        <CloseButton onClick={onClose} />
                    </div>
                </div>

                <div className="search-inputs compact">
                    <div className="input-group">
                        <div className="autocomplete-wrapper">
                            <input
                                type="text"
                                placeholder="Person 1..."
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

                    <span className="search-arrow">→</span>

                    <div className="input-group">
                        <div className="autocomplete-wrapper">
                            <input
                                type="text"
                                placeholder="Person 2..."
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
                </div>
            </div>

            <div className="path-result">
                {selectedPerson1 && selectedPerson2 && path === null && (
                    <div className="no-path-message">
                        <p>❌ No relationship found</p>
                    </div>
                )}

                {path && path.length > 0 && (
                    <div className="path-found" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="path-info-compact">
                            <span>Connection through {path.length} people</span>
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
                                    compact={true}
                                    path={path}
                                />
                            </div>
                        )}
                    </div>
                )}

                {!selectedPerson1 && !selectedPerson2 && (
                    <div className="empty-state">
                        <p>Select two people to see how they are related</p>
                    </div>
                )}
            </div>
        </div>
    );
};
