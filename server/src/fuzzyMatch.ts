/**
 * Fuzzy matching utilities for enhanced symbol search
 */

export interface FuzzyMatch {
    text: string;
    score: number;
    indices: number[]; // Character indices that matched
}

/**
 * Advanced fuzzy matching algorithm with scoring
 * Prioritizes:
 * 1. Exact matches (highest score)
 * 2. Prefix matches
 * 3. Camel case matches
 * 4. Acronym matches
 * 5. Substring matches
 * 6. Character sequence matches with advanced scoring
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
    if (!query || !text) {
        return null;
    }

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Exact match (highest priority)
    if (textLower === queryLower) {
        return {
            text,
            score: 1000,
            indices: Array.from({length: text.length}, (_, i) => i)
        };
    }

    // Prefix match (very high priority)
    if (textLower.startsWith(queryLower)) {
        return {
            text,
            score: 900 + (query.length / text.length) * 50,
            indices: Array.from({length: query.length}, (_, i) => i)
        };
    }

    // Try acronym matching (e.g., "ps" matches "prometheus_service")
    const acronymMatch = matchAcronym(queryLower, text);
    if (acronymMatch) {
        return acronymMatch;
    }

    // Try camel case matching (e.g., "ps" matches "prometheusService")
    const camelCaseMatch = matchCamelCase(queryLower, text);
    if (camelCaseMatch) {
        return camelCaseMatch;
    }

    // Try substring matching
    const substringIndex = textLower.indexOf(queryLower);
    if (substringIndex >= 0) {
        const score = 700 - substringIndex * 10 + (query.length / text.length) * 100;
        return {
            text,
            score,
            indices: Array.from({length: query.length}, (_, i) => substringIndex + i)
        };
    }

    // Try character sequence matching with improved algorithm
    const sequenceMatch = matchCharacterSequenceAdvanced(queryLower, textLower);
    if (sequenceMatch) {
        return {
            text,
            score: sequenceMatch.score,
            indices: sequenceMatch.indices
        };
    }

    return null;
}

/**
 * Match acronym patterns (e.g., "ps" -> "prometheus_service")
 */
function matchAcronym(query: string, text: string): FuzzyMatch | null {
    const words = text.split(/[_.\s]+/).filter(word => word.length > 0);
    const acronym = words.map(word => word[0]).join('').toLowerCase();

    if (acronym.includes(query)) {
        const score = 850 + (query.length / acronym.length) * 30;
        // Find indices in original text
        const indices: number[] = [];
        let queryIndex = 0;

        for (let i = 0; i < text.length && queryIndex < query.length; i++) {
            if (text[i].toLowerCase() === query[queryIndex] &&
                (i === 0 || text[i-1].match(/[_.\s]/))) {
                indices.push(i);
                queryIndex++;
            }
        }

        if (queryIndex === query.length) {
            return {
                text,
                score,
                indices
            };
        }
    }

    return null;
}

/**
 * Match camel case patterns (e.g., "ps" -> "prometheusService")
 */
function matchCamelCase(query: string, text: string): FuzzyMatch | null {
    const upperCaseIndices: number[] = [];
    const lowerCaseText = text.toLowerCase();

    // Find all uppercase letters and word boundaries
    for (let i = 0; i < text.length; i++) {
        if (i === 0 || text[i] !== lowerCaseText[i] ||
            (i > 0 && text[i-1] === '_') ||
            (i > 0 && text[i-1] === '.')) {
            upperCaseIndices.push(i);
        }
    }

    if (upperCaseIndices.length < query.length) {
        return null;
    }

    // Try to match query characters against camel case initials
    let queryIndex = 0;
    const matchIndices: number[] = [];

    for (const charIndex of upperCaseIndices) {
        if (queryIndex >= query.length) break;

        if (lowerCaseText[charIndex] === query[queryIndex]) {
            matchIndices.push(charIndex);
            queryIndex++;
        }
    }

    if (queryIndex === query.length) {
        const score = 800 - (upperCaseIndices.length - query.length) * 5;
        return {
            text,
            score,
            indices: matchIndices
        };
    }

    return null;
}

/**
 * Match character sequence with advanced scoring (e.g., "prom" -> "prometheus_scrape")
 */
