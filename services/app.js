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

            this.initialized = true;
            this.ui.showWelcome();
            this.logger.info('✅ Application ready!');

        } catch (error) {
            this.logger.error('❌ Initialization failed:', error);
            this.ui.showError('Erreur d\'initialisation. Veuillez rafraîchir la page.');
        }
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
            } catch (error) {
                this.logger.error('⚠️ PROA service failed, using cached data or fallback');
                
                // Try cache
                const cached = this.api.getCachedResults(this.quiz.getUserId());
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
                // Step 2a: Fetch filieres for universities
                this.ui.showProgress(2, 3, 'Recherche des universités');
                try {
                    const univFilieres = await this.api.fetchFilieresForUniversities(recommendedFields);
                    this.logger.info(`✅ Found ${univFilieres.length} university matches`);

                    // Step 2b: Call PORA to rank universities
                    if (univFilieres.length > 0) {
                        const univIds = [...new Set(univFilieres.map(r => r.universite_id))];
                        const poraPayload = {
                            user_id: this.quiz.getUserId(),
                            recommended_fields: recommendedFields,
                            quiz_type: 'orientation'
                        };

                        const poraResult = await this.api.callPoraService('universities', poraPayload);
                        this.logger.info('✅ PORA result:', poraResult);

                        // Step 2c: Fetch university details (NAMES, not UUIDs!)
                        const univDetails = await this.api.fetchUniversityDetails(univIds);
                        this.logger.info(`✅ Fetched ${univDetails.length} university details`);

                        // Merge PORA scores with university details
                        universities = univIds.slice(0, 3).map((univId, idx) => {
                            const details = univDetails.find(u => u.id === univId);
                            const poraScore = poraResult.universites?.find(p => p.universite_id === univId)?.pora_score || 0;
                            
                            return {
                                id: univId,
                                name: details?.nom || `Université ${univId.substring(0, 8)}`,
                                city: details?.ville || 'Non spécifiée',
                                poraScore: poraScore,
                                filieres: univFilieres
                                    .filter(r => r.universite_id === univId)
                                    .map(r => r.filieres || {})
                            };
                        });
                    }

                    // Step 2d: Fetch centres
                    this.ui.showProgress(3, 3, 'Recherche des centres de formation');
                    const centreFilieres = await this.api.fetchFilieresForCentres(recommendedFields);
                    this.logger.info(`✅ Found ${centreFilieres.length} centre matches`);

                    if (centreFilieres.length > 0) {
                        const centreIds = [...new Set(centreFilieres.map(r => r.centre_formation_id))];
                        const centreDetails = await this.api.fetchCentreDetails(centreIds);
                        this.logger.info(`✅ Fetched ${centreDetails.length} centre details`);

                        centres = centreIds.slice(0, 3).map(centreId => {
                            const details = centreDetails.find(c => c.id === centreId);
                            return {
                                id: centreId,
                                name: details?.nom || `Centre ${centreId.substring(0, 8)}`,
                                city: details?.ville || 'Non spécifiée'
                            };
                        });
                    }
                } catch (error) {
                    this.logger.warn('⚠️ Failed to fetch universities/centres:', error);
                    // Continue gracefully - show results without recommendations
                }
            }

            // Step 3: Prepare final result data
            const topField = this.proaResult?.recommended_fields?.[0];
            const resultData = {
                title: topField?.field_name || 'Profil Unique',
                description: topField?.reason || 'Votre profil d\'orientation a été calculé.',
                parentBudget: this.quiz.getBudgetAdvice(),
                recommendations: {
                    universities,
                    centres
                }
            };

            // Cache results for offline use
            this.api.cacheResults(this.quiz.getUserId(), {
                proaResult: this.proaResult,
                resultData
            });

            // Step 4: Display final results (with REAL data, not incomplete!)
            this.ui.renderResults(resultData);
            this.logger.info('✅ Results displayed successfully!');

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
