/**
 * Orientation App Orchestrator - Version 2.0
 * Coordinates APIService, QuizService, UIRenderer
 * Main entry point for the quiz application
 * 
 * AMÉLIORATIONS V2:
 * - Support bac congolais complet
 * - Cache intelligent avec TTL
 * - Performance monitoring
 * - Offline support
 * - Meilleure gestion des erreurs
 * - Analytics intégré
 */

// ============================================================
// 📊 LOGGER UTILITY
// ============================================================

/**
 * Simple Logger utility
 */
class Logger {
    constructor(level = 'info') {
        this.level = level;
        this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    }

    log(msg, ...args) {
        if (this.levels[this.level] <= this.levels.info) {
            console.log(msg, ...args);
        }
    }

    info(msg, ...args) {
        if (this.levels[this.level] <= this.levels.info) {
            console.log(`ℹ️ ${msg}`, ...args);
        }
    }

    warn(msg, ...args) {
        if (this.levels[this.level] <= this.levels.warn) {
            console.warn(`⚠️ ${msg}`, ...args);
        }
    }

    error(msg, ...args) {
        if (this.levels[this.level] <= this.levels.error) {
            console.error(`❌ ${msg}`, ...args);
        }
    }

    debug(msg, ...args) {
        if (this.levels[this.level] <= this.levels.debug) {
            console.debug(`🔍 ${msg}`, ...args);
        }
    }
}

// ============================================================
// 🚀 ORIENTATION APP
// ============================================================

class OrientationApp {
    constructor() {
        this.logger = new Logger(window.getConfig ? window.getConfig('UI.DEBUG_LOG_LEVEL', 'info') : 'info');
        this.api = null;
        this.quiz = null;
        this.ui = null;
        this.proaResult = null;
        this.poraResult = null;
        this.pendingRole = null;
        this.initialized = false;
        this.eventListenersSetup = false;
        this.pendingFlutterAuth = null;
        this.flutterAuthStarted = false;
        
        // Performance metrics
        this.performanceMetrics = {
            appStartTime: performance.now(),
            initTime: 0,
            quizStartTime: null,
            quizEndTime: null,
            proaCallTime: null,
            proaCallDuration: 0,
            poraCallTime: null,
            poraCallDuration: 0
        };
        
        // Offline support
        this.offlineMode = false;
        this.pendingRequests = [];
        this.userProfile = null;
        this.profileId = null;
    }

