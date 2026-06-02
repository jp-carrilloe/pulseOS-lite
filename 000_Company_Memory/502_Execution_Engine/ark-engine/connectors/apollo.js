/**
 * Apollo.io Connector — company and people search.
 * Port of the Apollo API calls from content_api.py.
 */
const config = require('../server/config');

const APOLLO_BASE = 'https://api.apollo.io';

async function apolloFetch(path, body) {
    const res = await fetch(`${APOLLO_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'User-Agent': 'PulseOS-Client/1.0',
            'X-Api-Key': config.apolloApiKey,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errBody = await res.text();
        const err = new Error(`Apollo API Error ${res.status}: ${errBody}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

/**
 * Search for companies matching the given filters.
 */
async function searchCompanies(filters) {
    const payload = { page: 1, per_page: 5 };
    for (const [k, v] of Object.entries(filters)) {
        if (Array.isArray(v) && v.length > 0) {
            payload[k] = v;
        } else if (v !== undefined && v !== null && v !== '') {
            payload[k] = v;
        }
    }
    const data = await apolloFetch('/api/v1/mixed_companies/search', payload);
    return data.organizations || [];
}

/**
 * Search for people matching the given criteria.
 */
async function searchPeople({ domains, titles, page = 1 }) {
    const payload = {
        q_organization_domains: domains.join('\n'),
        person_titles: titles,
        page,
        per_page: 100,
    };
    const data = await apolloFetch('/v1/mixed_people/api_search', payload);
    const people = (data.contacts || []).concat(data.people || []);
    const totalEntries = data.total_entries || 0;
    return {
        people,
        pagination: {
            page,
            per_page: 100,
            total_entries: totalEntries,
            total_pages: Math.ceil(totalEntries / 100),
        },
    };
}

/**
 * Enrich a person by ID to get full details (including LinkedIn URL).
 * Note: This consumes Apollo API credits.
 */
async function enrichPerson(personId) {
    const payload = {
        id: personId,
        reveal_personal_emails: false
    };
    const data = await apolloFetch('/v1/people/match', payload);
    return data.person || null;
}

module.exports = { searchCompanies, searchPeople, enrichPerson };
