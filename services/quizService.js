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
        this.studentQuestionPriority = [
            'q1',
            'q2',
            'q4',
            'q9',
            'q10',
            'q11',
            'q18',
            'q19',
            'q20',
            'q21'
        ];
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
            this.logger.log('ðŸŽ¯ Initializing quiz service...');
            
            // Split questions by quiz_type field
            const studentQuestions = questions.filter(q => q.quiz_type !== 'parent');
            const parentQuestions = questions.filter(q => q.quiz_type === 'parent' || studentQuestions.some(sq => sq.code === q.code));
            
            this.questions.student = this.buildOptimizedStudentQuiz(studentQuestions).map(q => this.formatQuestion(q));
            this.questions.parent = parentQuestions.slice(0, 5).map(q => this.formatQuestion(q));
            
            this.logger.log(`âœ… Quiz service ready: ${this.questions.student.length} student, ${this.questions.parent.length} parent questions`);
            
            return {
                student: this.questions.student,
                parent: this.questions.parent
            };
        } catch (error) {
            this.logger.error('âŒ Failed to initialize quiz:', error);
            throw error;
        }
    }

    /**
     * Build a short 10-question student quiz with stronger business/admin signal.
     */
    buildOptimizedStudentQuiz(questions) {
        const questionsByCode = new Map(
            questions.map(question => [
                (question.code || question.question_code || '').toLowerCase(),
                question
            ])
        );
        const selected = [];
        const seen = new Set();
        for (const code of this.studentQuestionPriority) {
            const question = questionsByCode.get(code);
            if (question && !seen.has(code)) {
                selected.push(question);
                seen.add(code);
            }
        }
        for (const question of questions) {
            const code = (question.code || question.question_code || '').toLowerCase();
            if (!seen.has(code) && selected.length < 10) {
                selected.push(question);
                seen.add(code);
            }
        }
        this.logger.log(
            'Optimized student quiz codes:',
            selected.map(q => q.code || q.question_code)
        );
        return selected.slice(0, 10);
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
            throw new Error(`âŒ No questions loaded for role: ${role}`);
        }

        this.logger.log(`ðŸŽ® Starting ${role} quiz with ${this.questions[role].length} questions`);
        
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
        this.logger.log(`ðŸ“ Answer recorded: ${currentQuestion.code} = ${value}`);

        // Update profile scores
        if (this.scores[normalizedValue] !== undefined) {
            this.scores[normalizedValue] += 2;
        }

        // Budget advice for parents
        if (normalizedValue === 'LOW') {
            this.parentBudget = 'PrivilÃ©giez les UniversitÃ©s Publiques ou BTS.';
        }
        if (normalizedValue === 'HIGH') {
            this.parentBudget = 'Les Grandes Ã‰coles de Commerce/IngÃ©nieurs sont accessibles.';
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
        this.logger.log('ðŸ”„ Resetting quiz...');
        this.currentRole = null;
        this.currentStep = 0;
        this.selectedAnswers = {};
        this.scores = { TECH: 0, CREA: 0, MED: 0, BIZ: 0 };
    }

    /**
     * Validate responses before submission
     */
    validateResponses() {
        const expectedCount = this.questions[this.currentRole]?.length;
        const actualCount = Object.keys(this.selectedAnswers).length;

        this.logger.log('ðŸ” Validating responses...');
        this.logger.log(`   Expected: ${expectedCount}, Actual: ${actualCount}`);

        if (actualCount !== expectedCount) {
            const missing = this.questions[this.currentRole]
                .map(q => q.code)
                .filter(code => !this.selectedAnswers[code]);
            
            this.logger.error(`âŒ Missing answers: ${missing.join(', ')}`);
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
            this.logger.error(`âŒ Invalid answer values:`, invalidAnswers);
            return {
                valid: false,
                error: `Invalid answer values for ${invalidAnswers.length} questions`
            };
        }

        this.logger.log('âœ… All responses valid');
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

        this.logger.log('ðŸ“Š Mapping responses to PROA format...');

        const proaResponses = {};
        
        for (const [code, value] of Object.entries(this.selectedAnswers)) {
            // Keep values as-is (1, 2, 3, 4) - PROA expects these values
            // Normalization happens server-side if needed
            proaResponses[code.toLowerCase()] = value;
        }

        this.logger.log('âœ… PROA format ready:', proaResponses);
        
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