    /**
     * Initialize the entire application (V2 amélioré)
     */
    async init() {
        const startTime = performance.now();
        
        try {
            this.logger.info('🚀 Initializing Orientation App V2...');

            // Step 1: Initialize configuration
            if (window.CONFIG && typeof window.CONFIG.initialize === 'function') {
                await window.CONFIG.initialize();
            }
            this.logger.info('✅ Configuration loaded');

            // Step 2: Check offline mode
            this.offlineMode = !navigator.onLine;
            if (this.offlineMode) {
                this.logger.warn('📡 Offline mode detected - using cached data');
                if (this.ui && this.ui.showOfflineWarning) {
                    this.ui.showOfflineWarning();
                }
            }

            // Step 3: Create services with bac support
            const serviceConfig = {
                SUPABASE_URL: window.CONFIG?.SUPABASE?.URL || process.env.SUPABASE_URL,
                SUPABASE_ANON_KEY: window.CONFIG?.SUPABASE?.ANON_KEY || process.env.SUPABASE_ANON_KEY,
                PROA_URL: window.CONFIG?.SERVICES?.PROA_URL || 'https://universearch.com/proa',
                PORA_URL: window.CONFIG?.SERVICES?.PORA_URL || 'https://universearch.com/pora',
                TIMEOUT_MS: window.CONFIG?.SERVICES?.TIMEOUT_MS || 10000,
                RETRY_ATTEMPTS: window.CONFIG?.SERVICES?.RETRY_ATTEMPTS || 3,
                RETRY_DELAY_MS: window.CONFIG?.SERVICES?.RETRY_DELAY_MS || 1000,
                ENABLE_OFFLINE: true,
                ENABLE_REALTIME: true,
                logger: this.logger
            };

            this.api = new APIService(serviceConfig);

            this.quiz = new QuizService({
                logger: this.logger,
                enableBacSupport: true
            });

            this.ui = new UIRenderer({
                logger: this.logger,
                onQuestionAnswered: (value) => this.handleQuestionAnswered(value),
                onBacSelected: (bacCode) => this.handleBacSelected(bacCode),
                onNavigateQuestion: (direction) => this.navigateQuestion(direction),
                onAnalyzeProfile: () => this.analyzeProfile(),
                onShowRecommendations: () => this.showRecommendations()
            });

            this.logger.info('✅ Services created');

            // Step 4: Load quiz questions (with offline fallback)
            let questions;
            try {
                questions = await this.api.loadQuizStructure();
                if (questions && questions.length > 0) {
                    this.cacheQuizStructure(questions);
                }
            } catch (error) {
                this.logger.warn('⚠️ Failed to load fresh quiz, trying cache');
                questions = this.loadCachedQuizStructure();
                if (!questions || questions.length === 0) {
                    throw error;
                }
            }
            
            const quizzes = await this.quiz.initialize(questions);
            this.logger.info(`✅ Loaded ${Object.keys(quizzes).length} quiz types`);

            // Step 5: Load user profile with bac info
            await this.loadUserProfile();

            // Step 6: Setup event listeners
            this.initialized = true;
            if (!this.eventListenersSetup) {
                this.setupEventListeners();
            }

            // Step 7: Performance tracking
            this.performanceMetrics.initTime = performance.now() - startTime;
            this.trackPerformance('app_init', this.performanceMetrics.initTime);

            const flutterStarted = this.flushPendingFlutterAuth();
            if (!flutterStarted && this.ui) {
                this.ui.showWelcome();
            }
            
            this.logger.info(`✅ Application ready! (init: ${this.performanceMetrics.initTime.toFixed(0)}ms)`);

        } catch (error) {
            this.logger.error('❌ Initialization failed:', error);
            if (this.ui) {
                this.ui.showError(
                    'Erreur d\'initialisation. Veuillez rafraîchir la page.',
                    () => location.reload()
                );
            }
        }
    }

    /**
     * Load user profile with bac info (NOUVEAU)
     */
    async loadUserProfile() {
        try {
            const userId = localStorage.getItem('user_id') || sessionStorage.getItem('user-id');
            if (userId && this.api) {
                const profile = await this.api.getUserProfile(userId);
                if (profile && profile.bac_code) {
                    this.logger.info(`🎓 User bac code: ${profile.bac_code}`);
                    if (this.quiz) {
                        this.quiz.setBacType(profile.bac_code);
                    }
                    
                    // Show bac info in UI
                    const bacInfo = this.api.getBacInfo(profile.bac_code);
                    if (bacInfo && this.ui && this.ui.showBacInfo) {
                        this.ui.showBacInfo(bacInfo);
                    }
                }
                this.userProfile = profile;
            }
        } catch (error) {
            this.logger.warn('Could not load user profile:', error);
        }
    }