function matchCharacterSequenceAdvanced(query: string, textLower: string): { score: number; indices: number[] } | null {
    let queryIndex = 0;
    const indices: number[] = [];
    let lastMatchIndex = -1;
    
    for (let i = 0; i < textLower.length && queryIndex < query.length; i++) {
        if (textLower[i] === query[queryIndex]) {
            indices.push(i);
            
            // Bonus for consecutive characters
            if (lastMatchIndex >= 0 && i === lastMatchIndex + 1) {
                // Consecutive match bonus will be applied in scoring
            }
            
            lastMatchIndex = i;
            queryIndex++;
        }
    }
    
    if (queryIndex === query.length) {
        // Calculate score based on:
        // - Match density (how close together the matches are)
        // - Query coverage
        // - Position of first match
        const spread = indices[indices.length - 1] - indices[0] + 1;
        const density = query.length / spread;
        const coverage = query.length / textLower.length;
        const positionPenalty = indices[0] * 2;
        
        let consecutiveBonus = 0;
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === indices[i-1] + 1) {
                consecutiveBonus += 20;
            }
        }
        
        const score = Math.max(0, 500 + density * 100 + coverage * 100 + consecutiveBonus - positionPenalty);
        
        return {
            score,
            indices
        };
    }
    
    return null;
}

/**
 * Sort fuzzy matches by score (descending) and then by length (ascending)
 */
export function sortFuzzyMatches(matches: FuzzyMatch[]): FuzzyMatch[] {
    return matches.sort((a, b) => {
        if (a.score !== b.score) {
            return b.score - a.score;
        }
        // If scores are equal, prefer shorter strings
        return a.text.length - b.text.length;
    });
}

/**
 * Filter and sort symbols by fuzzy matching with advanced ranking
 */
export function fuzzyFilterSymbols<T extends { name: string; kind?: any; containerName?: string }>(
    query: string,
    symbols: T[],
    maxResults: number = 100
): (T & { fuzzyMatch: FuzzyMatch })[] {
    if (!query.trim()) {
        return symbols.slice(0, maxResults).map(symbol => ({
            ...symbol,
            fuzzyMatch: {
                text: symbol.name,
                score: 0,
                indices: []
            }
        }));
    }

    const matches: (T & { fuzzyMatch: FuzzyMatch; rank: number })[] = [];

    for (const symbol of symbols) {
        const match = fuzzyMatch(query, symbol.name);
        if (match) {
            // Calculate enhanced ranking score
            const rank = calculateSymbolRank(symbol, match, query);
            matches.push({
                ...symbol,
                fuzzyMatch: match,
                rank
            });
        }
    }

    // Sort by enhanced ranking (combines fuzzy score + symbol importance)
    matches.sort((a, b) => {
        if (a.rank !== b.rank) {
            return b.rank - a.rank;
        }
        // Secondary sort by fuzzy score
        if (a.fuzzyMatch.score !== b.fuzzyMatch.score) {
            return b.fuzzyMatch.score - a.fuzzyMatch.score;
        }
        // Tertiary sort by name
        return a.name.localeCompare(b.name);
    });

    return matches.slice(0, maxResults);
}

/**
 * Calculate enhanced ranking score for symbols
 */
function calculateSymbolRank<T extends { name: string; kind?: any; containerName?: string }>(
    symbol: T,
    match: FuzzyMatch,
    query: string
): number {
    let rank = match.score;

    // Boost score based on symbol type importance
    if (symbol.kind) {
        switch (symbol.kind) {
            case 5: // Class (components)
                rank += 50;
                break;
            case 6: // Method (functions)
                rank += 40;
                break;
            case 7: // Property
                rank += 30;
                break;
            case 14: // Variable
                rank += 20;
                break;
        }
    }

    // Boost for exact matches on component types
    if (symbol.name.toLowerCase() === query.toLowerCase()) {
        rank += 100;
    }

    // Boost for matches at word boundaries
    if (symbol.name.match(new RegExp(`\\b${query}`, 'i'))) {
        rank += 25;
    }

    // Boost for shorter names (more specific)
    if (symbol.name.length <= query.length + 5) {
        rank += 20;
    }

    // Boost for symbols without container (top-level)
    if (!symbol.containerName) {
        rank += 15;
    }

    return rank;
}

/**
 * Highlight matched characters in text for display
 */
export function highlightMatches(text: string, indices: number[]): string {
    if (indices.length === 0) {
        return text;
    }
    
    let result = '';
    let lastIndex = 0;
    
    for (const index of indices.sort((a, b) => a - b)) {
        if (index < lastIndex) continue; // Skip duplicates
        
        // Add text before the match
        result += text.substring(lastIndex, index);
        
        // Add the matched character (could be wrapped in markup for highlighting)
        result += text[index];
        
        lastIndex = index + 1;
    }
    
    // Add remaining text
    result += text.substring(lastIndex);
    
    return result;
}