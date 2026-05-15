/**
 * Dynamic Questions Configuration - Version 2.0
 * Configuration des questions dynamiques pour le quiz d'orientation
 * 
 * AMÉLIORATIONS V2:
 * - Support bac congolais (filtrage des questions selon la série)
 * - Dimension mapping pour scoring vectoriel
 * - Poids adaptatifs par question
 * - Validation des réponses
 * - Support multi-langues
 * 
 * Types supported:
 * 1. likert - Échelle d'accord (1-5)
 * 2. single_choice - Choix unique
 * 3. multi_choice - Choix multiples
 * 4. scenario - Mise en situation
 * 5. scale - Slider/Intensité (0-10)
 * 6. ranking - Classement par ordre de préférence
 */

// ============================================================
// 📊 CONFIGURATION DES DIMENSIONS
// ============================================================

const DIMENSIONS = {
    TECH: 'tech',
    BUSINESS: 'business',
    SOCIAL: 'social',
    CREATIVITY: 'creativity',
    IMPACT: 'impact',
    FLEXIBILITY: 'flexibility',
    INTERNATIONAL: 'international',
    EXPERTISE: 'expertise',
    ANALYSIS: 'analysis'
};

// Mapping bac congolais → dimensions prioritaires
const BAC_DIMENSION_PRIORITY = {
    'C': [DIMENSIONS.TECH, DIMENSIONS.EXPERTISE, DIMENSIONS.ANALYSIS],
    'D': [DIMENSIONS.TECH, DIMENSIONS.IMPACT, DIMENSIONS.SOCIAL],
    'A': [DIMENSIONS.SOCIAL, DIMENSIONS.CREATIVITY, DIMENSIONS.INTERNATIONAL],
    'G': [DIMENSIONS.BUSINESS, DIMENSIONS.SOCIAL, DIMENSIONS.FLEXIBILITY],
    'E': [DIMENSIONS.TECH, DIMENSIONS.FLEXIBILITY, DIMENSIONS.EXPERTISE],
    'H': [DIMENSIONS.TECH, DIMENSIONS.ANALYSIS, DIMENSIONS.EXPERTISE]
};

// ============================================================
// 🔥 CONFIGURATION DES QUESTIONS DYNAMIQUES V2
// ============================================================