    /**
     * Load cached quiz structure for offline mode (NOUVEAU)
     */
    loadCachedQuizStructure() {
        try {
            const cached = localStorage.getItem('quiz_structure');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                    this.logger.info('💾 Using cached quiz structure');
                    return parsed.questions;
                }
            }
            return null;
        } catch (error) {
            this.logger.warn('Failed to load cached quiz:', error);
            return null;
        }
    }

    /**
     * Cache quiz structure for offline (NOUVEAU)
     */
    cacheQuizStructure(questions) {
        try {
            localStorage.setItem('quiz_structure', JSON.stringify({
                questions,
                timestamp: Date.now()
            }));
        } catch (error) {
            this.logger.warn('Failed to cache quiz structure:', error);
        }
    }

    /**
     * Get cookie value by name
     */
    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    }

    /**
     * Handle Flutter token injection event
     */
    async handleFlutterTokenReady(detail) {
        try {
            this.logger.info('📱 Handling FlutterTokenReady payload', detail);

            this.pendingFlutterAuth = detail || {};

            if (!this.initialized || !this.quiz || !this.ui) {
                this.logger.info('Flutter auth received before quiz services are ready; deferring start');
                return false;
            }

            const token = detail?.token || detail?.jwtToken || detail?.accessToken;
            const userType = detail?.userType || detail?.user_type;
            const userId = detail?.userId || detail?.user_id;

            this.logger.info(`📱 FlutterTokenReady | user_type=${userType} | user_id=${userId} | has_token=${!!token}`);

            if (token) {
                this.jwtToken = token;
                localStorage.setItem('jwt_token', token);
                localStorage.setItem('access_token', token);
            }

            if (userType) {
                localStorage.setItem('user_type', userType);
            }

            if (userId) {
                localStorage.setItem('user_id', userId);
                if (!sessionStorage.getItem('user-id')) {
                    sessionStorage.setItem('user-id', userId);
                }
            }

            if (userType && userId) {
                this.userProfile = { user_id: userId, user_type: userType };
            }

            // Force auto-start if we have all required data
            if (userType && userId && token) {
                this.logger.info('🚀 Complete Flutter data received - auto-starting quiz');
                
                let quizRole;
                switch (userType.toLowerCase()) {
                    case 'bachelier':
                        quizRole = 'student';
                        break;
                    case 'etudiant':
                        quizRole = 'student';
                        break;
                    case 'parent':
                        quizRole = 'parent';
                        break;
                    default:
                        quizRole = 'student';
                }
                
                if (this.quiz) {
                    this.quiz.setAuthenticatedUser({
                        id: userId,
                        user_type: userType
                    });
                }
                
                this.profileId = userId;
                
                if (this.flutterAuthStarted) {
                    this.logger.info('Flutter auth already consumed, skipping duplicate quiz start');
                    return true;
                }
                this.flutterAuthStarted = true;

                requestAnimationFrame(() => {
                    setTimeout(() => {
                        this.startQuiz(quizRole);
                    }, 50);
                });
                return true;
            }
        } catch (error) {
            this.logger.warn('⚠️ Error handling FlutterTokenReady event:', error);
            return false;
        }
    }

    flushPendingFlutterAuth() {
        if (!this.pendingFlutterAuth) {
            return false;
        }

        this.handleFlutterTokenReady(this.pendingFlutterAuth);
        return this.flutterAuthStarted;
    }

    /**
     * Setup DOM event listeners
     */
    setupEventListeners() {
        if (this.eventListenersSetup) {
            return;
        }
        this.eventListenersSetup = true;

        // Listen for Flutter token injection
        window.addEventListener('FlutterTokenReady', (event) => {
            this.logger.info('📱 Flutter token ready event received', event.detail);
            this.handleFlutterTokenReady(event.detail);
        });

        document.addEventListener('click', (e) => {
            const roleButton = e.target.closest('[data-role]');
            if (roleButton) {
                const role = roleButton.getAttribute('data-role');
                this.startQuiz(role);
                return;
            }

            const bacButton = e.target.closest('[data-bac-value]');
            if (bacButton) {
                const bacType = bacButton.getAttribute('data-bac-value');
                this.handleBacSelected(bacType);
                return;
            }

            const restartButton = e.target.closest('[data-action="restart"]');
            if (restartButton) {
                this.restart();
                return;
            }

            const bacBackButton = e.target.closest('[data-action="bac-back"]');
            if (bacBackButton) {
                this.goBackFromBacSelection();
                return;
            }

            const quizBackButton = e.target.closest('[data-action="quiz-back"]');
            if (quizBackButton) {
                this.goBackFromQuiz();
                return;
            }
        });

        // Listen for custom back button events
        document.addEventListener('quiz-back-clicked', () => {
            this.goBackFromQuiz();
        });

        document.addEventListener('bac-back-clicked', () => {
            this.goBackFromBacSelection();
        });

        // Network status listeners
        window.addEventListener('online', () => {
            this.logger.info('📡 Back online');
            this.offlineMode = false;
            if (this.ui && this.ui.hideOfflineWarning) {
                this.ui.hideOfflineWarning();
            }
        });

        window.addEventListener('offline', () => {
            this.logger.warn('📡 Offline mode activated');
            this.offlineMode = true;
            if (this.ui && this.ui.showOfflineWarning) {
                this.ui.showOfflineWarning();
            }
        });

        this.logger.info('✅ Event listeners setup');
    }

    goBackFromBacSelection() {
        this.logger.info('↩️ Returning from bac selection');
        this.pendingRole = null;
        if (this.ui && typeof this.ui.showWelcome === 'function') {
            this.ui.showWelcome();
        }
    }

    goBackFromQuiz() {
        this.logger.info('↩️ Returning from quiz to bac selection');
        if (this.quiz) {
            this.quiz.resetQuiz();
        }
        if (this.ui && typeof this.ui.showBacSelection === 'function') {
            this.ui.showBacSelection(this.quiz?.getAvailableBacTypes());
        }
    }

    /**
     * Handle bac selection with validation (AMÉLIORÉ)
     */
    async handleBacSelected(value) {
        try {
            this.logger.info(`🎓 Bac selected: ${value}`);
            
            // Validate bac code
            const bacInfo = this.api ? this.api.getBacInfo(value) : null;
            if (!bacInfo) {
                this.logger.warn(`Unknown bac code: ${value}, using default`);
                if (this.ui && this.ui.showWarning) {
                    this.ui.showWarning(`Code bac "${value}" non reconnu, poursuite avec options par défaut`);
                }
            } else if (this.ui) {
                this.logger.info(`✅ Bac validated: ${bacInfo.label} (${bacInfo.track})`);
                this.ui.showSuccess(`Bac ${value} (${bacInfo.label}) pris en compte`);
            }
            
            if (this.quiz) {
                this.quiz.setBacType(value);
            }
            
            // Track bac selection
            this.trackEvent('bac_selected', { bac_code: value, bac_track: bacInfo?.track });
            
            await this.startQuiz(this.pendingRole || 'student');
        } catch (error) {
            this.logger.error('Failed to register bac type:', error);
            if (this.ui) {
                this.ui.showError('Erreur lors de l\'enregistrement du bac');
                if (this.quiz) {
                    this.ui.showBacSelection(this.quiz.getBacType());
                }
            }
        }
    }

    /**
     * Start quiz for a given role (AMÉLIORÉ)
     */
    async startQuiz(role) {
        try {
            this.logger.info(`🎮 Starting quiz for role: ${role}`);
            this.performanceMetrics.quizStartTime = performance.now();

            if (!this.quiz) {
                throw new Error('Quiz service not initialized');
            }

            // Check if bac is required for student
            if (role === 'student' && !this.quiz.hasBacType()) {
                this.pendingRole = role;
                const availableBacTypes = this.quiz.getAvailableBacTypes();
                if (this.ui) {
                    this.ui.showBacSelection(availableBacTypes);
                }
                this.logger.info('Waiting for required bac type before starting student quiz');
                return;
            }

            const quizState = this.quiz.startQuiz(role);
            this.pendingRole = null;
            if (this.ui) {
                this.ui.showQuiz(role);
                this.ui.renderQuestion(quizState.firstQuestion);
            }
            
            // Track quiz start
            this.trackEvent('quiz_started', { role, total_questions: quizState.totalQuestions });

            this.logger.info(`✅ Quiz started: ${quizState.totalQuestions} questions`);
        } catch (error) {
            this.logger.error('❌ Failed to start quiz:', error);
            if (this.ui) {
                this.ui.showError('Impossible de démarrer le quiz. Veuillez réessayer.');
            }
        }
    }

    /**
     * Handle question answered
     */
    async handleQuestionAnswered(value) {
        try {
            if (!this.quiz) {
                throw new Error('Quiz service not initialized');
            }
            
            const result = this.quiz.answerQuestion(value);

            if (result.complete) {
                this.ui?.showQuizCompletionAction();
            } else if (this.ui) {
                this.ui.renderQuestion(result.nextQuestion);
            }
        } catch (error) {
            this.logger.error('❌ Error handling answer:', error);
            if (this.ui) {
                this.ui.showError('Une erreur s\'est produite. Veuillez réessayer.');
            }
        }
    }

    navigateQuestion(direction) {
        if (!this.quiz || !this.ui) return;

        if (direction === 'prev') {
            if (this.quiz.currentStep > 0) {
                this.quiz.currentStep = Math.max(0, this.quiz.currentStep - 1);
                const question = this.quiz.getCurrentQuestion();
                this.ui.renderQuestion(question);
            }
            return;
        }

        if (direction === 'next') {
            this.ui.renderQuestion(this.quiz.getCurrentQuestion());
        }
    }

    analyzeProfile() {
        if (!this.quiz || !this.ui) return;
        this.submitAndShowResults();
    }

    showRecommendations() {
        if (!this.ui || !this.proaResult) return;
        this.ui.renderRecommendations(this.ui.currentResultData || {
            recommendations: { top_field_details: [], universities: [] }
        });
    }

    /**
     * Submit quiz and show results (AMÉLIORÉ avec bac)
     */
    async submitAndShowResults() {
        const submitStartTime = performance.now();
        
        try {
            this.logger.info('📤 Quiz complete! Submitting responses...');
            this.performanceMetrics.quizEndTime = submitStartTime;

            if (!this.ui || !this.quiz || !this.api) {
                throw new Error('Services not initialized');
            }

            // Show results screen with loading state
            this.ui.showResults();
            this.ui.showLoader('Analyse en cours... Calcul du profil');

            // Map responses to PROA format with bac info
            let proaPayload;
            try {
                proaPayload = this.quiz.mapToProaFormat();
                
                // Add bac info if available
                const bacCode = this.quiz.getBacType();
                if (bacCode) {
                    proaPayload.bac_code = bacCode;
                    this.logger.info(`🎓 Including bac code in PROA payload: ${bacCode}`);
                }
            } catch (error) {
                this.logger.error('❌ Response validation failed:', error);
                this.ui.showError('Réponses invalides. Veuillez relancer le quiz.');
                return;
            }

            // Step 1: Call PROA service (with bac boost)
            this.ui.showProgress(1, 3, 'Récupération des filières recommandées');
            this.performanceMetrics.proaCallTime = performance.now();
            
            try {
                this.proaResult = await this.api.callProaService(proaPayload, this.quiz.getBacType());
                this.profileId = this.proaResult?.profile_id || null;
                
                this.performanceMetrics.proaCallDuration = performance.now() - this.performanceMetrics.proaCallTime;
                this.trackPerformance('proa_call', this.performanceMetrics.proaCallDuration);
                
                this.logger.info(`✅ PROA completed in ${this.performanceMetrics.proaCallDuration.toFixed(0)}ms`);
                
            } catch (error) {
                this.logger.error('⚠️ PROA service failed, using cached data or fallback');
                
                // Try cache
                const cached = this.api.getCachedResults(this.quiz.getUserId(), this.quiz.getAnswers());
                if (cached) {
                    this.logger.info('💾 Using cached PROA result');
                    this.proaResult = cached.proaResult;
                } else if (this.offlineMode) {
                    this.proaResult = this.generateOfflineProaResult();
                } else {
                    throw error;
                }
            }

            // Apply coherence decision layer with cluster detection
            const recommendationDecision = this.resolveRecommendationDecision(this.proaResult);
            const coherentFields = recommendationDecision.fields
                .sort((a, b) => this.getFieldConfidenceScore(b) - this.getFieldConfidenceScore(a))
                .slice(0, 5);
            const recommendedFields = coherentFields.map(f => f.field_name);
            
            this.logger.info(`✅ PROA Result: ${recommendedFields.length} top fields`);
            this.logger.info(`🧠 Dominant cluster: ${recommendationDecision.dominantCluster}`);

            let universities = [];
            let centres = [];

            if (this.quiz.getCurrentRole() === 'student') {
                // Step 2: Call PORA service (with bac)
                this.ui.showProgress(2, 3, 'Calcul des recommandations');
                this.performanceMetrics.poraCallTime = performance.now();
                
                try {
                    const poraSharedPayload = {
                        user_id: this.quiz.getUserId(),
                        profile_id: this.profileId,
                        recommended_fields: recommendedFields,
                        field_scores: this.proaResult?.field_scores || {},
                        budget_preference: this.quiz.getBudgetPreference(),
                        quiz_type: 'orientation',
                        user_type: this.userProfile?.user_type || sessionStorage.getItem('user-role') || 'bachelier',
                        bac_code: this.quiz.getBacType()
                    };

                    // Parallel calls for better performance
                    const [poraUnivResult, poraCentreResult] = await Promise.allSettled([
                        this.api.callPoraService('universites', poraSharedPayload, this.quiz.getBacType()),
                        this.api.callPoraService('centres', poraSharedPayload, this.quiz.getBacType())
                    ]);
                    
                    this.performanceMetrics.poraCallDuration = performance.now() - this.performanceMetrics.poraCallTime;
                    this.trackPerformance('pora_call', this.performanceMetrics.poraCallDuration);
                    
                    if (poraUnivResult.status === 'fulfilled') {
                        universities = await this.api.strictFilterPoraRecommendations(
                            'universites',
                            poraUnivResult.value.universites || [],
                            recommendedFields
                        );
                    }
                    
                    if (poraCentreResult.status === 'fulfilled') {
                        centres = await this.api.strictFilterPoraRecommendations(
                            'centres',
                            poraCentreResult.value.centres || [],
                            recommendedFields
                        );
                    }
                    
                    this.logger.info(`✅ PORA completed: ${universities.length} universities, ${centres.length} centres`);
                    
                } catch (error) {
                    this.logger.warn('⚠️ Failed to get PORA recommendations:', error);
                    universities = [];
                    centres = [];
                }
            }

            // Step 3: Prepare final result with bac insights
            const topField = coherentFields[0] || this.proaResult?.recommended_fields?.[0];
            const coverage = this.resolveCoverage();
            const bacInfo = this.quiz.getBacType() && this.api ? this.api.getBacInfo(this.quiz.getBacType()) : null;
            
            const resultData = {
                title: topField?.field_name || 'Profil Unique',
                description: topField?.reason || 'Votre profil d\'orientation a été calculé.',
                aiInsight: this.buildAiInsight(topField, recommendedFields, coverage, bacInfo),
                parentBudget: this.quiz.getBudgetAdvice(),
                coverage,
                bac_info: bacInfo,
                recommendations: {
                    top_fields: recommendedFields.slice(0, 5),
                    top_field_details: coherentFields.slice(0, 5),
                    universities,
                    centres
                },
                dominantCluster: recommendationDecision.dominantCluster,
                performanceMetrics: {
                    totalTime: performance.now() - submitStartTime,
                    proaTime: this.performanceMetrics.proaCallDuration,
                    poraTime: this.performanceMetrics.poraCallDuration
                }
            };

            // Cache results
            this.api.cacheResults(this.quiz.getUserId(), {
                proaResult: this.proaResult,
                resultData,
                answers: this.quiz.getAnswers(),
                timestamp: Date.now()
            });

            // Track completion
            this.trackEvent('quiz_completed', {
                total_time_ms: performance.now() - (this.performanceMetrics.quizStartTime || performance.now()),
                recommended_fields_count: recommendedFields.length,
                bac_used: !!this.quiz.getBacType()
            });

            // Display results
            this.logger.info('🎯 Final resultData to render:', resultData);
            this.ui.renderResults(resultData);

        } catch (error) {
            this.logger.error('❌ Critical error in submitAndShowResults:', error);
            this.trackEvent('quiz_error', { error: error.message });
            if (this.ui) {
                this.ui.showError(
                    'Une erreur critique s\'est produite. Veuillez réessayer.',
                    () => this.submitAndShowResults()
                );
            }
        }
    }

    /**
     * Generate offline PROA result (NOUVEAU)
     */
    generateOfflineProaResult() {
        if (!this.quiz) {
            return {
                recommended_fields: [],
                field_scores: {},
                confidence: 0.3,
                offline_mode: true
            };
        }
        
        const answers = this.quiz.getAnswers();
        const answerValues = Object.values(answers);
        const avgScore = answerValues.length > 0 ? answerValues.reduce((a, b) => a + b, 0) / answerValues.length : 0.5;
        
        return {
            recommended_fields: [
                { field_name: "Informatique", score: avgScore * 0.8, reason: "Analyse hors ligne" },
                { field_name: "Commerce", score: avgScore * 0.6, reason: "Analyse hors ligne" }
            ],
            field_scores: {},
            confidence: 0.5,
            offline_mode: true
        };
    }

    /**
     * Build AI insight with bac integration (AMÉLIORÉ)
     */
    buildAiInsight(topField, recommendedFields = [], coverage = null, bacInfo = null) {
        const fieldName = topField?.field_name || recommendedFields?.[0] || 'ton orientation';
        const score = topField?.score || topField?.confidence || null;
        const bacMatchScore = Number(topField?.bac_match_score ?? topField?.bac_score ?? 0);
        const coverageSuffix = Number.isFinite(coverage)
            ? ` Couverture des réponses: ${Math.round(coverage * 100)}%.`
            : '';

        // Bac-specific insight
        let bacSuffix = '';
        if (bacInfo) {
            if (bacMatchScore >= 0.7) {
                bacSuffix = ` Ton bac ${bacInfo.code} (${bacInfo.label}) est particulièrement bien adapté à cette orientation.`;
            } else if (bacInfo.boost > 1) {
                bacSuffix = ` Ton bac ${bacInfo.code} te donne un bonus de ${Math.round((bacInfo.boost - 1) * 100)}% pour les filières techniques.`;
            } else {
                bacSuffix = ` Avec ton bac ${bacInfo.code}, explore bien toutes les options avant de choisir.`;
            }
        }

        if (score && Number(score) >= 0.75) {
            return `Ton profil montre une forte cohérence autour de ${fieldName}, avec un vrai potentiel d'analyse et d'initiative.${bacSuffix}${coverageSuffix}`;
        }

        if (bacMatchScore >= 0.7) {
            return `Ton profil garde plusieurs options ouvertes, mais ${fieldName} ressort avec une bonne cohérence.${bacSuffix}${coverageSuffix}`;
        }

        if (recommendedFields.length >= 3) {
            return `Ton profil combine curiosité, adaptation et sens de progression. ${fieldName} ressort comme une piste solide.${bacSuffix}${coverageSuffix}`;
        }

        return `Ton profil montre une forte capacité d'analyse et une progression claire vers ${fieldName}.${bacSuffix}${coverageSuffix}`;
    }

    /**
     * Track performance metric (NOUVEAU)
     */
    trackPerformance(metricName, durationMs) {
        if (window.gtag && window.gtag) {
            window.gtag('event', 'performance', {
                event_category: 'app_performance',
                event_label: metricName,
                value: Math.round(durationMs)
            });
        }
        this.logger.debug(`📊 Performance: ${metricName} = ${durationMs.toFixed(0)}ms`);
    }

    /**
     * Track user event (NOUVEAU)
     */
    trackEvent(eventName, eventParams = {}) {
        if (window.gtag && window.gtag) {
            window.gtag('event', eventName, eventParams);
        }
        this.logger.debug(`📊 Event: ${eventName}`, eventParams);
    }

    /**
     * Resolve recommendation decision with cluster detection
     */
    resolveRecommendationDecision(proaResult) {
        const fields = Array.isArray(proaResult?.recommended_fields)
            ? [...proaResult.recommended_fields]
            : [];

        if (fields.length === 0) {
            return { dominantCluster: null, fields: [] };
        }

        const clusterScores = {};
        fields.forEach((field, index) => {
            const cluster = field.cluster || this.inferClusterFromFieldName(field.field_name);
            field.cluster = cluster;

            const baseScore = Number(field.decision_score ?? field.score ?? field.confidence ?? 0.1);
            const rankWeight = 1 / (index + 1);
            clusterScores[cluster] = (clusterScores[cluster] || 0) + (baseScore * rankWeight);
        });

        let dominantCluster = proaResult?.dominant_cluster || null;
        if (!dominantCluster) {
            const sortedClusters = Object.entries(clusterScores).sort((a, b) => b[1] - a[1]);
            dominantCluster = sortedClusters[0]?.[0] || null;
        }

        if (!dominantCluster || dominantCluster === 'unknown') {
            return { dominantCluster, fields };
        }

        const ordered = [
            ...fields.filter(field => field.cluster === dominantCluster),
            ...fields.filter(field => field.cluster === 'unknown'),
            ...fields.filter(field => field.cluster !== dominantCluster && field.cluster !== 'unknown')
        ];

        return {
            dominantCluster,
            fields: ordered
        };
    }

    /**
     * Infer cluster from field name
     */
    inferClusterFromFieldName(fieldName = '') {
        const normalized = String(fieldName).toLowerCase();

        if (/(reseau|telecom|informatique|logiciel|data|cyber|ia|intelligence artificielle)/.test(normalized)) {
            return 'informatique';
        }
        if (/(droit|juridique|justice|penal|public|prive|diplomatie|politique)/.test(normalized)) {
            return 'droit';
        }
        if (/(compta|finance|gestion|marketing|commerce|business|logistique)/.test(normalized)) {
            return 'business';
        }
        if (/(medec|sante|pharma|infirm)/.test(normalized)) {
            return 'sante';
        }

        return 'unknown';
    }

    /**
     * Resolve coverage from result
     */
    resolveCoverage() {
        const breakdownCoverage = Number(
            this.proaResult?.confidence_breakdown?.question_coverage?.score
            ?? this.proaResult?.confidence_breakdown?.question_coverage
        );
        if (Number.isFinite(breakdownCoverage) && breakdownCoverage > 0) {
            return breakdownCoverage;
        }

        const answeredQuestions = Object.keys(this.quiz?.getAnswers?.() || {}).length;
        const totalQuestions = this.quiz?.getTotalQuestions?.() || answeredQuestions || 1;
        return Math.min(1, answeredQuestions / Math.max(totalQuestions, 1));
    }

    /**
     * Get field confidence score
     */
    getFieldConfidenceScore(field = {}) {
        const rawScore = Number(field.decision_score ?? field.score ?? field.confidence ?? 0);
        if (!Number.isFinite(rawScore)) {
            return 0;
        }

        return rawScore > 1 ? rawScore / 100 : rawScore;
    }

    /**
     * Restart the application
     */
    restart() {
        this.logger.info('🔄 Restarting application...');
        if (this.quiz) {
            this.quiz.reset();
        }
        this.proaResult = null;
        this.poraResult = null;
        this.pendingRole = null;
        this.performanceMetrics = {
            appStartTime: performance.now(),
            initTime: 0,
            quizStartTime: null,
            quizEndTime: null,
            proaCallTime: null,
            proaCallDuration: 0,
            poraCallTime: null,
            poraCallDuration: 0
        };
        if (this.ui) {
            this.ui.showWelcome();
        }
        this.trackEvent('app_restart', {});
    }

    /**
     * Get current state (for debugging)
     */
    getState() {
        return {
            initialized: this.initialized,
            offlineMode: this.offlineMode,
            currentRole: this.quiz ? this.quiz.getCurrentRole() : null,
            bacType: this.quiz ? this.quiz.getBacType() : null,
            selectedAnswers: this.quiz ? this.quiz.getAnswers() : {},
            proaResult: this.proaResult,
            poraResult: this.poraResult,
            performanceMetrics: this.performanceMetrics,
            servicesReady: {
                api: !!this.api,
                quiz: !!this.quiz,
                ui: !!this.ui
            }
        };
    }
}

// ============================================================
// 🚀 BOOTSTRAP APPLICATION
// ============================================================

// Export classes
if (typeof window !== 'undefined') {
    window.OrientationApp = OrientationApp;
    window.Logger = Logger;

    /**
     * Bootstrap application - Wait for Flutter injection before initializing
     */
    const bootstrapApp = async () => {
        console.log('🚀 Bootstrapping Orientation App V2...');

        // Create app instance
        const app = new OrientationApp();
        window.orientationApp = app;
        app.setupEventListeners();

        /**
         * Notify Flutter that auth is ready
         */
        if (window.FlutterBridge && window.FlutterBridge.postMessage) {
            window.FlutterBridge.postMessage('AUTH_READY');
        }

        await app.init();

        console.log('✅ Orientation App V2 fully initialized');
    };

    // Start app when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapApp);
    } else {
        bootstrapApp();
    }
}