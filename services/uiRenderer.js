/**
 * UI Renderer Module - Version 3.0
 * Handles all DOM updates: questions, results, loaders, errors
 * 
 * AMÉLIORATIONS V3:
 * - Support bac congolais complet (26 séries)
 * - Nouveau design moderne et clair pour les résultats
 * - Icônes Font Awesome Pro
 * - Animations améliorées (confettis, fadeInUp)
 * - Barres de progression pour les universités
 * - Badges de compatibilité colorés
 * - Score circulaire avec effet glow
 */

class UIRenderer {
    constructor(config = {}) {
        this.logger = config.logger || console;
        this.onQuestionAnswered = config.onQuestionAnswered || (() => {});
        this.onBacSelected = config.onBacSelected || (() => {});
        this.onNavigateQuestion = config.onNavigateQuestion || (() => {});
        this.onAnalyzeProfile = config.onAnalyzeProfile || (() => {});
        this.onShowRecommendations = config.onShowRecommendations || (() => {});
        this.multiChoiceSelected = [];
        this.currentResultData = null;
        this.elements = this.findElements();
        this.enhanceLayout();
        this.setupDelegatedEvents();
        this.currentQuestion = null;
        this.animating = false;
        this.bacInfo = null;
        
        // Animation durations
        this.ANIMATION_DURATION = config.animationDuration || 400;
        
        // Initialize ARIA attributes
        this.setupAccessibility();
    }

    setupDelegatedEvents() {
        // Options grid events
        this.elements.optionsGrid?.addEventListener('click', (e) => {
            const option = e.target.closest('[data-quiz-option]');
            if (!option || !this.elements.optionsGrid.contains(option)) return;

            e.preventDefault();
            const value = option.dataset.value;
            const optionType = option.dataset.quizOption;

            if (optionType === 'multi') {
                option.classList.toggle('selected');
                this.updateMultiChoiceValue(this.currentQuestion);
                return;
            }

            this.selectOption(option);
            
            // Add haptic feedback
            this.hapticFeedback();
            
            // Small delay for animation
            setTimeout(() => {
                this.onQuestionAnswered(value);
            }, 50);
        });
        
        // Bac selection events
        document.addEventListener('click', (e) => {
            const bacButton = e.target.closest('[data-bac-value]');
            if (bacButton && this.elements.bacScreen?.classList.contains('active')) {
                const bacValue = bacButton.getAttribute('data-bac-value');
                this.handleBacSelection(bacValue);
            }

            const prevButton = e.target.closest('[data-action="quiz-prev"]');
            if (prevButton) {
                e.preventDefault();
                this.onNavigateQuestion('prev');
                return;
            }

            const nextButton = e.target.closest('[data-action="quiz-next"]');
            if (nextButton) {
                e.preventDefault();
                this.onNavigateQuestion('next');
                return;
            }

            const analyzeButton = e.target.closest('[data-action="analyze-profile"]');
            if (analyzeButton) {
                e.preventDefault();
                this.onAnalyzeProfile();
                return;
            }

            const recommendationsButton = e.target.closest('[data-action="show-recommendations"]');
            if (recommendationsButton) {
                e.preventDefault();
                this.onShowRecommendations();
                return;
            }
        });
    }

    findElements() {
        return {
            welcomeScreen: document.getElementById('welcomeScreen'),
            bacScreen: document.getElementById('bacScreen'),
            quizScreen: document.getElementById('quizScreen'),
            resultScreen: document.getElementById('resultScreen'),
            gameHeader: document.getElementById('gameHeader'),
            levelName: document.getElementById('levelName'),
            currentStep: document.getElementById('currentStep'),
            totalSteps: document.getElementById('totalSteps'),
            questionText: document.getElementById('questionText'),
            optionsGrid: document.getElementById('optionsGrid'),
            progressFill: document.getElementById('progress-fill'),
            finalTitle: document.getElementById('finalTitle'),
            finalDesc: document.getElementById('finalDesc'),
            aiInsight: document.getElementById('aiInsight'),
            parentAddon: document.getElementById('parentAddon'),
            recommendationsContainer: document.getElementById('recommendationsContainer'),
            loaderSpinner: document.getElementById('loaderSpinner'),
            loaderText: document.getElementById('loaderText'),
            errorMessage: document.getElementById('errorMessage'),
            retryButton: document.getElementById('retryButton'),
            confidenceBadge: document.getElementById('confidenceBadge'),
            bacInfoContainer: document.getElementById('bacInfoContainer')
        };
    }

    setupAccessibility() {
        // Add ARIA live regions for screen readers
        const liveRegion = document.createElement('div');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.style.position = 'absolute';
        liveRegion.style.width = '1px';
        liveRegion.style.height = '1px';
        liveRegion.style.padding = '0';
        liveRegion.style.margin = '-1px';
        liveRegion.style.overflow = 'hidden';
        liveRegion.style.clip = 'rect(0, 0, 0, 0)';
        liveRegion.style.border = '0';
        document.body.appendChild(liveRegion);
        this.liveRegion = liveRegion;
    }

    announceToScreenReader(message) {
        if (this.liveRegion) {
            this.liveRegion.textContent = message;
            setTimeout(() => {
                this.liveRegion.textContent = '';
            }, 3000);
        }
    }

    enhanceLayout() {
        this.ensureQuestionMeta();
        this.ensureQuestionCard();
        this.ensureAiInsight();
        this.ensureConfidenceBadge();
        this.ensureBacInfoContainer();
        this.ensureResultStyles();
        this.elements = this.findElements();
    }

    ensureQuestionMeta() {
        const gameHeader = document.getElementById('gameHeader');
        if (!gameHeader) return;

        if (!document.getElementById('currentStep')) {
            const meta = document.createElement('div');
            meta.className = 'question-meta';
            meta.style.fontSize = '0.75rem';
            meta.style.color = '#94a3b8';
            meta.style.marginBottom = '6px';
            meta.innerHTML = 'Question <span id="currentStep">1</span> / <span id="totalSteps">30</span>';

            const progressTrack = gameHeader.querySelector('.progress-track');
            gameHeader.insertBefore(meta, progressTrack || null);
        }
    }

