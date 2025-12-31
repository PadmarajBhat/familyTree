import React, { useState, useMemo } from 'react';
import type { PersonNode } from '../../logic/types';
import { findPath, buildPathTree } from '../../logic/relationshipUtils';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import { TreeView } from '../TreeView';
import { CloseButton } from '../CloseButton';
import { PersonSearchInput } from './PersonSearchInput';
import './FindRelation.css';

interface FindRelationProps {
    nodes: Record<string, PersonNode>;
    onMemberClick: (nodeId: string) => void;
    onClose: () => void;
    initialPerson1Id?: string | null;
    initialPerson2Id?: string | null;
}

export const FindRelation: React.FC<FindRelationProps> = ({ nodes, onMemberClick, onClose, initialPerson1Id, initialPerson2Id }) => {
    const [person1Search, setPerson1Search] = useState(initialPerson1Id && nodes[initialPerson1Id] ? (nodes[initialPerson1Id].name || '') : '');
    const [person2Search, setPerson2Search] = useState(initialPerson2Id && nodes[initialPerson2Id] ? (nodes[initialPerson2Id].name || '') : '');
    const [selectedPerson1, setSelectedPerson1] = useState<string | null>(initialPerson1Id || null);
    const [selectedPerson2, setSelectedPerson2] = useState<string | null>(initialPerson2Id || null);

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
    };

    const handleSelectPerson2 = (nodeId: string, label: string) => {
        setSelectedPerson2(nodeId);
        setPerson2Search(label);
    };

    const handleReset = () => {
        setPerson1Search('');
        setPerson2Search('');
        setSelectedPerson1(null);
        setSelectedPerson2(null);
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
                    <PersonSearchInput
                        placeholder="Person 1..."
                        value={person1Search}
                        nodes={nodes}
                        onSelect={handleSelectPerson1}
                        onChange={(val) => {
                            setPerson1Search(val);
                            setSelectedPerson1(null);
                        }}
                    />

                    <span className="search-arrow">→</span>

                    <PersonSearchInput
                        placeholder="Person 2..."
                        value={person2Search}
                        nodes={nodes}
                        onSelect={handleSelectPerson2}
                        onChange={(val) => {
                            setPerson2Search(val);
                            setSelectedPerson2(null);
                        }}
                    />
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
