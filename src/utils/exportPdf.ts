import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { PersonNode } from '../logic/types';
import { getPhotoUrl } from '../services/drive';

/**
 * Exports the person detail information and tree visualization to a PDF file
 * @param node - The person node data to export
 * @param treeElementId - The DOM element ID of the tree container
 */
export async function exportPersonDetailToPdf(
    node: PersonNode,
    treeElementId: string
): Promise<void> {
    try {
        // Create a new PDF document (A4 size)
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pageWidth - (2 * margin);
        let yPosition = margin;

        // --- Font Setup for Kannada ---
        // Try to load NotoSansKannada if available
        try {
            const fontUrl = '/fonts/NotoSansKannada-Regular.ttf';
            const response = await fetch(fontUrl);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                // Convert to base64
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const fontBase64 = window.btoa(binary);

                // Add to VFS and Register
                pdf.addFileToVFS('NotoSansKannada-Regular.ttf', fontBase64);
                pdf.addFont('NotoSansKannada-Regular.ttf', 'NotoSansKannada', 'normal');
                pdf.setFont('NotoSansKannada');
                console.log("Kannada font loaded successfully.");
            } else {
                console.warn("Kannada font not found at /fonts/NotoSansKannada-Regular.ttf. Falling back to Helvetica.");
                pdf.setFont('helvetica', 'bold');
            }
        } catch (fontError) {
            console.warn("Failed to load Kannada font:", fontError);
            pdf.setFont('helvetica', 'bold');
        }

        // --- PAGE 1: Person Details ---

        // Title
        pdf.setFontSize(20);
        // If font is helvetica, bold works. If NotoSans, we registered as 'normal', so bold might simulate or failing?
        // jsPDF might not synthesize bold for custom fonts unless registered.
        // We only registered 'normal'.
        // Let's just set font size and rely on the font set above.
        // But if we fell back to helvetica, we want bold.
        // The try/catch block sets font.

        pdf.text(node.name || 'Unknown', margin, yPosition);
        yPosition += 10;

        // Try to add profile image if available
        if (node.imageUrl) {
            try {
                const imageUrl = getPhotoUrl(node.imageUrl);
                if (imageUrl) {
                    // Create an image element to load it
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = imageUrl;
                    });

                    // Add image to PDF (30mm x 30mm)
                    const imgSize = 30;
                    pdf.addImage(img, 'JPEG', margin, yPosition, imgSize, imgSize);
                    yPosition += imgSize + 5;
                }
            } catch (error) {
                console.warn('Failed to load profile image for PDF:', error);
                // Continue without image
            }
        }

        yPosition += 5;

        // Person Details Section
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Personal Information', margin, yPosition);
        yPosition += 8;

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');

        // Define all fields to show (including empty ones)
        const fields = [
            { label: 'Born', value: node.dob || '—' },
            { label: 'Died', value: node.dod || '—' },
            { label: 'Phone', value: node.phone || '—' },
            { label: 'Email', value: node.email || '—' },
            { label: 'Address', value: node.address.freeform || '—' }
        ];

        // Render each field
        for (const field of fields) {
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${field.label}:`, margin, yPosition);
            pdf.setFont('helvetica', 'normal');

            // Handle long text wrapping
            const labelWidth = 30;
            const valueLines = pdf.splitTextToSize(field.value, contentWidth - labelWidth);
            pdf.text(valueLines, margin + labelWidth, yPosition);

            yPosition += 6 * valueLines.length;

            // Check if we need a new page
            if (yPosition > pageHeight - margin) {
                pdf.addPage();
                yPosition = margin;
            }
        }

        // --- PAGE 2+: Tree Visualization ---

        const treeElement = document.getElementById(treeElementId);
        if (treeElement) {
            // Add a new page for the tree
            pdf.addPage();
            yPosition = margin;

            // Add tree section title
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Family Tree', margin, yPosition);
            yPosition += 10;

            // Capture the tree using html2canvas
            // We capture the full scrollable content
            const canvas = await html2canvas(treeElement, {
                scale: 2, // Higher quality
                useCORS: true,
                logging: false,
                scrollY: -window.scrollY,
                scrollX: -window.scrollX,
                windowWidth: treeElement.scrollWidth,
                windowHeight: treeElement.scrollHeight,
                width: treeElement.scrollWidth,
                height: treeElement.scrollHeight
            });

            // Calculate dimensions
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = contentWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const availableHeight = pageHeight - yPosition - margin;

            // If the image fits on one page
            if (imgHeight <= availableHeight) {
                pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
            } else {
                // Split across multiple pages
                let remainingHeight = imgHeight;
                let sourceY = 0;

                while (remainingHeight > 0) {
                    const heightToAdd = Math.min(availableHeight, remainingHeight);
                    const sourceHeight = (heightToAdd / imgWidth) * canvas.width;

                    // Create a temporary canvas for this slice
                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = canvas.width;
                    sliceCanvas.height = sourceHeight;
                    const sliceCtx = sliceCanvas.getContext('2d');

                    if (sliceCtx) {
                        sliceCtx.drawImage(
                            canvas,
                            0, sourceY,
                            canvas.width, sourceHeight,
                            0, 0,
                            canvas.width, sourceHeight
                        );

                        const sliceData = sliceCanvas.toDataURL('image/png');
                        pdf.addImage(sliceData, 'PNG', margin, yPosition, imgWidth, heightToAdd);
                    }

                    sourceY += sourceHeight;
                    remainingHeight -= heightToAdd;

                    if (remainingHeight > 0) {
                        pdf.addPage();
                        yPosition = margin;
                    }
                }
            }
        }

        // Save the PDF
        const fileName = `${node.name || 'Unknown'}-FamilyTree.pdf`;
        pdf.save(fileName);

    } catch (error) {
        console.error('Error generating PDF:', error);
        if (error instanceof Error) {
            console.error('Error details:', error.message, error.stack);
        }
        throw new Error('Failed to generate PDF. Please try again.');
    }
}
