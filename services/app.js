/**
 * Orientation App Orchestrator
 * Coordinates APIService, QuizService, UIRenderer
 * Main entry point for the quiz application
 */

class OrientationApp {
    constructor() {
        this.logger = new Logger(window.getConfig('UI.DEBUG_LOG_LEVEL', 'info'));
        this.api = null;
        this.quiz = null;
        this.ui = null;
        this.proaResult = null;
        this.poraResult = null;
        this.pendingRole = null;
        this.initialized = false;
    }

    /**
     * Initialize the entire application
     */
    async init() {
        try {
            this.logger.info('🚀 Initializing Orientation App...');

            // Step 1: Initialize configuration
            await CONFIG.initialize();
            this.logger.info('✅ Configuration loaded');

            // Step 2: Create services
            this.api = new APIService({
                SUPABASE_URL: window.CONFIG.SUPABASE.URL,
                SUPABASE_ANON_KEY: window.CONFIG.SUPABASE.ANON_KEY,
                PROA_URL: window.CONFIG.SERVICES.PROA_URL,
                PORA_URL: window.CONFIG.SERVICES.PORA_URL,
                TIMEOUT_MS: window.CONFIG.SERVICES.TIMEOUT_MS,
                RETRY_ATTEMPTS: window.CONFIG.SERVICES.RETRY_ATTEMPTS,
                RETRY_DELAY_MS: window.CONFIG.SERVICES.RETRY_DELAY_MS,
                logger: this.logger
            });

            this.quiz = new QuizService({
                logger: this.logger
            });

            this.ui = new UIRenderer({
                logger: this.logger,
                onQuestionAnswered: (value) => this.handleQuestionAnswered(value)
            });

            this.logger.info('✅ Services created');

            // Step 3: Load quiz questions from database
            try {
                const questions = await this.api.loadQuizStructure();
                const quizzes = await this.quiz.initialize(questions);
                this.logger.info(`✅ Loaded ${Object.keys(quizzes).length} quiz types`);
            } catch (error) {
                this.logger.error('❌ Failed to load quiz structure:', error);
                this.ui.showError(
                    'Impossible de charger le quiz. Veuillez rafraîchir la page.',
                    () => location.reload()
                );
                return;
            }

            // Step 4: Setup event listeners
            this.setupEventListeners();

            // Step 5: Try auto-start with JWT token (Flutter integration)
            const autoStarted = await this.autoStartWithToken();

            if (!autoStarted) {
                // No token or auto-start failed, show welcome screen
                this.ui.showWelcome();
            }

            this.initialized = true;
            this.logger.info('✅ Application ready!');

        } catch (error) {
            this.logger.error('❌ Initialization failed:', error);
            this.ui.showError('Erreur d\'initialisation. Veuillez rafraîchir la page.');
        }
    }

