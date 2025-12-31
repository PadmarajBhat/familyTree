import { useState, useEffect } from 'react';
import { type SearchResult } from '../../../services/GlobalTreeService';

interface UsePeopleSearchProps {
    initialValue?: string;
    onSearch: (term: string) => SearchResult[];
    disabled?: boolean;
}

export const usePeopleSearch = ({ initialValue = '', onSearch, disabled }: UsePeopleSearchProps) => {
    const [searchText, setSearchText] = useState(initialValue);
    const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (disabled) return;

            if (searchText && searchText.length > 2) {
                const results = onSearch(searchText);
                // We assume the caller handles filtering of results (e.g. self-filtering) 
                // inside the onSearch callback or we filter here if passed a raw list?
                // The original code did `GlobalTreeService.searchAllTrees` then `.filter`.
                // It's better if `onSearch` returns the filtered list.
                setSuggestions(results);
                if (results.length > 0) {
                    setShowSuggestions(true);
                } else {
                    setShowSuggestions(false);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText, disabled, onSearch]);

    return {
        searchText, setSearchText,
        suggestions, setSuggestions,
        showSuggestions, setShowSuggestions
    };
};
