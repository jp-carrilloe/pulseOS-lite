const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const apollo = require('../connectors/apollo');
const openai = require('../connectors/openai');
const leadmagic = require('../connectors/leadmagic');

const TARGET_TITLES = [
  'CEO', 'Founder', 'Chief Executive Officer', 
  'COO', 'Chief Operating Officer', 
  'Head of Operations', 'Head of AI', 'VP of Engineering'
];

const EVAL_PROMPT = `You are a Research Evaluator Agent for Tintto.
Given the contact's title and persona, evaluate their fit for a CEO Interview Campaign about AI Adoption.
Return JSON:
{
  "ark_fit_score": <number 0-100, 90+ for CEO/Founder, 80+ for COO/Head of AI>,
  "ark_fit_tier": <"A", "B", or "C">,
  "confidence_score": <number 0-100 based on title clarity>,
  "ark_rationale": <"short string explaining why">
}`;

async function findIcpContacts() {
  const homeDir = os.homedir();
  const researchDbPath = path.join(homeDir, '.pulseos', 'research-agent', 'databases', 'research_agent.db');
  
  let db;
  try {
    db = new Database(researchDbPath, { fileMustExist: true });
    console.log(`Connected to Research DB at: ${researchDbPath}`);
  } catch (e) {
    console.error(`Research DB not found at ${researchDbPath}. Exiting.`);
    return;
  }

  // Find validated companies that DO NOT already have leads in people_leads
  const companiesQuery = `
    SELECT c.id, c.company_name, c.normalized_domain, c.run_id
    FROM company_candidates c
    JOIN candidate_companies cc ON c.id = cc.company_id
    WHERE cc.accepted = 1 
      AND c.id NOT IN (SELECT company_id FROM people_leads)
  `;
  const companiesQueryFallback = `
    SELECT c.id, c.company_name, c.normalized_domain, c.run_id
    FROM company_candidates c
    JOIN company_scores cs ON c.id = cs.company_id
    WHERE cs.tier IN ('Tier 1', 'Tier 2')
      AND c.id NOT IN (SELECT company_id FROM people_leads)
  `;

  let companies = db.prepare(companiesQuery).all();
  if (companies.length === 0) {
    companies = db.prepare(companiesQueryFallback).all();
  }

  if (companies.length === 0) {
    console.log("No validated companies found in Research DB.");
    return;
  }

  console.log(`Found ${companies.length} validated companies. Beginning ICP contact search via Apollo...`);

  const enrichmentRunId = crypto.randomUUID();
  const insertLead = db.prepare(`
    INSERT INTO people_leads (
      enrichment_run_id, run_id, company_id, lead_fingerprint, apollo_person_id,
      first_name, last_name, full_name, title, email, email_status, linkedin_url,
      organization_name, normalized_domain, city, state, country, seniority,
      departments, matched_target_title, persona_type, ark_fit_score, ark_fit_tier,
      confidence_score, ark_rationale, source, apollo_raw, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  for (const company of companies) {
    console.log(`Searching contacts for: ${company.company_name} (${company.normalized_domain})`);
    
    try {
      // 1. Search Apollo
      const { people } = await apollo.searchPeople({
        domains: [company.normalized_domain],
        titles: TARGET_TITLES,
        page: 1
      });

      if (!people || people.length === 0) {
        console.log(`  - No ICP contacts found for ${company.normalized_domain}`);
        continue;
      }

      // 2. Select Top 3 candidates
      const topCandidates = people.slice(0, 3);
      
      for (const person of topCandidates) {
        console.log(`  - Found: ${person.first_name} ${person.last_name} (${person.title})`);
        
        // 3. AI Agent Validation
        const userPrompt = `Title: ${person.title}\nSeniority: ${person.seniority || 'Unknown'}\nName: ${person.first_name} ${person.last_name}`;
        
        let evalResult;
        try {
           evalResult = await openai.callJson(EVAL_PROMPT, userPrompt);
        } catch (openaiErr) {
           console.warn(`    - Agent evaluation failed for ${person.first_name}, falling back to default scores.`);
           evalResult = {
             ark_fit_score: 85,
             ark_fit_tier: 'A',
             confidence_score: 80,
             ark_rationale: 'Fallback evaluation for ICP title match due to API error'
           };
        }

        const now = new Date().toISOString();
        let email = person.email || '';
        let emailStatus = person.email_status || '';
        let linkedinUrl = person.linkedin_url || '';

        // 4. Enrich via Apollo to get LinkedIn URL
        if (person.id && evalResult.ark_fit_tier !== 'C') {
            console.log(`    - Enriching via Apollo to get LinkedIn URL...`);
            try {
                const enriched = await apollo.enrichPerson(person.id);
                if (enriched) {
                    if (enriched.linkedin_url) {
                        linkedinUrl = enriched.linkedin_url;
                        console.log(`    -> Apollo found LinkedIn: ${linkedinUrl}`);
                    }
                    if (!email && enriched.email) {
                        email = enriched.email;
                    }
                }
            } catch (err) {
                console.warn(`    -> Apollo enrichment failed: ${err.message}`);
            }
        }

        // 5. Use LeadMagic to find emails for top-tier validated contacts
        if (!email && evalResult.ark_fit_tier !== 'C') {
            console.log(`    - Searching LeadMagic for email...`);
            const lmResult = await leadmagic.findEmail(person.first_name, person.last_name, company.normalized_domain);
            if (lmResult && lmResult.email) {
                email = lmResult.email;
                emailStatus = lmResult.status;
                console.log(`    -> LeadMagic found email: ${email}`);
            } else {
                console.log(`    -> LeadMagic could not find email.`);
            }
        }

        const emailSafe = email || `${person.first_name || 'unknown'}.${person.last_name || 'unknown'}@${company.normalized_domain}`;
        const fingerprint = crypto.createHash('md5').update(emailSafe + linkedinUrl).digest('hex');
        const fullName = person.name || ((person.first_name || '') + ' ' + (person.last_name || '')).trim();

        // 5. Save to Research DB
        insertLead.run(
          enrichmentRunId,
          company.run_id || 'unknown_run',
          company.id,
          fingerprint,
          person.id || null,
          person.first_name || '',
          person.last_name || '',
          fullName,
          person.title || '',
          email,
          emailStatus,
          linkedinUrl,
          person.organization?.name || company.company_name,
          company.normalized_domain,
          person.city || '',
          person.state || '',
          person.country || '',
          person.seniority || '',
          person.departments ? person.departments.join(',') : '',
          person.title || '',
          'CEO_Campaign_Target',
          evalResult.ark_fit_score,
          evalResult.ark_fit_tier,
          evalResult.confidence_score,
          evalResult.ark_rationale,
          email ? 'apollo+leadmagic' : 'apollo',
          JSON.stringify(person),
          now,
          now
        );
        
        console.log(`    -> Evaluated as ${evalResult.ark_fit_tier} (Score: ${evalResult.ark_fit_score}). Saved to research DB.`);
      }
    } catch (e) {
      console.error(`  - Failed to search or process company ${company.normalized_domain}:`, e.message);
    }
  }
  
  console.log("\\nFinished finding and validating ICP contacts.");
  console.log("You can now run 'node tools/sync_research_to_crm.js' to move these into the CRM DB.");
}

findIcpContacts();
