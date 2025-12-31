
export const getTreeNameFromFilename = (filename: string): string => {
    // New format: FT_[TreeName]_[Date].json or FT_[TreeName] (Spreadsheet)
    // Legacy format: family_tree_[TreeName]_[Date].json

    let temp = filename
        .replace('FT_', '')
        .replace('family_tree_', '')
        .replace('.json', '');

    // Remove Google Drive duplicate suffixes like " (1)" or "_1"
    temp = temp.replace(/ \(\d+\)$/, '').replace(/_\d+$/, '');
    temp = temp.trim();

    // Standardize: Remove dates at the end (YYYY-MM-DD or YYYY_MM_DD)
    const dateRegex = /[_-](\d{4}-\d{2}-\d{2})$/;
    const alternativeDateRegex = /[_-](\d{4}_\d{2}_\d{2})$/;

    while (dateRegex.test(temp)) {
        temp = temp.replace(dateRegex, '');
    }
    while (alternativeDateRegex.test(temp)) {
        temp = temp.replace(alternativeDateRegex, '');
    }

    // Special case for main data file
    if (!temp || temp === '' || temp.toLowerCase() === 'data') return 'Main Family Tree';

    return temp.replace(/_/g, ' ');
};

export const generateFilename = (treeName: string): string => {
    const sanitized = treeName.trim().replace(/\s+/g, '_');
    const date = new Date().toISOString().split('T')[0];
    return `FT_${sanitized}_${date}.json`;
};