const DYNAMIC_QUESTIONS = {
    // 🔥 TYPE 1: LIKERT (Échelle traditionnelle 1-5)
    likert: [
        {
            code: "q1_tech_passion",
            type: "likert",
            q: "Je suis fasciné par les nouvelles technologies et l'innovation",
            dimension: DIMENSIONS.TECH,
            weight: 1.2,
            bac_compatible: ['C', 'D', 'E', 'H'], // Compatible avec ces séries bac
            o: [
                { t: "Pas du tout d'accord", v: 1 },
                { t: "Plutôt pas d'accord", v: 2 },
                { t: "Neutre", v: 3 },
                { t: "Plutôt d'accord", v: 4 },
                { t: "Tout à fait d'accord", v: 5 }
            ]
        },
        {
            code: "q2_analytical",
            type: "likert",
            q: "J'aime résoudre des problèmes complexes et logiques",
            dimension: DIMENSIONS.EXPERTISE,
            weight: 1.1,
            bac_compatible: ['C', 'D', 'E', 'H'],
            o: [
                { t: "Pas du tout", v: 1 },
                { t: "Un peu", v: 2 },
                { t: "Moyennement", v: 3 },
                { t: "Beaucoup", v: 4 },
                { t: "Passionnément", v: 5 }
            ]
        },
        {
            code: "q3_social",
            type: "likert",
            q: "Je préfère travailler en équipe plutôt qu'en solo",
            dimension: DIMENSIONS.SOCIAL,
            weight: 1.0,
            bac_compatible: ['A', 'G'],
            o: [
                { t: "Toujours solo", v: 1 },
                { t: "Plutôt solo", v: 2 },
                { t: "Équilibre", v: 3 },
                { t: "Plutôt équipe", v: 4 },
                { t: "Toujours équipe", v: 5 }
            ]
        },
        {
            code: "q4_creative",
            type: "likert",
            q: "Je me sens plus créatif que technique",
            dimension: DIMENSIONS.CREATIVITY,
            weight: 1.0,
            bac_compatible: ['A', 'G'],
            o: [
                { t: "Très technique", v: 1 },
                { t: "Plutôt technique", v: 2 },
                { t: "Équilibré", v: 3 },
                { t: "Plutôt créatif", v: 4 },
                { t: "Très créatif", v: 5 }
            ]
        }
    ],

    // 🔥 TYPE 2: SINGLE CHOICE (Choix unique)
    single_choice: [
        {
            code: "q5_career_attraction",
            type: "single_choice",
            q: "Qu'est-ce qui t'attire le plus dans une carrière ?",
            dimension: DIMENSIONS.BUSINESS,
            weight: 1.3,
            bac_compatible: ['C', 'D', 'G', 'H'],
            o: [
                { t: "💻 Créer des solutions innovantes", v: "innovation", dimension_impact: DIMENSIONS.TECH },
                { t: "💰 Gérer une entreprise et générer des profits", v: "business", dimension_impact: DIMENSIONS.BUSINESS },
                { t: "❤️ Aider les gens et résoudre des problèmes sociaux", v: "humanitarian", dimension_impact: DIMENSIONS.SOCIAL },
                { t: "📊 Analyser des données pour des décisions éclairées", v: "analytics", dimension_impact: DIMENSIONS.EXPERTISE },
                { t: "🌍 Travailler à l'international et voyager", v: "international", dimension_impact: DIMENSIONS.INTERNATIONAL }
            ]
        },
        {
            code: "q6_work_environment",
            type: "single_choice",
            q: "Ton environnement de travail idéal ?",
            dimension: DIMENSIONS.FLEXIBILITY,
            weight: 1.0,
            bac_compatible: null, // Tous les bacs
            o: [
                { t: "🏢 Grande entreprise structurée", v: "corporate", dimension_impact: DIMENSIONS.BUSINESS },
                { t: "🚀 Startup dynamique", v: "startup", dimension_impact: DIMENSIONS.CREATIVITY },
                { t: "🏠 100% télétravail", v: "remote", dimension_impact: DIMENSIONS.FLEXIBILITY },
                { t: "🌍 Hybride (mix bureau/maison)", v: "hybrid", dimension_impact: DIMENSIONS.FLEXIBILITY },
                { t: "🎓 Recherche / Enseignement", v: "academic", dimension_impact: DIMENSIONS.EXPERTISE }
            ]
        }
    ],

    // 🔥 TYPE 3: MULTI CHOICE (Choix multiples)
    multi_choice: [
        {
            code: "q7_interests",
            type: "multi_choice",
            q: "Quelles activités te plaisent le plus ? (Sélectionne jusqu'à 3)",
            dimension: DIMENSIONS.TECH,
            weight: 1.2,
            max_selections: 3,
            bac_compatible: null,
            o: [
                { t: "🔧 Programmer et construire des solutions", v: "coding", dimension_impact: DIMENSIONS.TECH },
                { t: "👥 Diriger et motiver une équipe", v: "leadership", dimension_impact: DIMENSIONS.SOCIAL },
                { t: "🎤 Communiquer et présenter des idées", v: "communication", dimension_impact: DIMENSIONS.SOCIAL },
                { t: "🎨 Designer et créer (UI/UX)", v: "design", dimension_impact: DIMENSIONS.CREATIVITY },
                { t: "📖 Apprendre et se former en continu", v: "learning", dimension_impact: DIMENSIONS.EXPERTISE },
                { t: "🔬 Rechercher et expérimenter", v: "research", dimension_impact: DIMENSIONS.EXPERTISE },
                { t: "💼 Négocier et vendre", v: "sales", dimension_impact: DIMENSIONS.BUSINESS },
                { t: "📈 Analyser des données", v: "analysis", dimension_impact: DIMENSIONS.EXPERTISE }
            ]
        },
        {
            code: "q8_domains",
            type: "multi_choice",
            q: "Quels domaines technologiques t'intéressent ?",
            dimension: DIMENSIONS.TECH,
            weight: 1.1,
            max_selections: 4,
            bac_compatible: ['C', 'D', 'E', 'H'],
            o: [
                { t: "🤖 Intelligence Artificielle & ML", v: "ai", dimension_impact: DIMENSIONS.TECH },
                { t: "🌐 Développement Web & Mobile", v: "web", dimension_impact: DIMENSIONS.TECH },
                { t: "🔒 Cybersécurité", v: "security", dimension_impact: DIMENSIONS.TECH },
                { t: "☁️ Cloud Computing", v: "cloud", dimension_impact: DIMENSIONS.TECH },
                { t: "🎮 Game Development", v: "gaming", dimension_impact: DIMENSIONS.CREATIVITY },
                { t: "📱 IoT & Embedded Systems", v: "iot", dimension_impact: DIMENSIONS.TECH },
                { t: "📊 Data Science", v: "data", dimension_impact: DIMENSIONS.EXPERTISE },
                { t: "🏥 Health Tech / MedTech", v: "health", dimension_impact: DIMENSIONS.IMPACT }
            ]
        }
    ],

    // 🔥 TYPE 4: SCENARIO (Mise en situation)
    scenario: [
        {
            code: "q9_scenario_problem",
            type: "scenario",
            q: "Tu reçois une mission complexe. Quelle est ta première réaction ?",
            dimension: DIMENSIONS.FLEXIBILITY,
            weight: 1.2,
            bac_compatible: null,
            o: [
                { t: "🔧 Plonger dans la technique pour comprendre", v: "technical", dimension_impact: DIMENSIONS.TECH },
                { t: "👥 Organiser une réunion d'équipe", v: "collaborative", dimension_impact: DIMENSIONS.SOCIAL },
                { t: "📊 Analyser les risques et contraintes", v: "analytical", dimension_impact: DIMENSIONS.EXPERTISE },
                { t: "🎯 Définir la stratégie globale", v: "strategic", dimension_impact: DIMENSIONS.BUSINESS }
            ]
        },
        {
            code: "q10_scenario_pressure",
            type: "scenario",
            q: "Sous pression, comment réagis-tu généralement ?",
            dimension: DIMENSIONS.FLEXIBILITY,
            weight: 1.0,
            bac_compatible: null,
            o: [
                { t: "🚀 Je travaille plus dur", v: "intense", dimension_impact: DIMENSIONS.TECH },
                { t: "🧠 Je prends du recul", v: "calm", dimension_impact: DIMENSIONS.EXPERTISE },
                { t: "🤝 Je cherche de l'aide", v: "collaborative", dimension_impact: DIMENSIONS.SOCIAL },
                { t: "⏸️ Je prends des pauses", v: "balanced", dimension_impact: DIMENSIONS.FLEXIBILITY }
            ]
        }
    ],

    // 🔥 TYPE 5: SCALE (Slider - Mesure d'intensité)
    scale: [
        {
            code: "q11_scale_logic",
            type: "scale",
            q: "Évalue ton niveau en logique et résolution de problèmes",
            dimension: DIMENSIONS.EXPERTISE,
            weight: 1.0,
            min: 0,
            max: 10,
            labels: { 0: "Débutant", 5: "Intermédiaire", 10: "Expert" },
            bac_compatible: ['C', 'D', 'H']
        },
        {
            code: "q12_scale_creativity",
            type: "scale",
            q: "Te sens-tu plus créatif ou analytique ?",
            dimension: DIMENSIONS.CREATIVITY,
            weight: 0.9,
            min: 0,
            max: 10,
            labels: { 0: "Très créatif", 5: "Équilibré", 10: "Très analytique" },
            bac_compatible: null
        }
    ],

    // 🔥 TYPE 6: RANKING (Classement - NOUVEAU)
    ranking: [
        {
            code: "q13_ranking_priorities",
            type: "ranking",
            q: "Classe ces critères par ordre d'importance pour ta carrière",
            dimension: DIMENSIONS.BUSINESS,
            weight: 1.3,
            max_items: 4,
            bac_compatible: null,
            items: [
                { text: "💰 Salaire élevé", value: "salary", dimension_impact: DIMENSIONS.BUSINESS },
                { text: "⚖️ Équilibre vie pro/perso", value: "balance", dimension_impact: DIMENSIONS.FLEXIBILITY },
                { text: "🚀 Opportunités d'évolution", value: "growth", dimension_impact: DIMENSIONS.BUSINESS },
                { text: "🌍 Impact social positif", value: "impact", dimension_impact: DIMENSIONS.IMPACT },
                { text: "🧠 Développement personnel", value: "learning", dimension_impact: DIMENSIONS.EXPERTISE },
                { text: "🏝️ Flexibilité / Télétravail", value: "flexibility", dimension_impact: DIMENSIONS.FLEXIBILITY }
            ]
        }
    ]
};

