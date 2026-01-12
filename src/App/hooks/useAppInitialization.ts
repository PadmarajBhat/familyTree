import { useState, useEffect } from 'react';
import { TreeService } from '../../services/TreeService';

import type { TreeDocument } from '../../logic/types';

export function useAppInitialization() {
    // We'll keep a simple mock state for now until Firebase Auth is integrated
    const [isSignedIn, setIsSignedIn] = useState(true);
    const [currentUser,] = useState<{ email: string; name: string } | null>({
        email: 'padmarajbhat@gmail.com',
        name: 'Padmaraj Bhat'
    });

    const [tree, setTree] = useState<TreeDocument | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("Loading...");
    const [error, setError] = useState<string | null>(null);
    const [viewState, setViewState] = useState<'home' | 'tree'>('home');
    const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
    const [currentTreeName, setCurrentTreeName] = useState<string>('Family Tree');

    const loadTree = async (specificTreeId?: string): Promise<TreeDocument | null> => {
        const idToLoad = specificTreeId || currentTreeId;
        if (!idToLoad) {
            console.log("No tree ID to load");
            return null;
        }

        setLoading(true);
        setError(null);
        try {
            console.log(`Fetching tree ${idToLoad} from Firestore via Backend...`);
            const treeDoc = await TreeService.fetchFullTree(idToLoad);

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
                setCurrentTreeId(idToLoad); // Ensure ID is synced
                if (treeDoc.treeName) setCurrentTreeName(treeDoc.treeName);
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

    // Smart Auto-load: Check for user's trees
    useEffect(() => {
        const initTree = async () => {
            if (isSignedIn && currentUser) {
                try {
                    const myTrees = await TreeService.findMyTrees(currentUser.email);
                    if (myTrees.length === 1) {
                        console.log("Found exactly one tree, auto-loading:", myTrees[0].name);
                        loadTree(myTrees[0].id);
                    } else if (myTrees.length === 0) {
                        // Fallback: Try loading 'default' if no explicit trees found
                        console.log("No trees found, attempting to load default...");
                        const defaultTree = await loadTree("default");
                        if (!defaultTree) {
                            // If default fails, we stay on Home, assuming ViewState defaults to Home
                            setViewState('home');
                        }
                    } else {
                        // Multiple trees found, stay on Home to let user pick
                        console.log("Multiple trees found, showing selection screen.");
                        setViewState('home');
                    }
                } catch (e) {
                    console.error("Error finding my trees:", e);
                }
            }
        };
        initTree();
    }, [isSignedIn, currentUser]);

    // Start listening for backend updates (e.g. from Gemini)
    useEffect(() => {
        TreeService.listenForUpdates();

        const unsubscribe = TreeService.subscribe(() => {
            console.log("♻️ Tree update signal received, reloading...", currentTreeId);
            if (currentTreeId) {
                // Determine if we need to reload the full tree or just patch. 
                // For now, full reload is safer and simplest.
                loadTree(currentTreeId);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [currentTreeId]); // Re-subscribe if treeId changes so the closure captures the new ID

    return {
        isSignedIn, setIsSignedIn, currentUser, tree, setTree, loading, setLoading,
        loadingMessage, setLoadingMessage, error, setError,
        viewState, setViewState,
        currentTreeId, setCurrentTreeId, currentTreeName, setCurrentTreeName,
        loadTree
    };
}
