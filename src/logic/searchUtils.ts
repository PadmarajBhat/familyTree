import type { PersonNode } from './types';

export type SortOption = 'name' | 'age' | 'dateAdded';
export type SortOrder = 'asc' | 'desc';

export const searchMembers = (nodes: PersonNode[], query: string): PersonNode[] => {
    if (!query) return nodes;

    const lowerQuery = query.toLowerCase();
    
    // Basic fuzzy search: check if name includes query
    // TODO: Add more advanced fuzzy matching or transliteration if needed
    return nodes.filter(node => {
        const name = node.name?.toLowerCase() || '';
        return name.includes(lowerQuery);
    });
};

export const sortMembers = (nodes: PersonNode[], sortBy: SortOption, order: SortOrder): PersonNode[] => {
    const sorted = [...nodes].sort((a, b) => {
        let valA: string | number | null = null;
        let valB: string | number | null = null;

        switch (sortBy) {
            case 'name':
                valA = a.name?.toLowerCase() || '';
                valB = b.name?.toLowerCase() || '';
                break;
            case 'age':
                // Use ageProvided or calculate from DOB
                // For sorting, we can just use birth year/date inverse
                // If DOB exists, use it. If ageProvided exists, use it.
                // We want "Youngest" (Low Age) to "Oldest" (High Age)
                // So for 'asc' (Youngest first), we want later DOB first.
                // Let's normalize to "birth timestamp" (approx).
                // Smaller timestamp = Older.
                // Larger timestamp = Younger.
                
                // Actually, let's just use the derived age logic or simple comparison
                // If we sort by "Age", usually people mean 0 -> 100.
                // So 'asc' = 0, 1, 2...
                // 'desc' = 100, 99...
                
                // We need a helper to get "comparable age"
                valA = getComparableAge(a);
                valB = getComparableAge(b);
                break;
            case 'dateAdded':
                valA = new Date(a.editedTime || 0).getTime();
                valB = new Date(b.editedTime || 0).getTime();
                break;
        }

        if (valA === valB) return 0;
        if (valA === null) return 1; // Nulls last
        if (valB === null) return -1;

        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });

    return sorted;
};

const getComparableAge = (node: PersonNode): number | null => {
    if (node.ageProvided !== null && node.ageProvided !== undefined) {
        return node.ageProvided;
    }
    if (node.dob) {
        const birthDate = new Date(node.dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }
    return null; // Unknown age
};
