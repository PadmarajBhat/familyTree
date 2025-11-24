import React, { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { PersonNode } from '../logic/types';
import { getISTTimestamp, deriveDobFromAge, calculateAge } from '../logic/dateUtils';
import { uploadImage } from '../services/drive';
import './MemberEditor.css';

interface MemberEditorProps {
    currentUserEmail: string;
    mode: 'add' | 'edit';
    initialData?: PersonNode;
    existingNodes: Record<string, PersonNode>;
    onSave: (person: PersonNode, newParentId: string | null) => void;
    onCancel: () => void;
}

export const MemberEditor: React.FC<MemberEditorProps> = ({
    currentUserEmail,
    mode,
    initialData,
    existingNodes,
    onSave,
    onCancel
}) => {
    const [name, setName] = useState(initialData?.name || '');
    // const [gender, setGender] = useState<'male' | 'female' | 'other'>('male'); // TODO: Add gender to PersonNode if needed, currently not in interface but useful for UI
    const [isAlive, setIsAlive] = useState(initialData ? !initialData.dod : true);
    const [dob, setDob] = useState(initialData?.dob || '');
    const [age, setAge] = useState(initialData?.ageProvided?.toString() || '');
    const [dod, setDod] = useState(initialData?.dod || '');
    const [phone, setPhone] = useState(initialData?.phone || '');
    const [email, setEmail] = useState(initialData?.email || '');
    const [address, setAddress] = useState(initialData?.address?.freeform || '');
    const [parentId, setParentId] = useState<string | null>(initialData?.parentId || null);

    // Father Search State
    const [fatherSearch, setFatherSearch] = useState('');
    const [showFatherSuggestions, setShowFatherSuggestions] = useState(false);

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(initialData?.imageUrl || null);
    const [uploading, setUploading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize computed age if dob exists but age doesn't
    useEffect(() => {
        if (mode === 'edit' && initialData?.dob && !initialData.ageProvided) {
            const calculated = calculateAge(initialData.dob, initialData.dod);
            if (calculated !== null) {
                setAge(calculated.toString());
            }
        }
        // Initialize father name for search field
        if (initialData?.parentId && existingNodes[initialData.parentId]) {
            setFatherSearch(existingNodes[initialData.parentId].name || 'Unknown');
        }
    }, [mode, initialData, existingNodes]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const filteredFathers = useMemo(() => {
        if (!fatherSearch) return [];
        const lowerSearch = fatherSearch.toLowerCase();
        return Object.values(existingNodes)
            .filter(node =>
                node.nodeId !== initialData?.nodeId && // Cannot be own father
                (node.name?.toLowerCase().includes(lowerSearch))
            )
            .slice(0, 5); // Limit suggestions
    }, [fatherSearch, existingNodes, initialData]);

    const handleFatherSelect = (node: PersonNode) => {
        setParentId(node.nodeId);
        setFatherSearch(node.name || 'Unknown');
        setShowFatherSuggestions(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        try {
            let imageUrl = initialData?.imageUrl || null;
            if (imageFile) {
                imageUrl = await uploadImage(imageFile);
            }

            let finalDob = dob;
            let dobInferred = initialData?.dobInferred || false;

            if (!dob && age) {
                finalDob = deriveDobFromAge(parseInt(age), isAlive ? null : dod);
                dobInferred = true;
            } else if (dob) {
                dobInferred = false;
            }

            const now = getISTTimestamp();

            const personData: PersonNode = {
                nodeId: initialData?.nodeId || uuidv4(),
                name: name || null,
                imageUrl: imageUrl,
                phone: phone || null,
                phoneE164: phone ? phone.replace(/\D/g, '') : null,
                email: email ? email.toLowerCase() : null,
                dob: finalDob || null,
                dobApprox: initialData?.dobApprox || { known: false, year: null, month: null, day: null },
                dod: !isAlive ? (dod || null) : null,
                dodApprox: initialData?.dodApprox || { known: false, year: null, month: null, day: null },
                ageProvided: age ? parseInt(age) : null,
                dobInferred: dobInferred,
                address: { freeform: address || null },
                spouseIds: initialData?.spouseIds || [],
                parentId: parentId, // Updated parent ID
                childrenIds: initialData?.childrenIds || [],
                isEditor: initialData?.isEditor || false,
                editorSince: initialData?.editorSince || null,
                editedBy: currentUserEmail,
                editedTime: now,
            };

            onSave(personData, parentId);
        } catch (error) {
            console.error("Error saving member:", error);
            alert("Failed to save member. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="member-editor-modal">
            <div className="member-editor-content">
                <h2>{mode === 'add' ? 'Add Member' : 'Edit Member'}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group image-upload">
                        <div
                            className="image-preview"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ backgroundImage: imagePreview ? `url(${imagePreview})` : 'none' }}
                        >
                            {!imagePreview && <span>Tap to add photo</span>}
                        </div>
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            ref={fileInputRef}
                            onChange={handleImageChange}
                            style={{ display: 'none' }}
                        />
                    </div>

                    <div className="form-group">
                        <label>Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required />
                    </div>

                    <div className="form-group">
                        <label>Father (Parent)</label>
                        <div className="autocomplete">
                            <input
                                type="text"
                                value={fatherSearch}
                                onChange={e => {
                                    setFatherSearch(e.target.value);
                                    setShowFatherSuggestions(true);
                                    if (e.target.value === '') setParentId(null);
                                }}
                                onFocus={() => setShowFatherSuggestions(true)}
                                placeholder="Search for father..."
                            />
                            {showFatherSuggestions && filteredFathers.length > 0 && (
                                <ul className="suggestions-list">
                                    {filteredFathers.map(node => (
                                        <li key={node.nodeId} onClick={() => handleFatherSelect(node)}>
                                            {node.name}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Status</label>
                        <div className="toggle-group">
                            <label>
                                <input
                                    type="radio"
                                    checked={isAlive}
                                    onChange={() => setIsAlive(true)}
                                /> Alive
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    checked={!isAlive}
                                    onChange={() => setIsAlive(false)}
                                /> Deceased
                            </label>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Date of Birth</label>
                        <input type="date" value={dob} onChange={e => { setDob(e.target.value); setAge(''); }} />
                    </div>

                    {!dob && (
                        <div className="form-group">
                            <label>Or Age (approx)</label>
                            <input type="number" value={age} onChange={e => { setAge(e.target.value); setDob(''); }} placeholder="Years" />
                        </div>
                    )}

                    {!isAlive && (
                        <div className="form-group">
                            <label>Date of Death</label>
                            <input type="date" value={dod} onChange={e => setDod(e.target.value)} />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Phone</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Address</label>
                        <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3} />
                    </div>

                    <div className="form-actions">
                        <button type="button" onClick={onCancel} disabled={uploading}>Cancel</button>
                        <button type="submit" disabled={uploading}>
                            {uploading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
