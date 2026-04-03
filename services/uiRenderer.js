/**
 * UI Renderer Module
 * Handles all DOM updates: questions, results, loaders, errors
 */

class UIRenderer {
    constructor(config = {}) {
        this.logger = config.logger || console;
        this.elements = config.elements || this.findElements();
        this.onQuestionAnswered = config.onQuestionAnswered || (() => {});
    }

    /**
     * Auto-discover DOM elements
     */
    findElements() {
        return {
            welcomeScreen: document.getElementById('welcomeScreen'),
            quizScreen: document.getElementById('quizScreen'),
            resultScreen: document.getElementById('resultScreen'),
            
            gameHeader: document.getElementById('gameHeader'),
            levelName: document.getElementById('levelName'),
            questionText: document.getElementById('questionText'),
            optionsGrid: document.getElementById('optionsGrid'),
            progressFill: document.getElementById('progress-fill'),
            
            finalTitle: document.getElementById('finalTitle'),
            finalDesc: document.getElementById('finalDesc'),
            parentAddon: document.getElementById('parentAddon'),
            recommendationsContainer: document.getElementById('recommendationsContainer'),
            
            loaderSpinner: document.getElementById('loaderSpinner'),
            loaderText: document.getElementById('loaderText'),
            errorMessage: document.getElementById('errorMessage'),
            retryButton: document.getElementById('retryButton')
        };
    }

    /**
     * Show welcome screen
     */
    showWelcome() {
        this.logger.log('🎯 Showing welcome screen');
        this.hideAllScreens();
        this.elements.welcomeScreen?.classList.add('active');
    }

    /**
     * Show quiz screen
     */
    showQuiz(role) {
        this.logger.log(`🎮 Showing quiz screen (${role})`);
        this.hideAllScreens();
        this.elements.quizScreen?.classList.add('active');
        this.elements.gameHeader?.classList.add('active');
        
        const title = role === 'student' 
            ? 'Niveau : Apprenti Bachelier'
            : 'Mode : Parent Stratège';
        
        if (this.elements.levelName) {
            this.elements.levelName.innerText = title;
        }
    }

    /**
     * Show results screen
     */
    showResults() {
        this.logger.log('✨ Showing results screen');
        this.hideAllScreens();
        this.elements.resultScreen?.classList.add('active');
        
        if (this.elements.gameHeader) {
            this.elements.gameHeader.style.opacity = '0.3';
        }
    }

    /**
     * Hide all screens
     */
    hideAllScreens() {
        const screens = [
            'welcomeScreen',
            'quizScreen',
            'resultScreen'
        ];
        screens.forEach(id => {
            this.elements[id]?.classList.remove('active');
        });
    }

    /**
     * Render current question
     */
    renderQuestion(question) {
        if (!question) {
            this.logger.error('❌ No question to render');
            return;
        }

        this.logger.log(`📝 Rendering question ${question.step}/${question.total}`);

        // Update question text
        if (this.elements.questionText) {
            this.elements.questionText.innerText = question.q;
        }

        // Render options
        const grid = this.elements.optionsGrid;
        if (grid) {
            grid.innerHTML = '';
            
            (question.o || []).forEach(option => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerText = option.t;
                btn.addEventListener('click', () => {
                    this.selectOption(btn);
                    this.onQuestionAnswered(option.v);
                });
                grid.appendChild(btn);
            });
        }

