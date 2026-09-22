const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const keyMatch = env.match(/ANTHROPIC_API_KEY=(.*)/);
const key = keyMatch ? keyMatch[1].trim() : '';

const body = {
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  system: "You must output your response as a valid, raw JSON object exactly matching this schema: {\"title\": \"string\"}. Do not output any XML tags.",
  messages: [{"role": "user", "content": "what is replit"}]
};

fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01"
  },
  body: JSON.stringify(body)
}).then(r => r.json()).then(console.log);
