/**
 * Quiz Service Module - Version 3.0
 * Handles quiz logic: loading, format mapping, response validation, scoring
 * 
 * AMÉLIORATIONS V3:
 * - Support bac congolais complet (toutes les séries)
 * - Validation améliorée des réponses
 * - Cache des réponses utilisateur
 * - Support questions multi-choice
 * - Meilleure gestion des erreurs
 * - Compatibilité avec l'échelle 1-5 et 1-4
 */

class QuizService {
    constructor(config = {}) {
        this.logger = config.logger || console;
        this.questions = {
            student: [],
            parent: []
        };
        this.currentRole = null;
        this.currentStep = 0;
        this.selectedAnswers = {};
        this.responseMetadata = {};
        this.scores = { TECH: 0, CREA: 0, MED: 0, BIZ: 0 };
        this.parentBudget = null;
        this.bacType = this.loadStoredBacType();
        this.authenticatedUser = null;
        
        // Nouveaux champs V2
        this.responseCache = new Map();
        this.questionTimestamps = new Map();
        this.totalTimeSpent = 0;
        this.quizStartTime = null;
        
        // Configuration bac congolais - COMPLÈTE (26 séries)
        this.BAC_CONFIG = {
            availableCodes: [
                'A', 'C', 'D', 'E',
                'F1', 'F2', 'F3', 'F4',
                'H1', 'H2', 'H3', 'H4', 'H5',
                'G1', 'G2', 'G3', 'BG',
                'R1', 'R2', 'R3', 'R4', 'R5', 'R6',
                'P2', 'P6', 'P7'
            ],
            tracks: {
                'A': { name: 'Lettres, langues et philosophie', group: 'humanities', boost: 1.10 },
                'C': { name: 'Mathématiques et sciences physiques', group: 'science', boost: 1.15 },
                'D': { name: 'Sciences naturelles et biologie', group: 'science', boost: 1.10 },
                'E': { name: 'Mathématiques techniques et technologie', group: 'technical', boost: 1.12 },
                'F1': { name: 'Construction mécanique', group: 'industrial', boost: 1.15 },
                'F2': { name: 'Électronique', group: 'industrial', boost: 1.15 },
                'F3': { name: 'Électrotechnique', group: 'industrial', boost: 1.15 },
                'F4': { name: 'Génie civil et bâtiment', group: 'industrial', boost: 1.12 },
                'H1': { name: 'Informatique de gestion', group: 'it', boost: 1.20 },
                'H2': { name: 'Communication administrative', group: 'business', boost: 1.10 },
                'H3': { name: 'Action commerciale', group: 'business', boost: 1.12 },
                'H4': { name: 'Maintenance informatique', group: 'it', boost: 1.15 },
                'H5': { name: 'Techniques administratives', group: 'business', boost: 1.10 },
                'G1': { name: 'Secrétariat de direction', group: 'business', boost: 1.10 },
                'G2': { name: 'Comptabilité et gestion financière', group: 'business', boost: 1.15 },
                'G3': { name: 'Commerce et marketing', group: 'business', boost: 1.12 },
                'BG': { name: 'Banque et gestion', group: 'business', boost: 1.15 },
                'R1': { name: 'Production végétale', group: 'agriculture', boost: 1.10 },
                'R2': { name: 'Production animale', group: 'agriculture', boost: 1.10 },
                'R3': { name: 'Santé animale', group: 'agriculture', boost: 1.10 },
                'R4': { name: 'Machiniste agricole', group: 'agriculture', boost: 1.08 },
                'R5': { name: 'Économie et gestion coopératives', group: 'business', boost: 1.10 },
                'R6': { name: 'Génie rural', group: 'agriculture', boost: 1.10 },
                'P2': { name: 'Génie civil', group: 'vocational', boost: 1.12 },
                'P6': { name: 'Mécanique de production', group: 'vocational', boost: 1.12 },
                'P7': { name: 'Électrotechnique et équipement de communication', group: 'vocational', boost: 1.12 }
            }
        };
    }

    /**
     * Set authenticated user from Supabase
     */
    setAuthenticatedUser(user) {
        this.authenticatedUser = user;
        this.logger.log('✅ Authenticated user set in quiz service:', user?.id);
        
        if (user?.user_metadata?.bac_code) {
            this.setBacType(user.user_metadata.bac_code);
        }
    }

