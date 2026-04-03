/**
 * API Service Module
 * Centralizes all API calls: Supabase, PROA, PORA
 * Features: Error handling, retry logic, timeouts, logging
 */

class APIService {
    constructor(config = {}) {
        this.PROA_URL = config.PROA_URL || 'https://universearch-proa-service.onrender.com';
        this.PORA_URL = config.PORA_URL || 'https://universearch-pora-service.onrender.com';
        this.TIMEOUT_MS = config.TIMEOUT_MS || 10000;
        this.RETRY_ATTEMPTS = config.RETRY_ATTEMPTS || 3;
        this.RETRY_DELAY_MS = config.RETRY_DELAY_MS || 1000;
        
        // Initialize Supabase - credentials MUST come from config (never hardcode!)
        if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
            this.supabase = window.supabase?.createClient(
                config.SUPABASE_URL,
                config.SUPABASE_ANON_KEY
            );
        } else {
            this.supabase = null;
            console.warn('⚠️ WARNING: Supabase credentials not configured. Database features will not work.');
        }
        
        this.logger = config.logger || console;
    }

    /**
     * Fetch with timeout and retry logic
     */
    async fetchWithRetry(url, options = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.RETRY_ATTEMPTS; attempt++) {
            let timeout;
            try {
                const controller = new AbortController();
                timeout = setTimeout(() => controller.abort('Request timeout'), this.TIMEOUT_MS);
                
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                }
                
                return await response.json();
            } catch (error) {
                const isAbort =
                    error?.name === 'AbortError' ||
                    error?.message?.includes('aborted') ||
                    error?.message?.includes('timeout');

                lastError = isAbort
                    ? new Error(`Request timed out after ${this.TIMEOUT_MS}ms`)
                    : error;

                this.logger.warn(`🔄 Attempt ${attempt}/${this.RETRY_ATTEMPTS} failed:`, error.message);
                
                if (attempt < this.RETRY_ATTEMPTS) {
                    const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } finally {
                if (timeout) clearTimeout(timeout);
            }
        }
        
        throw new Error(`Failed after ${this.RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
    }

    /**
     * Load quiz structure from Supabase
     */
    async loadQuizStructure() {
        try {
            this.logger.log('📥 Loading quiz structure...');
            
            // Fetch questions
            const { data: questions, error: qError } = await this.supabase
                .from('orientation_quiz_questions')
                .select('*')
                .order('order_index', { ascending: true });
            
            if (qError) throw qError;
            
            // Fetch options (CRITICAL for dynamic loading)
            const { data: options, error: oError } = await this.supabase
                .from('orientation_quiz_options')
                .select('*')
                .order('option_order', { ascending: true });
            
            if (oError) throw oError;
            
            // Merge options into questions
            const enrichedQuestions = this.mergeOptionsIntoQuestions(questions, options);
            
            this.logger.log(`✅ Loaded ${enrichedQuestions.length} questions with dynamic options`);
            return enrichedQuestions;
        } catch (error) {
            this.logger.error('❌ Failed to load quiz structure:', error);
            throw error;
        }
    }

    /**
     * Merge quiz options into questions
     */
    mergeOptionsIntoQuestions(questions, options) {
        const optionsByQuestion = {};
        
        // Group options by question_id to match the DB relation
        options.forEach(opt => {
            if (!optionsByQuestion[opt.question_id]) {
                optionsByQuestion[opt.question_id] = [];
            }
            optionsByQuestion[opt.question_id].push({
                text: opt.option_text,
                value: opt.option_value,
                order: opt.option_order
            });
        });
        
        // Map options into questions
        return questions.map(q => ({
            code: q.question_code,
            text: q.question_text,
            type: q.question_type,
            options: (optionsByQuestion[q.id] || this.getDefaultOptions(q.question_type))
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(({ order, ...option }) => option)
        }));
    }

    /**
     * Fallback options if DB is missing
     */
    getDefaultOptions(type) {
        const defaults = {
            likert: [
                { text: 'Pas du tout d\'accord', value: 1 },
                { text: 'Plutôt pas d\'accord', value: 2 },
                { text: 'Plutôt d\'accord', value: 3 },
                { text: 'Tout à fait d\'accord', value: 4 }
            ],
            boolean: [
                { text: 'Oui', value: 1 },
                { text: 'Non', value: 4 }
            ],
            choice: [
                { text: 'Option 1', value: 1 },
                { text: 'Option 2', value: 2 },
                { text: 'Option 3', value: 3 }
            ]
        };
        return defaults[type] || defaults.choice;
    }

    /**
     * Call PROA service for field recommendations
     */
    async callProaService(payload) {
        try {
            this.logger.log('🔥 Calling PROA service:', payload);
            
            const result = await this.fetchWithRetry(
                `${this.PROA_URL}/orientation/compute`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );
            
            this.logger.log('✅ PROA response:', result);
            return result;
        } catch (error) {
            this.logger.error('❌ PROA call failed:', error);
            throw error;
        }
    }

    /**
     * Call PORA service for university/centre rankings
     */
    async callPoraService(type, payload) {
        const endpoint = type === 'universities' ? 'universites' : 'centres';
        try {
            this.logger.log(`🏆 Calling PORA service (${endpoint}):`, payload);
            
            const result = await this.fetchWithRetry(
                `${this.PORA_URL}/recommendations/${endpoint}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );
            
            this.logger.log(`✅ PORA response (${endpoint}):`, result);
            return result;
        } catch (error) {
            this.logger.error(`❌ PORA call (${endpoint}) failed:`, error);
            // Return empty result instead of throwing to allow graceful degradation
            return endpoint === 'universites' ? { universites: [] } : { centres: [] };
        }
    }

    /**
     * Fetch university details with names (not just IDs)
     */
    async fetchUniversityDetails(universityIds = []) {
        try {
            if (!universityIds || universityIds.length === 0) return [];
            
            this.logger.log('🏫 Fetching university details for:', universityIds);
            
            const { data, error } = await this.supabase
                .from('universites')
                .select('id, nom')
                .in('id', universityIds);
            
            if (error) throw error;
            
            this.logger.log('✅ University details:', data);
            return data || [];
        } catch (error) {
            this.logger.error('❌ Failed to fetch university details:', error);
            return [];
        }
    }

    /**
     * Fetch centre details with names
     */
    async fetchCentreDetails(centreIds = []) {
        try {
            if (!centreIds || centreIds.length === 0) return [];
            
            this.logger.log('🏢 Fetching centre details for:', centreIds);
            
            const { data, error } = await this.supabase
                .from('centres_formation')
                .select('id, nom')
                .in('id', centreIds);
            
            if (error) throw error;
            
            this.logger.log('✅ Centre details:', data);
            return data || [];
        } catch (error) {
            this.logger.error('❌ Failed to fetch centre details:', error);
            return [];
        }
    }

    /**
     * Fetch filieres for universities with fuzzy matching
     */
    async fetchFilieresForUniversities(recommendedFields, limit = 20) {
        try {
            this.logger.log('📚 Fetching filieres for universities:', recommendedFields);
            
            const { data, error } = await this.supabase
                .from('universite_filieres')
                .select(`
                    id,
                    universite_id,
                    filiere_id,
                    filieres(id, nom, description)
                `)
                .limit(limit);
            
            if (error) throw error;
            
            this.logger.log(`📊 Raw data from DB (${data?.length || 0} rows):`, data);
            
            // Apply fuzzy matching to filter by recommended fields
            const filtered = this.fuzzyFilterFilieres(data, recommendedFields);
            
            this.logger.log(`✅ After fuzzy filter: ${filtered.length} matches`, filtered);
            return filtered;
        } catch (error) {
            this.logger.error('❌ Failed to fetch university filieres:', error);
            return [];
        }
    }

    /**
     * Fetch filieres for centres with fuzzy matching
     */
    async fetchFilieresForCentres(recommendedFields, limit = 20) {
        try {
            this.logger.log('📚 Fetching filieres for centres:', recommendedFields);
            
            const { data, error } = await this.supabase
                .from('centre_formation_filieres')
                .select(`
                    id,
                    centre_formation_id,
                    filiere_id,
                    filiere:filieres_centre!centre_formation_filieres_filiere_id_fkey(
                        id,
                        nom,
                        description
                    )
                `)
                .limit(limit);
            
            if (error) throw error;
            
            this.logger.log(`📊 Raw data from DB (${data?.length || 0} rows):`, data);
            
            const filtered = this.fuzzyFilterFilieres(data, recommendedFields);
            
            this.logger.log(`✅ After fuzzy filter: ${filtered.length} matches`, filtered);
            return filtered;
        } catch (error) {
            this.logger.error('❌ Failed to fetch centre filieres:', error);
            return [];
        }
    }

    /**
     * Normalize text for matching: lowercase, remove accents, remove special chars
     */
    normalizeText(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .normalize('NFD')                           // Decompose accents
            .replace(/[\u0300-\u036f]/g, '')            // Remove diacritical marks
            .replace(/[^a-z0-9\s]/g, '')                // Remove special chars (&, ,, etc)
            .replace(/\s+/g, ' ')                       // Normalize spaces
            .trim();
    }

    /**
     * Get intelligent keywords for semantic matching
     * Maps generic PROA fields to specific filiere keywords
     */
    getFieldKeywords(field) {
        const normalized = this.normalizeText(field);

        // Semantic keyword mappings - PROA field → filiere keywords
        const mappings = {
            // Comptabilité & Gestion
            "comptabilite gestion entreprise": ["comptabilite", "gestion", "finance", "comptable"],
            "comptabilite": ["comptabilite", "gestion", "finance", "comptable"],
            "gestion": ["gestion", "management", "administration"],
            
            // Business & Marketing
            "business trade marketing": ["business", "marketing", "commerce", "vente"],
            "business": ["business", "commerce", "trade"],
            "marketing": ["marketing", "publicite", "communication"],
            "commerce": ["commerce", "vente", "business"],
            
            // Entrepreneuriat & Management
            "entrepreneuriat management projets": ["entrepreneuriat", "management", "projet", "entreprise"],
            "entrepreneuriat": ["entrepreneuriat", "startup", "business"],
            "management": ["management", "administration", "direction"],
            
            // Transport & Logistique
            "transit commerce international": ["logistique", "commerce", "transport", "transit", "international"],
            "logistique": ["logistique", "transport", "commerce"],
            "transport": ["transport", "logistique", "delivery"],
            
            // Informatique & Développement
            "genie logiciel": ["informatique", "logiciel", "developpement", "programmation", "ingenieur"],
            "informatique": ["informatique", "developpement", "programming", "logiciel"],
            "developpement": ["developpement", "programming", "logiciel"],
            "web": ["web", "developpement", "application"],
        };

        // Return mapped keywords or the normalized field itself
        return mappings[normalized] || [normalized];
    }

    /**
     * Fuzzy match filieres against recommended fields with semantic keywords + scoring
     */
    fuzzyFilterFilieres(filieres, recommendedFields) {
        if (!filieres || !recommendedFields) return filieres;
        
        return filieres
            .map(rel => {
                const filiereName = this.normalizeText(rel.filieres?.nom || rel.filiere?.nom || '');
                
                if (!filiereName) return null;
                
                let matchScore = 0;
                
                // Check each recommended field
                for (const field of recommendedFields) {
                    const keywords = this.getFieldKeywords(field);
                    
                    for (const keyword of keywords) {
                        // Exact match = +3 points
                        if (filiereName === keyword) {
                            matchScore += 3;
                        }
                        // Contains match = +2 points
                        else if (filiereName.includes(keyword)) {
                            matchScore += 2;
                        }
                        // Reverse contains = +1 point (keyword includes filiere)
                        else if (keyword.includes(filiereName)) {
                            matchScore += 1;
                        }
                        // Fuzzy match (Levenshtein) = +1 point
                        else if (this.levenshteinDistance(filiereName, keyword) <= 3) {
                            matchScore += 1;
                        }
                    }
                }
                
                // Only return matches with score > 0
                if (matchScore > 0) {
                    return {
                        ...rel,
                        matchScore: matchScore
                    };
                }
                
                return null;
            })
            .filter(item => item !== null)  // Remove non-matches
            .sort((a, b) => b.matchScore - a.matchScore);  // Sort by score DESC
    }

    /**
     * Calculate Levenshtein distance for fuzzy matching
     */
    levenshteinDistance(a, b) {
        const matrix = [];
        
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[b.length][a.length];
    }

    /**
     * Expand common acronyms
     */
    expandAcronym(text) {
        const expansions = {
            'it': 'informatique',
            'si': 'systèmes',
            'ti': 'technologie',
            'ai': 'intelligence',
            'ml': 'machine learning',
            'web': 'développement web',
            'mobile': 'développement mobile'
        };
        return expansions[text] || null;
    }

    /**
     * Get cached results from localStorage
     */
    getCachedResults(userId) {
        try {
            const cached = localStorage.getItem(`proa-result-${userId}`);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            this.logger.warn('⚠️ Failed to get cached results:', error);
            return null;
        }
    }

    /**
     * Cache results to localStorage
     */
    cacheResults(userId, results) {
        try {
            localStorage.setItem(`proa-result-${userId}`, JSON.stringify({
                ...results,
                timestamp: Date.now()
            }));
            this.logger.log('💾 Results cached');
        } catch (error) {
            this.logger.warn('⚠️ Failed to cache results:', error);
        }
    }

    /**
     * Clear cache
     */
    clearCache(userId) {
        try {
            localStorage.removeItem(`proa-result-${userId}`);
            this.logger.log('🗑️ Cache cleared');
        } catch (error) {
            this.logger.warn('⚠️ Failed to clear cache:', error);
        }
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.APIService = APIService;
}
