
import { useState, useEffect } from 'react';
import { getPreferences, updateUserStarredTrees } from '../../../services/drive';

export function useHomePreferences(userEmail: string, treeIdMap: Record<string, string[]>) {
    const [starredTreeNames, setStarredTreeNames] = useState<Set<string>>(new Set());
    const [shortlistedIds, setShortlistedIds] = useState<string[]>([]);

    useEffect(() => {
        const loadPrefs = async () => {
            try {
                const prefs = await getPreferences();
                if (prefs?.[userEmail]?.starredTreeNames) {
                    setStarredTreeNames(new Set<string>(prefs[userEmail].starredTreeNames));
                } else if (prefs?.[userEmail]?.defaultTreeName) {
                    setStarredTreeNames(new Set([prefs[userEmail].defaultTreeName!]));
                }
            } catch (e) {
                console.warn("Failed to load prefs", e);
                const stored = localStorage.getItem(`shortlist_${userEmail}`);
                if (stored) setShortlistedIds(JSON.parse(stored));
            }
        };
        loadPrefs();
    }, [userEmail]);

    useEffect(() => {
        const newIds: string[] = [];
        starredTreeNames.forEach(name => {
            const ids = treeIdMap[name];
            if (ids) newIds.push(...ids);
        });
        setShortlistedIds(newIds);
        localStorage.setItem(`shortlist_${userEmail}`, JSON.stringify(newIds));
    }, [starredTreeNames, treeIdMap, userEmail]);

    const toggleShortlist = (treeName: string) => {
        const newStarred = new Set(starredTreeNames);
        if (newStarred.has(treeName)) newStarred.delete(treeName);
        else newStarred.add(treeName);
        setStarredTreeNames(newStarred);
        updateUserStarredTrees(userEmail, Array.from(newStarred)).catch(console.error);
    };

    return { starredTreeNames, shortlistedIds, toggleShortlist, setStarredTreeNames };
}
