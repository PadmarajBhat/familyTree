
import { useEffect } from 'react';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import { updateUserStarredTrees } from '../../services/drive';

interface UseSyncGlobalTreeProps {
    currentUser: { email: string; name: string } | null;
    isGapiReady: boolean;
    isSignedIn: boolean;
    homeAutoloadEnabled: boolean;
    setLoading: (val: boolean) => void;
    setLoadingMessage: (val: string) => void;
    loadTree: (returnOnly: boolean, fileId?: string) => Promise<any>;
    setViewState: (val: 'home' | 'tree') => void;
}

export function useSyncGlobalTree({
    currentUser,
    isGapiReady,
    isSignedIn,
    homeAutoloadEnabled,
    setLoading,
    setLoadingMessage,
    loadTree,
    setViewState
}: UseSyncGlobalTreeProps) {
    // Sync Shortlist
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

    // Autoload
    useEffect(() => {
        if (!isSignedIn || !isGapiReady || !currentUser || !homeAutoloadEnabled) return;

        const checkAccessAndLoad = async () => {
            setLoading(true);
            setLoadingMessage("Checking access...");
            try {
                setLoadingMessage("Scanning trees for your profile...");
                const result = await GlobalTreeService.findUserInTrees(currentUser.email);

                if (result) {
                    console.log("User found in tree:", result.treeName);
                    updateUserStarredTrees(currentUser.email, [result.treeName]).catch(console.error);
                    await loadTree(false, result.treeId);
                    setViewState('tree');
                } else {
                    console.warn("User not found in any tree:", currentUser.email);
                    setLoading(false);
                    setViewState('home');
                }
            } catch (e) {
                console.error("Error in checkAccessAndLoad", e);
                setLoading(false);
            }
        };

        checkAccessAndLoad();
    }, [isSignedIn, isGapiReady, currentUser, homeAutoloadEnabled, loadTree, setLoading, setLoadingMessage, setViewState]);
}
