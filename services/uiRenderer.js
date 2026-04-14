/**
 * UI Renderer Module
 * Handles all DOM updates: questions, results, loaders, errors
 */

class UIRenderer {
    constructor(config = {}) {
        this.logger = config.logger || console;
        this.onQuestionAnswered = config.onQuestionAnswered || (() => {});
        this.elements = this.findElements();
        this.enhanceLayout();
        this.elements = this.findElements();
    }

    findElements() {
        return {
            welcomeScreen: document.getElementById('welcomeScreen'),
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
            retryButton: document.getElementById('retryButton')
        };
    }

    enhanceLayout() {
        this.ensureQuestionMeta();
        this.ensureQuestionCard();
        this.ensureAiInsight();
    }

    ensureQuestionMeta() {
        const gameHeader = document.getElementById('gameHeader');
        if (!gameHeader || document.getElementById('currentStep')) return;

        const meta = document.createElement('div');
        meta.style.fontSize = '0.75rem';
        meta.style.color = '#94a3b8';
        meta.style.marginBottom = '6px';
        meta.innerHTML = 'Question <span id="currentStep">1</span> / <span id="totalSteps">30</span>';

        const progressTrack = gameHeader.querySelector('.progress-track');
        gameHeader.insertBefore(meta, progressTrack || null);
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
        insight.style.marginTop = '15px';
        insight.style.fontSize = '0.9rem';
        insight.style.opacity = '0.8';
        resultBox.appendChild(insight);
    }

    showWelcome() {
        this.logger.log('Showing welcome screen');
        this.hideAllScreens();
        this.elements.welcomeScreen?.classList.add('active');
        if (this.elements.gameHeader) {
            this.elements.gameHeader.style.opacity = '1';
        }
    }

    showQuiz(role) {
        this.logger.log(`Showing quiz screen (${role})`);
        this.hideAllScreens();
        this.elements.quizScreen?.classList.add('active');
        this.elements.gameHeader?.classList.add('active');

        if (this.elements.levelName) {
            this.elements.levelName.innerText = role === 'student'
                ? 'Analyse de ton profil'
                : 'Lecture du profil famille';
        }
    }

    showResults() {
        this.logger.log('Showing results screen');
        this.hideAllScreens();
        this.elements.resultScreen?.classList.add('active');

        if (this.elements.gameHeader) {
            this.elements.gameHeader.style.opacity = '0.3';
        }
    }

    hideAllScreens() {
        ['welcomeScreen', 'quizScreen', 'resultScreen'].forEach(id => {
            this.elements[id]?.classList.remove('active');
        });
    }

