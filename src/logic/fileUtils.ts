
export const getTreeNameFromFilename = (filename: string): string => {
    // Expected format: family_tree_[TreeName]_[Date].json
    // Or legacy: family_tree_[Date].json (TreeName is "family_tree")
    // Or legacy: family_tree_name without date?

    if (!filename) return 'Unknown Tree';
    let temp = filename.replace('family_tree_', '').replace('.json', '');

    // Remove Google Drive duplicate suffixes like " (1)" or "_1"
    temp = temp.replace(/ \(\d+\)$/, '').replace(/_\d+$/, '');
    temp = temp.trim();

    // Recursively remove dates at the end (YYYY-MM-DD)
    // This handles cases like "Sample_2025-12-13_2025-12-14" -> "Sample"
    const dateRegex = /_(\d{4}-\d{2}-\d{2})$/;
    while (dateRegex.test(temp)) {
        temp = temp.replace(dateRegex, '');
    }

    // Handling "family_tree" base case if it was just date
    if (!temp || temp === '') return 'Family Tree';

    return temp.replace(/_/g, ' ');
};

export const generateFilename = (treeName: string): string => {
    const sanitized = treeName.trim().replace(/\s+/g, '_');
    const date = new Date().toISOString().split('T')[0];
    return `family_tree_${sanitized}_${date}.json`;
};
