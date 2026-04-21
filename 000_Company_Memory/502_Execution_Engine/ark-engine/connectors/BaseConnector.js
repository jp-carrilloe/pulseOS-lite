/**
 * Base Framework Connector
 * Use this as a template to connect to your preferred APIs (e.g. OpenAI, Anthropic, CRM)
 */
class BaseConnector {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || '';
    }

    async fetch(endpoint, options = {}) {
        const url = \`\${this.baseUrl}\${endpoint}\`;
        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': \`Bearer \${this.apiKey}\`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(\`API request failed: \${response.statusText}\`);
        }

        return response.json();
    }
}

module.exports = BaseConnector;
