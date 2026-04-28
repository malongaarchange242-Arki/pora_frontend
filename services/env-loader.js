/**
 * ENV Loader
 * Loads .env.local file and makes variables available
 * Must be loaded BEFORE config.js
 */

(async function loadEnv() {
    try {
        // Try to load .env.local file
        const response = await fetch('/.env.local');
        
        if (!response.ok) {
            console.warn('⚠️ .env.local not found. Using default configuration.');
            return;
        }

        const envContent = await response.text();
        const envVars = {};

        // Parse .env file format (KEY=VALUE)
        envContent.split('\n').forEach(line => {
            line = line.trim();
            
            // Skip empty lines and comments
            if (!line || line.startsWith('#')) {
                return;
            }

            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=').trim();

            if (key) {
                envVars[key] = value;
            }
        });

        // Convert VITE_ prefixed vars to window.CONFIG structure
        const env = {};
        
        // Supabase
        if (envVars.VITE_SUPABASE_URL) {
            env.SUPABASE_URL = envVars.VITE_SUPABASE_URL;
        }
        if (envVars.VITE_SUPABASE_ANON_KEY) {
            env.SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY;
        }

        // Services
        if (envVars.VITE_PROA_SERVICE_URL) {
            env.PROA_URL = envVars.VITE_PROA_SERVICE_URL;
        }
        if (envVars.VITE_PORA_SERVICE_URL) {
            env.PORA_URL = envVars.VITE_PORA_SERVICE_URL;
        }

        // API Settings
        if (envVars.VITE_API_TIMEOUT_MS) {
            env.TIMEOUT_MS = parseInt(envVars.VITE_API_TIMEOUT_MS);
        }
        if (envVars.VITE_API_RETRY_ATTEMPTS) {
            env.RETRY_ATTEMPTS = parseInt(envVars.VITE_API_RETRY_ATTEMPTS);
        }
        if (envVars.VITE_API_RETRY_DELAY_MS) {
            env.RETRY_DELAY_MS = parseInt(envVars.VITE_API_RETRY_DELAY_MS);
        }

        // Feature Flags
        if (envVars.VITE_ENABLE_CACHING) {
            env.CACHING_ENABLED = envVars.VITE_ENABLE_CACHING === 'true';
        }
        if (envVars.VITE_ENABLE_OFFLINE_MODE) {
            env.OFFLINE_MODE = envVars.VITE_ENABLE_OFFLINE_MODE === 'true';
        }

        // UI/Debug
        if (envVars.VITE_DEBUG_LOG_LEVEL) {
            env.DEBUG_LOG_LEVEL = envVars.VITE_DEBUG_LOG_LEVEL;
        }

        // Store in window for use by config.js
        window.__ENV = env;
        window.ENV = env;
        console.log('✅ Environment variables loaded from .env.local');

    } catch (error) {
        console.warn('⚠️ Could not load .env.local file:', error.message);
    }
})();
