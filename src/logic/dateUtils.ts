import { differenceInYears } from 'date-fns';

export const getISTTimestamp = (): string => {
    const now = new Date();
    // IST is UTC + 5:30
    const offset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + offset);
    // Remove the 'Z' and append '+05:30'
    // Note: toISOString() returns YYYY-MM-DDTHH:mm:ss.sssZ
    // We want YYYY-MM-DDTHH:mm:ss+05:30 (ignoring milliseconds if preferred, but ISO usually has them)
    // The user example: YYYY-MM-DDTHH:mm:ss+05:30
    return istTime.toISOString().replace('Z', '+05:30');
};

export const calculateAge = (dob: string | null, dod: string | null): number | null => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const endDate = dod ? new Date(dod) : new Date();
    return differenceInYears(endDate, birthDate);
};

export const deriveDobFromAge = (age: number, dod: string | null): string => {
    const targetYear = dod ? new Date(dod).getFullYear() : new Date().getFullYear();
    const birthYear = targetYear - age;
    // Default to Jan 1st if only year is known/derived
    return `${birthYear}-01-01`;
};
