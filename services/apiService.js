/**
 * API Service Module - Version 2.0
 * Centralizes all API calls: Supabase, PROA, PORA
 * Features: Error handling, retry logic, timeouts, logging, caching, offline support
 * 
 * AMÉLIORATIONS V2:
 * - Support bac congolais complet (toutes les séries)
 * - Parallel requests for better performance
 * - WebSocket real-time updates
 * - Performance analytics
 * - Offline support with Service Worker
 * - Better fuzzy matching with ML
 */

class APIService {
    constructor(config = {}) {
        // Configuration
        this.PROA_URL = config.PROA_URL || 'https://universearch-proa-service.onrender.com';
        this.PORA_URL = config.PORA_URL || 'https://universearch-pora-service.onrender.com';
        this.TIMEOUT_MS = config.TIMEOUT_MS || 10000;
        this.RETRY_ATTEMPTS = config.RETRY_ATTEMPTS || 3;
        this.RETRY_DELAY_MS = config.RETRY_DELAY_MS || 1000;
        
        // Cache configuration
        this.CACHE_TTL_MS = config.CACHE_TTL_MS || 5 * 60 * 1000; // 5 minutes
        this.ENABLE_OFFLINE = config.ENABLE_OFFLINE !== false;
        
        // Analytics
        this.performanceMetrics = {
            apiCalls: [],
            averageResponseTime: 0,
            lastCallTimestamp: null
        };
        
        // Initialize Supabase
        if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
            this.supabase = window.supabase?.createClient(
                config.SUPABASE_URL,
                config.SUPABASE_ANON_KEY
            );
            
            // Setup real-time subscriptions if enabled
            if (config.ENABLE_REALTIME) {
                this.setupRealtimeSubscriptions();
            }
        } else {
            this.supabase = null;
            console.warn('⚠️ WARNING: Supabase credentials not configured. Database features will not work.');
        }
        
        // Initialize offline support
        if (this.ENABLE_OFFLINE && 'serviceWorker' in navigator) {
            this.registerServiceWorker();
        }
        
        this.logger = config.logger || console;
        
        // ============================================================
        // BAC CONGOLAIS - MAPPING COMPLET
        // ============================================================
        
        // Mapping complet des séries bac congolais
        this.BAC_MAPPING = {
            // Lettres et Sciences Humaines
            'A': { track: 'humanities', label: 'Lettres, langues et philosophie', boost: 1.10, group: 'humanities' },
            
            // Sciences
            'C': { track: 'science', label: 'Mathématiques et sciences physiques', boost: 1.15, group: 'science' },
            'D': { track: 'science', label: 'Sciences naturelles et biologie', boost: 1.10, group: 'science' },
            'E': { track: 'technical', label: 'Mathématiques techniques et technologie', boost: 1.12, group: 'technical' },
            
            // Filières industrielles
            'F1': { track: 'technical', label: 'Construction mécanique', boost: 1.15, group: 'industrial' },
            'F2': { track: 'technical', label: 'Électronique', boost: 1.15, group: 'industrial' },
            'F3': { track: 'technical', label: 'Électrotechnique', boost: 1.15, group: 'industrial' },
            'F4': { track: 'technical', label: 'Génie civil et bâtiment', boost: 1.12, group: 'industrial' },
            
            // Filières tertiaires - Informatique
            'H1': { track: 'informatics', label: 'Informatique de gestion', boost: 1.20, group: 'it' },
            'H2': { track: 'business', label: 'Communication administrative', boost: 1.10, group: 'business' },
            'H3': { track: 'business', label: 'Action commerciale', boost: 1.12, group: 'business' },
            'H4': { track: 'informatics', label: 'Maintenance informatique', boost: 1.15, group: 'it' },
            'H5': { track: 'business', label: 'Techniques administratives', boost: 1.10, group: 'business' },
            
            // Gestion / Commerce
            'G1': { track: 'business', label: 'Secrétariat de direction', boost: 1.10, group: 'business' },
            'G2': { track: 'business', label: 'Comptabilité et gestion financière', boost: 1.15, group: 'business' },
            'G3': { track: 'business', label: 'Commerce et marketing', boost: 1.12, group: 'business' },
            'BG': { track: 'business', label: 'Banque et gestion', boost: 1.15, group: 'business' },
            
            // Filières agricoles
            'R1': { track: 'agriculture', label: 'Production végétale', boost: 1.10, group: 'agriculture' },
            'R2': { track: 'agriculture', label: 'Production animale', boost: 1.10, group: 'agriculture' },
            'R3': { track: 'agriculture', label: 'Santé animale', boost: 1.10, group: 'agriculture' },
            'R4': { track: 'technical', label: 'Machiniste agricole', boost: 1.08, group: 'agriculture' },
            'R5': { track: 'business', label: 'Économie et gestion coopératives', boost: 1.10, group: 'business' },
            'R6': { track: 'technical', label: 'Génie rural', boost: 1.10, group: 'agriculture' },
            
            // Filières professionnelles
            'P2': { track: 'technical', label: 'Génie civil', boost: 1.12, group: 'vocational' },
            'P6': { track: 'technical', label: 'Mécanique de production', boost: 1.12, group: 'vocational' },
            'P7': { track: 'technical', label: 'Électrotechnique et équipement de communication', boost: 1.12, group: 'vocational' }
        };
        
