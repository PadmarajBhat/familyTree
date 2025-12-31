import React from 'react';
import type { PersonNode } from '../../../logic/types';
import { parseDateFromDDMMYYYY } from '../../../logic/dateUtils';
import { RelationSelect } from './RelationSelect';

interface Occupation {
    role: string;
    organization: string;
}

interface Education {
    degree: string;
    major: string;
}

interface AdvancedInfoSectionProps {
    form: {
        phone: string;
        setPhone: (val: string) => void;
        email: string;
        setEmail: (val: string) => void;
        address: string;
        setAddress: (val: string) => void;
        education: Education[];
        setEducation: (val: Education[]) => void;
        occupation: Occupation | null;
        setOccupation: (val: Occupation | null) => void;
        hobbies: string[];
        setHobbies: (val: string[]) => void;
        notes: string;
        setNotes: (val: string) => void;
        isAlive: boolean;
        setIsAlive: (val: boolean) => void;
        dobInput: string;
        setDobInput: (val: string) => void;
        setDob: (val: string) => void;
        dob: string | null;
        age: string;
        setAge: (val: string) => void;
        dodInput: string;
        setDodInput: (val: string) => void;
        setDod: (val: string) => void;
        siblingIds: string[];
        setSiblingIds: React.Dispatch<React.SetStateAction<string[]>>;
        childrenIds: string[];
        setChildrenIds: React.Dispatch<React.SetStateAction<string[]>>;
        parentId: string | null;
    };
    initialData?: PersonNode;
    isLinkedNode: boolean;

