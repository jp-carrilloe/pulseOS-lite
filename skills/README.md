# Skills Library

This directory acts as a **Lazy Loader** for specific skills and Standard Operating Procedures (SOPs).

Instead of packing every Agent with a massive list of detailed instructions, Agents are built to automatically search this directory for specific `skills` when they need to perform a highly complex task.

### How to use:
1. Create a markdown file for a specific capability (e.g., `write_cold_email.md`).
2. Define the strict rules, inputs, outputs, and format that make the skill perfect.
3. Prompt your Agent to load the skill: *"@Sales, write a new sequence. Load the `write_cold_email` skill before you draft the copy."*
