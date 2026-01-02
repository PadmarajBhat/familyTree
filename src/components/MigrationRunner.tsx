
import React, { useEffect, useState } from 'react';
import { migrateTreeToSheets } from '../services/drive/sheets/tree/save';

const MIGRATION_KEY = 'migration_FT_Sample_2025_12_30_done';

export const MigrationRunner: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const runMigration = async () => {
            if (localStorage.getItem(MIGRATION_KEY) === 'true') {
                return; // Already done
            }

            setStatus('running');
            setMessage('Starting migration...');

            try {
                // Dynamic import of the JSON asset
                const treeDataModule = await import('../assets/temp_tree.json');
                const treeData = treeDataModule.default || treeDataModule;

                setMessage(`Loaded JSON. Migrating "${treeData.treeName}" to Sheets...`);

                // Ensure gapi is ready (it should be if App mounts this, 
                // but let's be safe or just rely on the drive service handles)
                // Actually migrateTreeToSheets handles getOrCreateSpreadsheet.

                const success = await migrateTreeToSheets(treeData as any); // Cast to TreeDocument

                if (success) {
                    localStorage.setItem(MIGRATION_KEY, 'true');
                    setStatus('success');
                    setMessage('Migration successful! You can now delete "src/assets/temp_tree.json".');
                } else {
                    setStatus('error');
                    setMessage('Migration failed. Check console logs.');
                }
            } catch (err: any) {
                console.error("Migration Runner Error:", err);
                setStatus('error');
                setMessage(`Error: ${err.message || 'Unknown error'}`);
            }
        };

        // Delay slightly to allow auth/gapi to be ready if needed, 
        // though migrateTreeToSheets should handle auth checks or fail.
        // Better to wait for a user action? 
        // User requested AUTO run if file exists.
        // We'll rely on the parent App to mount us only when ready or just try.
        // If auth fails, it might fail.

        // Let's add a small check or just run it.
        // Since it's mounted in App, if App is signed in, we are good.
        // The App component renders content only if signed in (mostly).
        // We will mount this inside AppContent or just below AppHeader.

        const timer = setTimeout(() => {
            runMigration();
        }, 2000); // 2 second delay to let GAPI settle

        return () => clearTimeout(timer);
    }, []);

    if (localStorage.getItem(MIGRATION_KEY) === 'true' && status === 'idle') return null;

    return (
        <div style={{
            padding: '10px',
            background: status === 'success' ? '#e6fffa' : status === 'error' ? '#ffe6e6' : '#ebf8ff',
            borderBottom: '1px solid #ccc',
            textAlign: 'center',
            fontSize: '14px'
        }}>
            <strong>Migration Status:</strong> {message}
            {status === 'running' && ' (Please wait...)'}
        </div>
    );
};
