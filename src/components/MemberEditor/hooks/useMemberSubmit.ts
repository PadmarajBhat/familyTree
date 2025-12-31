import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { PersonNode } from '../../../logic/types';
import { getISTTimestamp } from '../../../logic/dateUtils';
import { uploadImage, uploadVideo, deleteFile } from '../../../services/drive';
import { GlobalTreeService } from '../../../services/GlobalTreeService';

interface UseMemberSubmitProps {
    form: any; // Type from useMemberForm
    media: any; // Type from useMediaCapture
    location: any; // Type from useLocationSearch
    initialData?: PersonNode;
    currentUserEmail: string;
    // existingNodes removed as unused
    isLinkedNode: boolean;
    externalLink?: any;
    linkedImageUrl: string | null;
    pendingShadowNodes: PersonNode[];
    onSave: (person: PersonNode, newParentId: string | null, newChildrenIds: string[], newSpouseIds: string[], newSiblingIds: string[], shadowNodes?: PersonNode[]) => void;
}

export const useMemberSubmit = ({
    form,
    media,
    location,
    initialData,
    currentUserEmail,
    isLinkedNode,
    externalLink,
    linkedImageUrl,
    pendingShadowNodes,
    onSave
}: UseMemberSubmitProps) => {
    const [uploading, setUploading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        try {
            const validation = form.validate();
            if (!validation.valid) {
                alert(validation.errors.join('\n'));
                setUploading(false);
                return;
            }

            // Media Uploads
            let finalImageUrl = initialData?.imageUrl || null;
            if (linkedImageUrl) finalImageUrl = linkedImageUrl;
            if (media.imageFile) {
                if (initialData?.imageUrl) {
                    try { await deleteFile(initialData.imageUrl); } catch (e) { console.warn("Delete old image failed", e); }
                }
                finalImageUrl = await uploadImage(media.imageFile);
            }

            let finalVideoUrl = initialData?.videoUrl || null;
            if (media.videoBlob) {
                if (initialData?.videoUrl) {
                    try { await deleteFile(initialData.videoUrl); } catch (e) { console.warn("Delete old video failed", e); }
                }
                finalVideoUrl = await uploadVideo(media.videoBlob, `video_${initialData?.nodeId || 'new'}.webm`);
            }

            const now = getISTTimestamp();
            const personData: PersonNode = {
                nodeId: initialData?.nodeId || uuidv4(),
                name: form.name || null,
                imageUrl: finalImageUrl,
                videoUrl: finalVideoUrl,
                phone: form.phone || null,
                phoneE164: form.phone ? form.phone.replace(/\D/g, '') : null,
                email: form.email ? form.email.toLowerCase() : null,
                dob: validation.finalDob || null,
                dobApprox: initialData?.dobApprox || { known: false, year: null, month: null, day: null },
                dod: !form.isAlive ? (form.dod || null) : null,
                dodApprox: initialData?.dodApprox || { known: false, year: null, month: null, day: null },
                ageProvided: form.age ? parseInt(form.age) : null,
                dobInferred: validation.dobInferred,
                address: { freeform: form.address || null },
                spouseIds: form.spouseIds,
                parentId: form.parentId,
                childrenIds: form.childrenIds,
                isEditor: initialData?.isEditor || false,
                editorSince: initialData?.editorSince || null,
                editedBy: currentUserEmail,
                editedTime: now,
                gender: form.gender,
                hobbies: form.hobbies,
                education: form.education,
                occupation: form.occupation,
                notes: form.notes,
                location: location.zipcode ? {
                    zipcode: location.zipcode,
                    district: location.locationData.district,
                    state: location.locationData.state,
                    country: location.locationData.country
                } : null,
                externalLink: externalLink,
                nameTranslations: form.translations
            };

            // Live Link Write-Back
            if (isLinkedNode && externalLink) {
                const success = await GlobalTreeService.updateRemoteNode(
                    externalLink.treeId,
                    externalLink.nodeId,
                    personData,
                    currentUserEmail
                );
                if (!success) return; // Error handled in service
            }

            onSave(personData, form.parentId, form.childrenIds, form.spouseIds, form.siblingIds, pendingShadowNodes);

        } catch (error) {
            console.error("Error saving member:", error);
            alert("Failed to save member. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    return { handleSubmit, uploading };
};
