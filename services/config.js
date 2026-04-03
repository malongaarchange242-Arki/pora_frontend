/**
 * Configuration File - SECURE
 * Load from environment variables or .env file
 * NEVER hardcode API keys, URLs, or secrets
 */

// ============================================
// ENVIRONMENT LOADING
// ============================================

// Method 1: Load from .env file via build process (recommended)
// Place in root: .env.local (development) or .env.production (production)
// Example:
//   VITE_SUPABASE_URL=https://xxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyExC...
//   VITE_PROA_SERVICE_URL=http://localhost:8000
//   VITE_PORA_SERVICE_URL=http://localhost:8080

// Method 2: Load from window (if using build tool like Vite)
// const getEnv = (key, defaultValue) => {
//     return import.meta.env[`VITE_${key}`] || defaultValue;
// };

// Method 3: Server-side proxy (MOST SECURE)
// Recommended: Use a backend proxy that handles API calls
// Example: http://localhost:3000/api/proa -> proxies to PROA service
// This hides all backend URLs from frontend

// For now, use a simple config object
const CONFIG = {
    // ============================================
    // SUPABASE CONFIGURATION
    // ============================================
    SUPABASE: {
        URL: localStorage.getItem('SUPABASE_URL') || 'https://your-project.supabase.co',
        ANON_KEY: localStorage.getItem('SUPABASE_ANON_KEY') || 'eyJhbGc...',
        // Store these securely (not hardcoded)
        // In production: load from secure backend endpoint
    },

    // ============================================
    // ORIENTATION SERVICES (PROA & PORA)
    // ============================================
    SERVICES: {
        PROA_URL: 'https://universearch-proa-service.onrender.com',        // Orientation computation
        PORA_URL: 'https://universearch-pora-service.onrender.com',        // University ranking
        TIMEOUT_MS: 10000,                         // 10 second timeout
        RETRY_ATTEMPTS: 3,                         // Retry failed calls 3 times
        RETRY_DELAY_MS: 1000                       // 1 second initial delay (exponential)
    },

    // ============================================
    // QUIZ CONFIGURATION
    // ============================================
    QUIZ: {
        STUDENT_QUESTIONS: 10,
        PARENT_QUESTIONS: 5,
        CACHING_ENABLED: true,                     // Cache results in localStorage
        OFFLINE_MODE: true                         // Use cached data if API fails
    },

    // ============================================
    // UI/UX CONFIGURATION
    // ============================================
    UI: {
        SHOW_LOADERS: true,
        SHOW_PROGRESS: true,
        ANIMATION_DURATION_MS: 400,
        MOBILE_MAX_WIDTH: 480,
        DEBUG_LOG_LEVEL: 'info'                    // 'debug', 'info', 'warn', 'error'
    },

    // ============================================
    // FEATURE FLAGS
    // ============================================
    FEATURES: {
        ENABLE_FUZZY_MATCHING: true,
        ENABLE_UNIVERSITY_DISPLAY: true,
        ENABLE_PORA_SCORES: true,
        ENABLE_ERROR_RETRY: true,
        ENABLE_CACHING: true,
        ENABLE_OFFLINE_MODE: true
    },

    // ============================================
    // INITIALIZE CONFIGURATION (called on page load)
    // ============================================
    async initialize() {
        console.log('Initializing configuration...');

        // Step 1: Load from window.ENV / window.__ENV first.
        const runtimeEnv = window.ENV || window.__ENV;
        if (runtimeEnv) {
            try {
                this.SUPABASE.URL = runtimeEnv.SUPABASE_URL || this.SUPABASE.URL;
                this.SUPABASE.ANON_KEY = runtimeEnv.SUPABASE_ANON_KEY || this.SUPABASE.ANON_KEY;
                this.SERVICES.PROA_URL = runtimeEnv.PROA_SERVICE_URL || runtimeEnv.PROA_URL || this.SERVICES.PROA_URL;
                this.SERVICES.PORA_URL = runtimeEnv.PORA_SERVICE_URL || runtimeEnv.PORA_URL || this.SERVICES.PORA_URL;
                this.SERVICES.TIMEOUT_MS = runtimeEnv.API_TIMEOUT_MS || runtimeEnv.TIMEOUT_MS || this.SERVICES.TIMEOUT_MS;
                this.SERVICES.RETRY_ATTEMPTS = runtimeEnv.API_RETRY_ATTEMPTS || runtimeEnv.RETRY_ATTEMPTS || this.SERVICES.RETRY_ATTEMPTS;
                this.SERVICES.RETRY_DELAY_MS = runtimeEnv.API_RETRY_DELAY_MS || runtimeEnv.RETRY_DELAY_MS || this.SERVICES.RETRY_DELAY_MS;
                this.UI.DEBUG_LOG_LEVEL = runtimeEnv.DEBUG_LOG_LEVEL || this.UI.DEBUG_LOG_LEVEL;
                console.log('Loaded config from env.js / env-loader.js');
            } catch (error) {
                console.warn('Could not load from env.js:', error.message);
            }
        }

        // Step 2: Fall back to localStorage.
        const stored = localStorage.getItem('orientation-config');
        if (stored) {
            try {
                const storedConfig = JSON.parse(stored);
                Object.assign(this, storedConfig);
                console.log('Loaded config from localStorage');
            } catch (error) {
                console.warn('Invalid localStorage config:', error.message);
            }
        }

        // Step 3: Optional backend endpoint, disabled by default.
        if (window.ENABLE_BACKEND_CONFIG === true) {
            try {
                const response = await fetch('/api/config', {
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    const secureConfig = await response.json();
                    Object.assign(this, secureConfig);
                    console.log('Loaded secure config from backend');
                } else {
                    console.debug('Backend config endpoint returned ' + response.status);
                }
            } catch (error) {
                console.debug('Backend config endpoint not available');
            }
        }

        console.log('Configuration ready');
    },

    /**
     * Save configuration to localStorage (user-configured values only)
     */
    saveToLocalStorage() {
        const configToSave = {
            SUPABASE: this.SUPABASE,
            SERVICES: this.SERVICES,
            QUIZ: this.QUIZ,
            UI: this.UI,
            FEATURES: this.FEATURES
        };
        localStorage.setItem('orientation-config', JSON.stringify(configToSave));
        console.log('💾 Configuration saved to localStorage');
    }
};

/**
 * SETUP PAGE DATA WITHOUT HARDCODING
 * This is called from a server endpoint or during build
 */
function setupConfiguration(supabaseUrl, supabaseKey, proaUrl, poraUrl) {
    CONFIG.SUPABASE.URL = supabaseUrl;
    CONFIG.SUPABASE.ANON_KEY = supabaseKey;
    CONFIG.SERVICES.PROA_URL = proaUrl;
    CONFIG.SERVICES.PORA_URL = poraUrl;
    CONFIG.saveToLocalStorage();
}

/**
 * GET A CONFIG VALUE WITH FALLBACK
 */
function getConfig(path, defaultValue = null) {
    const keys = path.split('.');
    let value = CONFIG;
    
    for (const key of keys) {
        value = value?.[key];
        if (value === undefined) {
            return defaultValue;
        }
    }
    
    return value;
}

// Export for use
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.getConfig = getConfig;
}
