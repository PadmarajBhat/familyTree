
import React, { useEffect, useState, useRef } from 'react';
import { useHomeTrees } from './hooks/useHomeTrees';
import { useHomePreferences } from './hooks/useHomePreferences';
import { HomeHeader } from './components/HomeHeader';
import { TreeCard } from './components/TreeCard';
import './Home.css';

interface HomeProps {
    userEmail: string;
    onSelectTree: (treeId: string) => void;
    currentTreeId: string | null;
    isEditor: boolean;
    enableAutoload?: boolean;
}

export const Home: React.FC<HomeProps> = ({ userEmail, onSelectTree, currentTreeId, isEditor, enableAutoload = true }) => {
    const { trees, treeIdMap, loading, loadingMessage, creating, loadTrees, handleCreateTree, handleDeleteTree } = useHomeTrees(userEmail);
    const { starredTreeNames, toggleShortlist } = useHomePreferences(userEmail, treeIdMap);
    const [showAll, setShowAll] = useState(false);
    const [newTreeName, setNewTreeName] = useState('');
    const autoloadAttempted = useRef(false);

    useEffect(() => { loadTrees(); }, [userEmail]);

    useEffect(() => {
        if (enableAutoload && !loading && trees.length > 0 && starredTreeNames.size === 1 && !autoloadAttempted.current) {
            const target = trees.find(t => t.name === Array.from(starredTreeNames)[0]);
            if (target) {
                autoloadAttempted.current = true;
                onSelectTree(target.id);
            }
        }
    }, [trees, starredTreeNames, loading, enableAutoload, onSelectTree]);

    const displayedTrees = (starredTreeNames.size > 0 && !showAll) ? trees.filter(t => starredTreeNames.has(t.name)) : trees;

    return (
        <div className="home-screen">
            <HomeHeader isEditor={isEditor} creating={creating} newTreeName={newTreeName} setNewTreeName={setNewTreeName} onCreateTree={() => handleCreateTree(newTreeName).then(ok => ok && setNewTreeName(''))} />
            {loading ? (
                <div className="loading">{loadingMessage}</div>
            ) : (
                <div className="tree-list">
                    {starredTreeNames.size > 0 && (
                        <div className="filter-toggle">
                            <label><input type="checkbox" checked={!showAll} onChange={() => setShowAll(!showAll)} /> Show only my shortlisted trees</label>
                        </div>
                    )}
                    {displayedTrees.length === 0 && <div className="empty-state">{trees.length === 0 ? "No family trees found." : "No shortlisted trees found."}</div>}
                    <div className="cards-grid">
                        {displayedTrees.map(tree => (
                            <TreeCard key={tree.id} tree={tree} isActive={currentTreeId === tree.id} isStarred={starredTreeNames.has(tree.name)} isEditor={isEditor} onSelect={() => onSelectTree(tree.id)} onToggleStar={() => toggleShortlist(tree.name)} onDelete={() => handleDeleteTree(tree.id, tree.originalFilename)} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