    // Sibling Search Props
    siblingSearchText: string;
    setSiblingSearchText: (val: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    siblingSuggestions: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleSiblingSelect: (result: any) => void;
    getNodeName: (id: string) => string;

    // Child Search Props
    childSearch: {
        searchText: string;
        setSearchText: (val: string) => void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        suggestions: any[];
        showSuggestions: boolean;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleChildSelect: (result: any) => void;
}

export const AdvancedInfoSection: React.FC<AdvancedInfoSectionProps> = ({
    form,
    initialData,
    isLinkedNode,
    siblingSearchText,
    setSiblingSearchText,
    siblingSuggestions,
    handleSiblingSelect,
    getNodeName,
    childSearch,
    handleChildSelect
}) => {
    return (
        <>
            {/* Phone */}
            <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={form.phone} onChange={e => form.setPhone(e.target.value)} disabled={isLinkedNode} />
            </div>

            {/* Status & Dates */}
            <div className="form-group">
                <label>Status</label>
                <div className="toggle-group">
                    <label><input type="radio" checked={form.isAlive} onChange={() => form.setIsAlive(true)} disabled={isLinkedNode} /> Alive</label>
                    <label><input type="radio" checked={!form.isAlive} onChange={() => form.setIsAlive(false)} disabled={isLinkedNode} /> Deceased</label>
                </div>
            </div>

            <div className="form-group">
                <label>Date of Birth (DD-MM-YYYY)</label>
                <input
                    type="text"
                    value={form.dobInput}
                    placeholder="DD-MM-YYYY"
                    inputMode="numeric"
                    onChange={e => {
                        form.setDobInput(e.target.value);
                        const parsed = parseDateFromDDMMYYYY(e.target.value);
                        if (parsed) form.setDob(parsed);
                        else if (!e.target.value) form.setDob('');
                    }}
                    disabled={isLinkedNode}
                />
            </div>
            {!form.dob && (
                <div className="form-group">
                    <label>Or Age (approx)</label>
                    <input type="number" value={form.age} onChange={e => { form.setAge(e.target.value); form.setDob(''); form.setDobInput(''); }} placeholder="Years" disabled={isLinkedNode} />
                </div>
            )}
            {!form.isAlive && (
                <div className="form-group">
                    <label>Date of Death (DD-MM-YYYY)</label>
                    <input
                        type="text"
                        value={form.dodInput}
                        placeholder="DD-MM-YYYY"
                        inputMode="numeric"
                        onChange={e => {
                            form.setDodInput(e.target.value);
                            const parsed = parseDateFromDDMMYYYY(e.target.value);
                            if (parsed) form.setDod(parsed);
                            else if (!e.target.value) form.setDod('');
                        }}
                        disabled={isLinkedNode}
                    />
                </div>
            )}

            {/* Email */}
            <div className="form-group">
                <label>Email {(initialData?.isEditor) && <span style={{ color: 'red' }}>*</span>}</label>
                <input type="email" value={form.email} onChange={e => form.setEmail(e.target.value)} required={initialData?.isEditor || false} disabled={isLinkedNode} />
            </div>

            {/* Address */}
            <div className="form-group">
                <label>Address</label>
                <textarea value={form.address} onChange={e => form.setAddress(e.target.value)} rows={3} disabled={isLinkedNode} />
            </div>

            {/* Education */}
            <div className="form-group">
                <label>Education</label>
                {form.education.map((edu, index) => (
                    <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '5px' }}>
                        <input type="text" placeholder="Degree" value={edu.degree || ''} onChange={e => { const newEdu = [...form.education]; newEdu[index].degree = e.target.value; form.setEducation(newEdu); }} disabled={isLinkedNode} />
                        <input type="text" placeholder="Major" value={edu.major || ''} onChange={e => { const newEdu = [...form.education]; newEdu[index].major = e.target.value; form.setEducation(newEdu); }} disabled={isLinkedNode} />
                        <button type="button" onClick={() => form.setEducation(form.education.filter((_, i) => i !== index))} disabled={isLinkedNode}>×</button>
                    </div>
                ))}
                <button type="button" onClick={() => form.setEducation([...form.education, { degree: '', major: '' }])} style={{ fontSize: '0.8em' }} disabled={isLinkedNode}>+ Add Education</button>
            </div>

            {/* Occupation */}
            <div className="form-group">
                <label>Occupation</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="text" placeholder="Role" value={form.occupation?.role || ''} onChange={e => form.setOccupation({ ...form.occupation, role: e.target.value, organization: form.occupation?.organization || '' })} disabled={isLinkedNode} />
                    <input type="text" placeholder="Organization" value={form.occupation?.organization || ''} onChange={e => form.setOccupation({ ...form.occupation, role: form.occupation?.role || '', organization: e.target.value })} disabled={isLinkedNode} />
                </div>
            </div>

            {/* Hobbies */}
            <div className="form-group">
                <label>Hobbies</label>
                <input type="text" value={form.hobbies.join(', ')} onChange={e => form.setHobbies(e.target.value.split(',').map(s => s.trim()).filter(s => s))} placeholder="Reading, Traveling, etc." disabled={isLinkedNode} />
            </div>

            {/* Siblings */}
            <RelationSelect
                label={`Siblings ${(!form.parentId) ? '(Requires Parent)' : ''}`}
                items={form.siblingIds.map(id => ({ id, name: getNodeName(id) }))}
                searchText={siblingSearchText}
                onSearchChange={setSiblingSearchText}
                suggestions={siblingSuggestions}
                showSuggestions={!!siblingSuggestions.length && !!siblingSearchText}
                onSelect={handleSiblingSelect}
                onRemove={(id) => form.setSiblingIds(prev => prev.filter(sid => sid !== id))}
                searchPlaceholder="Search to add sibling..."
                disabled={isLinkedNode || !form.parentId}
                emptyMessage={(!form.parentId) ? "Please select a father/parent first to manage siblings." : undefined}
            />

            {/* Children */}
            <RelationSelect
                label="Children"
                items={form.childrenIds.map(id => ({ id, name: getNodeName(id) }))}
                searchText={childSearch.searchText}
                onSearchChange={childSearch.setSearchText}
                suggestions={childSearch.suggestions}
                showSuggestions={childSearch.showSuggestions}
                onSelect={handleChildSelect}
                onRemove={(id) => form.setChildrenIds(prev => prev.filter(cid => cid !== id))}
                searchPlaceholder="Search to add child..."
                disabled={isLinkedNode}
            />

            {/* Notes */}
            <div className="form-group">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => form.setNotes(e.target.value)} rows={3} placeholder="Random remarks..." disabled={isLinkedNode} />
            </div>
        </>
    );
};
