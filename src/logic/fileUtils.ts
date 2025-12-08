
export const getTreeNameFromFilename = (filename: string): string => {
    // Expected format: family_tree_[TreeName]_[Date].json
    // Or legacy: family_tree_[Date].json (TreeName is "family_tree")
    // Or legacy: family_tree_name without date?

    let temp = filename.replace('family_tree_', '').replace('.json', '');

    // Check if it has a date at the end (YYYY-MM-DD)
    const dateRegex = /_(\d{4}-\d{2}-\d{2})$/;
    const match = temp.match(dateRegex);

    if (match) {
        // Remove the date part
        temp = temp.replace(dateRegex, '');
    }

    // Replace underscores with spaces for display, maybe? 
    // The user said: "family_tree_Smith_2023-10-01.json".
    // If temp is now "Smith", that is the tree name.

    // Handling "family_tree" base case if it was just date
    if (!temp || temp === '') return 'Family Tree';

    return temp.replace(/_/g, ' ');
};

export const generateFilename = (treeName: string): string => {
    const sanitized = treeName.trim().replace(/\s+/g, '_');
    const date = new Date().toISOString().split('T')[0];
    return `family_tree_${sanitized}_${date}.json`;
};
