import { useTranslation } from 'react-i18next';
import './LanguageSelector.css'; // We'll create a simple CSS or inline styles

interface LanguageSelectorProps {
    onLanguageChange?: (lang: string) => void;
}

export const LanguageSelector = ({ onLanguageChange }: LanguageSelectorProps) => {
    const { i18n } = useTranslation();

    const languages = [
        { code: 'en', label: 'English' },
        { code: 'kn', label: 'ಕನ್ನಡ' }, // Kannada
        { code: 'ta', label: 'தமிழ்' }, // Tamil
        { code: 'ml', label: 'മലയാളം' }, // Malayalam
        { code: 'hi', label: 'हिन्दी' }   // Hindi
    ];

    const handleChange = (lng: string) => {
        i18n.changeLanguage(lng);
        if (onLanguageChange) {
            onLanguageChange(lng);
        }
    };

    // Sync with prop if provided (for initial load)
    // Actually, i18n is the source of truth for the UI, but the prop is for persistence.
    // We can rely on i18n.language for the value, but prefer the prop if we want to force it.

    return (
        <select
            className="language-selector"
            value={i18n.language}
            onChange={(e) => handleChange(e.target.value)}
            style={{
                marginLeft: '10px',
                padding: '5px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                color: '#333',
                cursor: 'pointer'
            }}
        >
            {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                    {lang.label}
                </option>
            ))}
        </select>
    );
};