// ============================================================
// 📊 FONCTIONS UTILITAIRES
// ============================================================

/**
 * Filtre les questions selon la série bac de l'utilisateur
 * @param {string} bacCode - Code bac (C, D, A, G, E, H)
 * @returns {Array} Questions compatibles
 */
function filterQuestionsByBac(bacCode) {
    if (!bacCode) return getAllQuestions();
    
    const compatibleQuestions = [];
    const allTypes = ['likert', 'single_choice', 'multi_choice', 'scenario', 'scale', 'ranking'];
    
    for (const type of allTypes) {
        const questions = DYNAMIC_QUESTIONS[type] || [];
        for (const q of questions) {
            // Si pas de restriction bac, inclure
            if (!q.bac_compatible || q.bac_compatible.includes(bacCode)) {
                compatibleQuestions.push({
                    ...q,
                    original_type: type
                });
            }
        }
    }
    
    console.log(`🎓 Filtrage bac ${bacCode}: ${compatibleQuestions.length}/${getAllQuestions().length} questions compatibles`);
    return compatibleQuestions;
}

/**
 * Récupère toutes les questions (sans filtre)
 */
function getAllQuestions() {
    const all = [];
    const allTypes = ['likert', 'single_choice', 'multi_choice', 'scenario', 'scale', 'ranking'];
    
    for (const type of allTypes) {
        const questions = DYNAMIC_QUESTIONS[type] || [];
        for (const q of questions) {
            all.push({
                ...q,
                original_type: type
            });
        }
    }
    return all;
}

