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

export const formatDateToDDMMYYYY = (dateStr: string | null): string => {
    if (!dateStr) return '';
    try {
        const [year, month, day] = dateStr.split('-');
        if (!year || !month || !day) return '';
        return `${day}-${month}-${year}`;
    } catch {
        return '';
    }
};

export const parseDateFromDDMMYYYY = (dateStr: string): string | null => {
    if (!dateStr) return null;
    // Allow basic separators: - / .
    const parts = dateStr.split(/[-/.]/);
    if (parts.length !== 3) return null;

    let [day, month, year] = parts;

    // Pad day/month if needed
    if (day.length === 1) day = '0' + day;
    if (month.length === 1) month = '0' + month;

    // Validate year (basic 4 digit check)
    if (year.length === 2) {
        // Assume 1900s if > 25, else 2000s? Or just requiring 4 digits is improved.
        // Let's require 4 digits for clarity or assume based on current year.
        // For DOB, simpler to require 4 digits to avoid ambiguity.
        return null;
    }
    if (year.length !== 4) return null;

    // Basic range checks
    const d = parseInt(day);
    const m = parseInt(month);
    const y = parseInt(year);

    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    if (m < 1 || m > 12) return null;
    // Simple day check (not full calendar validation per month, but date obj check can do it)
    if (d < 1 || d > 31) return null;

    // Use Date object to verify validity (e.g. Feb 30)
    // Note: JS Date constructor uses 0-indexed month
    const dateObj = new Date(y, m - 1, d);
    if (dateObj.getFullYear() !== y || dateObj.getMonth() !== m - 1 || dateObj.getDate() !== d) {
        return null;
    }

    return `${year}-${month}-${day}`;
};
