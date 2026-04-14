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
     * 🚀 Auto-start quiz if JWT token is present (Flutter integration)
     * Checks for JWT in cookies/localStorage and launches appropriate quiz automatically
     */
    async autoStartWithToken() {
        try {
            this.logger.info('🔍 Checking for JWT token for auto-start...');

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
                const userType = userProfile.user_type || 'bachelier';
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
     * Setup DOM event listeners
     */
    setupEventListeners() {
        // Role selection buttons
        document.querySelectorAll('[data-role]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const role = e.currentTarget.getAttribute('data-role');
                this.startQuiz(role);
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

            const quizState = this.quiz.startQuiz(role);
            this.ui.showQuiz(role);
            this.ui.renderQuestion(quizState.firstQuestion);

            this.logger.info(`✅ Quiz started: ${quizState.totalQuestions} questions`);
        } catch (error) {
            this.logger.error('❌ Failed to start quiz:', error);
            this.ui.showError('Impossible de démarrer le quiz. Veuillez réessayer.');
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

            // Step 2: Extract recommended fields and call PORA if student
            const recommendedFields = this.proaResult?.recommended_fields?.map(f => f.field_name) || [];
            this.logger.info(`✅ PROA Result: ${recommendedFields.length} fields recommended:`, recommendedFields);

            let universities = [];
            let centres = [];

            if (this.quiz.getCurrentRole() === 'student') {
                // Step 2: Call PORA service for recommendations
                this.ui.showProgress(2, 3, 'Calcul des recommandations');
                try {
                    const poraPayload = {
                        user_id: this.quiz.getUserId(),
                        profile_id: this.profileId,  // 🔗 Traçabilité vers le profil PROA
                        recommended_fields: recommendedFields,
                        quiz_type: 'orientation'
                    };

                    const poraResult = await this.api.callPoraService('universites', poraPayload);
                    this.logger.info('✅ PORA universities result:', poraResult);
                    // Utiliser directement les données de PORA (elles contiennent target_name, score, confidence, reason)
                    universities = poraResult.universites || [];
                    this.logger.info(`✅ Got ${universities.length} university recommendations from PORA`);

                    // Appeler PORA pour les centres aussi
                    const poraCentresPayload = {
                        user_id: this.quiz.getUserId(),
                        profile_id: this.profileId,
                        recommended_fields: recommendedFields,
                        quiz_type: 'orientation'
                    };

                    const poraCentresResult = await this.api.callPoraService('centres', poraCentresPayload);
                    this.logger.info('✅ PORA centres result:', poraCentresResult);

                    centres = poraCentresResult.centres || [];
                    this.logger.info(`✅ Got ${centres.length} centre recommendations from PORA`);

                } catch (error) {
                    this.logger.warn('⚠️ Failed to get PORA recommendations:', error);
                    universities = [];
                    centres = [];
                    // Continue gracefully - show results without recommendations
                }
            }

            // Step 3: Prepare final result data
            const topField = this.proaResult?.recommended_fields?.[0];
            const resultData = {
                title: topField?.field_name || 'Profil Unique',
                description: topField?.reason || 'Votre profil d\'orientation a été calculé.',
                aiInsight: this.buildAiInsight(topField, recommendedFields),
                parentBudget: this.quiz.getBudgetAdvice(),
                recommendations: {
                    top_fields: recommendedFields.slice(0, 5),
                    universities,
                    centres
                }
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
        this.ui.showWelcome();
    }

    buildAiInsight(topField, recommendedFields = []) {
        const fieldName = topField?.field_name || recommendedFields?.[0] || 'ton orientation';
        const score = topField?.score || topField?.confidence || null;

        if (score && Number(score) >= 0.75) {
            return `Ton profil montre une forte coherence autour de ${fieldName}, avec un vrai potentiel d analyse et d initiative.`;
        }

        if (recommendedFields.length >= 3) {
            return `Ton profil combine curiosite, adaptation et sens de progression. ${fieldName} ressort comme une piste solide parmi plusieurs options prometteuses.`;
        }

        return `Ton profil montre une forte capacite d analyse et une progression claire vers ${fieldName}.`;
    }


    /**
     * Get current state (for debugging)
     */
    getState() {
        return {
            initialized: this.initialized,
            currentRole: this.quiz ? this.quiz.getCurrentRole() : null,
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

