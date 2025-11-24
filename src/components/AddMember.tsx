import React, { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PersonNode } from '../logic/types';
import { getISTTimestamp, deriveDobFromAge } from '../logic/dateUtils';
import { uploadImage } from '../services/drive';
import './AddMember.css';

interface AddMemberProps {
    currentUserEmail: string;
    onAdd: (person: PersonNode) => void;
    onCancel: () => void;
    relatedNodeId?: string | null; // If adding relative
    relationType?: 'parent' | 'spouse' | 'child' | null;
}

export const AddMember: React.FC<AddMemberProps> = ({ currentUserEmail, onAdd, onCancel, relatedNodeId, relationType }) => {
    const [name, setName] = useState('');
    const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
    const [isAlive, setIsAlive] = useState(true);
    const [dob, setDob] = useState('');
    const [age, setAge] = useState('');
    const [dod, setDod] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        try {
            let imageUrl = null;
            if (imageFile) {
                imageUrl = await uploadImage(imageFile);
            }

            let finalDob = dob;
            let dobInferred = false;

            if (!dob && age) {
                finalDob = deriveDobFromAge(parseInt(age), isAlive ? null : dod);
                dobInferred = true;
            }

            const newNode: PersonNode = {
                nodeId: uuidv4(),
                name: name || null,
                imageUrl: imageUrl,
                phone: phone || null,
                phoneE164: phone ? phone.replace(/\D/g, '') : null, // Basic normalization
                email: email ? email.toLowerCase() : null,
                dob: finalDob || null,
                dobApprox: { known: false, year: null, month: null, day: null }, // TODO: Implement approx date UI
                dod: !isAlive ? (dod || null) : null,
                dodApprox: { known: false, year: null, month: null, day: null },
                ageProvided: age ? parseInt(age) : null,
                dobInferred: dobInferred,
                address: { freeform: address || null },
                spouseIds: [],
                parentId: null, // Will be linked by parent component logic
                childrenIds: [],
                isEditor: false, // Default to false
                editorSince: null,
                editedBy: currentUserEmail,
                editedTime: getISTTimestamp(),
            };

            onAdd(newNode);
        } catch (error) {
            console.error("Error adding member:", error);
            alert("Failed to add member. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="add-member-modal">
            <div className="add-member-content">
                <h2>Add Member {relationType ? `(${relationType})` : ''}</h2>
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
                            capture="environment" // Prefer rear camera on mobile
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
                            {uploading ? 'Saving...' : 'Add Member'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