    /**
     * Initialize quiz with questions from API
     */
    async initialize(questions) {
        try {
            this.logger.log('🎯 Initializing quiz service V3...');
            
            const uniqueQuestions = [];
            const seenCodes = new Set();
            for (const q of questions) {
                const code = q.code || q.question_code;
                if (!seenCodes.has(code)) {
                    seenCodes.add(code);
                    uniqueQuestions.push(q);
                } else {
                    this.logger.warn(`Duplicate question code skipped: ${code}`);
                }
            }
            
            const studentQuestions = uniqueQuestions.filter(q => q.quiz_type !== 'parent');
            const parentQuestions = uniqueQuestions.filter(q => q.quiz_type === 'parent');
            
            this.questions.student = [
                ...studentQuestions.slice(0, 12).map(q => this.formatQuestion(q)),
                this.createBudgetQuestion()
            ];
            this.questions.parent = [
                ...parentQuestions.slice(0, 6).map(q => this.formatQuestion(q)),
                this.createBudgetQuestion()
            ];
            
            this.logger.log(`✅ Quiz ready: ${this.questions.student.length} student, ${this.questions.parent.length} parent questions`);
            
            return {
                student: this.questions.student,
                parent: this.questions.parent
            };
        } catch (error) {
            this.logger.error('❌ Failed to initialize quiz:', error);
            throw error;
        }
    }

    createBudgetQuestion() {
        return {
            code: 'Q_BUDGET_SCOLARITE',
            q: 'Quel budget mensuel pouvez-vous prévoir pour les frais de scolarité ?',
            type: 'single_choice',
            isBudgetQuestion: true,
            o: [
                { t: '≤ 25 000 XAF', v: 1 },
                { t: '25 000 - 50 000 XAF', v: 2 },
                { t: '50 000 - 100 000 XAF', v: 3 },
                { t: '> 100 000 XAF', v: 4 }
            ]
        };
    }

    /**
     * Format question from DB structure to quiz format
     */
    formatQuestion(dbQuestion) {
        const questionType = dbQuestion.type || dbQuestion.question_type || 'likert';
        let options = [];

        if (dbQuestion.options && Array.isArray(dbQuestion.options)) {
            options = dbQuestion.options.map((opt, idx) => {
                let optionValue;
                let optionText;

                if (typeof opt === 'string' && opt.startsWith('@{') && opt.endsWith('}')) {
                    const content = opt.slice(2, -1);
                    const parts = content.split(';').map(p => p.trim());
                    const labelPart = parts.find(p => p.startsWith('label='));
                    const valuePart = parts.find(p => p.startsWith('value='));
                    optionText = labelPart ? labelPart.split('=')[1] : opt;
                    optionValue = valuePart ? valuePart.split('=')[1] : idx + 1;
                }
                else if (typeof opt === 'object' && opt !== null) {
                    optionText = opt.label || opt.text || `Option ${idx + 1}`;
                    optionValue = opt.value || opt.option_value || idx + 1;
                }
                else if (typeof opt === 'string') {
                    optionText = opt;
                    optionValue = idx + 1;
                }
                else {
                    optionText = `Option ${idx + 1}`;
                    optionValue = idx + 1;
                }

                return {
                    t: optionText,
                    v: this.normalizeOptionValue(optionValue, questionType)
                };
            });
        }

        return {
            code: dbQuestion.code || dbQuestion.question_code,
            q: dbQuestion.text || dbQuestion.question_text,
            type: questionType,
            o: options,
            dimension: dbQuestion.dimension || null,
            difficulty: dbQuestion.difficulty || 'medium'
        };
    }

    /**
     * Normalize option values
     */
    normalizeOptionValue(value, questionType) {
        if (typeof value === 'string') {
            const trimmed = value.trim();

            if (['likert', 'scale', 'single_choice'].includes(questionType) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
                return Number(trimmed);
            }

            return trimmed;
        }

        return value;
    }

    // ============================================================
    // 🎓 BAC CONGOLAIS - GESTION COMPLÈTE (26 séries)
    // ============================================================

    normalizeBacType(value) {
        if (!value) return null;
        
        const normalized = String(value)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/[^A-Z0-9]/g, '');
        
        if (this.BAC_CONFIG.availableCodes.includes(normalized)) {
            return normalized;
        }
        
        const aliases = {
            'C/D': 'C', 'CD': 'C', 'D/C': 'D', 'DC': 'D',
            'E/F': 'E', 'EF': 'E', 'G/BG': 'G', 'GBG': 'G'
        };
        
