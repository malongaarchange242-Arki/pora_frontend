/**
 * Configuration File - SECURE V2
 * Load from environment variables or .env file
 * NEVER hardcode API keys, URLs, or secrets
 * 
 * AMÉLIORATIONS V2:
 * - Support bac congolais
 * - Validation des URLs
 * - Cache TTL configurable
 * - Mode dégradé intelligent
 * - Health check endpoints
 */

// ============================================
// CONFIGURATION DEFAULT VALUES
// ============================================

const DEFAULT_CONFIG = {
    SUPABASE: {
        URL: null,
        ANON_KEY: null,
        SERVICE_ROLE_KEY: null,
        TIMEOUT_MS: 10000,
        MAX_RETRIES: 3
    },
    SERVICES: {
        PROA_URL: null,
        PORA_URL: null,
        TIMEOUT_MS: 10000,
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY_MS: 1000,
        HEALTH_CHECK_ENABLED: true,
        HEALTH_CHECK_INTERVAL_MS: 300000 // 5 minutes
    },
    QUIZ: {
        STUDENT_QUESTIONS: 10,
        PARENT_QUESTIONS: 5,
        CACHING_ENABLED: true,
        OFFLINE_MODE: true,
        CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
        MAX_ANSWERS: 24
    },
    BAC: {
        ENABLED: true,
        AVAILABLE_CODES: ['C', 'D', 'A', 'A1', 'A2', 'G', 'G1', 'G2', 'E', 'F1', 'H', 'H1'],
        DEFAULT_CODE: 'C',
        BOOST_ENABLED: true,
        VALIDATION_ENABLED: true
    },
    UI: {
        SHOW_LOADERS: true,
        SHOW_PROGRESS: true,
        ANIMATION_DURATION_MS: 400,
        MOBILE_MAX_WIDTH: 480,
        DEBUG_LOG_LEVEL: 'info',
        THEME: 'light',
        DEFAULT_LANGUAGE: 'fr'
    },
    FEATURES: {
        ENABLE_FUZZY_MATCHING: true,
        ENABLE_UNIVERSITY_DISPLAY: true,
        ENABLE_PORA_SCORES: true,
        ENABLE_ERROR_RETRY: true,
        ENABLE_CACHING: true,
        ENABLE_OFFLINE_MODE: true,
        ENABLE_BAC_FILTERING: true,
        ENABLE_REALTIME_UPDATES: false
    },
    PERFORMANCE: {
        BATCH_SIZE: 10,
        PARALLEL_REQUESTS: 3,
        DEBOUNCE_MS: 300,
        THROTTLE_MS: 500
    }
};

// ============================================
// MAIN CONFIG OBJECT
// ============================================

