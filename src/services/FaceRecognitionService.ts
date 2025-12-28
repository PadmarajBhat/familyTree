import * as faceapi from 'face-api.js';
import type { PersonNode } from '../logic/types';
import { getPhotoUrl } from './drive';

// Use GitHub Raw as a CDN for models
const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

export class FaceRecognitionService {
    private static instance: FaceRecognitionService;
    private modelsLoaded = false;
    private faceMatcher: faceapi.FaceMatcher | null = null;

    private constructor() { }

    public static getInstance(): FaceRecognitionService {
        if (!FaceRecognitionService.instance) {
            FaceRecognitionService.instance = new FaceRecognitionService();
        }
        return FaceRecognitionService.instance;
    }

    public async loadModels() {
        if (this.modelsLoaded) return;

        console.log("Loading FaceAPI models from", MODEL_URL);
        try {
            await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
            await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
            await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
            this.modelsLoaded = true;
            console.log("FaceAPI Models Loaded Successfully");
        } catch (e) {
            console.error("Failed to load FaceAPI models", e);
            throw e;
        }
    }

    public isLoaded() {
        return this.modelsLoaded;
    }

    /**
     * Loads profile pictures for all nodes and computes face descriptors.
     * This can be slow, so call it sparingly or in background.
     */
    public async indexFaces(nodes: Record<string, PersonNode>) {
        if (!this.modelsLoaded) await this.loadModels();

        const labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];
        const nodesList = Object.values(nodes).filter(n => n.imageUrl);

        console.log(`Indexing ${nodesList.length} faces...`);

        for (const node of nodesList) {
            if (!node.imageUrl) continue;
            const url = getPhotoUrl(node.imageUrl);
            if (!url) continue;

            try {
                // Fetch image directly to avoid CORS issues if possible, 
                // but face-api needs an Image object or Blob.
                // If getPhotoUrl returns a drive thumbnail, it might have CORS issues.
                // We typically need to proxy or use `crossOrigin = "anonymous"`.
                const img = await faceapi.fetchImage(url);
                const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

                if (detections) {
                    labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(node.nodeId, [detections.descriptor]));
                }
            } catch (err) {
                console.warn(`Failed to process face for ${node.name} (${node.nodeId})`, err);
            }
        }

        if (labeledDescriptors.length > 0) {
            this.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
            console.log(`Indexed ${labeledDescriptors.length} faces.`);
        } else {
            console.warn("No faces indexed.");
        }
    }

    /**
     * Matches a face from a video element or image element.
     */
    public async recognizeFace(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<{ nodeId: string; distance: number; name?: string } | null> {
        if (!this.modelsLoaded || !this.faceMatcher) {
            console.warn("Models not loaded or no faces indexed");
            return null;
        }

        try {
            const detection = await faceapi.detectSingleFace(input).withFaceLandmarks().withFaceDescriptor();
            if (detection) {
                const bestMatch = this.faceMatcher.findBestMatch(detection.descriptor);
                if (bestMatch.label !== 'unknown') {
                    return { nodeId: bestMatch.label, distance: bestMatch.distance };
                }
            }
            return null;
        } catch (e) {
            console.error("Recognition failed", e);
            return null;
        }
    }
}
