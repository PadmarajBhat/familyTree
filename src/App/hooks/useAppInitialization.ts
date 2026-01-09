import { useState, useEffect } from 'react';
import {
    initGoogleClient,
    getUserProfile,
    listTreeFiles,
    getPreferences,
    getFileContent,
    updateUserStarredTrees
} from '../../services/drive';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import { getTreeNameFromFilename } from '../../logic/fileUtils';
import type { TreeDocument } from '../../logic/types';

export function useAppInitialization() {
    const isMockAuth = import.meta.env.VITE_USE_MOCK_AUTH === 'true' || (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_AUTH !== 'false');

    const [isSignedIn, setIsSignedIn] = useState(isMockAuth);
    const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(
        isMockAuth
            ? { email: 'padmarajbhat@gmail.com', name: 'Padmaraj Bhat (Mock)' }
            : null
    );
    const [tree, setTree] = useState<TreeDocument | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("Loading...");
    const [error, setError] = useState<string | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [isGapiReady, setIsGapiReady] = useState(isMockAuth);
    const [viewState, setViewState] = useState<'home' | 'tree'>('home');
    const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
    const [currentTreeName, setCurrentTreeName] = useState<string>('family_tree');
    const [homeAutoloadEnabled, setHomeAutoloadEnabled] = useState(true);

    useEffect(() => {
        if (isMockAuth) {
            console.log("Mock Auth Enabled: Login as padmarajbhat@gmail.com");
            setIsSignedIn(true);
            setCurrentUser({ email: 'padmarajbhat@gmail.com', name: 'Padmaraj Bhat (Mock)' });
            setIsGapiReady(true);
            return;
        }

        initGoogleClient((signedIn) => {
            setIsSignedIn(signedIn);
        }).then(() => {
            setIsGapiReady(true);
        });
    }, [isMockAuth]);

    useEffect(() => {
        if (isSignedIn && isGapiReady) {
            if (import.meta.env.VITE_USE_MOCK_AUTH === 'true') return;

            getUserProfile().then(profile => {
                if (profile) {
                    setCurrentUser({ email: profile.email, name: profile.name });
                }
            });
        } else if (!isSignedIn) {
            setCurrentUser(null);
            setTree(null);
        }
    }, [isSignedIn, isGapiReady]);

    useEffect(() => {
        if (currentUser?.email && isGapiReady && isSignedIn) {
            const shortlistKey = `shortlist_${currentUser.email} `;
            const storedShortlist = localStorage.getItem(shortlistKey);
            if (storedShortlist) {
                try {
                    const shortlist = JSON.parse(storedShortlist);
                    if (Array.isArray(shortlist) && shortlist.length > 0) {
                        console.log("Pre-loading shortlisted trees for Unified Search...");
                        GlobalTreeService.loadShortlistedTrees(shortlist);
                    }
                } catch (e) {
                    console.error("Failed to parse shortlist for GlobalTreeService", e);
                }
            }
        }
    }, [currentUser, isGapiReady, isSignedIn]);

    const loadTree = async (returnOnly = false, specificFileId?: string): Promise<TreeDocument | null> => {
        if (!returnOnly) setLoading(true);
        setError(null);
        setAccessDenied(false);
        try {
            const files = await listTreeFiles();
            if (files && files.length > 0) {
                let fileToLoad = files[0];

                if (specificFileId) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const found = files.find((f: any) => f.id === specificFileId);
                    if (found) fileToLoad = found;
                } else if (currentTreeId && files.some((f: any) => f.id === currentTreeId)) {
                    if (currentTreeName) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const consistentFiles = files.filter((f: any) => getTreeNameFromFilename(f.name) === currentTreeName);
                        if (consistentFiles.length > 0) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            consistentFiles.sort((a: any, b: any) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
                            fileToLoad = consistentFiles[0];
                        }
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        fileToLoad = files.find((f: any) => f.id === currentTreeId);
                    }
                }

                console.log("Loading file:", fileToLoad.name, fileToLoad.id);
                setCurrentTreeId(fileToLoad.id);
                setCurrentTreeName(getTreeNameFromFilename(fileToLoad.name));

                const content = await getFileContent(fileToLoad.id);
                if (!content || typeof content !== 'object' || !('nodes' in content) || !('rootNodeId' in content)) {
                    throw new Error("Invalid tree structure");
                }

                const treeDoc = content as TreeDocument;

                if (!treeDoc.rootNodeId || !treeDoc.nodes[treeDoc.rootNodeId]) {
                    const nodeIds = Object.keys(treeDoc.nodes);
                    if (nodeIds.length > 0) {
                        const newRoot = Object.values(treeDoc.nodes).find(n => !n.parentId);
                        treeDoc.rootNodeId = newRoot ? newRoot.nodeId : nodeIds[0];
                    }
                }

                if (currentUser && currentUser.email) {
                    const userEmail = currentUser.email.toLowerCase();
                    const nodes = Object.values(treeDoc.nodes);
                    const isMember = nodes.some(n => n.email?.toLowerCase() === userEmail);
                    const isCreator = treeDoc.meta.createdBy?.toLowerCase() === userEmail;
                    if (!isMember && !isCreator && nodes.length > 0) {
                        setAccessDenied(true);
                        setTree(null);
                        return null;
                    }
                }

                GlobalTreeService.hydrateTree(treeDoc, files);
                GlobalTreeService.registerTree(fileToLoad.id, treeDoc);
                setTree(treeDoc);
                setHomeAutoloadEnabled(false);
                return treeDoc;
            }
            return null;
        } catch (err) {
            console.error("Failed to load tree", err);
            setError("Failed to load family tree.");
            return null;
        } finally {
            if (!returnOnly) setLoading(false);
        }
    };

    useEffect(() => {
        if (!isSignedIn || !isGapiReady || !currentUser || isMockAuth) {
            if (isMockAuth) setLoading(false);
            return;
        }

        const checkAccessAndLoad = async () => {
            setLoading(true);
            setLoadingMessage("Checking access...");
            try {
                let startingTrees: string[] = [];
                const prefs = await getPreferences();
                if (prefs && prefs[currentUser.email]?.starredTreeNames && prefs[currentUser.email].starredTreeNames!.length > 0) {
                    startingTrees = prefs[currentUser.email].starredTreeNames!;
                }

                if (startingTrees.length === 1) {
                    const files = await listTreeFiles();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const consistent = files.filter((f: any) => f.name.startsWith(`${startingTrees[0]}_family_tree`) || f.name.startsWith(`family_tree_${startingTrees[0]}`));
                    if (consistent.length > 0) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        consistent.sort((a: any, b: any) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
                        await loadTree(false, consistent[0].id);
                        setViewState('tree');
                        return;
                    }
                } else if (startingTrees.length > 1) {
                    setViewState('home');
                    setLoading(false);
                    return;
                }

                const result = await GlobalTreeService.findUserInTrees(currentUser.email);
                if (result) {
                    updateUserStarredTrees(currentUser.email, [result.treeName]).catch(console.error);
                    await loadTree(false, result.treeId);
                    setViewState('tree');
                } else {
                    setAccessDenied(true);
                    setViewState('home');
                }
            } catch (e) {
                console.error("Error in access check:", e);
            } finally {
                setLoading(false);
            }
        };
        checkAccessAndLoad();
    }, [isSignedIn, isGapiReady, currentUser]);

    return {
        isSignedIn, setIsSignedIn, currentUser, tree, setTree, loading, setLoading,
        loadingMessage, setLoadingMessage, error, setError,
        accessDenied, setAccessDenied, isGapiReady, viewState, setViewState,
        currentTreeId, setCurrentTreeId, currentTreeName, setCurrentTreeName,
        homeAutoloadEnabled, setHomeAutoloadEnabled, loadTree
    };
}
