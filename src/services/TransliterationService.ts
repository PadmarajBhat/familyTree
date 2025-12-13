import Sanscript from '@indic-transliteration/sanscript';

const GOOGLE_INPUT_TOOLS_URL = "https://inputtools.google.com/request";

const LANG_CODE_MAP: Record<string, string> = {
    ta: 'ta-t-i0-und',
    ml: 'ml-t-i0-und',
    hi: 'hi-t-i0-und',
    kn: 'kn-t-i0-und'
};

const SANSCRIPT_SCHEME_MAP: Record<string, string> = {
    ta: 'tamil',
    ml: 'malayalam',
    hi: 'devanagari',
    kn: 'kannada'
};

function getScript(text: string): 'ta' | 'ml' | 'hi' | 'kn' | 'en' | null {
    // Basic Unicode range detection
    for (const char of text) {
        const code = char.charCodeAt(0);
        if (code >= 0x0B80 && code <= 0x0BFF) return 'ta';
        if (code >= 0x0D00 && code <= 0x0D7F) return 'ml';
        if (code >= 0x0900 && code <= 0x097F) return 'hi';
        if (code >= 0x0C80 && code <= 0x0CFF) return 'kn';
    }
    // If predominantly ASCII range, assume EN
    if (/^[a-zA-Z\s.]+$/.test(text)) return 'en';
    return null; // Mixed or other
}

async function transliterateToIndic(englishText: string, targetLang: string): Promise<string> {
    const itc = LANG_CODE_MAP[targetLang];
    if (!itc) return englishText;

    try {
        const url = `${GOOGLE_INPUT_TOOLS_URL}?text=${encodeURIComponent(englishText)}&itc=${itc}&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        if (data && data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1]) {
            return data[1][0][1][0] || englishText;
        }
    } catch (error) {
        console.warn(`Transliteration failed for ${targetLang}:`, error);
    }
    return englishText;
}

export async function generateAllTranslations(name: string): Promise<Record<string, string>> {
    if (!name || !name.trim()) return {};

    const detectedScript = getScript(name);
    let englishName = name;

    // If input is NOT English, first convert to English (Pivot)
    if (detectedScript && detectedScript !== 'en') {
        const sourceScheme = SANSCRIPT_SCHEME_MAP[detectedScript];
        if (sourceScheme) {
            // Convert to ITRANS (Phonetic Roman) which is generally good for standard names
            // or 'itrans' / 'hk'. Let's try 'itrans'.
            try {
                // @ts-ignore
                englishName = Sanscript.t(name, sourceScheme, 'itrans');
                // Basic cleanup: ITRANS might produce Proper Names with capitalization logic?
                // Actually Sanscript output is often lower/mixed. 
                // Google Input Tools handles case-insensitive mostly but prefers lowercase?
                // Let's capitalize first letter for neatness if we use it, 
                // but for feeding Google, raw is fine.
                console.log(`Pivoted ${name} (${detectedScript}) to English(ITRANS): ${englishName}`);
            } catch (e) {
                console.warn("Sanscript conversion failed", e);
                // Fallback: If we can't pivot, we can't generate others easily
                // return what we have? 
                // We'll proceed with original name, maybe Google handles it? Unlikely.
            }
        }
    }

    const targets = ['ta', 'ml', 'hi', 'kn'];
    const results: Record<string, string> = { en: englishName }; // Always store approximate English if pivoted? 
    // Actually, we shouldn't overwrite 'en' if the user didn't ask for it, 
    // but the caller expects a map to merge. 
    // If the input was already English, results['en'] is just name.

    // Transliterate to all targets
    await Promise.all(targets.map(async (lang) => {
        if (lang === detectedScript) {
            results[lang] = name; // Orig
        } else {
            results[lang] = await transliterateToIndic(englishName, lang);
        }
    }));

    // Return map
    return results;
}
