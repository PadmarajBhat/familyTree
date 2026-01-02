
import { useEffect } from 'react';
import { initGoogleClient, getUserProfile, setAuthErrorCallback } from '../../services/drive';

interface UseAppInitializationProps {
    setIsSignedIn: (val: boolean) => void;
    setCurrentUser: (val: { email: string; name: string } | null) => void;
    setIsGapiReady: (val: boolean) => void;
    setStaticPage: (val: 'privacy' | 'terms' | null) => void;
    isSignedIn: boolean;
    isGapiReady: boolean;
    setTree: (tree: any) => void;
}

export function useAppInitialization({
    setIsSignedIn,
    setCurrentUser,
    setIsGapiReady,
    setStaticPage,
    isSignedIn,
    isGapiReady,
    setTree
}: UseAppInitializationProps) {
    useEffect(() => {
        const hash = window.location.hash;
        if (hash === '#privacy-policy') {
            setStaticPage('privacy');
        } else if (hash === '#terms-of-service') {
            setStaticPage('terms');
        }

        setAuthErrorCallback((err) => {
            console.warn("Auth Error caught in App:", err);
            if (err === 'interaction_required' || err === 'access_denied') {
                window.location.href = window.location.origin + import.meta.env.BASE_URL;
            }
        });

        initGoogleClient((signedIn) => {
            setIsSignedIn(signedIn);
        }).then(() => {
            setIsGapiReady(true);
        });
    }, [setIsSignedIn, setIsGapiReady, setStaticPage]);

    useEffect(() => {
        if (isSignedIn && isGapiReady) {
            getUserProfile().then(profile => {
                if (profile) {
                    setCurrentUser({ email: profile.email, name: profile.name });
                }
            });
        } else if (!isSignedIn) {
            setCurrentUser(null);
            setTree(null);
        }
    }, [isSignedIn, isGapiReady, setCurrentUser, setTree]);
}