        if (aliases[normalized]) {
            return aliases[normalized];
        }
        
        const match = normalized.match(/[A-Z][0-9]?/);
        if (match && this.BAC_CONFIG.availableCodes.includes(match[0])) {
            return match[0];
        }
        
        return null;
    }

    getBacStorageKey() {
        return `orientation-bac-type:${this.getUserId()}`;
    }

    loadStoredBacType() {
        try {
            const stored = sessionStorage.getItem(this.getBacStorageKey());
            return stored ? this.normalizeBacType(stored) : null;
        } catch (error) {
            this.logger.warn('Unable to load stored bac type:', error);
            return null;
        }
    }

    setBacType(value) {
        const normalized = this.normalizeBacType(value);
        if (!normalized) {
            throw new Error(`Invalid bac type: ${value}. Available: ${this.BAC_CONFIG.availableCodes.join(', ')}`);
        }

        this.bacType = normalized;

        try {
            sessionStorage.setItem(this.getBacStorageKey(), normalized);
        } catch (error) {
            this.logger.warn('Unable to persist bac type:', error);
        }

        this.logger.log(`🎓 Bac type set: ${normalized}`);
        return this.bacType;
    }

    getBacType() {
        return this.bacType;
    }

    getBacInfo() {
        if (!this.bacType) return null;
        return this.BAC_CONFIG.tracks[this.bacType] || { name: 'Général', group: 'general', boost: 1.0 };
    }

    hasBacType() {
        return Boolean(this.bacType);
    }

    getAvailableBacTypes() {
        return this.BAC_CONFIG.availableCodes;
    }

    clearBacType() {
        try {
            sessionStorage.removeItem(this.getBacStorageKey());
        } catch (error) {
            this.logger.warn('Unable to clear stored bac type:', error);
        }
        this.bacType = null;
    }

    // ============================================================
    // 🎮 QUIZ LOGIC
    // ============================================================

    startQuiz(role) {
        if (!this.questions[role] || this.questions[role].length === 0) {
            throw new Error(`No questions loaded for role: ${role}`);
        }

        this.logger.log(`🎮 Starting ${role} quiz with ${this.questions[role].length} questions`);
        
        this.currentRole = role;
        this.currentStep = 0;
        this.selectedAnswers = {};
        this.responseMetadata = {};
        this.scores = { TECH: 0, CREA: 0, MED: 0, BIZ: 0 };
        this.parentBudget = null;
        this.totalTimeSpent = 0;
        this.quizStartTime = Date.now();
        this.questionTimestamps.clear();
        this.responseCache.clear();

        return {
            role: this.currentRole,
            totalQuestions: this.questions[role].length,
            firstQuestion: this.getCurrentQuestion()
        };
    }

    getCurrentQuestion() {
        if (!this.currentRole || !this.questions[this.currentRole]) {
            throw new Error('Quiz not initialized');
        }

        const q = this.questions[this.currentRole][this.currentStep];
        if (!q) return null;

        this.questionTimestamps.set(q.code, Date.now());

        return {
            ...q,
            step: this.currentStep + 1,
            total: this.questions[this.currentRole].length
        };
    }

    convertToNumericScore(value, question) {
        const normalizedValue = this.normalizeOptionValue(value, question.type);
        
        if (question.type === 'likert' || question.type === 'scale') {
            const numValue = Number(normalizedValue);
            if (Number.isFinite(numValue) && numValue >= 1 && numValue <= 5) {
                return numValue;
            }
        }

        const options = question.o || [];
        const optionIndex = options.findIndex(opt => 
            opt.v === normalizedValue || opt.t === normalizedValue
        );

        if (optionIndex === -1) {
            this.logger.warn(`Option not found: "${value}", using default`);
            return 3;
        }

        const numOptions = options.length;
        let score;

        if (numOptions === 2) {
            score = optionIndex === 0 ? 1 : 4;
        } else if (numOptions === 3) {
            score = optionIndex === 0 ? 1 : (optionIndex === 1 ? 2 : 4);
        } else {
            score = Math.min(optionIndex + 1, 4);
        }

        return score;
    }

    answerQuestion(value) {
        const currentQuestion = this.getCurrentQuestion();
        if (!currentQuestion) {
            throw new Error('No current question');
        }

        const startTime = this.questionTimestamps.get(currentQuestion.code);
        if (startTime) {
            const timeSpent = Date.now() - startTime;
            this.totalTimeSpent += timeSpent;
            this.questionTimestamps.delete(currentQuestion.code);
        }

        let processedValue = value;
        let numericScore;
        
        if (currentQuestion.type === 'multi_choice') {
            try {
                const choices = JSON.parse(value);
                numericScore = this.calculateMultiChoiceScore(choices, currentQuestion);
                processedValue = choices.join(',');
            } catch (e) {
                numericScore = this.convertToNumericScore(value, currentQuestion);
            }
        } else {
            numericScore = this.convertToNumericScore(value, currentQuestion);
        }

        const normalizedValue = this.normalizeOptionValue(value, currentQuestion.type);
        const selectedOption = (currentQuestion.o || []).find(opt => 
            opt.v === normalizedValue || opt.t === normalizedValue
        );

        this.selectedAnswers[currentQuestion.code] = numericScore;
        this.responseMetadata[currentQuestion.code] = {
            raw_value: normalizedValue,
            numeric_score: numericScore,
            question_type: currentQuestion.type,
            option_count: (currentQuestion.o || []).length,
            selected_text: selectedOption?.t || String(value),
            time_spent_ms: startTime ? (Date.now() - startTime) : null
        };
        
        this.logger.log(`📝 Answer: ${currentQuestion.code} = ${value} (score: ${numericScore})`);

        this.responseCache.set(currentQuestion.code, {
            value: processedValue,
            score: numericScore,
            timestamp: Date.now()
        });

        if (currentQuestion.dimension) {
            const dim = currentQuestion.dimension.toUpperCase();
            if (this.scores[dim] !== undefined) {
                this.scores[dim] += numericScore;
            }
        }

        if (currentQuestion.isBudgetQuestion) {
            this.parentBudget = this.getBudgetAdviceFromScore(numericScore);
        }

        this.currentStep++;

        const isComplete = this.currentStep >= this.questions[this.currentRole].length;

        return {
            complete: isComplete,
            nextQuestion: isComplete ? null : this.getCurrentQuestion(),
            progress: {
                step: this.currentStep,
                total: this.questions[this.currentRole].length,
                percentage: Math.round((this.currentStep / this.questions[this.currentRole].length) * 100)
            }
        };
    }

    calculateMultiChoiceScore(choices, question) {
        if (!choices || choices.length === 0) return 3;
        
        const options = question.o || [];
        const selectedValues = choices.map(c => {
            const opt = options.find(o => o.v === c || o.t === c);
            return opt ? this.convertToNumericScore(opt.v, question) : 3;
        });
        
        return Math.round(selectedValues.reduce((a, b) => a + b, 0) / selectedValues.length);
    }

    getProgress() {
        const total = this.questions[this.currentRole]?.length || 1;
        return Math.round((this.currentStep / total) * 100);
    }

    getTotalQuestions() {
        return this.questions[this.currentRole]?.length || 0;
    }

    reset() {
        this.logger.log('🔄 Resetting quiz...');
        this.currentRole = null;
        this.currentStep = 0;
        this.selectedAnswers = {};
        this.responseMetadata = {};
        this.scores = { TECH: 0, CREA: 0, MED: 0, BIZ: 0 };
        this.responseCache.clear();
        this.questionTimestamps.clear();
        this.totalTimeSpent = 0;
        this.quizStartTime = null;
        this.clearBacType();
    }

    validateResponses() {
        const expectedKeys = [...new Set(this.questions[this.currentRole]?.map(q => q.code) || [])];
        const expectedCount = expectedKeys.length;
        const actualCount = Object.keys(this.selectedAnswers).length;

        this.logger.log('🔍 Validating responses...');
        this.logger.log(`   Expected: ${expectedCount}, Actual: ${actualCount}`);

        if (actualCount !== expectedCount) {
            const missing = expectedKeys.filter(code => this.selectedAnswers[code] === undefined);
            
            this.logger.error(`❌ Missing answers: ${missing.join(', ')}`);
            return {
                valid: false,
                error: `Incomplete quiz: ${missing.length} questions missing`,
                missing
            };
        }

        const invalidAnswers = Object.entries(this.selectedAnswers)
            .filter(([code, value]) => {
                if (typeof value !== 'number' || value < 1 || value > 5) {
                    this.logger.warn(`Invalid value for ${code}: ${value}`);
                    return true;
                }
                return false;
            });

        if (invalidAnswers.length > 0) {
            this.logger.error(`❌ Invalid answer values:`, invalidAnswers);
            return {
                valid: false,
                error: `Invalid answer values for ${invalidAnswers.length} questions`
            };
        }

        this.logger.log('✅ All responses valid');
        return { valid: true };
    }

    mapToProaFormat() {
        const validation = this.validateResponses();
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        this.logger.log('📊 Mapping responses to PROA format V3...');

        const proaResponses = {};
        
        for (const [code, value] of Object.entries(this.selectedAnswers)) {
            if (code === 'Q_BUDGET_SCOLARITE') continue;
            proaResponses[code.toLowerCase()] = value;
        }

        const responseMetadata = {};
        for (const [code, metadata] of Object.entries(this.responseMetadata)) {
            responseMetadata[code.toLowerCase()] = metadata;
        }

        if (this.currentRole === 'student') {
            if (!this.bacType) {
                throw new Error('Le type de bac est obligatoire pour ce quiz.');
            }

            responseMetadata.q_bac_type = {
                raw_value: this.bacType,
                selected_text: this.bacType,
                question_type: 'required_bac_gate',
                bac_info: this.getBacInfo(),
                is_required: true
            };
        }

        const quizDuration = this.quizStartTime ? (Date.now() - this.quizStartTime) : this.totalTimeSpent;
        
        const result = {
            user_id: this.getUserId(),
            user_type: this.currentRole === 'student' ? 'bachelier' : 'parent',
            quiz_code: this.currentRole === 'student' ? 'quiz_bachelier_v2' : 'quiz_parent_v2',
            orientation_type: 'field',
            responses: proaResponses,
            response_metadata: responseMetadata,
            quiz_metadata: {
                role: this.currentRole,
                total_questions: Object.keys(proaResponses).length,
                displayed_questions: this.questions[this.currentRole]?.length || 0,
                duration_ms: quizDuration,
                completed_at: new Date().toISOString(),
                bac_type: this.bacType
            }
        };

        if (this.bacType) {
            result.bac_code = this.bacType;
        }

        this.logger.log('✅ PROA format ready');
        return result;
    }

    getUserId() {
        if (this.authenticatedUser && this.authenticatedUser.id) {
            return this.authenticatedUser.id;
        }

        let userId = sessionStorage.getItem('user-id');
        if (!userId) {
            userId = this.generateUUID();
            sessionStorage.setItem('user-id', userId);
            this.logger.warn('⚠️ Using generated UUID as fallback user ID:', userId);
        }
        return userId;
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    getCurrentRole() {
        return this.currentRole;
    }

    getAnswers() {
        return { ...this.selectedAnswers };
    }

    getResponseMetadata() {
        return { ...this.responseMetadata };
    }

    getScores() {
        return { ...this.scores };
    }

    getBudgetAdvice() {
        return this.parentBudget;
    }

    getBudgetPreference() {
        const score = Number(this.selectedAnswers.Q_BUDGET_SCOLARITE);
        const ranges = {
            1: { level: 'low', label: '25 000 XAF par mois ou moins', max_monthly_price: 25000, currency: 'XAF' },
            2: { level: 'medium', label: 'Jusqu\'à 50 000 XAF par mois', max_monthly_price: 50000, currency: 'XAF' },
            3: { level: 'high', label: 'Jusqu\'à 100 000 XAF par mois', max_monthly_price: 100000, currency: 'XAF' },
            4: { level: 'open', label: 'Plus de 100 000 XAF par mois', max_monthly_price: null, currency: 'XAF' }
        };
        return ranges[score] || null;
    }

    getBudgetAdviceFromScore(score) {
        const advice = {
            1: 'Nous filtrons les universités avec des frais mensuels inférieurs à 25 000 XAF.',
            2: 'Nous filtrons les universités avec des frais mensuels inférieurs à 50 000 XAF.',
            3: 'Nous filtrons les universités avec des frais mensuels inférieurs à 100 000 XAF.',
            4: 'Le budget ne limite pas les recommandations universitaires.'
        };
        return advice[score] || null;
    }

    getStats() {
        return {
            totalQuestions: this.getTotalQuestions(),
            answeredQuestions: Object.keys(this.selectedAnswers).length,
            completionPercentage: this.getProgress(),
            totalTimeSpentMs: this.totalTimeSpent,
            bacType: this.bacType,
            currentRole: this.currentRole
        };
    }
}

if (typeof window !== 'undefined') {
    window.QuizService = QuizService;
}