    ensureQuestionCard() {
        const questionText = document.getElementById('questionText');
        if (!questionText || questionText.parentElement?.classList.contains('question-card')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'question-card';
        questionText.parentNode.insertBefore(wrapper, questionText);
        wrapper.appendChild(questionText);
    }

    ensureAiInsight() {
        const resultBox = document.querySelector('.result-box');
        if (!resultBox || document.getElementById('aiInsight')) return;

        const insight = document.createElement('p');
        insight.id = 'aiInsight';
        insight.className = 'ai-insight';
        insight.style.marginTop = '15px';
        insight.style.fontSize = '0.9rem';
        insight.style.opacity = '0.8';
        resultBox.appendChild(insight);
    }

    ensureConfidenceBadge() {
        const resultBox = document.querySelector('.result-box');
        if (!resultBox || document.getElementById('confidenceBadge')) return;

        const badge = document.createElement('div');
        badge.id = 'confidenceBadge';
        badge.className = 'confidence-badge';
        badge.style.display = 'none';
        badge.style.marginTop = '10px';
        badge.style.padding = '8px 12px';
        badge.style.borderRadius = '20px';
        badge.style.fontSize = '0.75rem';
        badge.style.textAlign = 'center';
        resultBox.appendChild(badge);
    }

    ensureBacInfoContainer() {
        const resultBox = document.querySelector('.result-box');
        if (!resultBox || document.getElementById('bacInfoContainer')) return;

        const container = document.createElement('div');
        container.id = 'bacInfoContainer';
        container.className = 'bac-info';
        container.style.display = 'none';
        container.style.marginTop = '10px';
        container.style.padding = '8px 12px';
        container.style.borderRadius = '8px';
        container.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        container.style.fontSize = '0.8rem';
        resultBox.appendChild(container);
    }

    ensureResultStyles() {
        // Ajoute les styles du nouveau design s'ils n'existent pas
        if (!document.getElementById('result-styles')) {
            const style = document.createElement('style');
            style.id = 'result-styles';
            style.textContent = `
                /* Container principal */
                .result-container-v2 {
                    max-width: 480px;
                    width: 100%;
                    margin: 0 auto;
                }

                /* Carte principale - Style clair */
                .result-card-v2 {
                    background: white;
                    border-radius: 40px;
                    padding: 28px 24px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05), 0 4px 12px rgba(0, 0, 0, 0.03);
                    border: 1px solid rgba(0, 0, 0, 0.05);
                }

                /* EN-TÊTE AVEC SCORE */
                .result-header-v2 {
                    text-align: center;
                    margin-bottom: 32px;
                }

                .score-circle-v2 {
                    width: 120px;
                    height: 120px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border-radius: 50%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
                }

                .score-value-v2 {
                    font-size: 2.5rem;
                    font-weight: 800;
                    color: white;
                    line-height: 1;
                }

                .score-label-v2 {
                    font-size: 0.7rem;
                    color: rgba(255, 255, 255, 0.8);
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }

                .result-title-v2 {
                    font-size: 1.8rem;
                    font-weight: 800;
                    color: #1e293b;
                    margin-bottom: 12px;
                }

                .result-summary-v2 {
                    font-size: 0.95rem;
                    color: #64748b;
                    line-height: 1.6;
                    margin-bottom: 8px;
                }

                .step-indicator-v2 {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    margin-bottom: 24px;
                    flex-wrap: wrap;
                }

                .step-pill {
                    padding: 6px 10px;
                    border-radius: 999px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    color: #64748b;
                    background: #f1f5f9;
                }

                .step-pill.active {
                    background: #ede9fe;
                    color: #6d28d9;
                }

                .dimensions-grid-v2 {
                    display: grid;
                    gap: 12px;
                }

                .dimension-card-v2 {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 18px;
                    padding: 12px 14px;
                }

                .dimension-top-v2 {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.9rem;
                    margin-bottom: 8px;
                    color: #0f172a;
                }

                .dimension-bar-v2 {
                    height: 8px;
                    background: #e2e8f0;
                    border-radius: 999px;
                    overflow: hidden;
                    margin-bottom: 6px;
                }

                .dimension-fill-v2 {
                    height: 100%;
                    border-radius: 999px;
                    background: linear-gradient(90deg, #6366f1, #8b5cf6);
                }

                .dimension-card-v2 small {
                    color: #64748b;
                }

                .insight-grid-v2 {
                    display: grid;
                    gap: 12px;
                }

                .insight-card-v2 {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 18px;
                    padding: 14px 16px;
                }

                .insight-card-v2 h4 {
                    font-size: 0.95rem;
                    margin: 0 0 8px;
                    color: #1e293b;
                }

                .insight-card-v2 ul {
                    margin: 0;
                    padding-left: 18px;
                    color: #475569;
                    line-height: 1.6;
                }

                .tag-list-v2 {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .learning-style-v2 {
                    background: #eff6ff;
                    border: 1px solid #bfdbfe;
                    border-radius: 16px;
                    padding: 12px 14px;
                    color: #1d4ed8;
                    font-weight: 600;
                }

                .recommendation-meta-v2 {
                    display: block;
                    margin-top: 4px;
                    color: #64748b;
                    font-size: 0.8rem;
                }

                .result-tags-v2 {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 8px;
                }

                .tag-v2 {
                    background: #f1f5f9;
                    padding: 6px 14px;
                    border-radius: 30px;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: #475569;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .tag-v2.bac {
                    background: #dcfce7;
                    color: #16a34a;
                    border: none;
                }

                /* SECTIONS GÉNÉRIQUES */
                .section-v2 {
                    margin-bottom: 32px;
                }

                .section-title-v2 {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 0.85rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    color: #6366f1;
                    margin-bottom: 20px;
                }

                /* LISTE DES FILIÈRES */
                .fields-list-v2 {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .field-item-v2 {
                    background: #f8fafc;
                    border-radius: 20px;
                    padding: 14px 18px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.3s ease;
                    border: 1px solid #e2e8f0;
                }

                .field-item-v2:hover {
                    background: #f1f5f9;
                    transform: translateX(4px);
                    border-color: #cbd5e1;
                }

                .field-name-v2 {
                    font-weight: 600;
                    color: #1e293b;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .field-name-v2 i {
                    width: 24px;
                    color: #6366f1;
                }

                .field-score-v2 {
                    font-weight: 800;
                    font-size: 1.1rem;
                }

                .field-score-v2.high {
                    color: #10b981;
                }

                .field-score-v2.medium {
                    color: #f59e0b;
                }

                .field-score-v2.low {
                    color: #94a3b8;
                }

                /* LISTE DES UNIVERSITÉS */
                .universities-list-v2 {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .uni-card-v2 {
                    background: #f8fafc;
                    border-radius: 24px;
                    padding: 18px;
                    display: flex;
                    gap: 14px;
                    transition: all 0.3s ease;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                }

                .uni-card-v2:hover {
                    background: #ffffff;
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
                    border-color: #cbd5e1;
                }

                .uni-rank-v2 {
                    width: 44px;
                    height: 44px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border-radius: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                    font-weight: 700;
                    color: white;
                }

                .uni-rank-v2.gold {
                    background: linear-gradient(135deg, #fbbf24, #f59e0b);
                }

                .uni-rank-v2.silver {
                    background: linear-gradient(135deg, #94a3b8, #64748b);
                }

                .uni-rank-v2.bronze {
                    background: linear-gradient(135deg, #d97706, #b45309);
                }

                .uni-info-v2 {
                    flex: 1;
                }

                .uni-name-v2 {
                    font-weight: 700;
                    color: #1e293b;
                    margin-bottom: 10px;
                    font-size: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .uni-match-bar-v2 {
                    height: 6px;
                    background: #e2e8f0;
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 10px;
                }

                .match-fill-v2 {
                    height: 100%;
                    border-radius: 3px;
                    background: linear-gradient(90deg, #6366f1, #8b5cf6);
                }

                .uni-stats-v2 {
                    display: flex;
                    gap: 12px;
                }

                .pill-v2 {
                    background: #f1f5f9;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: #475569;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                .pill-v2.high {
                    background: #dcfce7;
                    color: #16a34a;
                }

                .pill-v2.medium {
                    background: #fef3c7;
                    color: #d97706;
                }

                /* CONSEIL BUDGET */
                .budget-tip-v2 {
                    background: #fffbeb;
                    border: 1px solid #fde68a;
                    border-radius: 20px;
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    margin-bottom: 28px;
                }

                .tip-icon-v2 {
                    width: 44px;
                    height: 44px;
                    background: #fef3c7;
                    border-radius: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.3rem;
                    color: #d97706;
                }

                /* BOUTON RESTART */
                .restart-btn-v2 {
                    width: 100%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none;
                    padding: 18px;
                    border-radius: 50px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: white;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                }

                .restart-btn-v2:hover {
                    transform: scale(1.02);
                    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
                }

                .restart-btn-v2 i {
                    transition: transform 0.3s;
                }

                .restart-btn-v2:hover i {
                    transform: rotate(180deg);
                }

                /* ANIMATIONS */
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .field-item-v2, .uni-card-v2 {
                    animation: fadeInUp 0.4s ease-out;
                    animation-fill-mode: both;
                }

                /* CONFETTI */
                .confetti {
                    position: fixed;
                    width: 10px;
                    height: 10px;
                    position: absolute;
                    animation: confettiFall 3s linear forwards;
                    z-index: 1000;
                    border-radius: 2px;
                }

                @keyframes confettiFall {
                    0% {
                        transform: translateY(-100vh) rotate(0deg);
                        opacity: 1;
                    }
                    100% {
                        transform: translateY(100vh) rotate(360deg);
                        opacity: 0;
                    }
                }

                .empty-state {
                    text-align: center;
                    padding: 30px 20px;
                    color: #94a3b8;
                }
            `;
            document.head.appendChild(style);
        }
    }

    showWelcome() {
        this.logger.log('Showing welcome screen');
        this.hideAllScreens();
        this.fadeIn(this.elements.welcomeScreen);
        if (this.elements.gameHeader) {
            this.elements.gameHeader.classList.remove('active');
            this.elements.gameHeader.style.opacity = '1';
        }
        this.announceToScreenReader('Bienvenue sur l\'application d\'orientation');
    }

    showBacSelection(availableCodes = null) {
        this.logger.log('Showing bac selection screen with full list');
        this.hideAllScreens();
        this.ensureBacBackButton();
        
        const bacGroups = [
            {
                name: 'Lettres & Sciences Humaines',
                icon: 'fa-book-open-reader',
                color: '#8b5cf6',
                series: [
                    { code: 'A', label: 'Lettres, langues et philosophie', fields: 'Droit, Communication, Journalisme, Enseignement' }
                ]
            },
            {
                name: 'Sciences',
                icon: 'fa-flask',
                color: '#3b82f6',
                series: [
                    { code: 'C', label: 'Mathématiques et sciences physiques', fields: 'Informatique, Ingénierie, Mathématiques, Data Science' },
                    { code: 'D', label: 'Sciences naturelles et biologie', fields: 'Médecine, Biologie, Chimie, Pharmacie' },
                    { code: 'E', label: 'Mathématiques techniques et technologie', fields: 'Génie civil, Mécanique, Électrotechnique' }
                ]
            },
            {
                name: 'Filières Industrielles',
                icon: 'fa-industry',
                color: '#ef4444',
                series: [
                    { code: 'F1', label: 'Construction mécanique', fields: 'Mécanique, Maintenance industrielle, Production' },
                    { code: 'F2', label: 'Électronique', fields: 'Électronique, Télécoms, Robotique' },
                    { code: 'F3', label: 'Électrotechnique', fields: 'Électricité, Énergie, Automatisme' },
                    { code: 'F4', label: 'Génie civil et bâtiment', fields: 'BTP, Architecture, Urbanisme' }
                ]
            },
            {
                name: 'Informatique & Tertiaire',
                icon: 'fa-computer',
                color: '#10b981',
                series: [
                    { code: 'H1', label: 'Informatique de gestion', fields: 'Développement, Data, Systèmes d\'information' },
                    { code: 'H2', label: 'Communication administrative', fields: 'RH, Communication, Gestion' },
                    { code: 'H3', label: 'Action commerciale', fields: 'Commerce, Marketing, Vente' },
                    { code: 'H4', label: 'Maintenance informatique', fields: 'Réseaux, Support IT, Cybersécurité' },
                    { code: 'H5', label: 'Techniques administratives', fields: 'Administration, Gestion de projets' }
                ]
            },
            {
                name: 'Gestion & Commerce',
                icon: 'fa-money-bill-wave',
                color: '#f59e0b',
                series: [
                    { code: 'G1', label: 'Secrétariat de direction', fields: 'Gestion, RH, Assistant de direction' },
                    { code: 'G2', label: 'Comptabilité et gestion financière', fields: 'Comptabilité, Finance, Audit' },
                    { code: 'G3', label: 'Commerce et marketing', fields: 'Marketing, Commerce, Management' },
                    { code: 'BG', label: 'Banque et gestion', fields: 'Finance, Banque, Assurance' }
                ]
            },
            {
                name: 'Agriculture',
                icon: 'fa-seedling',
                color: '#84cc16',
                series: [
                    { code: 'R1', label: 'Production végétale', fields: 'Agronomie, Agriculture, Cultures' },
                    { code: 'R2', label: 'Production animale', fields: 'Élevage, Zootechnie' },
                    { code: 'R3', label: 'Santé animale', fields: 'Vétérinaire, Santé animale' },
                    { code: 'R4', label: 'Machiniste agricole', fields: 'Mécanique agricole' },
                    { code: 'R5', label: 'Économie et gestion coopératives', fields: 'Gestion coopérative, Économie rurale' },
                    { code: 'R6', label: 'Génie rural', fields: 'Infrastructures rurales, Hydraulique agricole' }
                ]
            },
            {
                name: 'Filières Professionnelles',
                icon: 'fa-hammer',
                color: '#6b7280',
                series: [
                    { code: 'P2', label: 'Génie civil', fields: 'BTP, Construction, Travaux publics' },
                    { code: 'P6', label: 'Mécanique de production', fields: 'Mécanique industrielle' },
                    { code: 'P7', label: 'Électrotechnique et équipement de communication', fields: 'Électricité, Équipements' }
                ]
            }
        ];

        const bacContainer = document.getElementById('bacOptions');
        if (bacContainer) {
            bacContainer.innerHTML = '';
            
            bacGroups.forEach(group => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'bac-group';
                groupDiv.style.marginBottom = '24px';
                
                groupDiv.innerHTML = `
                    <div class="bac-group-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid ${group.color}20;">
                        <i class="fas ${group.icon}" style="font-size: 1.5rem; color: ${group.color};"></i>
                        <h3 style="color: ${group.color}; margin: 0; font-size: 1.1rem;">${group.name}</h3>
                    </div>
                    <div class="bac-cards" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
                `;
                
                group.series.forEach(series => {
                    groupDiv.innerHTML += `
                        <button class="bac-option-btn" data-bac-value="${series.code}" 
                                style="display: flex; flex-direction: column; align-items: flex-start; padding: 12px; border: 1px solid ${group.color}30; border-radius: 12px; background: ${group.color}08; cursor: pointer; transition: all 0.2s; text-align: left; width: 100%;">
                            <span style="font-weight: bold; font-size: 1.1rem; color: ${group.color};">${series.code}</span>
                            <span style="font-size: 0.85rem; margin-top: 4px;">${series.label}</span>
                            <span style="font-size: 0.75rem; color: #666; margin-top: 6px;">${series.fields}</span>
                        </button>
                    `;
                });
                
                groupDiv.innerHTML += `</div>`;
                bacContainer.appendChild(groupDiv);
            });
        }
        
        this.fadeIn(this.elements.bacScreen);
        if (this.elements.gameHeader) {
            this.elements.gameHeader.classList.remove('active');
            this.elements.gameHeader.style.opacity = '1';
        }
        this.announceToScreenReader('Veuillez sélectionner votre série de baccalauréat parmi les 26 séries disponibles');
    }

