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
     * 🔐 Get JWT token from localStorage (injected by Flutter)
     */
    getAuthToken() {
        const token = localStorage.getItem('jwt_token') || localStorage.getItem('access_token');
        if (token) {
            this.logger.log('🔐 Using JWT token from localStorage');
        }
        return token;
    }

    /**
     * Fetch with timeout and retry logic
     */
    async fetchWithRetry(url, options = {}, requestConfig = {}) {
        let lastError;
        const retryAttempts = requestConfig.retryAttempts || this.RETRY_ATTEMPTS;
        const retryDelayMs = requestConfig.retryDelayMs || this.RETRY_DELAY_MS;
        const timeoutMs = requestConfig.timeoutMs || this.TIMEOUT_MS;
        const requestLabel = requestConfig.label || 'request';
        
        // 🔐 Add JWT token to headers if available
        const headers = options.headers || {};
        const token = this.getAuthToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            let timeoutId;
            try {
                const controller = new AbortController();
                timeoutId = setTimeout(() => {
                    controller.abort(`Request timeout after ${timeoutMs}ms`);
                }, timeoutMs);
                
                const response = await fetch(url, {
                    ...options,
                    headers,
                    signal: controller.signal
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                }
                
                return await response.json();
            } catch (error) {
                lastError = this.normalizeFetchError(error, timeoutMs, requestLabel);
                this.logger.warn(`🔄 Attempt ${attempt}/${retryAttempts} failed:`, lastError.message);
                
                if (attempt < retryAttempts) {
                    const delay = retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }
        
        throw new Error(`Failed after ${retryAttempts} attempts: ${lastError?.message}`);
    }

    normalizeFetchError(error, timeoutMs, requestLabel) {
        const message = String(error?.message || error || '').trim();
        const isAbort = error?.name === 'AbortError' || message.toLowerCase().includes('aborted');

        if (isAbort) {
            return new Error(`${requestLabel} timed out after ${timeoutMs}ms`);
        }

        return error instanceof Error ? error : new Error(message || `Unknown ${requestLabel} error`);
    }

    /**
     * Load quiz structure from Supabase - FALLBACK method
     */
    async loadQuizStructureFromSupabase() {
        try {
            this.logger.log('📥 Loading quiz structure from Supabase (FALLBACK)...');
            
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
            const enrichedQuestions = this.dedupeQuestionsByCode(
                this.mergeOptionsIntoQuestions(questions, options),
                'Supabase fallback quiz structure'
            );
            
            this.logger.log(`✅ Loaded ${enrichedQuestions.length} questions from Supabase`);
            return enrichedQuestions;
        } catch (error) {
            this.logger.error('❌ Failed to load quiz structure from Supabase:', error);
            throw error;
        }
    }

    /**
     * Load quiz structure from PROA dynamic endpoint (NEW - with fallback)
     */
    async loadQuizStructure() {
        try {
            this.logger.info('📥 Loading quiz structure from PROA dynamic endpoint...');
            
            // Get user type from sessionStorage (set after login)
            const userType = sessionStorage.getItem('user-role') || 'all';
            this.logger.log(`🎯 User type: ${userType}`);
            
            // 🎯 NEW: Try dynamic endpoint first
            const dynamicUrl = `${this.PROA_URL}/orientation/questions/dynamic?user_type=${userType}&count_per_dimension=2`;
            this.logger.log(`🔗 Fetching: ${dynamicUrl}`);
            
            try {
                const data = await this.fetchWithRetry(dynamicUrl, {}, {
                    label: 'dynamic quiz fetch'
                });
                
                if (!data.success || !data.questions) {
                    throw new Error('Invalid response from PROA /questions/dynamic');
                }
                
                const questions = data.questions;
                
                // Format questions to match expected structure
                const formattedQuestions = this.dedupeQuestionsByCode(questions.map(q => ({
                    code: q.question_code,
                    text: q.question_text,
                    type: q.question_type,
                    dimension: q.dimension,
                    difficulty: q.difficulty,
                    options: this.normalizeQuestionOptions(
                        q.options || this.getDefaultOptions(q.question_type),
                        q.question_type
                    )
                })), 'PROA dynamic quiz structure');
                data.dimension_coverage = data.dimension_coverage || this.buildDimensionCoverage(formattedQuestions);
                data.coverage = typeof data.coverage === 'number'
                    ? data.coverage
                    : (formattedQuestions.length > 0 ? 1 : 0);
                
                this.logger.info(`✅ Loaded ${formattedQuestions.length} dynamic questions from PROA`);
                this.logger.log(`📊 Coverage: ${JSON.stringify(data.dimension_coverage)}`);
                return formattedQuestions;
                
            } catch (dynamicError) {
                this.logger.warn('⚠️ Failed to load from PROA dynamic endpoint, falling back to Supabase:', dynamicError?.message);
                // Fallback vers Supabase
                return this.loadQuizStructureFromSupabase();
            }
            
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
            options: this.normalizeQuestionOptions(
                (optionsByQuestion[q.id] || this.getDefaultOptions(q.question_type))
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(({ order, ...option }) => option),
                q.question_type
            )
        }));
    }

    normalizeQuestionOptions(options = [], questionType = 'choice') {
        return (options || []).map(option => {
            const rawValue = option?.value ?? option?.option_value ?? option?.v ?? option;
            const text = option?.text ?? option?.option_text ?? option?.label ?? String(rawValue);

            return {
                ...option,
                text,
                value: this.normalizeQuestionOptionValue(rawValue, questionType)
            };
        });
    }

    normalizeQuestionOptionValue(value, questionType) {
        if (typeof value === 'string') {
            const trimmed = value.trim();

            if (['likert', 'boolean', 'choice', 'single_choice', 'scale'].includes(questionType) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
                return Number(trimmed);
            }

            return trimmed;
        }

        return value;
    }

    dedupeQuestionsByCode(questions = [], source = 'quiz structure') {
        const uniqueQuestions = [];
        const seenCodes = new Set();

        questions.forEach(question => {
            const code = String(question?.code || question?.question_code || '').trim().toLowerCase();
            if (!code) {
                uniqueQuestions.push(question);
                return;
            }

            if (seenCodes.has(code)) {
                this.logger.warn(`âš ï¸ Duplicate question code filtered from ${source}: ${code}`);
                return;
            }

            seenCodes.add(code);
            uniqueQuestions.push(question);
        });

        return uniqueQuestions;
    }

    buildDimensionCoverage(questions = []) {
        return questions.reduce((coverage, question) => {
            const dimension = question?.dimension || 'general';
            coverage[dimension] = (coverage[dimension] || 0) + 1;
            return coverage;
        }, {});
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
                },
                {
                    label: 'PROA compute'
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
        // 🔧 Define endpoint outside try block so it's accessible in catch
        const endpoint = type === 'universites' ? 'universites' : 'centres';
        
        try {
            this.logger.log(`🏆 Calling PORA service (${endpoint}):`, payload);
            
            const result = await this.fetchWithRetry(
                `${this.PORA_URL}/recommendations/${endpoint}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                },
                {
                    label: `PORA ${endpoint}`,
                    timeoutMs: Math.max(this.TIMEOUT_MS * 2, 20000),
                    retryAttempts: Math.max(2, this.RETRY_ATTEMPTS - 1),
                }
            );
            
            this.logger.log(`✅ PORA response (${endpoint}):`, result);
            return result;
        } catch (error) {
            this.logger.error(`❌ PORA call (${endpoint}) failed:`, error);
            // Return empty result instead of throwing to allow graceful degradation
            return endpoint === 'centres'
                ? { centres: [], centreFilieres: [] }
                : { universites: [] };
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

    async strictFilterPoraRecommendations(type, recommendations = [], recommendedFields = []) {
        if (!Array.isArray(recommendations) || recommendations.length === 0) {
            return [];
        }

        if (!this.supabase) {
            this.logger.warn(`⚠️ Supabase unavailable: strict filtering skipped for ${type}`);
            return [];
        }

        const uniqueRecommendedFields = this.getUniqueRecommendedFields(recommendedFields);
        if (uniqueRecommendedFields.length === 0) {
            this.logger.warn(`⚠️ No recommended fields provided for strict filtering (${type})`);
            return [];
        }

        const entityIds = this.extractRecommendationIds(recommendations, type);
        if (entityIds.length === 0) {
            this.logger.warn(`⚠️ No candidate ids found for strict filtering (${type})`);
            return [];
        }

        const filieresByEntity = type === 'universites'
            ? await this.fetchUniversityFilieresByIds(entityIds)
            : await this.fetchCentreFilieresByIds(entityIds);

        const enriched = recommendations
            .map(item => this.enrichStrictRecommendationItem(item, type, uniqueRecommendedFields, filieresByEntity))
            .filter(item => item && item.matching_fields_count > 0)
            .sort((a, b) => {
                const scoreDelta = (b.matching_fields_count || 0) - (a.matching_fields_count || 0);
                if (scoreDelta !== 0) return scoreDelta;
                return (b.score ?? b.pora_score ?? 0) - (a.score ?? a.pora_score ?? 0);
            });

        this.logger.log(`✅ Strictly filtered ${type}: ${enriched.length}/${recommendations.length} kept`);
        return enriched;
    }

    extractRecommendationIds(recommendations = [], type = 'universites') {
        const idKeys = type === 'universites'
            ? ['target_id', 'universite_id', 'id']
            : ['target_id', 'centre_formation_id', 'id'];

        const ids = recommendations
            .map(item => {
                for (const key of idKeys) {
                    const value = item?.[key];
                    if (value !== undefined && value !== null && value !== '') {
                        return value;
                    }
                }
                return null;
            })
            .filter(value => value !== null);

        return [...new Set(ids)];
    }

    async fetchUniversityFilieresByIds(universityIds = []) {
        try {
            if (!universityIds.length) return {};

            const { data, error } = await this.supabase
                .from('universite_filieres')
                .select(`
                    universite_id,
                    filieres(id, nom, description)
                `)
                .in('universite_id', universityIds);

            if (error) throw error;

            return (data || []).reduce((acc, rel) => {
                const entityId = rel.universite_id;
                const fieldName = rel.filieres?.nom;
                if (!entityId || !fieldName) return acc;
                if (!acc[entityId]) acc[entityId] = [];
                acc[entityId].push(fieldName);
                return acc;
            }, {});
        } catch (error) {
            this.logger.error('❌ Failed to fetch strict university filieres:', error);
            return {};
        }
    }

    async fetchCentreFilieresByIds(centreIds = []) {
        try {
            if (!centreIds.length) return {};

            const { data, error } = await this.supabase
                .from('centre_formation_filieres')
                .select(`
                    centre_formation_id,
                    filiere:filieres_centre!centre_formation_filieres_filiere_id_fkey(
                        id,
                        nom,
                        description
                    )
                `)
                .in('centre_formation_id', centreIds);

            if (error) throw error;

            return (data || []).reduce((acc, rel) => {
                const entityId = rel.centre_formation_id;
                const fieldName = rel.filiere?.nom;
                if (!entityId || !fieldName) return acc;
                if (!acc[entityId]) acc[entityId] = [];
                acc[entityId].push(fieldName);
                return acc;
            }, {});
        } catch (error) {
            this.logger.error('❌ Failed to fetch strict centre filieres:', error);
            return {};
        }
    }

    enrichStrictRecommendationItem(item, type, recommendedFields = [], filieresByEntity = {}) {
        const entityId = this.extractRecommendationIds([item], type)[0];
        if (entityId === undefined || entityId === null) {
            return null;
        }

        const realFields = this.dedupeFieldNames(filieresByEntity[entityId] || []);
        const matchedFields = this.findMatchedFields(realFields, recommendedFields);
        const totalRecommendedFields = recommendedFields.length;

        return {
            ...item,
            real_fields: realFields,
            matched_fields: matchedFields,
            other_fields: realFields.filter(field => !matchedFields.includes(field)),
            matching_fields_count: matchedFields.length,
            total_recommended_fields: totalRecommendedFields,
            compatibility_score: totalRecommendedFields > 0 ? matchedFields.length / totalRecommendedFields : 0
        };
    }

    getUniqueRecommendedFields(recommendedFields = []) {
        const unique = [];
        const seen = new Set();

        recommendedFields.forEach(field => {
            const trimmed = String(field || '').trim();
            const canonical = this.toCanonicalFieldSignature(trimmed);
            if (!trimmed || !canonical || seen.has(canonical)) return;
            seen.add(canonical);
            unique.push(trimmed);
        });

        return unique;
    }

    dedupeFieldNames(fields = []) {
        const unique = [];
        const seen = new Set();

        fields.forEach(field => {
            const trimmed = String(field || '').trim();
            const canonical = this.toCanonicalFieldSignature(trimmed);
            if (!trimmed || !canonical || seen.has(canonical)) return;
            seen.add(canonical);
            unique.push(trimmed);
        });

        return unique;
    }

    findMatchedFields(realFields = [], recommendedFields = []) {
        const matched = [];
        const seen = new Set();

        realFields.forEach(realField => {
            const match = this.matchRealFieldToRecommendation(realField, recommendedFields);
            const canonical = this.toCanonicalFieldSignature(realField);
            if (!match || !canonical || seen.has(canonical)) return;
            seen.add(canonical);
            matched.push(realField);
        });

        return matched;
    }

    matchRealFieldToRecommendation(realField, recommendedFields = []) {
        const realNormalized = this.normalizeText(realField);
        const realCanonical = this.toCanonicalFieldSignature(realField);
        if (!realNormalized || !realCanonical) return false;

        return recommendedFields.some(field => {
            const keywords = this.getFieldKeywords(field);
            const candidates = [field, ...keywords];

            return candidates.some(candidate => {
                const candidateNormalized = this.normalizeText(candidate);
                const candidateCanonical = this.toCanonicalFieldSignature(candidate);

                if (!candidateNormalized || !candidateCanonical) return false;
                if (realCanonical === candidateCanonical) return true;
                if (realNormalized.includes(candidateNormalized) || candidateNormalized.includes(realNormalized)) {
                    return candidateNormalized.length >= 6 && realNormalized.length >= 6;
                }

                return false;
            });
        });
    }

    toCanonicalFieldSignature(text) {
        const stopWords = new Set(['et', 'de', 'des', 'du', 'la', 'le', 'les', 'd', 'en', 'au', 'aux']);

        return this.normalizeText(text)
            .split(' ')
            .map(token => token.trim())
            .filter(token => token && !stopWords.has(token))
            .map(token => {
                if (token.length > 4 && token.endsWith('s')) {
                    return token.slice(0, -1);
                }
                return token;
            })
            .sort()
            .join(' ');
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
    getCachedResults(userId, answers = null) {
        try {
            const cached = localStorage.getItem(`proa-result-${userId}`);
            if (!cached) return null;

            const parsed = JSON.parse(cached);
            if (!answers) return parsed;

            const fingerprint = this.buildAnswersFingerprint(answers);
            if (parsed?.answers_fingerprint && parsed.answers_fingerprint === fingerprint) {
                return parsed;
            }

            return null;
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
            const fingerprint = this.buildAnswersFingerprint(results?.answers || {});
            localStorage.setItem(`proa-result-${userId}`, JSON.stringify({
                ...results,
                answers_fingerprint: fingerprint,
                timestamp: Date.now()
            }));
            this.logger.log('💾 Results cached');
        } catch (error) {
            this.logger.warn('⚠️ Failed to cache results:', error);
        }
    }

    /**
     * Build a stable fingerprint for answers to avoid stale cache reuse.
     */
    buildAnswersFingerprint(answers = {}) {
        const entries = Object.entries(answers)
            .map(([key, value]) => [String(key), value])
            .sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify(entries);
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