const CONFIG = {
    // Configuration loaded from environment
    _loaded: false,
    _loadTime: null,
    
    // Current configuration values
    SUPABASE: { ...DEFAULT_CONFIG.SUPABASE },
    SERVICES: { ...DEFAULT_CONFIG.SERVICES },
    QUIZ: { ...DEFAULT_CONFIG.QUIZ },
    BAC: { ...DEFAULT_CONFIG.BAC },
    UI: { ...DEFAULT_CONFIG.UI },
    FEATURES: { ...DEFAULT_CONFIG.FEATURES },
    PERFORMANCE: { ...DEFAULT_CONFIG.PERFORMANCE },

    /**
     * Initialize configuration - VERSION AMÉLIORÉE
     */
    async initialize() {
        console.log('⚙️ Initializing configuration V2...');
        const startTime = performance.now();
        
        // Step 1: Load from backend secure endpoint (production)
        await this.loadFromBackend();
        
        // Step 2: Load from localStorage (user-configured)
        this.loadFromLocalStorage();
        
        // Step 3: Load from window.ENV (env.js)
        this.loadFromEnv();
        
        // Step 4: Validate critical URLs
        this.validateUrls();
        
        // Step 5: Setup health checks
        if (this.FEATURES.ENABLE_REALTIME_UPDATES && this.SERVICES.HEALTH_CHECK_ENABLED) {
            this.setupHealthChecks();
        }
        
        this._loaded = true;
        this._loadTime = performance.now() - startTime;
        
        console.log(`✅ Configuration ready (loaded in ${this._loadTime.toFixed(0)}ms)`);
        console.log(`   PROA: ${this.SERVICES.PROA_URL}`);
        console.log(`   PORA: ${this.SERVICES.PORA_URL}`);
        console.log(`   Bac enabled: ${this.BAC.ENABLED}`);
        
        return this;
    },

    /**
     * Load configuration from backend secure endpoint
     */
    async loadFromBackend() {
        // Only attempt if running in a secure production context,
        // or explicitly enabled via env config for local development.
        const backendConfigEnabled = window.ENV?.ENABLE_BACKEND_CONFIG === true || window.__ENV?.ENABLE_BACKEND_CONFIG === true;
        const isSecureContext = window.location.protocol === 'https:' &&
                                !['localhost', '127.0.0.1'].includes(window.location.hostname);
        
        if (!backendConfigEnabled && !isSecureContext) {
            console.debug('ℹ️ Skipping backend config (not secure or not enabled)');
            return;
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch('/api/config', {
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const secureConfig = await response.json();
                
                // Merge secure config
                if (secureConfig.supabase) {
                    this.SUPABASE = { ...this.SUPABASE, ...secureConfig.supabase };
                }
                if (secureConfig.services) {
                    this.SERVICES = { ...this.SERVICES, ...secureConfig.services };
                }
                if (secureConfig.bac) {
                    this.BAC = { ...this.BAC, ...secureConfig.bac };
                }
                if (secureConfig.features) {
                    this.FEATURES = { ...this.FEATURES, ...secureConfig.features };
                }
                
                console.log('✅ Loaded secure config from backend');
                return;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.debug('ℹ️ Backend config endpoint not available', error.message);
            }
        }
    },

    /**
     * Load configuration from localStorage
     */
    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('orientation-config');
            if (stored) {
                const storedConfig = JSON.parse(stored);
                
                // Validate timestamp (don't use old config > 7 days)
                if (storedConfig.timestamp && Date.now() - storedConfig.timestamp > 7 * 24 * 60 * 60 * 1000) {
                    console.log('ℹ️ LocalStorage config expired, using defaults');
                    return;
                }
                
                // Merge stored config (non-null values only)
                if (storedConfig.SUPABASE?.URL) this.SUPABASE.URL = storedConfig.SUPABASE.URL;
                if (storedConfig.SUPABASE?.ANON_KEY) this.SUPABASE.ANON_KEY = storedConfig.SUPABASE.ANON_KEY;
                if (storedConfig.SERVICES?.PROA_URL) this.SERVICES.PROA_URL = storedConfig.SERVICES.PROA_URL;
                if (storedConfig.SERVICES?.PORA_URL) this.SERVICES.PORA_URL = storedConfig.SERVICES.PORA_URL;
                if (storedConfig.BAC) this.BAC = { ...this.BAC, ...storedConfig.BAC };
                if (storedConfig.FEATURES) this.FEATURES = { ...this.FEATURES, ...storedConfig.FEATURES };
                if (storedConfig.UI) this.UI = { ...this.UI, ...storedConfig.UI };
                
                console.log('✅ Loaded config from localStorage');
            }
        } catch (error) {
            console.warn('⚠️ Invalid localStorage config:', error.message);
        }
    },

    /**
     * Load configuration from window.ENV
     */
    loadFromEnv() {
        const activeEnv = window.ENV || window.__ENV;
        if (!activeEnv) return;
        
        try {
            if (activeEnv.SUPABASE_URL) this.SUPABASE.URL = activeEnv.SUPABASE_URL;
            if (activeEnv.SUPABASE_ANON_KEY) this.SUPABASE.ANON_KEY = activeEnv.SUPABASE_ANON_KEY;
            if (activeEnv.PROA_SERVICE_URL) this.SERVICES.PROA_URL = activeEnv.PROA_SERVICE_URL;
            if (activeEnv.PORA_SERVICE_URL) this.SERVICES.PORA_URL = activeEnv.PORA_SERVICE_URL;
            if (activeEnv.API_TIMEOUT_MS) this.SERVICES.TIMEOUT_MS = activeEnv.API_TIMEOUT_MS;
            if (activeEnv.API_RETRY_ATTEMPTS) this.SERVICES.RETRY_ATTEMPTS = activeEnv.API_RETRY_ATTEMPTS;
            if (activeEnv.DEBUG_LOG_LEVEL) this.UI.DEBUG_LOG_LEVEL = activeEnv.DEBUG_LOG_LEVEL;
            if (activeEnv.BAC_ENABLED !== undefined) this.BAC.ENABLED = activeEnv.BAC_ENABLED === 'true';
            if (activeEnv.BAC_AVAILABLE_CODES) this.BAC.AVAILABLE_CODES = activeEnv.BAC_AVAILABLE_CODES.split(',');
            
            console.log('✅ Loaded config from env.js');
        } catch (error) {
            console.warn('⚠️ Could not load from env.js:', error.message);
        }
    },

    /**
     * Validate and fix URLs
     */
    validateUrls() {
        // Fix PROA URL
        if (this.SERVICES.PROA_URL && this.SERVICES.PROA_URL.includes('localhost')) {
            const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
            if (!isLocalhost) {
                console.warn('⚠️ Ignoring localhost PROA_URL, using production fallback');
                this.SERVICES.PROA_URL = 'https://universearch.com/proa';
            }
        }
        
        // Fix PORA URL
        if (this.SERVICES.PORA_URL && this.SERVICES.PORA_URL.includes('localhost')) {
            const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
            if (!isLocalhost) {
                console.warn('⚠️ Ignoring localhost PORA_URL, using production fallback');
                this.SERVICES.PORA_URL = 'https://universearch.com/pora';
            }
        }
        
        // Ensure HTTPS in production
        if (window.location.protocol === 'https:' && this.SERVICES.PROA_URL) {
            this.SERVICES.PROA_URL = this.SERVICES.PROA_URL.replace('http://', 'https://');
        }
        if (window.location.protocol === 'https:' && this.SERVICES.PORA_URL) {
            this.SERVICES.PORA_URL = this.SERVICES.PORA_URL.replace('http://', 'https://');
        }
        
        // Validate Supabase URL format
        if (this.SUPABASE.URL && !this.SUPABASE.URL.includes('supabase.co')) {
            console.warn('⚠️ Supabase URL looks invalid:', this.SUPABASE.URL);
        }
    },

    /**
     * Setup health checks for services
     */
    setupHealthChecks() {
        // Health check for PROA
        if (this.SERVICES.PROA_URL) {
            this.checkServiceHealth('PROA', this.SERVICES.PROA_URL + '/health');
        }
        
        // Health check for PORA
        if (this.SERVICES.PORA_URL) {
            this.checkServiceHealth('PORA', this.SERVICES.PORA_URL + '/health');
        }
        
        // Periodic health checks
        setInterval(() => {
            if (this.SERVICES.PROA_URL) {
                this.checkServiceHealth('PROA', this.SERVICES.PROA_URL + '/health', true);
            }
            if (this.SERVICES.PORA_URL) {
                this.checkServiceHealth('PORA', this.SERVICES.PORA_URL + '/health', true);
            }
        }, this.SERVICES.HEALTH_CHECK_INTERVAL_MS);
    },

    /**
     * Check service health
     */
    async checkServiceHealth(serviceName, url, silent = false) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                if (!silent) console.log(`✅ ${serviceName} service is healthy`);
                this._serviceHealth = this._serviceHealth || {};
                this._serviceHealth[serviceName] = { status: 'healthy', lastCheck: Date.now() };
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            if (!silent) console.warn(`⚠️ ${serviceName} service health check failed:`, error.message);
            this._serviceHealth = this._serviceHealth || {};
            this._serviceHealth[serviceName] = { status: 'unhealthy', lastCheck: Date.now(), error: error.message };
        }
    },

    /**
     * Get service health status
     */
    getServiceHealth(serviceName) {
        return this._serviceHealth?.[serviceName] || { status: 'unknown', lastCheck: null };
    },

    /**
     * Save configuration to localStorage
     */
    saveToLocalStorage() {
        try {
            const configToSave = {
                SUPABASE: {
                    URL: this.SUPABASE.URL,
                    ANON_KEY: this.SUPABASE.ANON_KEY
                },
                SERVICES: {
                    PROA_URL: this.SERVICES.PROA_URL,
                    PORA_URL: this.SERVICES.PORA_URL,
                    TIMEOUT_MS: this.SERVICES.TIMEOUT_MS,
                    RETRY_ATTEMPTS: this.SERVICES.RETRY_ATTEMPTS,
                    RETRY_DELAY_MS: this.SERVICES.RETRY_DELAY_MS
                },
                BAC: this.BAC,
                UI: this.UI,
                FEATURES: this.FEATURES,
                timestamp: Date.now()
            };
            localStorage.setItem('orientation-config', JSON.stringify(configToSave));
            console.log('💾 Configuration saved to localStorage');
        } catch (error) {
            console.warn('⚠️ Failed to save config to localStorage:', error.message);
        }
    },

    /**
     * Reset to default configuration
     */
    resetToDefault() {
        console.log('🔄 Resetting configuration to defaults');
        
        this.SUPABASE = { ...DEFAULT_CONFIG.SUPABASE };
        this.SERVICES = { ...DEFAULT_CONFIG.SERVICES };
        this.QUIZ = { ...DEFAULT_CONFIG.QUIZ };
        this.BAC = { ...DEFAULT_CONFIG.BAC };
        this.UI = { ...DEFAULT_CONFIG.UI };
        this.FEATURES = { ...DEFAULT_CONFIG.FEATURES };
        this.PERFORMANCE = { ...DEFAULT_CONFIG.PERFORMANCE };
        
        localStorage.removeItem('orientation-config');
        console.log('✅ Configuration reset to defaults');
    },

    /**
     * Get a configuration value with dot notation
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this;
        
        for (const key of keys) {
            if (value === undefined || value === null) {
                return defaultValue;
            }
            value = value[key];
        }
        
        return value !== undefined ? value : defaultValue;
    },

    /**
     * Set a configuration value
     */
    set(path, value) {
        const keys = path.split('.');
        let target = this;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]]) target[keys[i]] = {};
            target = target[keys[i]];
        }
        
        target[keys[keys.length - 1]] = value;
        
        // Auto-save to localStorage for user preferences
        if (keys[0] === 'UI' || keys[0] === 'FEATURES') {
            this.saveToLocalStorage();
        }
        
        return true;
    },

    /**
     * Check if a feature is enabled
     */
    isEnabled(featureName) {
        return this.FEATURES[featureName] === true;
    },

    /**
     * Get debug log level
     */
    getLogLevel() {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[this.UI.DEBUG_LOG_LEVEL] || 1;
    },

    /**
     * Check if in development mode
     */
    isDevelopment() {
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.protocol === 'file:';
    },

    /**
     * Check if in production mode
     */
    isProduction() {
        return !this.isDevelopment();
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get a config value with fallback
 */
function getConfig(path, defaultValue = null) {
    return CONFIG.get(path, defaultValue);
}

/**
 * Set a config value
 */
function setConfig(path, value) {
    return CONFIG.set(path, value);
}

/**
 * Setup configuration with custom values
 * Called from server-side or during build
 */
function setupConfiguration(supabaseUrl, supabaseKey, proaUrl, poraUrl, options = {}) {
    if (supabaseUrl) CONFIG.SUPABASE.URL = supabaseUrl;
    if (supabaseKey) CONFIG.SUPABASE.ANON_KEY = supabaseKey;
    if (proaUrl) CONFIG.SERVICES.PROA_URL = proaUrl;
    if (poraUrl) CONFIG.SERVICES.PORA_URL = poraUrl;
    
    if (options.bacEnabled !== undefined) CONFIG.BAC.ENABLED = options.bacEnabled;
    if (options.bacCodes) CONFIG.BAC.AVAILABLE_CODES = options.bacCodes;
    if (options.features) Object.assign(CONFIG.FEATURES, options.features);
    if (options.ui) Object.assign(CONFIG.UI, options.ui);
    
    CONFIG.saveToLocalStorage();
    console.log('✅ Configuration setup complete');
}

/**
 * Get bac configuration
 */
function getBacConfig() {
    return {
        enabled: CONFIG.BAC.ENABLED,
        availableCodes: CONFIG.BAC.AVAILABLE_CODES,
        defaultCode: CONFIG.BAC.DEFAULT_CODE,
        boostEnabled: CONFIG.BAC.BOOST_ENABLED,
        validationEnabled: CONFIG.BAC.VALIDATION_ENABLED
    };
}

/**
 * Validate bac code
 */
function isValidBacCode(code) {
    if (!CONFIG.BAC.ENABLED) return true;
    return CONFIG.BAC.AVAILABLE_CODES.includes(code.toUpperCase());
}

// ============================================
// EXPORTS
// ============================================

if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.getConfig = getConfig;
    window.setConfig = setConfig;
    window.setupConfiguration = setupConfiguration;
    window.getBacConfig = getBacConfig;
    window.isValidBacCode = isValidBacCode;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, getConfig, setConfig, setupConfiguration, getBacConfig, isValidBacCode };
}