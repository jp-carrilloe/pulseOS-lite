const config = require('../server/config');

async function findEmail(firstName, lastName, domain) {
    if (!config.hunterApiKey) {
        console.warn('Hunter API key missing. Skipping email search.');
        return null;
    }
    
    try {
        const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${config.hunterApiKey}`;
        const res = await fetch(url);
        
        if (!res.ok) {
            console.warn(`Hunter API Error: ${res.status}`);
            return null;
        }
        
        const data = await res.json();
        if (data && data.data && data.data.email) {
            return {
                email: data.data.email,
                status: 'verified'
            };
        }
        return null;
    } catch (e) {
        console.warn('Hunter Fetch Error:', e.message);
        return null;
    }
}

module.exports = { findEmail };