    ensureBacBackButton() {
        const screen = this.elements.bacScreen;
        if (!screen || document.getElementById('bacBackButton')) return;

        const button = document.createElement('button');
        button.id = 'bacBackButton';
        button.type = 'button';
        button.className = 'bac-back-btn';
        button.setAttribute('data-action', 'bac-back');
        button.setAttribute('aria-label', 'Retour');
        button.innerHTML = '<i class="fas fa-arrow-left" style="margin-right: 6px;"></i>Retour';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.gap = '6px';
        button.style.padding = '12px 18px';
        button.style.border = '1px solid #e2e8f0';
        button.style.borderRadius = '12px';
        button.style.background = '#ffffff';
        button.style.color = '#334155';
        button.style.cursor = 'pointer';
        button.style.fontWeight = '600';
        button.style.fontSize = '0.95rem';
        button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
        button.style.transition = 'all 0.2s ease';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.left = '20px';
        button.style.zIndex = '1000';
        
        button.addEventListener('mouseenter', function() {
            this.style.background = '#f8fafc';
            this.style.borderColor = '#cbd5e1';
            this.style.transform = 'translateX(-2px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.background = '#ffffff';
            this.style.borderColor = '#e2e8f0';
            this.style.transform = 'translateX(0)';
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.logger.info('↩️ Bac back button clicked');
            // Dispatch custom event for app.js to handle
            document.dispatchEvent(new CustomEvent('bac-back-clicked'));
        });

        document.body.appendChild(button);
    }

