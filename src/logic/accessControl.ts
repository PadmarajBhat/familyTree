
export const canEdit = (email: string | null | undefined): boolean => {
    if (!email) return false;
    const normalizedEmail = email.toLowerCase();
    return normalizedEmail.startsWith('padmarajbhat') || normalizedEmail.startsWith('narasimhapbhat');
};
