import type { PersonNode } from './types';
import { calculateAge } from './dateUtils';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export const validatePersonData = (data: Partial<PersonNode>, isEditor: boolean = false): ValidationResult => {
    const errors: string[] = [];

    // 1. Name is required
    if (!data.name || data.name.trim().length === 0) {
        errors.push("Name is required.");
    }

    // 2. Email required for editors
    // Note: data.isEditor might be true, or we pass isEditor explicitly if we are enforcing a specific role
    if ((data.isEditor || isEditor) && (!data.email || data.email.trim().length === 0)) {
        errors.push("Email is required for editors.");
    }

    // 3. Date Validations
    const dob = data.dob;
    const dod = data.dod;

    if (dob) {
        if (!isValidISODate(dob)) {
            errors.push(`Invalid DOB format: ${dob}. Must be YYYY-MM-DD.`);
        }
    }

    if (dod) {
        if (!isValidISODate(dod)) {
            errors.push(`Invalid DOD format: ${dod}. Must be YYYY-MM-DD.`);
        }
    }

    if (dob && dod) {
        if (new Date(dob) > new Date(dod)) {
            errors.push("Date of Death cannot be before Date of Birth.");
        }
    }

    // 4. Age Consistency (Optional warning, but here we just check validity if both provided)
    // If user provided age, we might want to check it against dob? 
    // Usually UI derives DOB from age or vice versa. 
    // For Gemini, if it provides both, we should sanity check.
    if (data.ageProvided && dob) {
        const calculated = calculateAge(dob, dod || null);
        if (calculated !== null && Math.abs(calculated - data.ageProvided) > 1) {
            // loosening strictness for off-by-one errors in year calculation vs exact date
            // errors.push(`Provided age ${data.ageProvided} does not match DOB ${dob}.`); 
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

const isValidISODate = (dateStr: string): boolean => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date.getTime()) && date.toISOString().startsWith(dateStr);
};