    ensureQuizBackButton() {
        const screen = this.elements.quizScreen;
        if (!screen || document.getElementById('quizBackButton')) return;

        const button = document.createElement('button');
        button.id = 'quizBackButton';
        button.type = 'button';
        button.className = 'quiz-back-btn';
        button.setAttribute('data-action', 'quiz-back');
        button.setAttribute('aria-label', 'Retour');
        button.innerHTML = '<i class="fas fa-arrow-left" style="margin-right: 6px;"></i>Retour';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.gap = '6px';
        button.style.padding = '12px 18px';
        button.style.border = '1px solid #e2e8f0';
        button.style.borderRadius = '12px';
        button.style.background = '#ffffff';
        button.style.color = '#334155';
        button.style.cursor = 'pointer';
        button.style.fontWeight = '600';
        button.style.fontSize = '0.95rem';
        button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
        button.style.transition = 'all 0.2s ease';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.left = '20px';
        button.style.zIndex = '1000';
        
        button.addEventListener('mouseenter', function() {
            this.style.background = '#f8fafc';
            this.style.borderColor = '#cbd5e1';
            this.style.transform = 'translateX(-2px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.background = '#ffffff';
            this.style.borderColor = '#e2e8f0';
            this.style.transform = 'translateX(0)';
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.logger.info('↩️ Quiz back button clicked');
            // Dispatch custom event for app.js to handle
            document.dispatchEvent(new CustomEvent('quiz-back-clicked'));
        });

        document.body.appendChild(button);
    }

    getBacLabel(code) {
        const labels = {
            'A': 'Lettres, langues et philosophie',
            'C': 'Mathématiques et sciences physiques',
            'D': 'Sciences naturelles et biologie',
            'E': 'Mathématiques techniques et technologie',
            'F1': 'Construction mécanique',
            'F2': 'Électronique',
            'F3': 'Électrotechnique',
            'F4': 'Génie civil et bâtiment',
            'H1': 'Informatique de gestion',
            'H2': 'Communication administrative',
            'H3': 'Action commerciale',
            'H4': 'Maintenance informatique',
            'H5': 'Techniques administratives',
            'G1': 'Secrétariat de direction',
            'G2': 'Comptabilité et gestion financière',
            'G3': 'Commerce et marketing',
            'BG': 'Banque et gestion',
            'R1': 'Production végétale',
            'R2': 'Production animale',
            'R3': 'Santé animale',
            'R4': 'Machiniste agricole',
            'R5': 'Économie et gestion coopératives',
            'R6': 'Génie rural',
            'P2': 'Génie civil',
            'P6': 'Mécanique de production',
            'P7': 'Électrotechnique et équipement de communication'
        };
        return labels[code] || 'Série générale';
    }

