/**
 * Dynamic Questions Configuration
 * Demonstrates how to use 5 different question types for varied quiz experience
 * 
 * Types supported:
 * 1. likert - Échelle d'accord (Pas du tout... Tout à fait)
 * 2. single_choice - Choix unique (Radio buttons)
 * 3. multi_choice - Choix multiples (Checkboxes)
 * 4. scenario - Mise en situation (Like single_choice but contextual)
 * 5. scale - Slider/Intensité (0-10 range)
 */

const DYNAMIC_QUESTIONS_EXAMPLES = {
    // 🔥 TYPE 1: LIKERT (Traditional scale)
    likert_examples: [
        {
            code: "q1_likert",
            type: "likert",
            q: "Je suis fasciné par l'IA et le machine learning",
            o: [
                { t: "Pas du tout d'accord", v: 1 },
                { t: "Plutôt pas d'accord", v: 2 },
                { t: "Plutôt d'accord", v: 3 },
                { t: "Tout à fait d'accord", v: 4 }
            ]
        },
        {
            code: "q2_likert",
            type: "likert",
            q: "J'aime travailler en équipe plutôt qu'en solo",
            o: [
                { t: "Pas du tout d'accord", v: 1 },
                { t: "Plutôt pas d'accord", v: 2 },
                { t: "Plutôt d'accord", v: 3 },
                { t: "Tout à fait d'accord", v: 4 }
            ]
        }
    ],

    // 🔥 TYPE 2: SINGLE CHOICE (Radio buttons - more engaging)
    single_choice_examples: [
        {
            code: "q3_choice",
            type: "single_choice",
            q: "Qu'est-ce qui t'attire le plus dans une carrière ?",
            o: [
                { t: "💻 Créer des applications innovantes", v: "innovation" },
                { t: "💰 Gérer une entreprise et générer des profits", v: "business" },
                { t: "❤️ Aider les gens et résoudre des problèmes sociaux", v: "humanitarian" },
                { t: "📊 Analyser des données et extraire des insights", v: "analytics" }
            ]
        },
        {
            code: "q4_choice",
            type: "single_choice",
            q: "Ton environnement de travail idéal ?",
            o: [
                { t: "🏢 Grand bureau structuré avec hiérarchie claire", v: "corporate" },
                { t: "🚀 Startup dynamique avec liberté créative", v: "startup" },
                { t: "🏠 Travail à distance avec flexibilité", v: "remote" },
                { t: "🌍 Environnement mixte (Bureau 2-3 jours/semaine)", v: "hybrid" }
            ]
        }
    ],

    // 🔥 TYPE 3: MULTI CHOICE (Checkboxes - select multiple answers)
    multi_choice_examples: [
        {
            code: "q5_multi",
            type: "multi_choice",
            q: "Quelles activités te plaisent ? (Sélectionne plusieurs)",
            o: [
                { t: "🔧 Coder et construire des solutions", v: "coding" },
                { t: "👥 Diriger et motiver une équipe", v: "leadership" },
                { t: "🎤 Communiquer et présenter des idées", v: "communication" },
                { t: "🎨 Créer et designer (UI/UX)", v: "design" },
                { t: "📖 Apprendre et rester à jour", v: "learning" },
                { t: "🔬 Rechercher et expérimenter", v: "research" }
            ]
        },
        {
            code: "q6_multi",
            type: "multi_choice",
            q: "Quels domaines t'intéressent ? (Multi-sélection)",
            o: [
                { t: "🤖 Intelligence Artificielle & Machine Learning", v: "ai" },
                { t: "🌐 Développement Web & Mobile", v: "web" },
                { t: "🔒 Cybersécurité & Protection des données", v: "security" },
                { t: "☁️ Cloud Computing & Infrastructure", v: "cloud" },
                { t: "🎮 Game Development", v: "gaming" },
                { t: "📱 IoT & Embedded Systems", v: "iot" }
            ]
        }
    ],

    // 🔥 TYPE 4: SCENARIO (Contextual choice - most powerful for ML)
    scenario_examples: [
        {
            code: "q7_scenario",
            type: "scenario",
            q: "Tu reçois une mission complexe. Tu préfères ?",
            o: [
                { t: "🔧 Résoudre un bug technique ultra complexe", v: "problem_solving" },
                { t: "👥 Organiser et coordonner une équipe pour la mission", v: "orchestration" },
                { t: "📢 Communiquer avec les stakeholders et défendre l'approche", v: "stakeholder_management" },
                { t: "🎯 Définir la stratégie et la roadmap du projet", v: "strategy" }
            ]
        },
        {
            code: "q8_scenario",
            type: "scenario",
            q: "Sous pression, tu tends à ?",
            o: [
                { t: "🚀 Accélérer et travailler plus dur pour livrer", v: "hustle" },
                { t: "🧠 Prendre du recul et analyser la situation calmement", v: "analytical" },
                { t: "🤝 Chercher de l'aide et collaborer pour trouver des solutions", v: "collaborative" },
                { t: "⏸️ Prendre des breaks réguliers pour garder la tête froide", v: "self_aware" }
            ]
        }
    ],

    // 🔥 TYPE 5: SCALE (Slider - great for measuring intensity)
    scale_examples: [
        {
            code: "q9_scale",
            type: "scale",
            q: "Ton niveau en logique et résolution de problèmes ?",
            min: 0,
            max: 10,
            // Auto-submits on change
        },
        {
            code: "q10_scale",
            type: "scale",
            q: "Ta préférence pour le travail créatif vs analytique ?",
            min: 0,
            max: 10,
            // 0 = Très créatif, 10 = Très analytique
        }
    ]
};

/**
 * Helper: Mix question types for a diverse quiz
 */
function createDynamicQuizMix() {
    return [
        ...DYNAMIC_QUESTIONS_EXAMPLES.likert_examples.slice(0, 1),           // 1 Likert
        ...DYNAMIC_QUESTIONS_EXAMPLES.single_choice_examples.slice(0, 2),     // 2 Single Choice
        ...DYNAMIC_QUESTIONS_EXAMPLES.multi_choice_examples.slice(0, 1),      // 1 Multi Choice
        ...DYNAMIC_QUESTIONS_EXAMPLES.scenario_examples.slice(0, 1),          // 1 Scenario
        ...DYNAMIC_QUESTIONS_EXAMPLES.scale_examples.slice(0, 1)              // 1 Scale
    ];
}

/**
 * Helper: Create a fully balanced quiz
 */
function createBalancedDynamicQuiz(targetQuestions = 10) {
    const all = [
        ...DYNAMIC_QUESTIONS_EXAMPLES.likert_examples,
        ...DYNAMIC_QUESTIONS_EXAMPLES.single_choice_examples,
        ...DYNAMIC_QUESTIONS_EXAMPLES.multi_choice_examples,
        ...DYNAMIC_QUESTIONS_EXAMPLES.scenario_examples,
        ...DYNAMIC_QUESTIONS_EXAMPLES.scale_examples
    ];
    
    // Shuffle and return
    return all.sort(() => 0.5 - Math.random()).slice(0, targetQuestions);
}

console.log('✅ Dynamic Questions module loaded. Available:');
console.log('- DYNAMIC_QUESTIONS_EXAMPLES: All question types');
console.log('- createDynamicQuizMix(): Balanced mix');
console.log('- createBalancedDynamicQuiz(n): Get n questions');
