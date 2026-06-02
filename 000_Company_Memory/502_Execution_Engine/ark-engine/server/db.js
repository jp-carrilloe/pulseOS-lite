/**
 * Local CRM Database Layer — SQLite via better-sqlite3
 * Port of crm_db.py. Same schema, same operations.
 * Stores companies and contacts from Apollo searches for staging before Attio sync.
 */
const Database = require('better-sqlite3');
const config = require('./config');

let _db = null;

function getDb() {
    if (!_db) {
        _db = new Database(config.dbPath);
        _db.pragma('journal_mode = WAL');
        _db.pragma('foreign_keys = ON');
    }
    return _db;
}

/**
 * Initialize tables & indexes. Called once on startup.
 */
function initDb() {
    const db = getDb();
    db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT,
      industry TEXT,
      employees INTEGER,
      location TEXT,
      apollo_raw TEXT,
      attio_id TEXT,
      sync_status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      first_name TEXT,
      last_name TEXT,
      title TEXT,
      email TEXT,
      linkedin_url TEXT,
      apollo_raw TEXT,
      attio_id TEXT,
      sync_status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE INDEX IF NOT EXISTS idx_companies_sync ON companies(sync_status);
    CREATE INDEX IF NOT EXISTS idx_contacts_sync ON contacts(sync_status);
    CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
  `);
    console.log(`📦 CRM database initialized at ${config.dbPath}`);
}

// ── Upserts ──────────────────────────────────────────

function upsertCompany(company) {
    const db = getDb();
    const now = new Date().toISOString();
    const id = company.id || '';
    const name = company.name || 'Unknown';
    const domain = company.domain || '';
    const industry = company.industry || '';
    const employees = company.estimated_num_employees ?? null;
    const parts = [company.city, company.state, company.country].filter(Boolean);
    const location = parts.join(', ');
    const raw = JSON.stringify(company);

    db.prepare(`
    INSERT INTO companies (id, name, domain, industry, employees, location, apollo_raw, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      domain=excluded.domain,
      industry=excluded.industry,
      employees=excluded.employees,
      location=excluded.location,
      apollo_raw=excluded.apollo_raw,
      updated_at=excluded.updated_at
  `).run(id, name, domain, industry, employees, location, raw, now, now);

    return id;
}

function upsertContact(person) {
    const db = getDb();
    const now = new Date().toISOString();
    const id = person.id || '';
    const firstName = person.first_name || '';
    const lastName = person.last_name || '';
    const title = person.title || '';
    const email = person.email || '';
    const linkedinUrl = person.linkedin_url || '';
    const org = person.organization || {};
    const companyId = org.id || person.organization_id || null;
    const raw = JSON.stringify(person);

    db.prepare(`
    INSERT INTO contacts (id, company_id, first_name, last_name, title, email, linkedin_url, apollo_raw, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      company_id=excluded.company_id,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      title=excluded.title,
      email=excluded.email,
      linkedin_url=excluded.linkedin_url,
      apollo_raw=excluded.apollo_raw,
      updated_at=excluded.updated_at
  `).run(id, companyId, firstName, lastName, title, email, linkedinUrl, raw, now, now);

    return id;
}

// ── Queries ──────────────────────────────────────────

function getAllCompanies() {
    return getDb()
        .prepare('SELECT id, name, domain, industry, employees, location, attio_id, sync_status, created_at FROM companies ORDER BY created_at DESC')
        .all();
}

function getAllContacts() {
    return getDb()
        .prepare(`
      SELECT c.id, c.first_name, c.last_name, c.title, c.email, c.linkedin_url,
             c.attio_id, c.sync_status, c.created_at,
             co.name AS company_name, co.domain AS company_domain
      FROM contacts c
      LEFT JOIN companies co ON c.company_id = co.id
      ORDER BY c.created_at DESC
    `)
        .all();
}

function getPendingCompanies() {
    return getDb()
        .prepare("SELECT * FROM companies WHERE sync_status = 'pending' ORDER BY created_at DESC")
        .all();
}

function getPendingContacts() {
    return getDb()
        .prepare("SELECT * FROM contacts WHERE sync_status = 'pending' ORDER BY created_at DESC")
        .all();
}

function updateSyncStatus(table, recordId, status, attioId = null) {
    const db = getDb();
    const now = new Date().toISOString();
    if (attioId) {
        db.prepare(`UPDATE ${table} SET sync_status=?, attio_id=?, updated_at=? WHERE id=?`)
            .run(status, attioId, now, recordId);
    } else {
        db.prepare(`UPDATE ${table} SET sync_status=?, updated_at=? WHERE id=?`)
            .run(status, now, recordId);
    }
}

function getDbStats() {
    const db = getDb();
    const totalCompanies = db.prepare('SELECT COUNT(*) AS c FROM companies').get().c;
    const syncedCompanies = db.prepare("SELECT COUNT(*) AS c FROM companies WHERE sync_status='synced'").get().c;
    const totalContacts = db.prepare('SELECT COUNT(*) AS c FROM contacts').get().c;
    const syncedContacts = db.prepare("SELECT COUNT(*) AS c FROM contacts WHERE sync_status='synced'").get().c;
    return {
        total_companies: totalCompanies,
        synced_companies: syncedCompanies,
        pending_companies: totalCompanies - syncedCompanies,
        total_contacts: totalContacts,
        synced_contacts: syncedContacts,
        pending_contacts: totalContacts - syncedContacts,
    };
}

module.exports = {
    initDb,
    upsertCompany,
    upsertContact,
    getAllCompanies,
    getAllContacts,
    getPendingCompanies,
    getPendingContacts,
    updateSyncStatus,
    getDbStats,
};