    getBacGroup(code) {
        if (code === 'A') return 'humanities';
        if (['C', 'D', 'E'].includes(code)) return 'science';
        if (['F1', 'F2', 'F3', 'F4'].includes(code)) return 'industrial';
        if (['H1', 'H2', 'H3', 'H4', 'H5'].includes(code)) return 'it';
        if (['G1', 'G2', 'G3', 'BG'].includes(code)) return 'business';
        if (['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].includes(code)) return 'agriculture';
        if (['P2', 'P6', 'P7'].includes(code)) return 'vocational';
        return 'general';
    }

    handleBacSelection(bacCode) {
        this.logger.log(`Bac selected: ${bacCode}`);
        
        document.querySelectorAll('[data-bac-value]').forEach(btn => {
            btn.classList.remove('selected');
            if (btn.getAttribute('data-bac-value') === bacCode) {
                btn.classList.add('selected');
                btn.style.border = '2px solid #10b981';
                btn.style.background = '#10b98115';
                this.hapticFeedback();
            } else {
                btn.style.border = '';
                btn.style.background = '';
            }
        });
        
        this.onBacSelected(bacCode);
    }

    showQuiz(role) {
        this.logger.log(`Showing quiz screen (${role})`);
        this.hideAllScreens();
        this.fadeIn(this.elements.quizScreen);
        this.ensureQuizBackButton();
        this.ensureQuizNavigationControls();
        this.hideQuizCompletionAction();
        this.elements.gameHeader?.classList.add('active');

        if (this.elements.levelName) {
            const roleText = role === 'student' ? 'Analyse de ton profil' : 'Lecture du profil famille';
            this.elements.levelName.innerText = roleText;
        }
        
        this.announceToScreenReader('Début du questionnaire d\'orientation');
    }

    showResults() {
        this.logger.log('Showing results screen');
        this.hideAllScreens();
        this.fadeIn(this.elements.resultScreen);

        if (this.elements.gameHeader) {
            this.elements.gameHeader.style.opacity = '0.3';
        }
        
        this.announceToScreenReader('Calcul du profil terminé. Voici vos résultats.');
    }

    ensureQuizNavigationControls() {
        const screen = this.elements.quizScreen;
        if (!screen) return;

        let wrapper = document.getElementById('quizNavigationControls');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'quizNavigationControls';
            wrapper.style.display = 'flex';
            wrapper.style.gap = '12px';
            wrapper.style.marginTop = '20px';
            screen.appendChild(wrapper);
        }

        if (!document.querySelector('[data-action="quiz-prev"]')) {
            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.setAttribute('data-action', 'quiz-prev');
            prevBtn.textContent = '← Précédent';
            prevBtn.style.flex = '1';
            prevBtn.style.padding = '12px 16px';
            prevBtn.style.borderRadius = '14px';
            prevBtn.style.border = '1px solid #e2e8f0';
            prevBtn.style.background = '#f8fafc';
            prevBtn.style.color = '#334155';
            prevBtn.style.fontWeight = '700';
            prevBtn.style.cursor = 'pointer';
            wrapper.appendChild(prevBtn);
        }

        if (!document.querySelector('[data-action="quiz-next"]')) {
            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.setAttribute('data-action', 'quiz-next');
            nextBtn.textContent = 'Suivant →';
            nextBtn.style.flex = '1';
            nextBtn.style.padding = '12px 16px';
            nextBtn.style.borderRadius = '14px';
            nextBtn.style.border = 'none';
            nextBtn.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
            nextBtn.style.color = 'white';
            nextBtn.style.fontWeight = '700';
            nextBtn.style.cursor = 'pointer';
            wrapper.appendChild(nextBtn);
        }
    }

    updateQuizNavigationState(question) {
        const prevBtn = document.querySelector('[data-action="quiz-prev"]');
        const nextBtn = document.querySelector('[data-action="quiz-next"]');
        if (!question) return;

        if (prevBtn) {
            prevBtn.disabled = question.step <= 1;
            prevBtn.style.opacity = question.step <= 1 ? '0.6' : '1';
        }
        if (nextBtn) {
            nextBtn.textContent = question.step >= (question.total || 1) ? 'Terminer' : 'Suivant →';
        }
    }

    showQuizCompletionAction() {
        const screen = this.elements.quizScreen;
        if (!screen) return;

        let container = document.getElementById('quizCompletionAction');
        if (!container) {
            container = document.createElement('div');
            container.id = 'quizCompletionAction';
            container.style.marginTop = '16px';
            screen.appendChild(container);
        }

        container.innerHTML = '';
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-action', 'analyze-profile');
        button.textContent = 'Analyser mon profil';
        button.style.width = '100%';
        button.style.padding = '14px 18px';
        button.style.border = 'none';
        button.style.borderRadius = '16px';
        button.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        button.style.color = 'white';
        button.style.fontWeight = '800';
        button.style.cursor = 'pointer';
        container.appendChild(button);
    }

    hideQuizCompletionAction() {
        const container = document.getElementById('quizCompletionAction');
        if (container) container.remove();
    }

    hideAllScreens() {
        ['welcomeScreen', 'bacScreen', 'quizScreen', 'resultScreen'].forEach(id => {
            if (this.elements[id]) {
                this.elements[id].style.display = 'none';
                this.elements[id].classList.remove('active');
            }
        });
        
        // Remove dynamic controls when hiding screens
        const bacBtn = document.getElementById('bacBackButton');
        if (bacBtn) bacBtn.remove();
        
        const quizBtn = document.getElementById('quizBackButton');
        if (quizBtn) quizBtn.remove();

        const quizNav = document.getElementById('quizNavigationControls');
        if (quizNav) quizNav.remove();

        const quizCompletion = document.getElementById('quizCompletionAction');
        if (quizCompletion) quizCompletion.remove();
    }

    fadeIn(element) {
        if (!element) return;
        element.style.display = 'block';
        element.style.opacity = '0';
        element.style.transition = `opacity ${this.ANIMATION_DURATION}ms ease`;
        
        requestAnimationFrame(() => {
            element.style.opacity = '1';
        });
    }

    hapticFeedback() {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
    }

    renderQuestion(question) {
        if (!question) {
            this.logger.error('No question to render');
            return;
        }

        this.logger.log(`Rendering question ${question.step}/${question.total} (Type: ${question.type})`);
        this.currentQuestion = question;
        this.hideQuizCompletionAction();

        if (this.elements.questionText) {
            this.elements.questionText.innerText = question.q;
        }
        if (this.elements.currentStep) {
            this.elements.currentStep.innerText = String(question.step);
        }
        if (this.elements.totalSteps) {
            this.elements.totalSteps.innerText = String(question.total);
        }
        if (this.elements.levelName) {
            this.elements.levelName.innerText = this.getStageLabel(question);
        }

        const grid = this.elements.optionsGrid;
        if (grid) {
            grid.style.opacity = '0';
            grid.style.transition = 'opacity 150ms ease';
            
            setTimeout(() => {
                grid.innerHTML = '';
                this.renderQuestionByType(question, grid);
                grid.style.opacity = '1';
            }, 150);
        }

        this.ensureQuizNavigationControls();
        this.updateQuizNavigationState(question);
        this.updateProgress(question.step, question.total);
    }

    renderQuestionByType(question, grid) {
        const questionType = question.type || 'likert';
        
        switch (questionType) {
            case 'likert':
                this.renderLikert(question, grid);
                this.hideMultiChoiceSubmit();
                break;
            case 'single_choice':
            case 'scenario':
                this.renderSingleChoice(question, grid);
                this.hideMultiChoiceSubmit();
                break;
            case 'multi_choice':
                this.renderMultiChoice(question, grid);
                this.showMultiChoiceSubmit();
                break;
            case 'scale':
                this.renderScale(question, grid);
                this.hideMultiChoiceSubmit();
                break;
            default:
                this.renderLikert(question, grid);
                this.hideMultiChoiceSubmit();
        }
    }

    renderLikert(question, grid) {
        (question.o || []).forEach(option => {
            const btn = this.createOptionButton(option, 'single');
            btn.innerHTML = `
                <span class="option-emoji">${this.getEmoji(option.v, question.type)}</span>
                <span class="option-label">${option.t}</span>
            `;
            grid.appendChild(btn);
        });
    }

    renderSingleChoice(question, grid) {
        (question.o || []).forEach(option => {
            const btn = this.createOptionButton(option, 'single');
            btn.innerHTML = `
                <span class="option-emoji">${this.getEmoji(option.v, question.type)}</span>
                <span class="option-label">${option.t}</span>
            `;
            grid.appendChild(btn);
        });
    }

    renderMultiChoice(question, grid) {
        const container = document.createElement('div');
        container.className = 'multi-choice-group';
        container.id = 'multiChoiceContainer';
        
        (question.o || []).forEach(option => {
            const btn = this.createOptionButton(option, 'multi');
            btn.innerHTML = `
                <span class="option-emoji">${this.getEmoji(option.v, question.type)}</span>
                <span class="option-label">${option.t}</span>
            `;
            container.appendChild(btn);
        });
        
        grid.appendChild(container);
    }

    renderScale(question, grid) {
        const container = document.createElement('div');
        container.className = 'scale-group';
        
        const min = question.min ?? 0;
        const max = question.max ?? 10;
        const mid = Math.round((min + max) / 2);
        
        const labels = document.createElement('div');
        labels.className = 'scale-labels';
        labels.innerHTML = `
            <span>${min}</span>
            <span>${mid}</span>
            <span>${max}</span>
        `;
        
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'scale-input';
        input.min = min;
        input.max = max;
        input.value = mid;
        input.setAttribute('aria-label', 'Sélectionnez une valeur');
        
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'scale-value';
        valueDisplay.innerText = mid;
        
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            valueDisplay.innerText = value;
            this.hapticFeedback();
        });
        