        // Update progress
        this.updateProgress(question.step, question.total);
    }

    /**
     * Visual feedback for selected option
     */
    selectOption(button) {
        const grid = this.elements.optionsGrid;
        if (grid) {
            Array.from(grid.querySelectorAll('.option-btn')).forEach(btn => {
                btn.classList.remove('selected');
            });
        }
        button.classList.add('selected');
    }

    /**
     * Update progress bar
     */
    updateProgress(current, total) {
        const percentage = (current / total) * 100;
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = percentage + '%';
        }
    }

    /**
     * Show loading state
     */
    showLoader(message = 'Analyse en cours...') {
        this.logger.log(`⏳ Showing loader: ${message}`);
        
        if (this.elements.loaderSpinner) {
            this.elements.loaderSpinner.style.display = 'flex';
        }
        if (this.elements.loaderText) {
            this.elements.loaderText.innerText = message;
        }
        
        this.hideError();
    }

    /**
     * Hide loader
     */
    hideLoader() {
        if (this.elements.loaderSpinner) {
            this.elements.loaderSpinner.style.display = 'none';
        }
    }

    /**
     * Show error message
     */
    showError(message = 'Une erreur s\'est produite. Veuillez réessayer.', onRetry = null) {
        this.logger.error(`❌ Showing error: ${message}`);
        
        this.hideLoader();
        
        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'block';
            this.elements.errorMessage.innerText = message;
        }
        
        if (this.elements.retryButton && onRetry) {
            this.elements.retryButton.style.display = 'block';
            this.elements.retryButton.onclick = onRetry;
        }
    }

    /**
     * Hide error message
     */
    hideError() {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'none';
        }
        if (this.elements.retryButton) {
            this.elements.retryButton.style.display = 'none';
        }
    }

    /**
     * Render results (MAIN DISPLAY)
     */
    renderResults(resultData) {
        this.logger.log('📊 Rendering results:', resultData);
        
        this.hideLoader();
        this.hideError();

        // Render title and description
        if (this.elements.finalTitle) {
            this.elements.finalTitle.innerText = resultData.title || 'Profil Unique';
        }
        if (this.elements.finalDesc) {
            this.elements.finalDesc.innerText = resultData.description || 
                'Votre profil d\'orientation a été calculé avec vos réponses.';
        }

        // Render parent advice if applicable
        if (resultData.parentBudget && this.elements.parentAddon) {
            this.elements.parentAddon.style.display = 'block';
            this.elements.parentAddon.innerText = `Conseil Stratégique : Basé sur vos réponses, ${resultData.parentBudget}`;
        }

        // Render recommendations
        if (resultData.recommendations) {
            this.renderRecommendations(resultData.recommendations);
        }
    }

    /**
     * Render university and centre recommendations (with REAL NAMES, not UUIDs)
     */
    renderRecommendations(recommendations) {
        if (!this.elements.recommendationsContainer) {
            this.logger.warn('⚠️ Recommendations container not found');
            return;
        }

        this.logger.log('🎓 Rendering recommendations:', recommendations);

        let html = '';

        // Universities section
        if (recommendations.universities && recommendations.universities.length > 0) {
            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🎓 Universités Recommandées</h3>';
            
            recommendations.universities.forEach((uni, idx) => {
                const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : 'bronze';
                const badgeEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                
                html += `
                    <div style="
                        background: var(--card-bg);
                        border: 1px solid var(--glass);
                        padding: 15px;
                        border-radius: 12px;
                        margin-bottom: 12px;
                        transition: transform 0.2s;
                    " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            <span style="font-size: 1.5rem;">${badgeEmoji}</span>
                            <strong style="color: var(--text);">${uni.name || 'Université'}</strong>
                        </div>
                        <div style="font-size: 0.85rem; color: #94a3b8; line-height: 1.6;">
                            ${uni.city ? `📍 <strong>${uni.city}</strong><br/>` : ''}
                            ${uni.poraScore ? `🏆 <strong>PORA Score: ${uni.poraScore.toFixed(2)}</strong><br/>` : ''}
                            ${uni.filieres && uni.filieres.length > 0 ? 
                                `📚 <strong>Filières:</strong> ${uni.filieres.map(f => f.nom).join(', ')}` 
                                : ''}
                        </div>
                    </div>
                `;
            });
        }

        // Centres section
        if (recommendations.centres && recommendations.centres.length > 0) {
            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🏢 Centres de Formation</h3>';
            
            recommendations.centres.forEach((centre, idx) => {
                const badgeEmoji = idx === 0 ? '⭐' : '✨';
                
                html += `
                    <div style="
                        background: var(--card-bg);
                        border: 1px solid var(--glass);
                        padding: 15px;
                        border-radius: 12px;
                        margin-bottom: 12px;
                    ">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            <span style="font-size: 1.5rem;">${badgeEmoji}</span>
                            <strong style="color: var(--text);">${centre.name || 'Centre'}</strong>
                        </div>
                        <div style="font-size: 0.85rem; color: #94a3b8;">
                            ${centre.city ? `📍 ${centre.city}` : ''}
                        </div>
                    </div>
                `;
            });
        }

        if (!html) {
            html = '<p style="color: #94a3b8; text-align: center;">📋 Aucune recommandation disponible pour le moment.</p>';
        }

        this.elements.recommendationsContainer.innerHTML = html;
    }

    /**
     * Update loader text (for progress indication)
     */
    updateLoaderText(message) {
        if (this.elements.loaderText) {
            this.elements.loaderText.innerText = message;
        }
    }

    /**
     * Show multi-step progress
     */
    showProgress(step, total, message) {
        this.updateLoaderText(`${message}... ${step}/${total}`);
    }

    /**
     * Scroll to top (for mobile UX)
     */
    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.UIRenderer = UIRenderer;
}
