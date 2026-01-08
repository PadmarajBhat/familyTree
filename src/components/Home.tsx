import React, { useEffect, useState, useRef } from 'react';
import { listTreeFiles, saveTreeFile, renameFile, getPreferences, updateUserStarredTrees } from '../services/drive';
import { getISTTimestamp } from '../logic/dateUtils';
import type { TreeDocument } from '../logic/types';
import { getTreeNameFromFilename, generateFilename } from '../logic/fileUtils';
import { GlobalTreeService } from '../services/GlobalTreeService';

interface HomeProps {
    userEmail: string;
    onSelectTree: (treeId: string) => void;
    currentTreeId: string | null;
    isEditor: boolean;
    enableAutoload?: boolean;
}

interface TreeFile {
    id: string;
    name: string;
    originalFilename: string;
    modifiedTime: string;
    description?: string;
}

import { GeminiLiveButton } from './GeminiLiveButton';

export const Home: React.FC<HomeProps> = ({ userEmail, onSelectTree, currentTreeId, isEditor, enableAutoload = true }) => {
    const [trees, setTrees] = useState<TreeFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string>("Loading...");
    const [shortlistedIds, setShortlistedIds] = useState<string[]>([]);
    const [starredTreeNames, setStarredTreeNames] = useState<Set<string>>(new Set());
    const [treeIdMap, setTreeIdMap] = useState<Record<string, string[]>>({});
    const [showAll, setShowAll] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newTreeName, setNewTreeName] = useState('');
    const autoloadAttempted = useRef(false);

    useEffect(() => {
        loadTrees();

        const loadPrefs = async () => {
            try {
                const prefs = await getPreferences();
                if (prefs && prefs[userEmail]?.starredTreeNames) {
                    const stars = new Set(prefs[userEmail].starredTreeNames);
                    setStarredTreeNames(stars);
                } else if (prefs && prefs[userEmail]?.defaultTreeName) {
                    setStarredTreeNames(new Set([prefs[userEmail].defaultTreeName!]));
                }
            } catch (e) {
                console.warn("Failed to load preferences", e);
                const storedShortlist = localStorage.getItem(`shortlist_${userEmail}`);
                if (storedShortlist) {
                    setShortlistedIds(JSON.parse(storedShortlist));
                }
            }
        };
        loadPrefs();

    }, [userEmail]);

    useEffect(() => {
        if (enableAutoload && !loading && trees.length > 0 && starredTreeNames.size === 1) {
            if (autoloadAttempted.current) return;

            const targetName = Array.from(starredTreeNames)[0];
            const targetTree = trees.find(t => t.name === targetName);

            if (targetTree) {
                console.log("Autoloading single shortlisted tree:", targetTree.name);
                autoloadAttempted.current = true;
                onSelectTree(targetTree.id);
            }
        }
    }, [trees, starredTreeNames, loading, enableAutoload, onSelectTree]);

    const loadTrees = async () => {
        setLoading(true);
        try {
            const files = await listTreeFiles();

            // Check if mock auth returned empty array
            if (files.length === 0 && import.meta.env.VITE_USE_MOCK_AUTH === 'true') {
                setTrees([]);
                setLoading(false);
                return;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const groupedFiles: Record<string, TreeFile[]> = {};
            const idMap: Record<string, string[]> = {};

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            files.forEach((f: any) => {
                const treeName = getTreeNameFromFilename(f.name);
                if (!groupedFiles[treeName]) {
                    groupedFiles[treeName] = [];
                    idMap[treeName] = [];
                }
                groupedFiles[treeName].push({
                    id: f.id,
                    name: treeName,
                    originalFilename: f.name,
                    modifiedTime: f.modifiedTime,
                    description: f.description
                });
                idMap[treeName].push(f.id);
            });

            setTreeIdMap(idMap);

            const latestTrees: TreeFile[] = [];
            Object.values(groupedFiles).forEach(group => {
                group.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
                latestTrees.push(group[0]);
            });

            setTrees(latestTrees);
        } catch (error) {
            console.error("Failed to list trees", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const newIds: string[] = [];
        starredTreeNames.forEach(name => {
            const ids = treeIdMap[name];
            if (ids) {
                newIds.push(...ids);
            }
        });
        setShortlistedIds(newIds);
        localStorage.setItem(`shortlist_${userEmail}`, JSON.stringify(newIds));
    }, [starredTreeNames, treeIdMap, userEmail]);

    useEffect(() => {
        if (trees.length > 0) {
            const allIds = trees.map(t => t.id);
            GlobalTreeService.loadShortlistedTrees(allIds);
        }
    }, [trees]);

    const toggleShortlist = (tree: TreeFile, e: React.MouseEvent) => {
        e.stopPropagation();

        const newStarred = new Set(starredTreeNames);
        if (newStarred.has(tree.name)) {
            newStarred.delete(tree.name);
        } else {
            newStarred.add(tree.name);
        }

        setStarredTreeNames(newStarred);
        updateUserStarredTrees(userEmail, Array.from(newStarred)).catch(console.error);
    };

    const handleCreateTree = async () => {
        if (!newTreeName.trim()) return;
        setCreating(true);
        try {
            const name = generateFilename(newTreeName);
            const newTree: TreeDocument = {
                schemaVersion: 1,
                treeId: crypto.randomUUID(),
                treeName: newTreeName.trim(),
                versionIndex: 0,
                timestamp: getISTTimestamp(),
                rootNodeId: "",
                nodes: {},
                marriages: [],
                summary: [],
                meta: {
                    createdBy: userEmail,
                    createdTime: getISTTimestamp(),
                    nodeCount: 0
                }
            };

            await saveTreeFile(name, newTree, "New Family Tree");
            await loadTrees();
            setNewTreeName('');
        } catch (e) {
            console.error("Error creating tree", e);
            alert("Failed to create tree");
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteTree = async (id: string, originalFilename: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to delete tree "${originalFilename}"? This cannot be undone.`)) return;

        try {
            setLoading(true);
            setLoadingMessage("Scanning references in other trees...");

            await GlobalTreeService.removeLinksToTree(id, userEmail, (msg) => {
                setLoadingMessage(msg);
            });

            setLoadingMessage("Deleting tree...");

            await renameFile(id, `delete_${originalFilename}`);

            const treeName = getTreeNameFromFilename(originalFilename);
            if (starredTreeNames.has(treeName)) {
                const newStarred = new Set(starredTreeNames);
                newStarred.delete(treeName);
                setStarredTreeNames(newStarred);
                await updateUserStarredTrees(userEmail, Array.from(newStarred));
            }

            if (shortlistedIds.includes(id)) {
                const newIds = shortlistedIds.filter(sid => sid !== id);
                setShortlistedIds(newIds);
                localStorage.setItem(`shortlist_${userEmail}`, JSON.stringify(newIds));
            }
            await loadTrees();
        } catch (e) {
            console.error("Error deleting tree", e);
            alert("Failed to delete tree");
        } finally {
            setLoading(false);
            setLoadingMessage("Loading...");
        }
    };

    const displayedTrees = (starredTreeNames.size > 0 && !showAll)
        ? trees.filter(t => starredTreeNames.has(t.name))
        : trees;

    return (
        <div className="home-screen">
            <header className="home-header">
                <h1>Family Trees</h1>
                <div className="home-actions">
                    <GeminiLiveButton />
                    {isEditor && (
                        <>
                            <input
                                type="text"
                                placeholder="New Tree Name"
                                value={newTreeName}
                                onChange={e => setNewTreeName(e.target.value)}
                            />
                            <button onClick={handleCreateTree} disabled={creating || !newTreeName}>
                                {creating ? "Creating..." : "Create New"}
                            </button>
                        </>
                    )}
                </div>
            </header>

            {loading ? (
                <div className="loading">{loadingMessage}</div>
            ) : (
                <div className="tree-list">
                    {starredTreeNames.size > 0 && (
                        <div className="filter-toggle">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={!showAll}
                                    onChange={() => setShowAll(!showAll)}
                                />
                                Show only my shortlisted trees
                            </label>
                        </div>
                    )}

                    {displayedTrees.length === 0 && (
                        <div className="empty-state">
                            {trees.length === 0 ? "No family trees found. Create one to get started!" : "No shortlisted trees found."}
                        </div>
                    )}

                    <div className="cards-grid">
                        {displayedTrees.map(tree => (
                            <div
                                key={tree.id}
                                className={`tree-card ${currentTreeId === tree.id ? 'active' : ''}`}
                                onClick={() => onSelectTree(tree.id)}
                            >
                                <div className="card-header">
                                    <h3>{tree.name}</h3>
                                    <button
                                        className={`star-btn ${starredTreeNames.has(tree.name) ? 'starred' : ''}`}
                                        onClick={(e) => toggleShortlist(tree, e)}
                                        title={starredTreeNames.has(tree.name) ? "Remove from shortlist" : "Add to shortlist"}
                                    >
                                        ★
                                    </button>
                                </div>
                                <div className="card-meta">
                                    <span>Last modified: {new Date(tree.modifiedTime).toLocaleDateString()}</span>
                                </div>
                                <div className="card-actions">
                                    {isEditor && (
                                        <button
                                            className="delete-btn"
                                            onClick={(e) => handleDeleteTree(tree.id, tree.originalFilename, e)}
                                            title="Delete Today's Version"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                .home-screen {
                    padding: 2rem;
                    max-width: 100%;
                    width: 1200px;
                    margin: 0 auto;
                    box-sizing: border-box; 
                }
                .empty-state {
                    text-align: center;
                    padding: 3rem;
                    color: #555;
                    font-size: 1.2rem;
                    background: #f9f9f9;
                    border-radius: 8px;
                    margin-top: 2rem;
                    border: 1px dashed #ccc;
                }
                .home-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 1rem;
                    margin-bottom: 2rem;
                    border-bottom: 2px solid #eee;
                    padding-bottom: 1rem;
                }
                .home-actions {
                    display: flex;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .home-actions input {
                    padding: 0.5rem;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                @media (max-width: 768px) {
                    .home-header {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    .home-actions {
                        width: 100%;
                        justify-content: space-between;
                    }
                    .home-actions input {
                        flex: 1;
                    }
                }
                .tree-list {
                    margin-top: 1rem;
                }
                .cards-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                    gap: 1.5rem;
                    margin-top: 1.5rem;
                }
                .tree-card {
                    background: white;
                    border: 1px solid #eee;
                    border-radius: 8px;
                    padding: 1.5rem;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                    position: relative;
                }
                .tree-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .tree-card.active {
                    border-color: #2196f3;
                    background: #f8fbff;
                }
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1rem;
                }
                .card-header h3 {
                    margin: 0;
                    font-size: 1.2rem;
                    color: #333;
                }
                .star-btn {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    color: #ccc;
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                }
                .star-btn.starred {
                    color: #ffd700;
                }
                .star-btn:hover {
                    transform: scale(1.2);
                }
                .card-meta {
                    font-size: 0.9rem;
                    color: #666;
                }
                .card-actions {
                    margin-top: 1rem;
                    display: flex;
                    justify-content: flex-end;
                }
                .delete-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 1.2rem;
                    opacity: 0.5;
                    transition: opacity 0.2s;
                }
                .delete-btn:hover {
                    opacity: 1;
                    color: #f44336;
                }
                .filter-toggle {
                    margin-bottom: 1rem;
                }
                .loading {
                    text-align: center;
                    padding: 2rem;
                    color: #666;
                }
            `}</style>
        </div>
    );
};