        input.addEventListener('change', (e) => {
            this.onQuestionAnswered(Number(e.target.value));
        });
        
        container.appendChild(labels);
        container.appendChild(input);
        container.appendChild(valueDisplay);
        grid.appendChild(container);
    }

    createOptionButton(option, type) {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.type = 'button';
        btn.dataset.quizOption = type;
        btn.dataset.value = option.v;
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', option.t);
        return btn;
    }

    selectOption(selectedBtn) {
        const grid = selectedBtn.parentElement;
        if (grid) {
            grid.querySelectorAll('[data-quiz-option="single"].selected').forEach(btn => {
                btn.classList.remove('selected');
                btn.setAttribute('aria-pressed', 'false');
            });
        }
        selectedBtn.classList.add('selected');
        selectedBtn.setAttribute('aria-pressed', 'true');
    }

    updateMultiChoiceValue(question) {
        const container = document.getElementById('multiChoiceContainer');
        if (!container) return;
        
        const selected = Array.from(container.querySelectorAll('[data-quiz-option="multi"].selected'))
            .map(opt => opt.dataset.value);
        
        if (selected.length > 0) {
            this.multiChoiceSelected = selected;
            this.logger.log('Multi-choice selected:', selected);
        }
    }

    showMultiChoiceSubmit() {
        const submitBtn = document.getElementById('multiChoiceSubmit');
        if (submitBtn) {
            submitBtn.style.display = 'block';
            const button = submitBtn.querySelector('button');
            if (button) {
                button.onclick = () => {
                    if (this.multiChoiceSelected && this.multiChoiceSelected.length > 0) {
                        this.hapticFeedback();
                        this.onQuestionAnswered(JSON.stringify(this.multiChoiceSelected));
                        this.multiChoiceSelected = [];
                    }
                };
            }
        }
    }

    hideMultiChoiceSubmit() {
        const submitBtn = document.getElementById('multiChoiceSubmit');
        if (submitBtn) submitBtn.style.display = 'none';
        this.multiChoiceSelected = [];
    }

    updateProgress(current, total) {
        const percentage = (current / total) * 100;
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = percentage + '%';
            this.elements.progressFill.setAttribute('aria-valuenow', percentage);
        }
    }

    showLoader(message = 'Analyse en cours...') {
        this.logger.log(`Showing loader: ${message}`);

        if (this.elements.loaderSpinner) {
            this.elements.loaderSpinner.style.display = 'flex';
        }
        if (this.elements.loaderText) {
            this.elements.loaderText.innerText = message;
        }

        this.hideError();
        this.announceToScreenReader(message);
    }

    hideLoader() {
        if (this.elements.loaderSpinner) {
            this.elements.loaderSpinner.style.display = 'none';
        }
    }

    showError(message = 'Une erreur s\'est produite. Veuillez réessayer.', onRetry = null) {
        this.logger.error(`Showing error: ${message}`);
        this.hideLoader();

        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'block';
            this.elements.errorMessage.innerText = message;
        }

        if (this.elements.retryButton && onRetry) {
            this.elements.retryButton.style.display = 'block';
            this.elements.retryButton.onclick = onRetry;
        }
        
        this.announceToScreenReader(`Erreur: ${message}`);
    }

    hideError() {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'none';
        }
        if (this.elements.retryButton) {
            this.elements.retryButton.style.display = 'none';
        }
    }

    showWarning(message) {
        this.logger.warn(`Warning: ${message}`);
        const warningDiv = document.createElement('div');
        warningDiv.className = 'warning-message';
        warningDiv.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
        warningDiv.style.border = '1px solid #f59e0b';
        warningDiv.style.borderRadius = '8px';
        warningDiv.style.padding = '12px';
        warningDiv.style.margin = '10px 0';
        warningDiv.style.color = '#f59e0b';
        warningDiv.style.fontSize = '0.85rem';
        warningDiv.innerText = message;
        
        const container = document.querySelector('.result-box') || document.body;
        container.appendChild(warningDiv);
        
        setTimeout(() => {
            warningDiv.remove();
        }, 5000);
    }

    showSuccess(message) {
        this.logger.log(`Success: ${message}`);
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        successDiv.style.border = '1px solid #10b981';
        successDiv.style.borderRadius = '8px';
        successDiv.style.padding = '12px';
        successDiv.style.margin = '10px 0';
        successDiv.style.color = '#10b981';
        successDiv.style.fontSize = '0.85rem';
        successDiv.innerText = message;
        
        const container = document.querySelector('.result-box') || document.body;
        container.appendChild(successDiv);
        
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    showBacInfo(bacInfo) {
        this.bacInfo = bacInfo;
        if (this.elements.bacInfoContainer) {
            this.elements.bacInfoContainer.style.display = 'block';
            const fullLabel = this.getBacLabel(bacInfo.code);
            this.elements.bacInfoContainer.innerHTML = `
                <strong>🎓 Bac ${bacInfo.code}</strong> - ${fullLabel}
                ${bacInfo.boost > 1 ? `<span style="margin-left: 8px; color: #10b981;">+${Math.round((bacInfo.boost - 1) * 100)}%</span>` : ''}
            `;
        }
    }

    showConfidenceBadge(confidence, reliabilityLabel) {
        if (this.elements.confidenceBadge) {
            this.elements.confidenceBadge.style.display = 'block';
            const confidencePercent = Math.round(confidence * 100);
            let color = '#ef4444';
            let text = 'Faible confiance';
            
            if (confidence >= 0.85) {
                color = '#10b981';
                text = 'Très haute confiance';
            } else if (confidence >= 0.7) {
                color = '#f59e0b';
                text = 'Haute confiance';
            } else if (confidence >= 0.5) {
                color = '#3b82f6';
                text = 'Confiance modérée';
            }
            
            this.elements.confidenceBadge.style.backgroundColor = `${color}20`;
            this.elements.confidenceBadge.style.color = color;
            this.elements.confidenceBadge.innerHTML = `
                📊 Score de confiance: ${confidencePercent}% - ${text}
                ${reliabilityLabel ? `<span style="font-size: 0.7rem;">(${reliabilityLabel})</span>` : ''}
            `;
        }
    }

    renderResults(resultData) {
        this.logger.log('Rendering results V3 with modern design:', resultData);
        this.currentResultData = resultData;

        this.hideLoader();
        this.hideError();

        const container = this.elements.recommendationsContainer;
        if (container) {
            container.innerHTML = '';
        }

        this.createConfetti();
        this.showResults();
        this.renderProfileAnalysis(resultData);

        if (this.elements.finalTitle) {
            this.elements.finalTitle.innerText = resultData.title || 'Profil Unique';
        }
        if (this.elements.finalDesc) {
            this.elements.finalDesc.innerText = resultData.description || 'Votre profil d\'orientation a été calculé avec vos réponses.';
        }
        if (this.elements.aiInsight) {
            this.elements.aiInsight.innerText = resultData.aiInsight || 'Ton profil montre une forte capacité d\'analyse et une belle progression dans tes choix.';
        }

        if (resultData.confidence_score) {
            this.showConfidenceBadge(resultData.confidence_score, resultData.reliability_label);
        }

        if (resultData.bac_info) {
            this.showBacInfo(resultData.bac_info);
        }

        this.scrollToTop();
        this.announceToScreenReader('Résultats affichés. ' + (resultData.aiInsight || ''));
    }

    renderProfileAnalysis(resultData) {
        const container = this.elements.recommendationsContainer;
        if (!container) return;

        const topDetails = resultData?.recommendations?.top_field_details || [];
        const score = Math.round((topDetails[0]?.score || resultData?.coverage || 0.72) * 100);
        const profileTitle = resultData?.title || 'Profil unique';
        const summary = resultData?.aiInsight || 'Ton profil met en avant un fort potentiel d\'adaptation, de logique et de créativité.';
        const interests = topDetails.slice(0, 5).map(item => item.field_name || 'Orientation').concat(['Technologie', 'Santé', 'Business']).slice(0, 6);
        const dimensions = topDetails.slice(0, 4).map((item, index) => ({
            name: item.field_name || `Dimension ${index + 1}`,
            percent: Math.max(60, Math.min(95, Math.round((item.score || 0.7) * 100))),
            description: index === 0 ? 'Capacité d\'analyse et de structuration' : index === 1 ? 'Créativité et imagination' : index === 2 ? 'Leadership et initiative' : 'Aptitude à collaborer et à communiquer'
        }));

        const html = `
            <div class="result-container-v2">
                <div class="result-card-v2">
                    <div class="step-indicator-v2">
                        <span class="step-pill active">1. Quiz</span>
                        <span class="step-pill active">2. Profil</span>
                        <span class="step-pill">3. Filières</span>
                    </div>

                    <div class="result-header-v2">
                        <div class="score-circle-v2">
                            <span class="score-value-v2">${score}%</span>
                            <span class="score-label-v2">Profil</span>
                        </div>
                        <h2 class="result-title-v2">${this.escapeHtml(profileTitle)}</h2>
                        <p class="result-summary-v2">${this.escapeHtml(summary)}</p>
                    </div>

                    <div class="section-v2">
                        <div class="section-title-v2">
                            <i class="fas fa-brain"></i>
                            <span>Profil psychométrique</span>
                        </div>
                        <div class="dimensions-grid-v2">
                            ${dimensions.map(d => `
                                <div class="dimension-card-v2">
                                    <div class="dimension-top-v2">
                                        <strong>${this.escapeHtml(d.name)}</strong>
                                        <span>${d.percent}%</span>
                                    </div>
                                    <div class="dimension-bar-v2">
                                        <div class="dimension-fill-v2" style="width: ${d.percent}%"></div>
                                    </div>
                                    <small>${this.escapeHtml(d.description)}</small>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="section-v2">
                        <div class="section-title-v2">
                            <i class="fas fa-star"></i>
                            <span>Forces et axes d'amélioration</span>
                        </div>
                        <div class="insight-grid-v2">
                            <div class="insight-card-v2">
                                <h4>Forces</h4>
                                <ul>
                                    <li>Capacité d'analyse fine</li>
                                    <li>Curiosité naturelle</li>
                                    <li>Capacité à apprendre rapidement</li>
                                </ul>
                            </div>
                            <div class="insight-card-v2">
                                <h4>Axes d'amélioration</h4>
                                <ul>
                                    <li>Structurer les idées</li>
                                    <li>Prendre confiance en soi</li>
                                    <li>Développer la communication</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="section-v2">
                        <div class="section-title-v2">
                            <i class="fas fa-compass"></i>
                            <span>Centres d'intérêt dominants</span>
                        </div>
                        <div class="tag-list-v2">
                            ${interests.map(item => `<span class="tag-v2">${this.escapeHtml(item)}</span>`).join('')}
                        </div>
                    </div>

                    <div class="section-v2">
                        <div class="section-title-v2">
                            <i class="fas fa-graduation-cap"></i>
                            <span>Style d'apprentissage</span>
                        </div>
                        <p class="learning-style-v2">Visuel, pratique et expérientiel. Tu apprends mieux avec des exemples concrets et des retours rapides.</p>
                    </div>

                    <button class="restart-btn-v2" data-action="show-recommendations" id="showRecommendationsBtn">
                        <i class="fas fa-arrow-right"></i>
                        <span>Découvrir les filières recommandées</span>
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.ensureResultStyles();
    }

    renderRecommendations(resultData) {
        const container = this.elements.recommendationsContainer;
        if (!container) return;
        const fields = resultData?.recommendations?.top_field_details || [];
        const universities = resultData?.recommendations?.universities || [];

        container.innerHTML = `
            <div class="result-container-v2">
                <div class="result-card-v2">
                    <div class="step-indicator-v2">
                        <span class="step-pill active">1. Quiz</span>
                        <span class="step-pill active">2. Profil</span>
                        <span class="step-pill active">3. Filières</span>
                    </div>

                    <div class="section-v2">
                        <div class="section-title-v2">
                            <i class="fas fa-list-ul"></i>
                            <span>Filières recommandées</span>
                        </div>
                        <div class="fields-list-v2">
                            ${fields.length > 0 ? fields.slice(0, 5).map((field, index) => {
                                const score = Math.round((field.score || 0.7) * 100);
                                return `
                                    <div class="field-item-v2 recommendation-card-v2">
                                        <div>
                                            <div class="field-name-v2"><i class="fas fa-book-open"></i>${this.escapeHtml(field.field_name || 'Filière')}</div>
                                            <small class="recommendation-meta-v2">Compatibilité ${score}% • ${score >= 80 ? 'Excellent' : score >= 65 ? 'Très bon' : score >= 50 ? 'Bon' : 'Moyen'}</small>
                                        </div>
                                        <span class="field-score-v2 ${score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low'}">${score}%</span>
                                    </div>
                                `;
                            }).join('') : '<div class="empty-state">Aucune recommandation disponible pour le moment.</div>'}
                        </div>
                    </div>

                    <div class="section-v2">
                        <div class="section-title-v2">
                            <i class="fas fa-university"></i>
                            <span>Établissements</span>
                        </div>
                        <div class="universities-list-v2">
                            ${this.renderUniversitiesList(universities)}
                        </div>
                    </div>

                    <button class="restart-btn-v2" id="restartBtnV2">
                        <i class="fas fa-sync-alt"></i>
                        <span>Recommencer l'aventure</span>
                    </button>
                </div>
            </div>
        `;

        const restartBtn = document.getElementById('restartBtnV2');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                if (window.orientationApp && window.orientationApp.restart) {
                    window.orientationApp.restart();
                } else {
                    window.location.reload();
                }
            });
        }
    }

    renderFieldsList(fields) {
        if (!fields || fields.length === 0) return '<div class="empty-state">Aucune filière recommandée</div>';
        
        return fields.slice(0, 5).map((field, index) => {
            const fieldName = typeof field === 'string' ? field : (field.field_name || field.name || 'Filière');
            const score = typeof field === 'object' ? (field.decision_score || field.score || 0) : 0.3;
            // Si score est déjà en pourcentage (> 1), le convertir en décimale
            const normalizedScore = score > 1 ? score / 100 : score;
            const scorePercent = Math.round(normalizedScore * 100);
            let scoreClass = 'low';
            if (scorePercent >= 60) scoreClass = 'high';
            else if (scorePercent >= 40) scoreClass = 'medium';
            
            const icons = ['fa-bullhorn', 'fa-laptop-code', 'fa-users', 'fa-building', 'fa-chart-line'];
            const icon = icons[index % icons.length];
            
            return `
                <div class="field-item-v2" style="animation-delay: ${index * 0.05}s">
                    <div class="field-name-v2">
                        <i class="fas ${icon}"></i>
                        <span>${this.escapeHtml(fieldName)}</span>
                    </div>
                    <span class="field-score-v2 ${scoreClass}">${scorePercent}%</span>
                </div>
            `;
        }).join('');
    }

    renderUniversitiesList(universities) {
        if (!universities || universities.length === 0) {
            return `
                <div class="empty-state">
                    <p>Aucune université ne propose ces filières pour le moment.</p>
                    <small>Consultez un conseiller d'orientation pour explorer d'autres options.</small>
                </div>
            `;
        }
        
        const ranks = ['gold', 'silver', 'bronze', ''];
        const rankIcons = ['fa-crown', 'fa-medal', 'fa-trophy', 'fa-arrow-up'];
        
        return universities.slice(0, 6).map((uni, index) => {
            const uniName = uni.target_name || uni.nom || uni.name || 'Inconnu';
            const matchCount = uni.matching_fields_count || 0;
            const totalFields = uni.total_recommended_fields || 5;
            let compatibility = uni.compatibility_score || (matchCount / Math.max(totalFields, 1));
            // Si compatibility_score est déjà en pourcentage (> 1), le convertir en décimale
            if (compatibility > 1) compatibility = compatibility / 100;
            const compatibilityPercent = Math.round(compatibility * 100);
            
            let pillClass = '';
            if (compatibilityPercent >= 70) pillClass = 'high';
            else if (compatibilityPercent >= 50) pillClass = 'medium';
            
            const rankClass = ranks[index] || '';
            const rankIcon = rankIcons[index] || 'fa-building-columns';
            
            return `
                <div class="uni-card-v2" style="animation-delay: ${0.1 + index * 0.05}s">
                    <div class="uni-rank-v2 ${rankClass}">
                        <i class="fas ${rankIcon}"></i>
                    </div>
                    <div class="uni-info-v2">
                        <div class="uni-name-v2">
                            <i class="fas fa-building-columns"></i>
                            ${this.escapeHtml(uniName)}
                        </div>
                        <div class="uni-match-bar-v2">
                            <div class="match-fill-v2" style="width: ${compatibilityPercent}%"></div>
                        </div>
                        <div class="uni-stats-v2">
                            <span class="pill-v2 ${pillClass}"><i class="fas fa-check-circle"></i> ${compatibilityPercent}% compatible</span>
                            <span class="pill-v2"><i class="fas fa-book"></i> ${matchCount}/${totalFields} filières</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    createConfetti() {
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#fbbf24', '#10b981'];
        for (let i = 0; i < 80; i++) {
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.width = Math.random() * 8 + 4 + 'px';
            confetti.style.height = Math.random() * 8 + 4 + 'px';
            confetti.style.animationDelay = Math.random() * 2 + 's';
            confetti.style.animationDuration = Math.random() * 2 + 2 + 's';
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 4000);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getClusterIcon(cluster) {
        const icons = {
            'informatique': '💻',
            'business': '💼',
            'engineering': '⚙️',
            'droit': '⚖️',
            'social': '🤝',
            'sante': '🏥',
            'sciences': '🔬',
            'arts_design': '🎨',
            'agriculture': '🌾'
        };
        return icons[cluster] || '📚';
    }

    getMatchBadgeClass(compatibility) {
        if (compatibility >= 0.8) return 'high';
        if (compatibility >= 0.6) return 'medium';
        return 'low';
    }

    updateLoaderText(message) {
        if (this.elements.loaderText) {
            this.elements.loaderText.innerText = message;
        }
    }

    showProgress(step, total, message) {
        this.updateLoaderText(`${message}... ${step}/${total}`);
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    getEmoji(value, type) {
        if (type === 'boolean') {
            return Number(value) === 1 ? '✅' : '❌';
        }

        const map = {
            1: '💸',
            2: '💰',
            3: '🏦',
            4: '🚀',
            5: '🔥'
        };

        return map[value] || '✨';
    }

    getStageLabel(question) {
        const current = Number(question.step || 1);
        const total = Number(question.total || 1);
        const ratio = total > 0 ? current / total : 0;

        if (ratio <= 0.4) return 'Analyse de ton profil';
        if (ratio <= 0.8) return 'Détection de tes forces';
        return 'Projection de ton avenir';
    }

    showOfflineWarning() {
        this.showWarning('Mode hors-ligne activé. Les recommandations peuvent être limitées.');
    }

    hideOfflineWarning() {
        // Warning auto-disappears after 5 seconds
    }
}

if (typeof window !== 'undefined') {
    window.UIRenderer = UIRenderer;
}