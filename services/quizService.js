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
        this.scores = { TECH: 0, CREA: 0, MED: 0, BIZ: 0 };
        this.parentBudget = null;
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
            
            this.questions.student = studentQuestions.slice(0, 10).map(q => this.formatQuestion(q));
            this.questions.parent = parentQuestions.slice(0, 5).map(q => this.formatQuestion(q));
            
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

    /**
     * Format question from DB structure to quiz format
     */
    formatQuestion(dbQuestion) {
        const questionType = dbQuestion.type || dbQuestion.question_type;

        return {
            code: dbQuestion.code || dbQuestion.question_code,
            q: dbQuestion.text || dbQuestion.question_text,
            type: questionType,
            o: (dbQuestion.options || []).map(opt => ({
                t: opt.text || opt.option_text,
                v: this.normalizeOptionValue(opt.value ?? opt.option_value, questionType)
            }))
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
        const currentQuestion = this.getCurrentQuestion();
        if (!currentQuestion) {
            throw new Error('No current question');
        }

        const normalizedValue = this.normalizeOptionValue(value, currentQuestion.type);

        // Store answer
        this.selectedAnswers[currentQuestion.code] = normalizedValue;
        this.logger.log(`📝 Answer recorded: ${currentQuestion.code} = ${value}`);

        // Update profile scores
        if (this.scores[normalizedValue] !== undefined) {
            this.scores[normalizedValue] += 2;
        }

        // Budget advice for parents
        if (normalizedValue === 'LOW') {
            this.parentBudget = 'Privilégiez les Universités Publiques ou BTS.';
        }
        if (normalizedValue === 'HIGH') {
            this.parentBudget = 'Les Grandes Écoles de Commerce/Ingénieurs sont accessibles.';
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

    /**
     * Reset quiz
     */
    reset() {
        this.logger.log('🔄 Resetting quiz...');
        this.currentRole = null;
        this.currentStep = 0;
        this.selectedAnswers = {};
        this.scores = { TECH: 0, CREA: 0, MED: 0, BIZ: 0 };
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

        // Validate all values are in range [1-4] for Likert questions
        const invalidAnswers = Object.entries(this.selectedAnswers)
            .filter(([code, value]) => {
                const question = this.questions[this.currentRole].find(q => q.code === code);
                if (question?.type === 'likert' && (typeof value !== 'number' || value < 1 || value > 4)) {
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
        const validation = this.validateResponses();
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        this.logger.log('📊 Mapping responses to PROA format...');

        const proaResponses = {};
        
        for (const [code, value] of Object.entries(this.selectedAnswers)) {
            // Keep values as-is (1, 2, 3, 4) - PROA expects these values
            // Normalization happens server-side if needed
            proaResponses[code.toLowerCase()] = value;
        }

        this.logger.log('✅ PROA format ready:', proaResponses);
        
        return {
            user_id: this.getUserId(),
            quiz_version: this.currentRole === 'student' ? '1.0' : '1.0-parent',
            orientation_type: 'field',
            responses: proaResponses
        };
    }

    /**
     * Get user ID from session/browser storage
     */
    getUserId() {
        // Try sessionStorage first
        let userId = sessionStorage.getItem('user-id');
        
        // Fall back to random UUID
        if (!userId) {
            userId = this.generateUUID();
            sessionStorage.setItem('user-id', userId);
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
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.QuizService = QuizService;
}