    renderQuestion(question) {
        if (!question) {
            this.logger.error('No question to render');
            return;
        }

        this.logger.log(`Rendering question ${question.step}/${question.total}`);

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
            grid.innerHTML = '';

            (question.o || []).forEach(option => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.type = 'button';
                btn.innerHTML = `
                    <span class="option-emoji">${this.getEmoji(option.v, question.type)}</span>
                    <span class="option-label">${option.t}</span>
                `;
                btn.addEventListener('click', () => {
                    this.selectOption(btn);
                    this.onQuestionAnswered(option.v);
                });
                grid.appendChild(btn);
            });
        }

        this.updateProgress(question.step, question.total);
    }

    selectOption(button) {
        const grid = this.elements.optionsGrid;
        if (grid) {
            Array.from(grid.querySelectorAll('.option-btn')).forEach(btn => {
                btn.classList.remove('selected');
            });
        }
        button.classList.add('selected');
    }

    updateProgress(current, total) {
        const percentage = (current / total) * 100;
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = percentage + '%';
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
    }

    hideLoader() {
        if (this.elements.loaderSpinner) {
            this.elements.loaderSpinner.style.display = 'none';
        }
    }

    showError(message = 'Une erreur s est produite. Veuillez reessayer.', onRetry = null) {
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
    }

    hideError() {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'none';
        }
        if (this.elements.retryButton) {
            this.elements.retryButton.style.display = 'none';
        }
    }

    renderResults(resultData) {
        this.logger.log('Rendering results:', resultData);

        // 🔥 LOG ULTRA IMPORTANT pour déboguer
        console.log("🔥 FINAL DATA USED:", JSON.stringify(resultData, null, 2));

        // 🔥 Log spécifique aux recommandations
        if (resultData.recommendations) {
            console.log("🏫 Universities data:", resultData.recommendations.universities);
            console.log("🏢 Centres data:", resultData.recommendations.centres);
        }

        this.hideLoader();
        this.hideError();

        // 🔥 RESET CRITIQUE - Vide complètement l'ancien contenu
        if (this.elements.recommendationsContainer) {
            this.elements.recommendationsContainer.innerHTML = '';
        }

        if (this.elements.finalTitle) {
            this.elements.finalTitle.innerText = resultData.title || 'Profil Unique';
        }
        if (this.elements.finalDesc) {
            this.elements.finalDesc.innerText = resultData.description ||
                'Votre profil d orientation a ete calcule avec vos reponses.';
        }
        if (this.elements.aiInsight) {
            this.elements.aiInsight.innerText = resultData.aiInsight ||
                'Ton profil montre une forte capacite d analyse et une belle progression dans tes choix.';
        }

        if (resultData.parentBudget && this.elements.parentAddon) {
            this.elements.parentAddon.style.display = 'block';
            this.elements.parentAddon.innerText = `Conseil strategique : ${resultData.parentBudget}`;
        } else if (this.elements.parentAddon) {
            this.elements.parentAddon.style.display = 'none';
            this.elements.parentAddon.innerText = '';
        }

        if (resultData.recommendations) {
            this.renderRecommendations(resultData.recommendations);
        }

        // 🔥 Force scroll to top pour éviter affichage ancien
        this.scrollToTop();
    }

    renderRecommendations(recommendations) {
        this.logger.log('🎯 Rendering recommendations:', recommendations); // DEBUG

        if (!this.elements.recommendationsContainer) {
            this.logger.warn('Recommendations container not found');
            return;
        }

        let html = '';

        // 🎯 AJOUT: Section des filières recommandées
        if (recommendations.top_fields && recommendations.top_fields.length > 0) {
            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🎯 Tes 5 meilleures filières</h3>';
            html += '<div class="top-fields">';
            recommendations.top_fields.slice(0, 5).forEach(field => {
                html += `<span class="top-field-tag">${field}</span>`;
            });
            html += '</div>';
        }

        if (recommendations.universities && recommendations.universities.length > 0) {
            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🏫 Où étudier ça</h3>';

            recommendations.universities.forEach((uni, idx) => {
                this.logger.log('🏫 Processing university:', uni); // DEBUG

                const uniData = this.normalizeItem(uni);
                this.logger.log('📊 Normalized university data:', uniData); // DEBUG
                this.logger.log('📚 Parsed filieres:', uniData.filieres); // DEBUG

                const primaryFields = uniData.matched.length > 0 ? uniData.matched : uniData.filieres.slice(0, 3);
                
                // 🎯 NEW: Get score and labels
                const score = uni.score || uni.pora_score || 0.3;
                const matchLabel = this.getMatchLabel(score);
                const strategicBadge = this.getStrategicBadge(uniData.filieres.length + uniData.otherFields.length);
                
                // 🎯 NEW: Limit matched fields display (max 4 + "X autres")
                let displayedMatched = [];
                let extraCount = 0;
                if (uniData.matched.length > 4) {
                    displayedMatched = uniData.matched.slice(0, 4);
                    extraCount = uniData.matched.length - 4;
                } else {
                    displayedMatched = uniData.matched;
                }

                html += `
                    <div class="rec-card clean">
                        <div class="rec-title">${uniData.name}</div>
                        ${strategicBadge ? `<div class="strategic-badge">${strategicBadge}</div>` : ''}
                        ${uniData.matched.length ? `
                        <div class="match-badge">
                          ${matchLabel}
                          ${displayedMatched.length > 0 ? `<br><small>${displayedMatched.join(', ')}${extraCount > 0 ? ` +${extraCount} autres filières` : ''}</small>` : ''}
                        </div>
                        ` : ''}
                        <div class="rec-tags">
                            ${primaryFields.map(f => `<span class="tag ${uniData.matched.length ? 'highlight' : ''}">${f}</span>`).join('')}
                        </div>
                    </div>
                `;
            });
        }

        if (recommendations.centres && recommendations.centres.length > 0) {
            // 🔥 Count compatible centres
            let compatibleCount = 0;

            recommendations.centres.forEach((centre, idx) => {
                const centreData = this.normalizeItem(centre);
                if (centreData) compatibleCount++;
            });

            if (compatibleCount > 0) {
                html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🏢 Formations rapides</h3>';

                recommendations.centres.forEach((centre, idx) => {
                    const centreData = this.normalizeItem(centre);

                    // 🔥 SKIP centres that don't have compatible filieres
                    if (!centreData) {
                        return;
                    }

                    const centreFieldsToShow = centreData.matched?.length > 0
                        ? centreData.matched.slice(0, 2)
                        : centreData.filieres.slice(0, 2);
                    
                    // 🎯 NEW: Get score and labels for centres
                    const score = centre.score || centre.pora_score || 0.3;
                    const matchLabel = this.getMatchLabel(score);
                    const strategicBadge = this.getStrategicBadge(centreData.filieres.length + centreData.otherFields.length);
                    
                    // 🎯 NEW: Limit matched fields display (max 4 + "X autres")
                    let displayedMatched = [];
                    let extraCount = 0;
                    if (centreData.matched?.length > 4) {
                        displayedMatched = centreData.matched.slice(0, 4);
                        extraCount = centreData.matched.length - 4;
                    } else {
                        displayedMatched = centreData.matched || [];
                    }

                    html += `
                        <div class="rec-card clean">
                            <div class="rec-title">${centreData.name}</div>
                            ${strategicBadge ? `<div class="strategic-badge">${strategicBadge}</div>` : ''}
                            ${centreData.matched?.length ? `
                            <div class="match-badge">
                              ${matchLabel}
                              ${displayedMatched.length > 0 ? `<br><small>${displayedMatched.join(', ')}${extraCount > 0 ? ` +${extraCount} autres filières` : ''}</small>` : ''}
                            </div>
                            ` : ''}
                            <div class="rec-tags">
                                ${centreFieldsToShow.map(f => `<span class="tag ${centreData.matched?.length > 0 ? 'highlight' : ''}">${f}</span>`).join('')}
                            </div>
                        </div>
                    `;
                });
            } else {
                // 🔥 No compatible centres found
                html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🏢 Formations rapides</h3>';
                html += '<div class="rec-card clean" style="text-align: center; opacity: 0.7;">';
                html += '<p style="margin: 0; color: #94a3b8;">Aucune formation courte compatible trouvée pour ce profil.</p>';
                html += '<p style="margin: 5px 0 0 0; font-size: 0.9rem; color: #64748b;">Les centres proposent principalement des formations techniques ou professionnelles.</p>';
                html += '</div>';
            }
        }

        if (!html) {
            html = '<p style="color: #94a3b8; text-align: center;">Aucune recommandation disponible pour le moment.</p>';
        }

        this.elements.recommendationsContainer.innerHTML = html;
    }

    normalizeItem(item) {
        let filieres = [];
        let matched = [];
        let otherFields = [];

        // ✅ PRIORITÉ AUX FILIÈRES RÉELLES DU CENTRE / université
        if (Array.isArray(item.real_fields) && item.real_fields.length > 0) {
            filieres = item.real_fields;
        }
        // ✅ MATCHED FIELDS = signal pour l'utilisateur (profil compatible)
        if (Array.isArray(item.matched_fields) && item.matched_fields.length > 0) {
            matched = item.matched_fields;
        }
        // ✅ BACKEND CAN SEND pre-computed other_fields
        if (Array.isArray(item.other_fields) && item.other_fields.length > 0) {
            otherFields = item.other_fields;
        }

        // 🔥 TEMP FIX: Si pas de vraies filières informatiques, ne pas afficher le centre
        if (filieres.length === 0 && matched.length === 0) {
            return null; // Le centre sera filtré
        }

        // Fallback si backend pas encore prêt
        if (filieres.length === 0 && matched.length > 0) {
            filieres = matched;
        }

        // Compute otherFields from real_fields when not provided explicitly
        if (otherFields.length === 0 && filieres.length > 0 && matched.length > 0) {
            const matchedSet = new Set(matched.map(f => f.trim().toLowerCase()));
            otherFields = filieres.filter(f => {
                const normalized = f.trim().toLowerCase();
                return normalized && !matchedSet.has(normalized);
            });
        }

        // Clean up values
        filieres = filieres.filter(f => f && f.trim().length > 0).map(f => f.trim());
        matched = matched.filter(f => f && f.trim().length > 0).map(f => f.trim());
        otherFields = otherFields.filter(f => f && f.trim().length > 0).map(f => f.trim());

        const result = {
            name: item.target_name || item.nom || item.name || 'Inconnu',
            filieres,
            matched,
            otherFields
        };

        console.log('✅ Normalized result:', result);
        return result;
    }

    // 🎯 NEW: Get match label based on PORA score
    getMatchLabel(score) {
        if (score > 0.45) return "🔥 Excellent match";
        if (score > 0.35) return "🎯 Bon match";
        return "👍 Match correct";
    }

    // 🎯 NEW: Get strategic badge based on total fields (improved logic)
    getStrategicBadge(totalFields) {
        if (totalFields <= 10) return "🧠 École spécialisée";
        if (totalFields >= 50) return "🌍 Grande université";
        return ""; // No badge for medium-sized schools
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
            return Number(value) === 1 ? '?' : '??';
        }

        const map = {
            1: '??',
            2: '??',
            3: '??',
            4: '??'
        };

        return map[value] || '??';
    }

    getStageLabel(question) {
        const current = Number(question.step || 1);
        const total = Number(question.total || 1);
        const ratio = total > 0 ? current / total : 0;

        if (ratio <= 0.34) return 'Analyse de ton profil';
        if (ratio <= 0.67) return 'Detection de tes forces';
        return 'Projection de ton avenir';
    }
}

if (typeof window !== 'undefined') {
    window.UIRenderer = UIRenderer;
}