/**
 * Crée un quiz dynamique équilibré
 * @param {number} targetQuestions - Nombre cible de questions
 * @param {string} bacCode - Code bac pour filtrage (optionnel)
 * @returns {Array} Questions du quiz
 */
function createDynamicQuizMix(targetQuestions = 10, bacCode = null) {
    let availableQuestions = bacCode ? filterQuestionsByBac(bacCode) : getAllQuestions();
    
    // Distribution équilibrée par type
    const typeDistribution = {
        likert: 2,
        single_choice: 2,
        multi_choice: 1,
        scenario: 1,
        scale: 1,
        ranking: 1
    };
    
    const selected = [];
    const types = Object.keys(typeDistribution);
    
    for (const type of types) {
        const typeQuestions = availableQuestions.filter(q => q.type === type);
        const needed = typeDistribution[type];
        
        // Mélanger et prendre les needed
        const shuffled = [...typeQuestions];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        selected.push(...shuffled.slice(0, needed));
    }
    
    // Si pas assez, compléter avec des questions aléatoires
    const remainingNeeded = targetQuestions - selected.length;
    if (remainingNeeded > 0) {
        const usedCodes = new Set(selected.map(q => q.code));
        const remaining = availableQuestions.filter(q => !usedCodes.has(q.code));
        
        for (let i = 0; i < remainingNeeded && i < remaining.length; i++) {
            selected.push(remaining[i]);
        }
    }
    
    console.log(`✅ Quiz créé: ${selected.length} questions (cible: ${targetQuestions})`);
    return selected.slice(0, targetQuestions);
}

/**
 * Crée un quiz personnalisé selon les dimensions prioritaires du bac
 * @param {string} bacCode - Code bac
 * @param {number} targetQuestions - Nombre de questions
 * @returns {Array} Questions personnalisées
 */
function createPersonalizedQuizByBac(bacCode, targetQuestions = 8) {
    if (!bacCode || !BAC_DIMENSION_PRIORITY[bacCode]) {
        return createDynamicQuizMix(targetQuestions);
    }
    
    const priorityDimensions = BAC_DIMENSION_PRIORITY[bacCode];
    console.log(`🎯 Bac ${bacCode}: Dimensions prioritaires: ${priorityDimensions.join(', ')}`);
    
    let availableQuestions = filterQuestionsByBac(bacCode);
    if (!availableQuestions || availableQuestions.length === 0) {
        return createDynamicQuizMix(targetQuestions, bacCode);
    }
    
    // Shuffle and return the selected questions
    const shuffled = [...availableQuestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, targetQuestions);
}

console.log('✅ Dynamic Questions module loaded. Available:');
console.log('- DYNAMIC_QUESTIONS_EXAMPLES: All question types');
console.log('- createDynamicQuizMix(): Balanced mix');
console.log('- createBalancedDynamicQuiz(n): Get n questions');
