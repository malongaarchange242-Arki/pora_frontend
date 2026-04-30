/**
 * UI Renderer Module
 * Handles all DOM updates: questions, results, loaders, errors
 */

class UIRenderer {
    constructor(config = {}) {
        this.logger = config.logger || console;
        this.onQuestionAnswered = config.onQuestionAnswered || (() => {});
        this.multiChoiceSelected = [];
        this.elements = this.findElements();
        this.enhanceLayout();
        this.elements = this.findElements();
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
            this.elements.gameHeader.classList.remove('active');
            this.elements.gameHeader.style.opacity = '1';
        }
    }

    showBacSelection(selectedBacType = null) {
        this.logger.log('Showing bac selection screen');
        this.hideAllScreens();
        this.elements.bacScreen?.classList.add('active');

        if (this.elements.gameHeader) {
            this.elements.gameHeader.classList.remove('active');
            this.elements.gameHeader.style.opacity = '1';
        }

        document.querySelectorAll('[data-bac-value]').forEach(button => {
            const isSelected = selectedBacType && button.getAttribute('data-bac-value') === selectedBacType;
            button.classList.toggle('selected', Boolean(isSelected));
        });

        this.scrollToTop();
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
        ['welcomeScreen', 'bacScreen', 'quizScreen', 'resultScreen'].forEach(id => {
            this.elements[id]?.classList.remove('active');
        });
    }

    renderQuestion(question) {
        if (!question) {
            this.logger.error('No question to render');
            return;
        }

        this.logger.log(`Rendering question ${question.step}/${question.total} (Type: ${question.type})`);

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

            // 🔥 RENDER ACCORDING TO QUESTION TYPE
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

        this.updateProgress(question.step, question.total);
    }

    // 🔥 LIKERT SCALE - Existing style
    renderLikert(question, grid) {
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

    // 🔥 Method to handle option selection for Likert scale
    selectOption(selectedBtn) {
        // Remove selected class from all buttons in the same grid
        const grid = selectedBtn.parentElement;
        if (grid) {
            grid.querySelectorAll('.option-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
        }
        // Add selected class to the clicked button
        selectedBtn.classList.add('selected');
    }

    // 🔥 SINGLE CHOICE - Radio buttons
    renderSingleChoice(question, grid) {
        const container = document.createElement('div');
        container.className = 'single-choice-group';
        
        (question.o || []).forEach(option => {
            const label = document.createElement('label');
            label.className = 'radio-option';
            label.innerHTML = `
                <span class="radio-input"></span>
                <span class="radio-label">${option.t}</span>
            `;
            label.addEventListener('click', (e) => {
                e.preventDefault();
                // Deselect all
                container.querySelectorAll('.radio-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                // Select this one
                label.classList.add('selected');
                this.onQuestionAnswered(option.v);
            });
            container.appendChild(label);
        });
        
        grid.appendChild(container);
    }

    // 🔥 MULTI CHOICE - Checkboxes
    renderMultiChoice(question, grid) {
        const container = document.createElement('div');
        container.className = 'multi-choice-group';
        container.id = 'multiChoiceContainer';
        
        (question.o || []).forEach(option => {
            const label = document.createElement('label');
            label.className = 'checkbox-option';
            label.dataset.value = option.v;
            label.innerHTML = `
                <span class="checkbox-input"></span>
                <span class="checkbox-label">${option.t}</span>
            `;
            label.addEventListener('click', (e) => {
                e.preventDefault();
                label.classList.toggle('selected');
                this.updateMultiChoiceValue(question);
            });
            container.appendChild(label);
        });
        
        grid.appendChild(container);
    }

    updateMultiChoiceValue(question) {
        const container = document.getElementById('multiChoiceContainer');
        if (!container) return;
        
        const selected = Array.from(container.querySelectorAll('.checkbox-option.selected'))
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
            submitBtn.querySelector('button').onclick = () => {
                if (this.multiChoiceSelected && this.multiChoiceSelected.length > 0) {
                    // Submit array as JSON string or comma-separated
                    this.onQuestionAnswered(JSON.stringify(this.multiChoiceSelected));
                    this.multiChoiceSelected = [];
                }
            };
        }
    }

    hideMultiChoiceSubmit() {
        const submitBtn = document.getElementById('multiChoiceSubmit');
        if (submitBtn) submitBtn.style.display = 'none';
        this.multiChoiceSelected = [];
    }

    // 🔥 SCALE/SLIDER - Range input
    renderScale(question, grid) {
        const container = document.createElement('div');
        container.className = 'scale-group';
        
        // Get min/max from question metadata or defaults
        const min = question.min ?? 0;
        const max = question.max ?? 10;
        const mid = Math.round((min + max) / 2);
        
        // Labels
        const labels = document.createElement('div');
        labels.className = 'scale-labels';
        labels.innerHTML = `
            <span>${min}</span>
            <span>${mid}</span>
            <span>${max}</span>
        `;
        
        // Slider
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'scale-input';
        input.min = min;
        input.max = max;
        input.value = mid;
        
        // Value display
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'scale-value';
        valueDisplay.innerText = mid;
        
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            valueDisplay.innerText = value;
            // Auto-submit on change
            this.onQuestionAnswered(Number(value));
        });
        
        container.appendChild(labels);
        container.appendChild(input);
        container.appendChild(valueDisplay);
        
        grid.appendChild(container);
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
        const topFields = recommendations.top_field_details || recommendations.top_fields || [];
        if (topFields.length > 0) {
            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🎯 Tes 5 meilleures filières</h3>';
            html += '<div class="top-fields">';
            topFields.slice(0, 5).forEach(field => {
                const fieldName = typeof field === 'string'
                    ? field
                    : (field.field_name || field.name || 'Filiere');
                const bacMatchScore = typeof field === 'object'
                    ? Number(field.bac_match_score ?? field.bac_score)
                    : NaN;
                const bacBadge = Number.isFinite(bacMatchScore) && bacMatchScore >= 0.55
                    ? ` <small>${Math.round(bacMatchScore * 100)}% bac</small>`
                    : '';

                html += `<span class="top-field-tag">${fieldName}${bacBadge}</span>`;
            });
            html += '</div>';
        }

        const recommendedFieldNames = topFields
            .slice(0, 5)
            .map(field => typeof field === 'string'
                ? field
                : (field.field_name || field.name || ''))
            .filter(Boolean);

        const compatibleUniversities = Array.isArray(recommendations.universities)
            ? recommendations.universities
                .map(uni => this.enrichRecommendationItem(uni, recommendedFieldNames))
                .filter(Boolean)
                .filter(uni => uni.matching_fields_count > 0)
            : [];

        if (compatibleUniversities.length > 0) {
            const sortedUniversities = [...compatibleUniversities].sort((a, b) => {
                const scoreDelta = (b.compatibility_score ?? 0) - (a.compatibility_score ?? 0);
                if (scoreDelta !== 0) return scoreDelta;
                return (b.matching_fields_count ?? 0) - (a.matching_fields_count ?? 0);
            });

            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🏫 Où étudier ça</h3>';
            html += '<ul class="rec-list">';

            sortedUniversities.forEach((uni) => {
                const uniName = uni.target_name || uni.nom || uni.name || 'Inconnu';
                const matchCount = uni.matching_fields_count || 0;
                const totalFields = uni.total_recommended_fields || recommendedFieldNames.length || 0;
                const feeLabel = this.formatFeeLabel(uni);
                const metaLabel = feeLabel || `${matchCount}/${totalFields} filières`;
                html += `
                    <li class="rec-list-item">
                        <span class="rec-list-name">${uniName}</span>
                        <span class="rec-list-meta">${metaLabel}</span>
                    </li>
                `;
            });

            html += '</ul>';
        } else if (recommendations.universities) {
            // 🔴 AUCUNE UNIVERSITÉ NE CORRESPOND
            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🏫 Où étudier ça</h3>';
            html += '<div style="text-align: center; opacity: 0.7; padding: 20px;">';
            html += '<p style="margin: 0; color: #94a3b8;">Aucune université ne propose ces filières pour le moment.</p>';
            html += '<p style="margin: 5px 0 0 0; font-size: 0.85rem; color: #64748b;">Consultez un conseiller d\'orientation pour explorer d\'autres options.</p>';
            html += '</div>';
        }

        const compatibleCentres = Array.isArray(recommendations.centres)
            ? recommendations.centres
                .map(centre => this.enrichRecommendationItem(centre, recommendedFieldNames))
                .filter(Boolean)
                .filter(centre => centre.matching_fields_count > 0)
            : [];

        if (compatibleCentres.length > 0) {
            const sortedCentres = [...compatibleCentres].sort((a, b) => {
                const scoreDelta = (b.compatibility_score ?? 0) - (a.compatibility_score ?? 0);
                if (scoreDelta !== 0) return scoreDelta;
                return (b.matching_fields_count ?? 0) - (a.matching_fields_count ?? 0);
            });

            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🏢 Formations rapides</h3>';
            html += '<ul class="rec-list">';

            sortedCentres.forEach((centre) => {
                const centreName = centre.target_name || centre.nom || centre.name || 'Inconnu';
                const matchCount = centre.matching_fields_count || 0;
                const totalFields = centre.total_recommended_fields || recommendedFieldNames.length || 0;
                html += `
                    <li class="rec-list-item is-secondary">
                        <span class="rec-list-name">${centreName}</span>
                        <span class="rec-list-meta">${matchCount}/${totalFields} filières</span>
                    </li>
                `;
            });

            html += '</ul>';
        } else if (recommendations.centres) {
            // 🔴 AUCUN CENTRE NE CORRESPOND
            html += '<h3 style="color: var(--accent); margin-top: 20px; margin-bottom: 15px;">🏢 Formations rapides</h3>';
            html += '<div style="text-align: center; opacity: 0.7; padding: 20px;">';
            html += '<p style="margin: 0; color: #94a3b8;">Aucune formation courte ne propose ces filières pour le moment.</p>';
            html += '<p style="margin: 5px 0 0 0; font-size: 0.85rem; color: #64748b;">Les centres se spécialisent souvent dans d\'autres domaines.</p>';
            html += '</div>';
        }

        if (!html) {
            html = '<p style="color: #94a3b8; text-align: center;">Aucune recommandation disponible pour le moment.</p>';
        }

        this.elements.recommendationsContainer.innerHTML = html;
    }

    enrichRecommendationItem(item, recommendedFields = []) {
        if (!item) return null;

        const normalizedRecommendedFields = recommendedFields
            .map(field => this.normalizeFieldName(field))
            .filter(Boolean);

        const rawMatchedFields = Array.isArray(item.matched_fields)
            ? item.matched_fields
            : [];
        const rawRealFields = Array.isArray(item.real_fields)
            ? item.real_fields
            : [];

        const matchedFromData = [];
        const matchedSet = new Set();

        if (rawRealFields.length > 0 && normalizedRecommendedFields.length > 0) {
            rawRealFields.forEach(field => {
                const trimmedField = String(field || '').trim();
                const normalizedRealField = this.normalizeFieldName(trimmedField);
                if (!normalizedRealField || !normalizedRecommendedFields.includes(normalizedRealField)) {
                    return;
                }

                if (!matchedSet.has(normalizedRealField)) {
                    matchedSet.add(normalizedRealField);
                    matchedFromData.push(trimmedField);
                }
            });
        } else {
            rawMatchedFields.forEach(field => {
                const trimmedField = String(field || '').trim();
                const normalizedMatchedField = this.normalizeFieldName(trimmedField);
                if (!normalizedMatchedField || matchedSet.has(normalizedMatchedField)) {
                    return;
                }

                matchedSet.add(normalizedMatchedField);
                matchedFromData.push(trimmedField);
            });
        }

        const uniqueMatchedFields = [];
        const seenMatched = new Set();
        matchedFromData.forEach(field => {
            const normalized = this.normalizeFieldName(field);
            if (!normalized || seenMatched.has(normalized)) return;
            seenMatched.add(normalized);
            uniqueMatchedFields.push(field);
        });

        const totalRecommendedFields = normalizedRecommendedFields.length
            || Number(item.total_recommended_fields)
            || 0;
        const matchingFieldsCount = uniqueMatchedFields.length;
        const compatibilityScore = totalRecommendedFields > 0
            ? matchingFieldsCount / totalRecommendedFields
            : (matchingFieldsCount > 0 ? 1 : 0);

        return {
            ...item,
            matched_fields: uniqueMatchedFields,
            matching_fields_count: matchingFieldsCount,
            total_recommended_fields: totalRecommendedFields,
            compatibility_score: compatibilityScore
        };
    }

    normalizeFieldName(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    formatFeeLabel(item) {
        const price = Number(item?.min_monthly_price);
        if (!Number.isFinite(price) || price <= 0) {
            return '';
        }

        const currency = item?.fee_currency || 'XAF';
        return `${Math.round(price).toLocaleString('fr-FR')} ${currency}/mois`;
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

        if (ratio <= 0.4) return 'Analyse de ton profil';
        if (ratio <= 0.8) return 'Detection de tes forces';
        return 'Projection de ton avenir';
    }
}

if (typeof window !== 'undefined') {
    window.UIRenderer = UIRenderer;
}