    /**
     * 🚀 Auto-start quiz based on user_type from Flutter
     * Maps user_type to quiz role and launches automatically
     */
    async autoStartWithToken() {
        try {
            this.logger.info('🔍 Checking for user_type for auto-start...');

            // 👈 NEW: First check if user_type is in localStorage (from Flutter injection)
            const userType = localStorage.getItem('user_type');
            if (userType) {
                // Map user_type to quiz role
                let quizRole;

                switch (userType.toLowerCase()) {
                    case 'bachelier':
                        quizRole = 'student'; // 15 questions - exploration
                        break;
                    case 'etudiant':
                        quizRole = 'student'; // 10 questions - réorientation
                        break;
                    case 'parent':
                        quizRole = 'parent'; // 5 questions - guidage
                        break;
                    default:
                        quizRole = 'student'; // Default fallback
                        this.logger.warn(`⚠️ Unknown user_type "${userType}", defaulting to student`);
                }

                this.logger.info(`🎯 Auto-starting quiz | user_type=${userType} | role=${quizRole}`);

                // Store JWT token for API calls
                const jwtToken = localStorage.getItem('jwt_token') || localStorage.getItem('access_token');
                const userId = localStorage.getItem('user_id') || sessionStorage.getItem('user-id');
                if (jwtToken) {
                    this.jwtToken = jwtToken;
                }
                if (userId) {
                    this.userProfile = { user_id: userId, user_type: userType };
                    if (!sessionStorage.getItem('user-id')) {
                        sessionStorage.setItem('user-id', userId);
                    }
                }

                if (!userId) {
                    this.logger.warn('⚠️ Flutter auto-start requested but user_id is missing; deferring until injection completes');
                    return false;
                }

                // Start quiz automatically
                await this.startQuiz(quizRole);
                return true;
            }

            // Fallback to old JWT token-based auto-start (if no user_type from Flutter)
            this.logger.info('ℹ️ No user_type from Flutter, checking for JWT token fallback...');

            // Check for JWT in cookies first (preferred by Flutter)
            let jwtToken = this.getCookie('jwt_token') || this.getCookie('access_token');

            // Fallback to localStorage
            if (!jwtToken) {
                jwtToken = localStorage.getItem('jwt_token') || localStorage.getItem('access_token');
            }

            if (!jwtToken) {
                this.logger.info('ℹ️ No JWT token found, showing welcome screen');
                return false; // No token, show normal welcome
            }

            this.logger.info('🔑 JWT token found, fetching user profile...');

            try {
                // Fetch user profile from PROA service using JWT
                const profileResponse = await fetch(`${window.CONFIG.SERVICES.PROA_URL}/orientation/profile`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${jwtToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000 // 5 second timeout
                });

                if (!profileResponse.ok) {
                    this.logger.warn(`⚠️ Profile fetch failed with status ${profileResponse.status}, falling back to welcome screen`);
                    return false;
                }

                const userProfile = await profileResponse.json();
                this.logger.info('👤 User profile retrieved:', userProfile);

                // Map user_type to quiz role
                const userTypeFromProfile = userProfile.user_type || 'bachelier';
                let quizRole;

                switch (userTypeFromProfile.toLowerCase()) {
                    case 'bachelier':
                        quizRole = 'student'; // 15 questions - exploration
                        break;
                    case 'etudiant':
                        quizRole = 'student'; // 10 questions - réorientation
                        break;
                    case 'parent':
                        quizRole = 'parent'; // 5 questions - guidage
                        break;
                    default:
                        quizRole = 'student'; // Default fallback
                        this.logger.warn(`⚠️ Unknown user_type "${userTypeFromProfile}", defaulting to student`);
                }

                this.logger.info(`🎯 Auto-starting quiz | user_type=${userTypeFromProfile} | role=${quizRole}`);

                // Store user info for later use
                this.userProfile = userProfile;
                this.jwtToken = jwtToken;

                // Start quiz automatically
                await this.startQuiz(quizRole);

                return true; // Auto-started successfully

            } catch (fetchError) {
                this.logger.warn(`⚠️ Profile fetch error (non-blocking): ${fetchError.message}`);
                // Don't fail the app initialization just because profile fetch failed
                return false; // Fall back to welcome screen
            }

        } catch (error) {
            this.logger.warn('⚠️ Auto-start check failed (non-blocking):', error);
            // Fall back to normal welcome screen - don't crash the app
            return false;
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

            const token = detail?.token || detail?.jwtToken || detail?.accessToken || localStorage.getItem('jwt_token') || localStorage.getItem('access_token');
            const userType = detail?.userType || detail?.user_type || localStorage.getItem('user_type');
            const userId = detail?.userId || detail?.user_id || localStorage.getItem('user_id');

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

            if (this.initialized && this.quiz && !this.quiz.getCurrentRole()) {
                this.logger.info('📱 Deferred auto-start after Flutter injection');
                await this.autoStartWithToken();
            }
        } catch (error) {
            this.logger.warn('⚠️ Error handling FlutterTokenReady event:', error);
        }
    }

