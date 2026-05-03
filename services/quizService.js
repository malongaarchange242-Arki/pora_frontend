/**
 * Quiz Service Module
 * Handles quiz logic: loading, format mapping, response validation, scoring
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
        this.authenticatedUser = null; // Store authenticated user
    }

    /**
     * Set authenticated user from Supabase
     */
    setAuthenticatedUser(user) {
        this.authenticatedUser = user;
        this.logger.log('✅ Authenticated user set in quiz service:', user?.id);
    }

    /**
     * Initialize quiz with questions from API
     */
    async initialize(questions) {
        try {
            this.logger.log('🎯 Initializing quiz service...');
            
            // Dédupliquer les questions par code pour éviter les doublons dans le quiz
            const uniqueQuestions = [];
            const seenCodes = new Set();
            for (const q of questions) {
                const code = q.code || q.question_code;
                if (!seenCodes.has(code)) {
                    seenCodes.add(code);
                    uniqueQuestions.push(q);
                } else {
                    this.logger.warn(`Duplicate question code skipped during initialization: ${code}`);
                }
            }
            
            // Split questions by quiz_type field
            const studentQuestions = uniqueQuestions.filter(q => q.quiz_type !== 'parent');
            const parentQuestions = uniqueQuestions.filter(q => q.quiz_type === 'parent');
            
            this.questions.student = [
                ...studentQuestions.slice(0, 10).map(q => this.formatQuestion(q)),
                this.createBudgetQuestion()
            ];
            this.questions.parent = [
                ...parentQuestions.slice(0, 5).map(q => this.formatQuestion(q)),
                this.createBudgetQuestion()
            ];
            
            this.logger.log(`✅ Quiz service ready: ${this.questions.student.length} student, ${this.questions.parent.length} parent questions`);
            
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
        const questionType = dbQuestion.type || dbQuestion.question_type;

        // Handle different option formats from API
        let options = [];
        if (dbQuestion.options && Array.isArray(dbQuestion.options)) {
            options = dbQuestion.options.map(opt => {
                let optionValue;
                let optionText;

                // Handle string format like "@{label=Text; value=1}"
                if (typeof opt === 'string' && opt.startsWith('@{') && opt.endsWith('}')) {
                    const content = opt.slice(2, -1); // Remove @{ and }
                    const parts = content.split(';').map(p => p.trim());
                    const labelPart = parts.find(p => p.startsWith('label='));
                    const valuePart = parts.find(p => p.startsWith('value='));
                    optionText = labelPart ? labelPart.split('=')[1] : opt;
                    optionValue = valuePart ? valuePart.split('=')[1] : opt;
                }
                // Handle object format with label/value
                else if (typeof opt === 'object' && opt !== null && opt.label !== undefined) {
                    optionText = opt.label || opt.text || `Option ${opt.value || options.length + 1}`;
                    optionValue = opt.value || opt.option_value || options.length + 1;
                }
                // Handle object format with text/value
                else if (typeof opt === 'object' && opt !== null && opt.text !== undefined) {
                    optionText = opt.text || opt.label || `Option ${opt.value || options.length + 1}`;
                    optionValue = opt.value || opt.option_value || options.length + 1;
                }
                // Handle simple string (for autocomplete type)
                else if (typeof opt === 'string') {
                    optionText = opt;
                    optionValue = opt;
                }
                // Fallback
                else {
                    optionText = `Option ${options.length + 1}`;
                    optionValue = options.length + 1;
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
            o: options
        };
    }

    /**
     * Normalize option values coming from DB/API.
     * Likert answers must be numeric for validation and PROA payload mapping.
     */
    normalizeOptionValue(value, questionType) {
        if (typeof value === 'string') {
            const trimmed = value.trim();

            if (['likert', 'boolean', 'choice'].includes(questionType) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
                return Number(trimmed);
            }

            return trimmed;
        }

        return value;
    }

    normalizeBacType(value) {
        const normalized = String(value || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '');

        const aliases = {
            A: 'A',
            A1: 'A',
            A2: 'A',
            A3: 'A',
            C: 'C/D',
            D: 'C/D',
            'C/D': 'C/D',
            CD: 'C/D',
            'D/C': 'C/D',
            DC: 'C/D',
            E: 'E/F',
            F: 'E/F',
            'E/F': 'E/F',
            EF: 'E/F',
            'F/E': 'E/F',
            FE: 'E/F',
            H: 'H',
            G: 'G/BG',
            BG: 'G/BG',
            'G/BG': 'G/BG',
            GBG: 'G/BG',
            P: 'P'
        };

        return aliases[normalized] || null;
    }

    getBacStorageKey() {
        return `orientation-bac-type:${this.getUserId()}`;
    }

    loadStoredBacType() {
        try {
            return this.normalizeBacType(sessionStorage.getItem(this.getBacStorageKey()));
        } catch (error) {
            this.logger.warn('Unable to load stored bac type:', error);
            return null;
        }
    }

    setBacType(value) {
        const normalized = this.normalizeBacType(value);
        if (!normalized) {
            throw new Error(`Invalid bac type: ${value}`);
        }

        this.bacType = normalized;

        try {
            sessionStorage.setItem(this.getBacStorageKey(), normalized);
        } catch (error) {
            this.logger.warn('Unable to persist bac type:', error);
        }

        return this.bacType;
    }

    getBacType() {
        return this.bacType;
    }

    hasBacType() {
        return Boolean(this.bacType);
    }

    clearBacType() {
        try {
            sessionStorage.removeItem(this.getBacStorageKey());
        } catch (error) {
            this.logger.warn('Unable to clear stored bac type:', error);
        }

        this.bacType = null;
    }

    /**
     * Convert option value to numeric score (1-4) for PROA API
     * For choice/autocomplete questions, map based on option position
     * For likert questions, use the value directly
     */
    convertToNumericScore(value, question) {
        const normalizedValue = this.normalizeOptionValue(value, question.type);
        value = normalizedValue;
        console.log(`🔄 Converting value "${value}" for question type "${question.type}"`);

        // For likert questions, value should already be numeric 1-4
        if (question.type === 'likert') {
            const numValue = Number(value);
            if (Number.isFinite(numValue) && numValue >= 1 && numValue <= 4) {
                console.log(`✅ Likert value ${value} -> ${numValue}`);
                return numValue;
            }
            // If it's a string but should be numeric, try to map it
            console.log(`⚠️  Likert value "${value}" is not numeric, treating as choice`);
        }

        // For choice/autocomplete questions, or likert with string values, find the option index and map to 1-4
        if (question.type === 'choice' || question.type === 'autocomplete' || question.type === 'likert') {
            const options = question.o || [];
            console.log(`🔍 Looking for "${value}" in options:`, options);

            const optionIndex = options.findIndex(opt => opt.v === value || opt.t === value);

            if (optionIndex === -1) {
                console.error(`❌ Option value "${value}" not found in options:`, options);
                throw new Error(`Option value not found: ${value}`);
            }

            // Map option position to score 1-4
            // If 2 options: position 0 = 1, position 1 = 4
            // If 3 options: position 0 = 1, position 1 = 2, position 2 = 4
            // If 4+ options: position 0 = 1, position 1 = 2, position 2 = 3, position 3+ = 4
            const numOptions = options.length;
            let score;
            if (numOptions === 2) {
                score = optionIndex === 0 ? 1 : 4;
            } else if (numOptions === 3) {
                score = optionIndex === 0 ? 1 : (optionIndex === 1 ? 2 : 4);
            } else {
                score = Math.min(optionIndex + 1, 4);
            }

            console.log(`✅ Mapped option at index ${optionIndex} to score ${score}`);
            return score;
        }

        // Fallback for unknown types
        const numValue = Number(value);
        if (!isNaN(numValue) && numValue >= 1 && numValue <= 4) {
            console.log(`✅ Fallback: "${value}" -> ${numValue}`);
            return numValue;
        }

        console.error(`❌ Cannot convert value "${value}" to numeric score`);
        throw new Error(`Cannot convert value to numeric score: ${value}`);
    }

    /**
     * Start quiz for a given role (student or parent)
     */
    startQuiz(role) {
        if (!this.questions[role] || this.questions[role].length === 0) {
            throw new Error(`❌ No questions loaded for role: ${role}`);
        }

        this.logger.log(`🎮 Starting ${role} quiz with ${this.questions[role].length} questions`);
        
        this.currentRole = role;
        this.currentStep = 0;
        this.selectedAnswers = {};
        this.responseMetadata = {};
        this.scores = { TECH: 0, CREA: 0, MED: 0, BIZ: 0 };
        this.parentBudget = null;

        return {
            role: this.currentRole,
            totalQuestions: this.questions[role].length,
            firstQuestion: this.getCurrentQuestion()
        };
    }

    /**
     * Get current question
     */
    getCurrentQuestion() {
        if (!this.currentRole || !this.questions[this.currentRole]) {
            throw new Error('Quiz not initialized');
        }

        const q = this.questions[this.currentRole][this.currentStep];
        if (!q) return null;

        return {
            ...q,
            step: this.currentStep + 1,
            total: this.questions[this.currentRole].length
        };
    }

    /**
     * Record answer and advance to next question
     */
    answerQuestion(value) {
        console.log(`🎯 answerQuestion called with value: "${value}"`);

        const currentQuestion = this.getCurrentQuestion();
        if (!currentQuestion) {
            throw new Error('No current question');
        }

        console.log(`📋 Current question:`, currentQuestion);

        // Convert option value to numeric score for PROA API
        const numericScore = this.convertToNumericScore(value, currentQuestion);
        const normalizedValue = this.normalizeOptionValue(value, currentQuestion.type);
        const selectedOption = (currentQuestion.o || []).find(opt => opt.v === normalizedValue || opt.t === normalizedValue || opt.v === value || opt.t === value);

        // Store answer (keep original value for display, numeric score for API)
        this.selectedAnswers[currentQuestion.code] = numericScore;
        this.responseMetadata[currentQuestion.code] = {
            raw_value: normalizedValue,
            numeric_score: numericScore,
            question_type: currentQuestion.type,
            option_count: (currentQuestion.o || []).length,
            selected_text: selectedOption?.t ?? String(value)
        };
        this.logger.log(`📝 Answer recorded: ${currentQuestion.code} = ${value} (score: ${numericScore})`);

        // Update profile scores for legacy compatibility
        if (this.scores[numericScore] !== undefined) {
            this.scores[numericScore] += 2;
        }

        if (currentQuestion.isBudgetQuestion) {
            this.parentBudget = this.getBudgetAdviceFromScore(numericScore);
        } else {
            // Budget advice for parents
            if (numericScore === 1) {  // LOW budget
                this.parentBudget = 'Privilégiez les Universités Publiques ou BTS.';
            }
            if (numericScore === 4) {  // HIGH budget
                this.parentBudget = 'Les Grandes Écoles de Commerce/Ingénieurs sont accessibles.';
            }
        }

        // Advance
        this.currentStep++;

        // Check if quiz complete
        const isComplete = this.currentStep >= this.questions[this.currentRole].length;

        return {
            complete: isComplete,
            nextQuestion: isComplete ? null : this.getCurrentQuestion(),
            progress: {
                step: this.currentStep,
                total: this.questions[this.currentRole].length
            }
        };
    }

    /**
     * Get progress percentage
     */
    getProgress() {
        const total = this.questions[this.currentRole]?.length || 1;
        return Math.round((this.currentStep / total) * 100);
    }

    getTotalQuestions() {
        return this.questions[this.currentRole]?.length || 0;
    }

    /**
     * Reset quiz
     */
    reset() {
        this.logger.log('🔄 Resetting quiz...');
        this.currentRole = null;
        this.currentStep = 0;
        this.selectedAnswers = {};
        this.responseMetadata = {};
        this.scores = { TECH: 0, CREA: 0, MED: 0, BIZ: 0 };
        this.clearBacType();
    }

    /**
     * Validate responses before submission
     */
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

        // Validate all values are in range [1-4] for all question types
        const invalidAnswers = Object.entries(this.selectedAnswers)
            .filter(([code, value]) => {
                if (typeof value !== 'number' || value < 1 || value > 4) {
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

    /**
     * Map responses to PROA format
     */
    mapToProaFormat() {
        console.log('📊 Mapping responses to PROA format...');
        console.log('📋 Current selectedAnswers:', this.selectedAnswers);

        const validation = this.validateResponses();
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        this.logger.log('📊 Mapping responses to PROA format...');

        const proaResponses = {};
        
        for (const [code, value] of Object.entries(this.selectedAnswers)) {
            if (code === 'Q_BUDGET_SCOLARITE') {
                continue;
            }
            // Values are already converted to numeric scores 1-4
            proaResponses[code.toLowerCase()] = value;
            console.log(`🔄 ${code} -> ${value} (type: ${typeof value})`);
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
                option_count: 6,
                is_required: true
            };
        }

        console.log('✅ PROA format ready:', proaResponses);
        this.logger.log('✅ PROA format ready:', proaResponses);
        
        return {
            user_id: this.getUserId(),
            quiz_version: this.currentRole === 'student' ? '1.0' : '1.0-parent',
            orientation_type: 'field',
            responses: proaResponses,
            response_metadata: responseMetadata
        };
    }

    /**
     * Get user ID from authenticated user or fallback
     */
    getUserId() {
        // Use authenticated user ID first
        if (this.authenticatedUser && this.authenticatedUser.id) {
            return this.authenticatedUser.id;
        }

        // Fallback to sessionStorage for legacy flows
        let userId = sessionStorage.getItem('user-id');

        if (!userId) {
            userId = this.generateUUID();
            sessionStorage.setItem('user-id', userId);
            this.logger.warn('⚠️ Using generated UUID as fallback user ID:', userId);
        }

        return userId;
    }

    /**
     * Generate UUID v4
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * Get current role
     */
    getCurrentRole() {
        return this.currentRole;
    }

    /**
     * Get all answers
     */
    getAnswers() {
        return { ...this.selectedAnswers };
    }

    /**
     * Get profile scores
     */
    getScores() {
        return { ...this.scores };
    }

    /**
     * Get parent budget advice
     */
    getBudgetAdvice() {
        return this.parentBudget;
    }

    getBudgetPreference() {
        const score = Number(this.selectedAnswers.Q_BUDGET_SCOLARITE);
        const ranges = {
            1: { level: 'low', label: '25 000 XAF par mois ou moins', max_monthly_price: 25000, currency: 'XAF' },
            2: { level: 'medium', label: 'Jusqu’à 50 000 XAF par mois', max_monthly_price: 50000, currency: 'XAF' },
            3: { level: 'high', label: 'Jusqu’à 100 000 XAF par mois', max_monthly_price: 100000, currency: 'XAF' },
            4: { level: 'open', label: 'Plus de 100 000 XAF par mois', max_monthly_price: null, currency: 'XAF' }
        };

        return ranges[score] || null;
    }

    getBudgetAdviceFromScore(score) {
        const preference = {
            1: 'Nous filtrons les universités avec des frais mensuels inférieurs à 25 000 XAF.',
            2: 'Nous filtrons les universités avec des frais mensuels inférieurs à 50 000 XAF.',
            3: 'Nous filtrons les universités avec des frais mensuels inférieurs à 100 000 XAF.',
            4: 'Le budget ne limite pas les recommandations universitaires.'
        };

        return preference[score] || null;
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.QuizService = QuizService;
}
