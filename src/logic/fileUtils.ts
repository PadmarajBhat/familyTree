export const getTreeNameFromFilename = (filename: string): string => {
    // Matches "Name_YYYY-MM-DD.json"
    const match = filename.match(/^(.*)_\d{4}-\d{2}-\d{2}\.json$/);
    if (match && match[1]) {
        return match[1];
    }
    // Legacy support: "family_tree_YYYY-MM-DD.json" -> "family_tree"
    // Actually the regex above handles it if "family_tree" is the name.

    // Fallback for other files
    return filename.replace('.json', '');
};

export const generateFilename = (treeName: string): string => {
    const today = new Date().toISOString().split('T')[0];
    return `${treeName}_${today}.json`;
};
