import { useState, useEffect } from 'react';
import { TreeService } from '../../services/TreeService';

import type { TreeDocument } from '../../logic/types';

export function useAppInitialization() {
    // We'll keep a simple mock state for now until Firebase Auth is integrated
    const [isSignedIn, setIsSignedIn] = useState(true);
    const [currentUser,] = useState<{ email: string; name: string } | null>({
        email: 'user@example.com',
        name: 'Family Member'
    });

    const [tree, setTree] = useState<TreeDocument | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("Loading...");
    const [error, setError] = useState<string | null>(null);
    const [viewState, setViewState] = useState<'home' | 'tree'>('home');
    const [currentTreeId, setCurrentTreeId] = useState<string | null>("default");
    const [currentTreeName, setCurrentTreeName] = useState<string>('Family Tree');

    const loadTree = async (): Promise<TreeDocument | null> => {
        setLoading(true);
        setError(null);
        try {
            console.log("Fetching tree from Firestore via Backend...");
            const treeDoc = await TreeService.fetchFullTree();

            if (treeDoc) {
                // Basic validation/repair logic
                if (!treeDoc.rootNodeId || !treeDoc.nodes[treeDoc.rootNodeId]) {
                    const nodeIds = Object.keys(treeDoc.nodes);
                    if (nodeIds.length > 0) {
                        const newRoot = Object.values(treeDoc.nodes).find(n => !n.parentId);
                        treeDoc.rootNodeId = newRoot ? newRoot.nodeId : nodeIds[0];
                    }
                }

                setTree(treeDoc);
                setViewState('tree');
                return treeDoc;
            }
            return null;
        } catch (err) {
            console.error("Failed to load tree", err);
            setError("Failed to connect to backend.");
            return null;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isSignedIn && currentUser) {
            loadTree();
        }
    }, [isSignedIn, currentUser]);

    return {
        isSignedIn, setIsSignedIn, currentUser, tree, setTree, loading, setLoading,
        loadingMessage, setLoadingMessage, error, setError,
        viewState, setViewState,
        currentTreeId, setCurrentTreeId, currentTreeName, setCurrentTreeName,
        loadTree
    };
}
