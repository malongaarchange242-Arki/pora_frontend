/**
 * API Service Module - Version 2.0
 * Centralizes all API calls: Supabase, PROA, PORA
 * Features: Error handling, retry logic, timeouts, logging, caching, offline support
 * 
 * AMÉLIORATIONS V2:
 * - Support bac congolais
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
        
        // Bac congolais mapping (NOUVEAU)
        this.BAC_MAPPING = {
            'C': { track: 'science', label: 'Mathématiques', boost: 1.15 },
            'D': { track: 'science', label: 'Sciences expérimentales', boost: 1.10 },
            'A': { track: 'humanities', label: 'Lettres', boost: 1.10 },
            'A1': { track: 'humanities', label: 'Lettres', boost: 1.10 },
            'A2': { track: 'humanities', label: 'Lettres', boost: 1.10 },
            'G': { track: 'business', label: 'Commerciale', boost: 1.15 },
            'G1': { track: 'business', label: 'Commerciale', boost: 1.15 },
            'G2': { track: 'business', label: 'Commerciale', boost: 1.15 },
            'E': { track: 'technical', label: 'Technique', boost: 1.10 },
            'F1': { track: 'technical', label: 'Technique', boost: 1.10 },
            'H': { track: 'informatics', label: 'Informatique', boost: 1.20 },
            'H1': { track: 'informatics', label: 'Informatique', boost: 1.20 }
        };
    }

    // ============================================================
    // 🔐 AUTHENTIFICATION (AMÉLIORÉE)
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
                
                // Track performance
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
     * 🔐 Get user profile from database with bac info (AMÉLIORÉ)
     */
    async getUserProfile(userId) {
        const startTime = performance.now();
        
        if (!this.supabase) {
            this.logger.warn('⚠️ Supabase not configured, cannot get user profile');
            return null;
        }

        try {
            // Parallel queries for better performance
            const [userResult, profileResult] = await Promise.allSettled([
                this.supabase
                    .from('utilisateurs')
                    .select('id, user_type, bac_code, bac_year') // NOUVEAU: bac fields
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
                
                // Track performance
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
     * 🎓 Get baccalaureat information (NOUVEAU)
     */
    getBacInfo(bacCode) {
        const info = this.BAC_MAPPING[bacCode.toUpperCase()];
        if (info) {
            return {
                code: bacCode.toUpperCase(),
                track: info.track,
                label: info.label,
                boost: info.boost
            };
        }
        return null;
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
                
                const data = await response.json();
                
                // Track performance
                this.recordApiCall(requestLabel, performance.now() - startTime);
                
                return data;
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

    /**
     * Parallel fetch for multiple endpoints (NOUVEAU - Performance)
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
    // 📊 ANALYTICS & PERFORMANCE (NOUVEAU)
    // ============================================================

    recordApiCall(endpoint, durationMs) {
        this.performanceMetrics.apiCalls.push({
            endpoint,
            durationMs,
            timestamp: Date.now()
        });
        
        // Keep only last 100 calls
        if (this.performanceMetrics.apiCalls.length > 100) {
            this.performanceMetrics.apiCalls.shift();
        }
        
        // Update average
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
    // 📚 QUIZ STRUCTURE (AMÉLIORÉE)
    // ============================================================

    /**
     * Load quiz structure from PROA dynamic endpoint (with bac support)
     */
    async loadQuizStructure(userBacCode = null) {
        try {
            this.logger.info('📥 Loading quiz structure from PROA dynamic endpoint...');
            
            const userType = sessionStorage.getItem('user-role') || 'all';
            this.logger.log(`🎯 User type: ${userType}`);
            
            // Build URL with bac parameter if available
            let url = `${this.PROA_URL}/orientation/questions/dynamic?user_type=${userType}&count_per_dimension=2`;
            if (userBacCode) {
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

    // ============================================================
    // 🎯 PROA SERVICE (AVEC BAC)
    // ============================================================

    /**
     * Call PROA service for field recommendations (avec bac support)
     */
    async callProaService(payload, userBacCode = null) {
        try {
            this.logger.log('🔥 Calling PROA service:', payload);
            
            // Add bac info to payload if available
            const enrichedPayload = { ...payload };
            if (userBacCode) {
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
                    timeoutMs: this.TIMEOUT_MS * 2 // Longer timeout for ML
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
    // 🏆 PORA SERVICE (AVEC BAC)
    // ============================================================

    /**
     * Call PORA service for university/centre rankings (avec bac support)
     */
    async callPoraService(type, payload, userBacCode = null) {
        const endpoint = type === 'universites' ? 'universites' : 'centres';
        
        try {
            this.logger.log(`🏆 Calling PORA service (${endpoint}):`, payload);
            
            // Add bac info to payload if available
            const enrichedPayload = { ...payload };
            if (userBacCode) {
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
     * Parallel call to both PROA and PORA (NOUVEAU - Performance)
     */
    async computeAllRecommendations(userId, answers, userBacCode = null) {
        const startTime = performance.now();
        
        // Prepare payloads
        const proaPayload = {
            user_id: userId,
            user_type: sessionStorage.getItem('user-role') || 'bachelier',
            quiz_code: 'quiz_bachelier_v2',
            responses: answers,
            orientation_type: 'field'
        };
        
        // Execute in parallel for better performance
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
    // 🔄 REAL-TIME SUBSCRIPTIONS (NOUVEAU)
    // ============================================================

    setupRealtimeSubscriptions() {
        if (!this.supabase) return;
        
        // Subscribe to changes in universites scores
        this.universitesSubscription = this.supabase
            .channel('universites-changes')
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'universites' },
                (payload) => this.handleUniversiteUpdate(payload)
            )
            .subscribe();
        
        // Subscribe to changes in centres scores
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
        // Dispatch event for UI update
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
    // 💾 OFFLINE SUPPORT (NOUVEAU)
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
            
            // Check TTL
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

    // ============================================================
    // 🧠 FUZZY MATCHING AMÉLIORÉ
    // ============================================================

    /**
     * Enhanced fuzzy matching with ML-like scoring
     */
    fuzzyFilterFilieres(filieres, recommendedFields) {
        if (!filieres || !recommendedFields) return filieres;
        
        return filieres
            .map(rel => {
                const filiereName = this.normalizeText(rel.filieres?.nom || rel.filiere?.nom || '');
                
                if (!filiereName) return null;
                
                let matchScore = 0;
                let matchedKeywords = [];
                
                // Calculate match score with weighted algorithm
                for (const field of recommendedFields) {
                    const keywords = this.getFieldKeywords(field);
                    
                    for (const keyword of keywords) {
                        const normalizedKeyword = this.normalizeText(keyword);
                        
                        // Exact match = +5 points
                        if (filiereName === normalizedKeyword) {
                            matchScore += 5;
                            matchedKeywords.push(keyword);
                        }
                        // Contains match = +3 points
                        else if (filiereName.includes(normalizedKeyword)) {
                            matchScore += 3;
                            matchedKeywords.push(keyword);
                        }
                        // Reverse contains = +2 points
                        else if (normalizedKeyword.includes(filiereName)) {
                            matchScore += 2;
                            matchedKeywords.push(keyword);
                        }
                        // Fuzzy match (Levenshtein) = +1-3 points based on distance
                        else {
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
                        confidence: Math.min(1, matchScore / 10) // Normalize to 0-1
                    };
                }
                
                return null;
            })
            .filter(item => item !== null)
            .sort((a, b) => b.matchScore - a.matchScore);
    }

    // ============================================================
    // 📝 HELPER METHODS (conservés)
    // ============================================================

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

    // ... autres méthodes helper conservées (mergeOptionsIntoQuestions, normalizeQuestionOptions, etc.)
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.APIService = APIService;
}