    /**
     * Setup DOM event listeners
     */
    setupEventListeners() {
        // 🔐 Listen for Flutter token injection (PORA integration)
        window.addEventListener('FlutterTokenReady', (event) => {
            this.logger.info('📱 Flutter token ready event received', event.detail);
            this.handleFlutterTokenReady(event.detail);
        });

        // Role selection buttons
        document.querySelectorAll('[data-role]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const role = e.currentTarget.getAttribute('data-role');
                this.startQuiz(role);
            });
        });

        document.querySelectorAll('[data-bac-value]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const bacType = e.currentTarget.getAttribute('data-bac-value');
                this.handleBacSelected(bacType);
            });
        });

        // Restart button
        const restartBtn = document.querySelector('[data-action="restart"]');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.restart());
        }

        this.logger.info('✅ Event listeners setup');
    }

    /**
     * Start quiz for a given role (student or parent)
     */
    async startQuiz(role) {
        try {
            this.logger.info(`🎮 Starting quiz for role: ${role}`);

            if (role === 'student' && !this.quiz.hasBacType()) {
                this.pendingRole = role;
                this.ui.showBacSelection(this.quiz.getBacType());
                this.logger.info('Waiting for required bac type before starting student quiz');
                return;
            }

            const quizState = this.quiz.startQuiz(role);
            this.pendingRole = null;
            this.ui.showQuiz(role);
            this.ui.renderQuestion(quizState.firstQuestion);

            this.logger.info(`✅ Quiz started: ${quizState.totalQuestions} questions`);
        } catch (error) {
            this.logger.error('❌ Failed to start quiz:', error);
            this.ui.showError('Impossible de démarrer le quiz. Veuillez réessayer.');
        }
    }

    /**
     * Handle bac selection before the student quiz starts
     */
    async handleBacSelected(value) {
        try {
            const bacType = this.quiz.setBacType(value);
            this.logger.info(`Bac type selected: ${bacType}`);
            await this.startQuiz(this.pendingRole || 'student');
        } catch (error) {
            this.logger.error('Failed to register bac type:', error);
            this.ui.showBacSelection(this.quiz.getBacType());
        }
    }

    /**
     * Handle question answered
     */
    async handleQuestionAnswered(value) {
        try {
            const result = this.quiz.answerQuestion(value);

            if (result.complete) {
                // Quiz finished - submit and show results
                await this.submitAndShowResults();
            } else {
                // Show next question
                this.ui.renderQuestion(result.nextQuestion);
            }
        } catch (error) {
            this.logger.error('❌ Error handling answer:', error);
            this.ui.showError('Une erreur s\'est produite. Veuillez réessayer.');
        }
    }

    /**
     * CRITICAL: Submit quiz responses and show results
     * This is the main async flow that was broken before
     */
    async submitAndShowResults() {
        try {
            this.logger.info('📤 Quiz complete! Submitting responses...');

            // Show results screen with loading state
            this.ui.showResults();
            this.ui.showLoader('Analyse en cours... Calcul du profil');

            // Map responses to PROA format
            let proaPayload;
            const isMissingBacError = (error) =>
                String(error?.message || error || '').toLowerCase().includes('type de bac');
            try {
                proaPayload = this.quiz.mapToProaFormat();
            } catch (error) {
                this.logger.error('❌ Response validation failed:', error);
                this.ui.showError('Réponses invalides. Veuillez relancer le quiz.');
                return;
            }

            // Step 1: Call PROA service (field recommendations)
            this.ui.showProgress(1, 3, 'Récupération des filières recommandées');
            try {
                this.proaResult = await this.api.callProaService(proaPayload);
                // 🔗 Sauvegarder profile_id pour la traçabilité des recommandations
                this.profileId = this.proaResult?.profile_id || null;
                
                // 🔍 LOG: Vérifier que profile_id est bien reçu
                this.logger.info('📋 PROA Full Response:', this.proaResult);
                this.logger.info(`🔗 ProfileID extracted: "${this.profileId}"`);
                
                if (!this.profileId) {
                    this.logger.warn('⚠️ WARNING: profile_id is null or undefined - recommandations may not be traced!');
                }
            } catch (error) {
                this.logger.error('⚠️ PROA service failed, using cached data or fallback');
                
                // Try cache
                const cached = this.api.getCachedResults(this.quiz.getUserId(), this.quiz.getAnswers());
                if (cached) {
                    this.logger.info('💾 Using cached PROA result');
                    this.proaResult = cached.proaResult;
                } else {
                    this.logger.error('❌ No cache available, showing error');
                    this.ui.showError(
                        'Impossible de récupérer les recommandations de filières.',
                        () => this.submitAndShowResults()
                    );
                    return;
                }
            }

            // Step 2: Apply a final coherence decision layer before calling PORA
            const recommendationDecision = this.resolveRecommendationDecision(this.proaResult);
            const coherentFields = recommendationDecision.fields
                .filter(field => this.getFieldConfidenceScore(field) > 0.9);
            const recommendedFields = coherentFields.map(f => f.field_name);
            this.logger.info(`✅ PROA Result: ${recommendedFields.length} fields above 90% recommended:`, recommendedFields);
            this.logger.info(`🧠 Decision layer dominant cluster: ${recommendationDecision.dominantCluster}`);

            let universities = [];
            let centres = [];

            if (this.quiz.getCurrentRole() === 'student') {
                // Step 2: Call PORA service for recommendations
                this.ui.showProgress(2, 3, 'Calcul des recommandations');
                try {
                    const poraSharedPayload = {
                        user_id: this.quiz.getUserId(),
                        profile_id: this.profileId,
                        recommended_fields: recommendedFields,
                        field_scores: this.proaResult?.field_scores || {},
                        budget_preference: this.quiz.getBudgetPreference(),
                        quiz_type: 'orientation',
                        user_type: this.userProfile?.user_type || localStorage.getItem('user_type') || sessionStorage.getItem('user-role') || 'bachelier'
                    };

                    const poraPayload = {
                        ...poraSharedPayload,
                        user_id: this.quiz.getUserId(),
                        profile_id: this.profileId,  // 🔗 Traçabilité vers le profil PROA
                        recommended_fields: recommendedFields,
                        quiz_type: 'orientation'
                    };

                    const poraResult = await this.api.callPoraService('universites', poraPayload);
                    this.logger.info('✅ PORA universities result:', poraResult);
                    universities = await this.api.strictFilterPoraRecommendations(
                        'universites',
                        poraResult.universites || [],
                        recommendedFields
                    );
                    this.logger.info(`✅ Got ${universities.length} strict university recommendations from PORA`);

                    // Appeler PORA pour les centres aussi
                    const poraCentresPayload = {
                        ...poraSharedPayload,
                        user_id: this.quiz.getUserId(),
                        profile_id: this.profileId,
                        recommended_fields: recommendedFields,
                        quiz_type: 'orientation'
                    };

                    const poraCentresResult = await this.api.callPoraService('centres', poraCentresPayload);
                    this.logger.info('✅ PORA centres result:', poraCentresResult);

                    centres = await this.api.strictFilterPoraRecommendations(
                        'centres',
                        poraCentresResult.centres || [],
                        recommendedFields
                    );
                    this.logger.info(`✅ Got ${centres.length} strict centre recommendations from PORA`);

                } catch (error) {
                    this.logger.warn('⚠️ Failed to get PORA recommendations:', error);
                    universities = [];
                    centres = [];
                    // Continue gracefully - show results without recommendations
                }
            }

            // Step 3: Prepare final result data
            const topField = coherentFields[0] || this.proaResult?.recommended_fields?.[0];
            const coverage = this.resolveCoverage();
            const resultData = {
                title: topField?.field_name || 'Profil Unique',
                description: topField?.reason || 'Votre profil d\'orientation a été calculé.',
                aiInsight: this.buildAiInsight(topField, recommendedFields, coverage),
                parentBudget: this.quiz.getBudgetAdvice(),
                coverage,
                recommendations: {
                    top_fields: recommendedFields.slice(0, 5),
                    top_field_details: coherentFields.slice(0, 5),
                    universities,
                    centres
                },
                dominantCluster: recommendationDecision.dominantCluster
            };

            // Cache results for offline use
            this.api.cacheResults(this.quiz.getUserId(), {
                proaResult: this.proaResult,
                resultData,
                answers: this.quiz.getAnswers()
            });

            // Step 4: Display final results (with REAL data, not incomplete!)
            this.logger.info('🎯 Final resultData to render:', resultData);
            this.logger.info('🏫 Universities data:', resultData.recommendations?.universities);
            this.logger.info('🏢 Centres data:', resultData.recommendations?.centres);

            this.ui.renderResults(resultData);

        } catch (error) {
            this.logger.error('❌ Critical error in submitAndShowResults:', error);
            this.ui.showError(
                'Une erreur critique s\'est produite. Veuillez réessayer.',
                () => this.submitAndShowResults()
            );
        }
    }

    /**
     * Restart the application
     */
    restart() {
        this.logger.info('🔄 Restarting application...');
        this.quiz.reset();
        this.proaResult = null;
        this.poraResult = null;
        this.pendingRole = null;
        this.ui.showWelcome();
    }

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

    getFieldConfidenceScore(field = {}) {
        const rawScore = Number(field.decision_score ?? field.score ?? field.confidence ?? 0);
        if (!Number.isFinite(rawScore)) {
            return 0;
        }

        return rawScore > 1 ? rawScore / 100 : rawScore;
    }

    buildAiInsight(topField, recommendedFields = [], coverage = null) {
        const fieldName = topField?.field_name || recommendedFields?.[0] || 'ton orientation';
        const score = topField?.score || topField?.confidence || null;
        const bacMatchScore = Number(topField?.bac_match_score ?? topField?.bac_score ?? 0);
        const coverageSuffix = Number.isFinite(coverage)
            ? ` Couverture des reponses: ${Math.round(coverage * 100)}%.`
            : '';

        if (score && Number(score) >= 0.75) {
            const bacSuffix = bacMatchScore >= 0.7
                ? ` La compatibilite avec ton bac renforce aussi cette piste (${Math.round(bacMatchScore * 100)}%).`
                : '';
            return `Ton profil montre une forte coherence autour de ${fieldName}, avec un vrai potentiel d analyse et d initiative.${bacSuffix}${coverageSuffix}`;
        }

        if (bacMatchScore >= 0.7) {
            return `Ton profil garde plusieurs options ouvertes, mais ${fieldName} ressort avec une bonne coherence et une compatibilite bac solide (${Math.round(bacMatchScore * 100)}%).${coverageSuffix}`;
        }

        if (recommendedFields.length >= 3) {
            return `Ton profil combine curiosite, adaptation et sens de progression. ${fieldName} ressort comme une piste solide parmi plusieurs options prometteuses.${coverageSuffix}`;
        }

        return `Ton profil montre une forte capacite d analyse et une progression claire vers ${fieldName}.${coverageSuffix}`;
    }


    /**
     * Get current state (for debugging)
     */
    getState() {
        return {
            initialized: this.initialized,
            currentRole: this.quiz ? this.quiz.getCurrentRole() : null,
            bacType: this.quiz ? this.quiz.getBacType() : null,
            selectedAnswers: this.quiz ? this.quiz.getAnswers() : {},
            proaResult: this.proaResult,
            poraResult: this.poraResult,
            servicesReady: {
                api: !!this.api,
                quiz: !!this.quiz,
                ui: !!this.ui
            }
        };
    }
}

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
            console.log(msg, ...args);
        }
    }

    warn(msg, ...args) {
        if (this.levels[this.level] <= this.levels.warn) {
            console.warn(msg, ...args);
        }
    }

    error(msg, ...args) {
        if (this.levels[this.level] <= this.levels.error) {
            console.error(msg, ...args);
        }
    }

    debug(msg, ...args) {
        if (this.levels[this.level] <= this.levels.debug) {
            console.debug(msg, ...args);
        }
    }
}

// Export and initialize on page load
if (typeof window !== 'undefined') {
    window.OrientationApp = OrientationApp;
    window.Logger = Logger;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            const app = new OrientationApp();
            app.init();
            window.orientationApp = app;
        });
    } else {
        const app = new OrientationApp();
        app.init();
        window.orientationApp = app;
    }
}

