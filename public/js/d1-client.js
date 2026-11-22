// CCK SIS - Cloudflare D1 client
// Replaces the old Supabase client. All data goes through the Worker API (/api/*),
// which checks the login session before returning anything private.
//
// getSupabaseClient() still exists and returns a small query builder with the same
// shape as supabase-js (from().select().eq()...), so the existing sync, allocation
// and timetable code keeps working. Those queries are admin-only on the server.

(function () {
    'use strict';

    async function request(method, path, body) {
        const opts = { method, credentials: 'same-origin', headers: {} };
        if (body !== undefined) {
            opts.headers['content-type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        let res;
        try {
            res = await fetch(path, opts);
        } catch (e) {
            return { data: null, error: { message: 'Network error: ' + e.message, status: 0 } };
        }
        let payload = null;
        try { payload = await res.json(); } catch (e) { /* empty body */ }
        if (!res.ok) {
            return { data: null, error: { message: (payload && payload.error) || res.statusText, status: res.status } };
        }
        return { data: payload, error: null };
    }

    // ---------------------------------------------------------------- API
    const api = {
        session: { role: null, user: null },

        async me() {
            const r = await request('GET', '/api/auth/me');
            api.session = r.data || { role: null, user: null };
            return api.session;
        },
        async login(id, password) {
            const r = await request('POST', '/api/auth/login', { id: id, password: password });
            if (!r.error) api.session = r.data;
            return r;
        },
        async logout() {
            const r = await request('POST', '/api/auth/logout', {});
            api.session = { role: null, user: null };
            return r;
        },
        changePassword(current, next) {
            return request('POST', '/api/auth/password', { current_password: current, new_password: next });
        },
        getData() { return request('GET', '/api/data'); },
        getHistoricalGrades() { return request('GET', '/api/historical-grades'); },
        createStudent(s) { return request('POST', '/api/students', s); },
        updateStudent(id, s) { return request('PUT', '/api/students/' + encodeURIComponent(id), s); },
        deleteStudent(id) { return request('DELETE', '/api/students/' + encodeURIComponent(id)); },
        deleteAllData(password) { return request('POST', '/api/admin/delete-all', { password: password }); },
        importData(payload) { return request('POST', '/api/admin/import', payload); },
        isAdmin() { return api.session && api.session.role === 'admin'; },
    };

    // ---------------------------------------------------------------- query builder
    function parseColumns(str) {
        // "*", "id, label", "*, timetable_entries(*)"
        const columns = [];
        const embed = [];
        String(str || '*').split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (part) {
            const m = part.match(/^([a-z_]+)\((.*)\)$/);
            if (m) embed.push(m[1]);
            else if (part !== '*') columns.push(part);
        });
        return { columns: columns, embed: embed };
    }

    // Foreign keys used for embedded selects like select('*, timetable_entries(*)')
    const EMBED_KEYS = { timetable_entries: 'timetable_id' };

    function QueryBuilder(table) {
        this.q = { table: table, action: 'select', filters: [], order: [] };
        this._single = false;
        this._maybe = false;
    }
    QueryBuilder.prototype.select = function (cols) {
        const parsed = parseColumns(cols);
        if (this.q.action === 'select') {
            this.q.columns = parsed.columns;
            this.q.embed = parsed.embed.map(function (t) { return { table: t, foreignKey: EMBED_KEYS[t] || 'id' }; });
        } else {
            this.q.returning = true; // insert(...).select()
        }
        return this;
    };
    QueryBuilder.prototype.insert = function (rows) { this.q.action = 'insert'; this.q.rows = rows; return this; };
    QueryBuilder.prototype.upsert = function (rows, opts) {
        this.q.action = 'upsert'; this.q.rows = rows;
        this.q.ignoreDuplicates = !!(opts && opts.ignoreDuplicates);
        return this;
    };
    QueryBuilder.prototype.update = function (values) { this.q.action = 'update'; this.q.values = values; return this; };
    QueryBuilder.prototype.delete = function () { this.q.action = 'delete'; return this; };
    QueryBuilder.prototype.eq = function (c, v) { this.q.filters.push({ op: 'eq', column: c, value: v }); return this; };
    QueryBuilder.prototype.neq = function (c, v) { this.q.filters.push({ op: 'neq', column: c, value: v }); return this; };
    QueryBuilder.prototype.in = function (c, v) { this.q.filters.push({ op: 'in', column: c, value: v }); return this; };
    QueryBuilder.prototype.or = function (expr) {
        // "name.ilike.%x%,student_id.ilike.%x%"
        this.q.or = String(expr).split(',').map(function (p) {
            const bits = p.split('.');
            return { column: bits[0], op: bits[1], value: bits.slice(2).join('.') };
        });
        return this;
    };
    QueryBuilder.prototype.order = function (c, opts) {
        this.q.order.push({ column: c, ascending: !(opts && opts.ascending === false) });
        return this;
    };
    QueryBuilder.prototype.limit = function (n) { this.q.limit = n; return this; };
    QueryBuilder.prototype.single = function () { this._single = true; return this; };
    QueryBuilder.prototype.maybeSingle = function () { this._single = true; this._maybe = true; return this; };

    QueryBuilder.prototype.execute = async function () {
        const r = await request('POST', '/api/query', this.q);
        if (r.error) return { data: null, error: r.error };
        let data = r.data ? r.data.data : null;
        if (this._single) {
            const rows = Array.isArray(data) ? data : [];
            if (rows.length !== 1 && !(this._maybe && rows.length === 0)) {
                return { data: null, error: { message: rows.length ? 'More than one row' : 'No rows found', status: 406 } };
            }
            data = rows[0] || null;
        }
        return { data: data, error: null };
    };
    QueryBuilder.prototype.then = function (resolve, reject) { return this.execute().then(resolve, reject); };

    const client = { from: function (table) { return new QueryBuilder(table); } };

    // ---------------------------------------------------------------- compatibility layer
    // Names kept from the Supabase version so the rest of the app doesn't change.
    function isSupabaseConfigured() { return api.isAdmin(); }
    function getSupabaseClient() { return api.isAdmin() ? client : null; }
    function isDbConnected() { return api.isAdmin(); }

    const db = {
        isOnline: false,
        async init() {
            const r = await request('GET', '/api/health');
            db.isOnline = !r.error && api.isAdmin();
            return db.isOnline;
        },
    };

    window.api = api;
    window.d1Client = client;
    window.db = db;
    window.isSupabaseConfigured = isSupabaseConfigured;
    window.getSupabaseClient = getSupabaseClient;
    window.isDbConnected = isDbConnected;
})();