        // Liste complète des codes bac valides
        this.VALID_BAC_CODES = [
            'A', 'C', 'D', 'E',
            'F1', 'F2', 'F3', 'F4',
            'H1', 'H2', 'H3', 'H4', 'H5',
            'G1', 'G2', 'G3', 'BG',
            'R1', 'R2', 'R3', 'R4', 'R5', 'R6',
            'P2', 'P6', 'P7'
        ];
        
        // Mapping par groupe de bac
        this.BAC_GROUPS = {
            'humanities': {
                name: 'Lettres et Sciences Humaines',
                codes: ['A'],
                boost: 1.10,
                recommended_clusters: ['social', 'droit', 'arts_design']
            },
            'science': {
                name: 'Sciences',
                codes: ['C', 'D', 'E'],
                boost: 1.12,
                recommended_clusters: ['sciences', 'engineering', 'sante']
            },
            'industrial': {
                name: 'Filières Industrielles',
                codes: ['F1', 'F2', 'F3', 'F4'],
                boost: 1.13,
                recommended_clusters: ['engineering', 'informatique']
            },
            'it': {
                name: 'Filières Informatique',
                codes: ['H1', 'H4'],
                boost: 1.18,
                recommended_clusters: ['informatique', 'business']
            },
            'business': {
                name: 'Gestion et Commerce',
                codes: ['G1', 'G2', 'G3', 'BG', 'H2', 'H3', 'H5', 'R5'],
                boost: 1.12,
                recommended_clusters: ['business', 'droit']
            },
            'agriculture': {
                name: 'Filières Agricoles',
                codes: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
                boost: 1.10,
                recommended_clusters: ['agriculture', 'geoscience']
            },
            'vocational': {
                name: 'Filières Professionnelles',
                codes: ['P2', 'P6', 'P7'],
                boost: 1.12,
                recommended_clusters: ['engineering', 'technical']
            }
        };
        
