
import React from 'react';

interface HomeHeaderProps {
    isEditor: boolean;
    creating: boolean;
    newTreeName: string;
    setNewTreeName: (val: string) => void;
    onCreateTree: () => void;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({ isEditor, creating, newTreeName, setNewTreeName, onCreateTree }) => {
    return (
        <header className="home-header">
            <h1>Family Trees</h1>
            <div className="home-actions">
                {isEditor && (
                    <>
                        <input type="text" placeholder="New Tree Name" value={newTreeName} onChange={e => setNewTreeName(e.target.value)} />
                        <button onClick={onCreateTree} disabled={creating || !newTreeName}>
                            {creating ? "Creating..." : "Create New"}
                        </button>
                    </>
                )}
            </div>
        </header>
    );
};
