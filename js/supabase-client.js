// CCK SIS - Supabase Client Configuration
// This file handles all database connections and operations

// =====================================================
// SUPABASE CONFIGURATION
// =====================================================

const SUPABASE_CONFIG = {
    url: 'https://YOUR_PROJECT_ID.supabase.co', // Replace with your Supabase project URL
    anonKey: 'YOUR_SUPABASE_ANON_KEY', // Replace with your actual anon key
};

// Initialize Supabase client - use different variable name to avoid conflict with CDN
let supabaseClient = null;

function initSupabase() {
    // The CDN creates window.supabase with createClient method
    if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('Supabase client initialized');
        return true;
    }
    console.warn('Supabase library not loaded');
    return false;
}

// Check if Supabase is configured with real credentials
function isSupabaseConfigured() {
    return SUPABASE_CONFIG.anonKey !== 'YOUR_ANON_KEY_HERE' && 
           SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
           SUPABASE_CONFIG.anonKey.length > 20;
}

// Get the Supabase client instance
function getSupabaseClient() {
    if (!supabaseClient && isSupabaseConfigured()) {
        initSupabase();
    }
    return supabaseClient;
}

// =====================================================
// DATABASE SERVICE CLASS
// =====================================================

class DatabaseService {
    constructor() {
        this.isOnline = false;
        this.pendingSync = [];
    }

    async init() {
        if (!isSupabaseConfigured()) {
            console.log('Supabase not configured - running in offline mode');
            return false;
        }

        try {
            initSupabase();
            const client = getSupabaseClient();
            if (!client) throw new Error('Client not initialized');
            
            // Test connection
            const { data, error } = await client.from('semesters').select('count').limit(1);
            if (error) throw error;
            this.isOnline = true;
            console.log('Database connection established');
            return true;
        } catch (error) {
            console.error('Database connection failed:', error.message);
            this.isOnline = false;
            return false;
        }
    }

    async getStudents(filters = {}) {
        if (!this.isOnline) return { data: null, error: 'Offline' };
        const client = getSupabaseClient();
        let query = client.from('students').select('*');
        if (filters.search) {
            query = query.or(`name.ilike.%${filters.search}%,student_id.ilike.%${filters.search}%`);
        }
        const { data, error } = await query.order('name');
        return { data, error };
    }

    async createStudent(student) {
        if (!this.isOnline) return { data: student, error: null, offline: true };
        const client = getSupabaseClient();
        const { data, error } = await client.from('students').insert(student).select().single();
        return { data, error };
    }

    async getInstructors() {
        if (!this.isOnline) return { data: null, error: 'Offline' };
        const client = getSupabaseClient();
        const { data, error } = await client.from('instructors').select('*').order('name');
        return { data, error };
    }

    async getCourses() {
        if (!this.isOnline) return { data: null, error: 'Offline' };
        const client = getSupabaseClient();
        const { data, error } = await client.from('courses').select('*').order('code');
        return { data, error };
    }

    async getSemesters() {
        if (!this.isOnline) return { data: null, error: 'Offline' };
        const client = getSupabaseClient();
        const { data, error } = await client.from('semesters').select('*').order('year', { ascending: false });
        return { data, error };
    }

    async getCurrentSemester() {
        if (!this.isOnline) return { data: null, error: 'Offline' };
        const client = getSupabaseClient();
        const { data, error } = await client.from('semesters').select('*').eq('is_current', true).single();
        return { data, error };
    }
}

// Create singleton instance
const db = new DatabaseService();

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.db = db;
    window.DatabaseService = DatabaseService;
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
    window.isSupabaseConfigured = isSupabaseConfigured;
    window.initSupabase = initSupabase;
    window.getSupabaseClient = getSupabaseClient;
    window.supabaseClient = null; // Will be set by initSupabase
}