        // Mapping cluster → codes bac recommandés
        this.CLUSTER_BAC_RECOMMENDATIONS = {
            'informatique': ['C', 'E', 'H1', 'H4', 'F2'],
            'engineering': ['C', 'E', 'F1', 'F2', 'F3', 'F4', 'P2', 'P6', 'P7'],
            'business': ['G1', 'G2', 'G3', 'BG', 'H2', 'H3', 'H5', 'R5'],
            'droit': ['A', 'BG', 'H5'],
            'social': ['A', 'H2', 'H5'],
            'sciences': ['C', 'D', 'E'],
            'sante': ['D', 'R3'],
            'geoscience': ['R1', 'R2', 'R6', 'R4'],
            'agriculture': ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
            'arts_design': ['A', 'F4']
        };
    }

    // ============================================================
    // 🔐 AUTHENTIFICATION
    // ============================================================

    /**
     * 🔐 Get current authenticated user from Supabase
     */
    async getCurrentUser() {
        const startTime = performance.now();
        
        if (!this.supabase) {
            this.logger.warn('⚠️ Supabase not configured, cannot get current user');
            return null;
        }

        try {
            const { data: { user }, error } = await this.supabase.auth.getUser();
            if (error) {
                this.logger.warn('⚠️ Error getting current user:', error.message);
                return null;
            }
            if (user) {
                this.logger.log('✅ Current authenticated user:', user.id, user.email);
                this.recordApiCall('getCurrentUser', performance.now() - startTime);
                return {
                    id: user.id,
                    email: user.email,
                    user_metadata: user.user_metadata || {}
                };
            }
            return null;
        } catch (error) {
            this.logger.error('❌ Error in getCurrentUser:', error);
            return null;
        }
    }

    /**
     * 🔐 Get user profile from database with bac info
     */
    async getUserProfile(userId) {
        const startTime = performance.now();
        
        if (!this.supabase) {
            this.logger.warn('⚠️ Supabase not configured, cannot get user profile');
            return null;
        }

        try {
            const [userResult, profileResult] = await Promise.allSettled([
                this.supabase
                    .from('utilisateurs')
                    .select('id, user_type, bac_code, bac_year')
                    .eq('id', userId)
                    .single(),
                this.supabase
                    .from('profiles')
                    .select('id, email, nom, prenom, telephone, profile_type, date_naissance, genre')
                    .eq('id', userId)
                    .single()
            ]);

            const userData = userResult.status === 'fulfilled' ? userResult.value.data : null;
            const profileData = profileResult.status === 'fulfilled' ? profileResult.value.data : null;

            if (profileData) {
                const fullProfile = {
                    ...profileData,
                    user_type: userData?.user_type || 'bachelier',
                    bac_code: userData?.bac_code || null,
                    bac_year: userData?.bac_year || null,
                    bac_info: userData?.bac_code ? this.getBacInfo(userData.bac_code) : null
                };
                
                this.logger.log('✅ User profile loaded:', fullProfile);
                this.recordApiCall('getUserProfile', performance.now() - startTime);
                return fullProfile;
            }
            return null;
        } catch (error) {
            this.logger.error('❌ Error in getUserProfile:', error);
            return null;
        }
    }

    /**
     * 🎓 Get baccalaureat information
     */
    getBacInfo(bacCode) {
        if (!bacCode) return null;
        const upperCode = bacCode.toUpperCase();
        const info = this.BAC_MAPPING[upperCode];
        if (info) {
            return {
                code: upperCode,
                track: info.track,
                label: info.label,
                boost: info.boost,
                group: info.group
            };
        }
        return null;
    }

    /**
     * Vérifie si un code bac est valide
     */
    isValidBacCode(bacCode) {
        if (!bacCode) return false;
        const upperCode = bacCode.toUpperCase();
        return this.VALID_BAC_CODES.includes(upperCode);
    }

    /**
     * Normalise un code bac
     */
    normalizeBacCode(bacCode) {
        if (!bacCode) return null;
        
        let cleaned = bacCode.toUpperCase().trim();
        cleaned = cleaned.replace(/^(SERIE|BAC|SÉRIE)\s*/i, '');
        
        const match = cleaned.match(/^([A-Z])(\d*)$/);
        if (match) {
            const letter = match[1];
            const number = match[2];
            
            if (letter === 'B' && number === 'G') return 'BG';
            
            if (number) {
                const code = `${letter}${number}`;
                if (this.VALID_BAC_CODES.includes(code)) return code;
            }
            
            if (this.VALID_BAC_CODES.includes(letter)) return letter;
        }
        
        return null;
    }

    /**
     * Retourne le groupe d'un code bac
     */
    getBacGroup(bacCode) {
        const normalized = this.normalizeBacCode(bacCode);
        if (!normalized) return null;
        
        for (const [group, data] of Object.entries(this.BAC_GROUPS)) {
            if (data.codes.includes(normalized)) {
                return { group, ...data };
            }
        }
        return null;
    }

    /**
     * Retourne les clusters recommandés pour un code bac
     */
    getRecommendedClustersForBac(bacCode) {
        const normalized = this.normalizeBacCode(bacCode);
        if (!normalized) return [];
        
        const group = this.getBacGroup(normalized);
        if (group && group.recommended_clusters) {
            return group.recommended_clusters;
        }
        
        return [];
    }

    /**
     * Calcule le boost de score pour un cluster donné selon le bac
     */
    getBacBoostForCluster(bacCode, cluster) {
        const normalized = this.normalizeBacCode(bacCode);
        if (!normalized) return 1.0;
        
        const recommendedClusters = this.getRecommendedClustersForBac(normalized);
        if (recommendedClusters.includes(cluster)) {
            const group = this.getBacGroup(normalized);
            return group ? group.boost : 1.10;
        }
        
        return 1.0;
    }

    /**
     * 🔐 Get JWT token from localStorage
     */
    getAuthToken() {
        const token = localStorage.getItem('jwt_token') || localStorage.getItem('access_token');
        if (token) {
            this.logger.log('🔐 Using JWT token from localStorage');
        }
        return token;
    }

    // ============================================================
    // 🌐 REQUÊTES RÉSEAU OPTIMISÉES
    // ============================================================

    /**
     * Fetch with timeout, retry logic, and performance tracking
     */
    async fetchWithRetry(url, options = {}, requestConfig = {}) {
        let lastError;
        const retryAttempts = requestConfig.retryAttempts || this.RETRY_ATTEMPTS;
        const retryDelayMs = requestConfig.retryDelayMs || this.RETRY_DELAY_MS;
        const timeoutMs = requestConfig.timeoutMs || this.TIMEOUT_MS;
        const requestLabel = requestConfig.label || 'request';
        const startTime = performance.now();
        
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
                
                const data = await response.json();
                this.recordApiCall(requestLabel, performance.now() - startTime);
                return data;
            } catch (error) {
                lastError = this.normalizeFetchError(error, timeoutMs, requestLabel);
                this.logger.warn(`🔄 Attempt ${attempt}/${retryAttempts} failed:`, lastError.message);
                
                if (attempt < retryAttempts) {
                    const delay = retryDelayMs * Math.pow(2, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }
        
        throw new Error(`Failed after ${retryAttempts} attempts: ${lastError?.message}`);
    }

    /**
     * Parallel fetch for multiple endpoints
     */
    async fetchParallel(requests, requestConfig = {}) {
        const results = await Promise.allSettled(
            requests.map(req => this.fetchWithRetry(req.url, req.options, { ...requestConfig, label: req.label }))
        );
        
        return results.map((result, index) => ({
            index,
            success: result.status === 'fulfilled',
            data: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason : null
        }));
    }

    normalizeFetchError(error, timeoutMs, requestLabel) {
        const message = String(error?.message || error || '').trim();
        const isAbort = error?.name === 'AbortError' || message.toLowerCase().includes('aborted');

        if (isAbort) {
            return new Error(`${requestLabel} timed out after ${timeoutMs}ms`);
        }

        return error instanceof Error ? error : new Error(message || `Unknown ${requestLabel} error`);
    }

    // ============================================================
    // 📊 ANALYTICS & PERFORMANCE
    // ============================================================

    recordApiCall(endpoint, durationMs) {
        this.performanceMetrics.apiCalls.push({
            endpoint,
            durationMs,
            timestamp: Date.now()
        });
        
        if (this.performanceMetrics.apiCalls.length > 100) {
            this.performanceMetrics.apiCalls.shift();
        }
        
        const total = this.performanceMetrics.apiCalls.reduce((sum, call) => sum + call.durationMs, 0);
        this.performanceMetrics.averageResponseTime = total / this.performanceMetrics.apiCalls.length;
        this.performanceMetrics.lastCallTimestamp = Date.now();
    }

    getPerformanceReport() {
        const calls = this.performanceMetrics.apiCalls;
        if (calls.length === 0) {
            return { message: 'No API calls recorded yet' };
        }
        
        const durations = calls.map(c => c.durationMs);
        durations.sort((a, b) => a - b);
        
        return {
            totalCalls: calls.length,
            averageResponseTime: this.performanceMetrics.averageResponseTime,
            p95ResponseTime: durations[Math.floor(durations.length * 0.95)],
            p99ResponseTime: durations[Math.floor(durations.length * 0.99)],
            fastestCall: durations[0],
            slowestCall: durations[durations.length - 1],
            endpoints: this.getEndpointStats()
        };
    }

    getEndpointStats() {
        const stats = {};
        for (const call of this.performanceMetrics.apiCalls) {
            if (!stats[call.endpoint]) {
                stats[call.endpoint] = { count: 0, totalDuration: 0 };
            }
            stats[call.endpoint].count++;
            stats[call.endpoint].totalDuration += call.durationMs;
        }
        
        for (const endpoint in stats) {
            stats[endpoint].averageDuration = stats[endpoint].totalDuration / stats[endpoint].count;
        }
        
        return stats;
    }

    // ============================================================
    // 📚 QUIZ STRUCTURE
    // ============================================================

    /**
     * Load quiz structure from Supabase - FALLBACK method
     */
    async loadQuizStructureFromSupabase() {
        try {
            this.logger.log('📥 Loading quiz structure from Supabase (FALLBACK)...');
            
            const { data: questions, error: qError } = await this.supabase
                .from('orientation_quiz_questions')
                .select('*')
                .order('order_index', { ascending: true });
            
            if (qError) throw qError;
            
            const { data: options, error: oError } = await this.supabase
                .from('orientation_quiz_options')
                .select('*')
                .order('option_order', { ascending: true });
            
            if (oError) throw oError;
            
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
     * Load quiz structure from PROA dynamic endpoint
     */
    async loadQuizStructure(userBacCode = null) {
        try {
            this.logger.info('📥 Loading quiz structure from PROA dynamic endpoint...');
            
            const userType = sessionStorage.getItem('user-role') || 'all';
            this.logger.log(`🎯 User type: ${userType}`);
            
            let url = `${this.PROA_URL}/orientation/questions/dynamic?user_type=${userType}&count_per_dimension=2`;
            if (userBacCode && this.isValidBacCode(userBacCode)) {
                url += `&bac_code=${userBacCode}`;
                this.logger.log(`🎓 Bac code: ${userBacCode}`);
            }
            
            try {
                const data = await this.fetchWithRetry(url, {}, {
                    label: 'dynamic quiz fetch'
                });
                
                if (!data.success || !data.questions) {
                    throw new Error('Invalid response from PROA /questions/dynamic');
                }
                
                const questions = data.questions;
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
                
                this.logger.info(`✅ Loaded ${formattedQuestions.length} dynamic questions from PROA`);
                return formattedQuestions;
                
            } catch (dynamicError) {
                this.logger.warn('⚠️ Failed to load from PROA dynamic endpoint, falling back to Supabase:', dynamicError?.message);
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

    /**
     * Normalize question options
     */
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

    /**
     * Normalize question option value
     */
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

    /**
     * Deduplicate questions by code
     */
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
                this.logger.warn(`⚠️ Duplicate question code filtered from ${source}: ${code}`);
                return;
            }

            seenCodes.add(code);
            uniqueQuestions.push(question);
        });

        return uniqueQuestions;
    }

    /**
     * Build dimension coverage
     */
    buildDimensionCoverage(questions = []) {
        return questions.reduce((coverage, question) => {
            const dimension = question?.dimension || 'general';
            coverage[dimension] = (coverage[dimension] || 0) + 1;
            return coverage;
        }, {});
    }

    /**
     * Get default options for question types
     */
    getDefaultOptions(type) {
        const defaults = {
            likert: [
                { text: 'Pas du tout d\'accord', value: 1 },
                { text: 'Plutôt pas d\'accord', value: 2 },
                { text: 'Plutôt d\'accord', value: 3 },
                { text: 'Tout à fait d\'accord', value: 4 },
                { text: 'Absolument d\'accord', value: 5 }
            ],
            boolean: [
                { text: 'Oui', value: 1 },
                { text: 'Non', value: 4 }
            ],
            choice: [
                { text: 'Option 1', value: 1 },
                { text: 'Option 2', value: 2 },
                { text: 'Option 3', value: 3 },
                { text: 'Option 4', value: 4 }
            ],
            scale: [
                { text: '0', value: 0 },
                { text: '5', value: 5 },
                { text: '10', value: 10 }
            ]
        };
        return defaults[type] || defaults.choice;
    }

    // ============================================================
    // 🎯 PROA SERVICE
    // ============================================================

    /**
     * Call PROA service for field recommendations
     */
    async callProaService(payload, userBacCode = null) {
        try {
            this.logger.log('🔥 Calling PROA service:', payload);
            
            const enrichedPayload = { ...payload };
            if (userBacCode && this.isValidBacCode(userBacCode)) {
                enrichedPayload.bac_code = userBacCode;
                const bacInfo = this.getBacInfo(userBacCode);
                if (bacInfo) {
                    enrichedPayload.bac_track = bacInfo.track;
                    this.logger.log(`🎓 Bac included: ${userBacCode} (${bacInfo.track})`);
                }
            }
            
            const result = await this.fetchWithRetry(
                `${this.PROA_URL}/orientation/compute`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(enrichedPayload)
                },
                {
                    label: 'PROA compute',
                    timeoutMs: this.TIMEOUT_MS * 2
                }
            );
            
            this.logger.log('✅ PROA response:', result);
            return result;
        } catch (error) {
            this.logger.error('❌ PROA call failed:', error);
            throw error;
        }
    }

    // ============================================================
    // 🏆 PORA SERVICE
    // ============================================================

    /**
     * Call PORA service for university/centre rankings
     */
    async callPoraService(type, payload, userBacCode = null) {
        const endpoint = type === 'universites' ? 'universites' : 'centres';
        
        try {
            this.logger.log(`🏆 Calling PORA service (${endpoint}):`, payload);
            
            const enrichedPayload = { ...payload };
            if (userBacCode && this.isValidBacCode(userBacCode)) {
                enrichedPayload.bac_code = userBacCode;
                const bacInfo = this.getBacInfo(userBacCode);
                if (bacInfo) {
                    enrichedPayload.bac_track = bacInfo.track;
                    enrichedPayload.bac_boost = bacInfo.boost;
                    this.logger.log(`🎓 Bac filter applied: ${userBacCode} (boost: ${bacInfo.boost})`);
                }
            }
            
            const result = await this.fetchWithRetry(
                `${this.PORA_URL}/recommendations/${endpoint}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(enrichedPayload)
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
            return endpoint === 'centres'
                ? { centres: [], centreFilieres: [] }
                : { universites: [] };
        }
    }

    /**
     * Parallel call to both PROA and PORA
     */
    async computeAllRecommendations(userId, answers, userBacCode = null) {
        const startTime = performance.now();
        
        const proaPayload = {
            user_id: userId,
            user_type: sessionStorage.getItem('user-role') || 'bachelier',
            quiz_code: 'quiz_bachelier_v2',
            responses: answers,
            orientation_type: 'field'
        };
        
        const [proaResult, poraUniversitesResult, poraCentresResult] = await Promise.allSettled([
            this.callProaService(proaPayload, userBacCode),
            this.callPoraService('universites', proaPayload, userBacCode),
            this.callPoraService('centres', proaPayload, userBacCode)
        ]);
        
        const totalTime = performance.now() - startTime;
        this.logger.log(`⚡ All recommendations computed in ${totalTime.toFixed(0)}ms`);
        
        return {
            proa: proaResult.status === 'fulfilled' ? proaResult.value : null,
            poraUniversites: poraUniversitesResult.status === 'fulfilled' ? poraUniversitesResult.value : null,
            poraCentres: poraCentresResult.status === 'fulfilled' ? poraCentresResult.value : null,
            totalTimeMs: totalTime
        };
    }

    // ============================================================
    // 🔄 REAL-TIME SUBSCRIPTIONS
    // ============================================================

    setupRealtimeSubscriptions() {
        if (!this.supabase) return;
        
        this.universitesSubscription = this.supabase
            .channel('universites-changes')
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'universites' },
                (payload) => this.handleUniversiteUpdate(payload)
            )
            .subscribe();
        
        this.centresSubscription = this.supabase
            .channel('centres-changes')
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'centres_formation' },
                (payload) => this.handleCentreUpdate(payload)
            )
            .subscribe();
        
        this.logger.log('📡 Real-time subscriptions active');
    }

    handleUniversiteUpdate(payload) {
        this.logger.log('🔄 Universite score updated:', payload.new.id);
        window.dispatchEvent(new CustomEvent('pora-score-update', {
            detail: { type: 'universite', data: payload.new }
        }));
    }

    handleCentreUpdate(payload) {
        this.logger.log('🔄 Centre score updated:', payload.new.id);
        window.dispatchEvent(new CustomEvent('pora-score-update', {
            detail: { type: 'centre', data: payload.new }
        }));
    }

    // ============================================================
    // 💾 OFFLINE SUPPORT
    // ============================================================

    async registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            this.logger.log('✅ Service Worker registered:', registration.scope);
        } catch (error) {
            this.logger.warn('⚠️ Service Worker registration failed:', error);
        }
    }

    /**
     * Get cached results with TTL check
     */
    getCachedResults(userId, answers = null) {
        try {
            const cached = localStorage.getItem(`proa-result-${userId}`);
            if (!cached) return null;

            const parsed = JSON.parse(cached);
            
            if (parsed.timestamp && Date.now() - parsed.timestamp > this.CACHE_TTL_MS) {
                this.logger.log('Cache expired, removing');
                localStorage.removeItem(`proa-result-${userId}`);
                return null;
            }
            
            if (!answers) return parsed;

            const fingerprint = this.buildAnswersFingerprint(answers);
            if (parsed?.answers_fingerprint && parsed.answers_fingerprint === fingerprint) {
                this.logger.log('✅ Cache HIT');
                return parsed;
            }

            return null;
        } catch (error) {
            this.logger.warn('⚠️ Failed to get cached results:', error);
            return null;
        }
    }

    /**
     * Cache results to localStorage with TTL
     */
    cacheResults(userId, results) {
        try {
            const fingerprint = this.buildAnswersFingerprint(results?.answers || {});
            localStorage.setItem(`proa-result-${userId}`, JSON.stringify({
                ...results,
                answers_fingerprint: fingerprint,
                timestamp: Date.now(),
                ttl: this.CACHE_TTL_MS
            }));
            this.logger.log('💾 Results cached');
        } catch (error) {
            this.logger.warn('⚠️ Failed to cache results:', error);
        }
    }

    /**
     * Build answers fingerprint for cache
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

    // ============================================================
    // 🧠 FUZZY MATCHING
    // ============================================================

    /**
     * Fuzzy filter filieres
     */
    fuzzyFilterFilieres(filieres, recommendedFields) {
        if (!filieres || !recommendedFields) return filieres;
        
        return filieres
            .map(rel => {
                const filiereName = this.normalizeText(rel.filieres?.nom || rel.filiere?.nom || '');
                if (!filiereName) return null;
                
                let matchScore = 0;
                let matchedKeywords = [];
                
                for (const field of recommendedFields) {
                    const keywords = this.getFieldKeywords(field);
                    
                    for (const keyword of keywords) {
                        const normalizedKeyword = this.normalizeText(keyword);
                        
                        if (filiereName === normalizedKeyword) {
                            matchScore += 5;
                            matchedKeywords.push(keyword);
                        } else if (filiereName.includes(normalizedKeyword)) {
                            matchScore += 3;
                            matchedKeywords.push(keyword);
                        } else if (normalizedKeyword.includes(filiereName)) {
                            matchScore += 2;
                            matchedKeywords.push(keyword);
                        } else {
                            const distance = this.levenshteinDistance(filiereName, normalizedKeyword);
                            if (distance <= 2) {
                                matchScore += 3;
                                matchedKeywords.push(keyword);
                            } else if (distance <= 4) {
                                matchScore += 1;
                                matchedKeywords.push(keyword);
                            }
                        }
                    }
                }
                
                if (matchScore > 0) {
                    return {
                        ...rel,
                        matchScore,
                        matchedKeywords: [...new Set(matchedKeywords)],
                        confidence: Math.min(1, matchScore / 10)
                    };
                }
                return null;
            })
            .filter(item => item !== null)
            .sort((a, b) => b.matchScore - a.matchScore);
    }

    /**
     * Get field keywords for semantic matching
     */
    getFieldKeywords(field) {
        const normalized = this.normalizeText(field);

        const mappings = {
            "comptabilite gestion entreprise": ["comptabilite", "gestion", "finance", "comptable"],
            "business trade marketing": ["business", "marketing", "commerce", "vente"],
            "entrepreneuriat management projets": ["entrepreneuriat", "management", "projet"],
            "genie logiciel": ["informatique", "logiciel", "developpement", "programmation"],
            "informatique": ["informatique", "programmation", "developpement", "logiciel"],
            "finance": ["finance", "comptabilite", "gestion", "banque"],
            "marketing": ["marketing", "commerce", "vente", "communication"],
            "gestion": ["gestion", "management", "administration", "rh"]
        };

        return mappings[normalized] || [normalized];
    }

    /**
     * Normalize text for matching
     */
    normalizeText(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calculate Levenshtein distance
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

    // ============================================================
    // 📊 STRICT FILTERING METHODS
    // ============================================================

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

    // ============================================================
    // 📚 FETCH METHODS
    // ============================================================

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
            
            const filtered = this.fuzzyFilterFilieres(data, recommendedFields);
            return filtered;
        } catch (error) {
            this.logger.error('❌ Failed to fetch university filieres:', error);
            return [];
        }
    }

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
            
            const filtered = this.fuzzyFilterFilieres(data, recommendedFields);
            return filtered;
        } catch (error) {
            this.logger.error('❌ Failed to fetch centre filieres:', error);
            return [];
        }
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.APIService = APIService;
}