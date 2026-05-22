/**
 * Environment Configuration
 * Modify these values for your environment
 * This file is safe to modify (it's in .gitignore)
 */

const ENV = {
    // ============================================
    // SUPABASE CONFIGURATION
    // ============================================
    SUPABASE_URL: 'https://wsdkieldyvehoqtukyis.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZGtpZWxkeXZlaG9xdHVreWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTY0OTcsImV4cCI6MjA4NTA5MjQ5N30.Wjnj7p6MRPFqtpvXLvoiMCYl5PFbaHwvRE_JU-EJbyI',

    // ============================================
    // ORIENTATION SERVICES
    // ============================================
    PROA_SERVICE_URL: 'https://universearch-proa-service-weza.onrender.com',
    PORA_SERVICE_URL: 'https://universearch-pora-service.onrender.com',

    // ============================================
    // API SETTINGS
    // ============================================
    API_TIMEOUT_MS: 10000,
    API_RETRY_ATTEMPTS: 3,
    API_RETRY_DELAY_MS: 1000,

    // ============================================
    // FEATURE FLAGS
    // ============================================
    ENABLE_CACHING: true,
    ENABLE_OFFLINE_MODE: true,
    ENABLE_FUZZY_MATCHING: true,
    ENABLE_ERROR_RETRY: true,

    // ============================================
    // UI/DEBUG
    // ============================================
    DEBUG_LOG_LEVEL: 'info', // 'debug', 'info', 'warn', 'error'
    ENABLE_BACKEND_CONFIG: false
};

// Make globally available
if (typeof window !== 'undefined') {
    window.ENV = ENV;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ENV;
}
