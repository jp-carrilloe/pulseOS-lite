const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const apollo = require('../connectors/apollo');
const leadmagic = require('../connectors/leadmagic');
const config = require('../server/config');

const delay = ms => new Promise(res => setTimeout(res, ms));
const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

async function enrichExistingLeads() {
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

  // Find people who need enrichment
  const leads = db.prepare(`
    SELECT id, first_name, last_name, email, linkedin_url, apollo_person_id, normalized_domain 
    FROM people_leads 
    WHERE ark_fit_tier IN ('A', 'B') 
      AND (linkedin_url IS NULL OR linkedin_url = '' OR email IS NULL OR email = '')
  `).all();

  if (leads.length === 0) {
    console.log("No leads found that need enrichment.");
    return;
  }

  console.log(`Found ${leads.length} leads to enrich...`);

  const updateLead = db.prepare(`
    UPDATE people_leads
    SET email = ?, linkedin_url = ?, email_status = ?
    WHERE id = ?
  `);

  let enrichedCount = 0;
  const batches = chunk(leads, 5);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\nProcessing batch ${i + 1} of ${batches.length} (${batch.length} leads)...`);
    
    await Promise.all(batch.map(async (lead) => {
      console.log(`Enriching: ${lead.first_name} ${lead.last_name} (${lead.normalized_domain})`);
      
      let currentEmail = lead.email || '';
      let currentLinkedin = lead.linkedin_url || '';
      let currentEmailStatus = '';
      
      // 1. Enrich via Apollo
      if (lead.apollo_person_id && (!currentEmail || !currentLinkedin)) {
        console.log(`  [${lead.first_name}] - Hitting Apollo Match API...`);
        try {
          const enriched = await apollo.enrichPerson(lead.apollo_person_id);
          if (enriched) {
            if (enriched.linkedin_url && !currentLinkedin) {
              currentLinkedin = enriched.linkedin_url;
              console.log(`  [${lead.first_name}] -> Apollo found LinkedIn: ${currentLinkedin}`);
            }
            if (enriched.email && !currentEmail) {
              currentEmail = enriched.email;
              currentEmailStatus = 'apollo_verified';
              console.log(`  [${lead.first_name}] -> Apollo found Email: ${currentEmail}`);
            }
          }
        } catch (err) {
          console.warn(`  [${lead.first_name}] -> Apollo enrichment failed: ${err.message}`);
        }
      }

      // 2. Enrich via LeadMagic
      if (!currentEmail && config.leadmagicApiKey) {
        console.log(`  [${lead.first_name}] - Searching LeadMagic...`);
        const lmResult = await leadmagic.findEmail(lead.first_name, lead.last_name, lead.normalized_domain);
        if (lmResult && lmResult.email) {
          currentEmail = lmResult.email;
          currentEmailStatus = lmResult.status || 'verified';
          console.log(`  [${lead.first_name}] -> LeadMagic found email: ${currentEmail}`);
        } else {
          console.log(`  [${lead.first_name}] -> LeadMagic could not find email.`);
        }
      } else if (!currentEmail && !config.leadmagicApiKey) {
        console.log(`  [${lead.first_name}] - Skipping LeadMagic (API key not found in .env.local).`);
      }

      // 3. Save updates
      if (currentEmail !== lead.email || currentLinkedin !== lead.linkedin_url) {
        updateLead.run(currentEmail, currentLinkedin, currentEmailStatus, lead.id);
        enrichedCount++;
      }
    }));

    // Wait between batches to respect Apollo's 50/min rate limit (max 5 parallel calls, wait 6s = max 50/min)
    if (i < batches.length - 1) {
      console.log(`Waiting 6 seconds before next batch to respect API limits...`);
      await delay(6000);
    }
  }

  console.log(`\nFinished enriching ${enrichedCount} leads.`);
  console.log("You can now run 'node tools/sync_research_to_crm.js' to update your CRM DB.");
}

enrichExistingLeads();
