import { useState, useEffect } from 'react';
import type { PersonNode } from '../../../logic/types';
import { calculateAge, deriveDobFromAge, formatDateToDDMMYYYY } from '../../../logic/dateUtils';
import { generateAllTranslations } from '../../../services/TransliterationService';
import { validatePersonData } from '../../../logic/validation';

interface UseMemberFormProps {
    initialData?: PersonNode;
    mode: 'add' | 'edit';
    existingNodes: Record<string, PersonNode>;
}

export const useMemberForm = ({ initialData, mode, existingNodes }: UseMemberFormProps) => {
    // Basic Info
    const [name, setName] = useState(initialData?.name || '');
    const [translations, setTranslations] = useState<Record<string, string | undefined>>(initialData?.nameTranslations || {});
    const [gender, setGender] = useState<'male' | 'female' | 'other' | null>(initialData?.gender || null);

    // Status & Dates
    const [isAlive, setIsAlive] = useState(initialData ? !initialData.dod : true);
    const [dob, setDob] = useState(initialData?.dob || '');
    const [dobInput, setDobInput] = useState(formatDateToDDMMYYYY(initialData?.dob || null));
    const [age, setAge] = useState(initialData?.ageProvided?.toString() || '');
    const [dod, setDod] = useState(initialData?.dod || '');
    const [dodInput, setDodInput] = useState(formatDateToDDMMYYYY(initialData?.dod || null));

    // Contact
    const [phone, setPhone] = useState(initialData?.phone || '');
    const [email, setEmail] = useState(initialData?.email || '');
    const [address, setAddress] = useState(initialData?.address?.freeform || '');

    // Relations (IDs only here, search state handled by other hooks)
    const [parentId, setParentId] = useState<string | null>(initialData?.parentId || null);
    const [childrenIds, setChildrenIds] = useState<string[]>(initialData?.childrenIds || []);
    const [spouseIds, setSpouseIds] = useState<string[]>(initialData?.spouseIds || []);
    const [siblingIds, setSiblingIds] = useState<string[]>(() => {
        if (!initialData?.parentId || !existingNodes[initialData.parentId]) return [];
        return existingNodes[initialData.parentId].childrenIds.filter(id => id !== initialData.nodeId);
    });

    // Additional Info
    const [hobbies, setHobbies] = useState<string[]>(initialData?.hobbies || []);
    const [education, setEducation] = useState<{ degree: string; major: string }[]>(initialData?.education || []);
    const [occupation, setOccupation] = useState<{ role: string; organization: string } | null>(initialData?.occupation || null);
    const [notes, setNotes] = useState(initialData?.notes || '');

    // Auto-Translation on Blur
    const handleNameBlur = async () => {
        if (name && name.length > 2) {
            try {
                const generated = await generateAllTranslations(name);
                setTranslations(prev => {
                    const next = { ...prev };
                    for (const [key, val] of Object.entries(generated)) {
                        if (!next[key]) next[key] = val;
                    }
                    return next;
                });
            } catch (e) {
                console.warn("Translation failed", e);
            }
        }
    };

    // Calculate Age on Load
    useEffect(() => {
        if (mode === 'edit' && initialData?.dob && !initialData.ageProvided) {
            const calculated = calculateAge(initialData.dob, initialData.dod);
            if (calculated !== null) {
                setAge(calculated.toString());
            }
        }
    }, [mode, initialData]);

    // Update Sibling Context when Parent Changes
    useEffect(() => {
        if (parentId && existingNodes[parentId]) {
            const newParentChildren = existingNodes[parentId].childrenIds.filter(id => id !== initialData?.nodeId);
            setSiblingIds(newParentChildren);
        } else {
            setSiblingIds([]);
        }
    }, [parentId, existingNodes, initialData]);

    // Validation Function
    const validate = () => {
        let finalDob = dob;
        let dobInferred = initialData?.dobInferred || false;

        if (!dob && age) {
            finalDob = deriveDobFromAge(parseInt(age), isAlive ? null : dod);
            dobInferred = true;
        } else if (dob) {
            dobInferred = false;
        }

        const dataToValidate: Partial<PersonNode> = {
            name,
            email,
            dob: finalDob,
            dod: !isAlive ? (dod || null) : null,
            isEditor: initialData?.isEditor || false,
            ageProvided: age ? parseInt(age) : null
        };

        const result = validatePersonData(dataToValidate, initialData?.isEditor);

        return {
            valid: result.valid,
            errors: result.errors,
            finalDob,
            dobInferred
        };
    };

    return {
        // State
        name, setName,
        translations, setTranslations,
        gender, setGender,
        isAlive, setIsAlive,
        dob, setDob,
        dobInput, setDobInput,
        age, setAge,
        dod, setDod,
        dodInput, setDodInput,
        phone, setPhone,
        email, setEmail,
        address, setAddress,
        parentId, setParentId,
        childrenIds, setChildrenIds,
        spouseIds, setSpouseIds,
        siblingIds, setSiblingIds,
        hobbies, setHobbies,
        education, setEducation,
        occupation, setOccupation,
        notes, setNotes,

        // Handlers
        handleNameBlur,
        validate
    };
};
