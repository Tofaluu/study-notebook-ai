# Study Notebook AI

A privacy-first, Bring-Your-Own-Key (BYOK) AI study platform designed to help students understand complex lecture materials. Users can upload lecture PDFs, ask questions, and receive detailed explanations featuring interactive technical concepts and contextual follow-ups.

## Features

* **Multi-Provider LLM Architecture:** Supports the latest flagship models from OpenAI (GPT-6.1 Sol, GPT-6 Luna), Anthropic (Claude 5.5 Sonnet, Claude 5.5 Opus), and Google (Gemini 3.8 Flash).
* **Interactive Explanations:** The AI automatically identifies and highlights technical jargon. Clicking any highlighted term opens a dedicated learning tab explaining the concept in isolation.
* **Contextual Follow-ups:** Highlight any text within an AI's response to ask a highly specific follow-up question directly related to that passage.
* **Mobile and Tablet Ready:** Fully responsive design featuring a sliding sidebar and polyfilled touch support for native drag-and-drop tab management on iPads and smartphones.
* **Privacy-First & Zero-Cost Backend:** All PDF parsing and chat history persistence occur entirely on the client side using IndexedDB. API keys are stored securely in browser LocalStorage. No user data, files, or keys are ever saved to a remote database.
* **Strict Type Safety:** Utilizes an Express + Zod API orchestration layer to enforce strict JSON schemas across all LLM providers, ensuring the React frontend always receives predictable data structures.

## Tech Stack

* **Frontend:** React, TypeScript, Tailwind CSS, React Query
* **Backend:** Node.js, Express, Zod
* **Data Persistence:** IndexedDB (Client-side)
* **Architecture:** `pnpm` workspace monorepo

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the development servers (frontend and API):
   ```bash
   pnpm run dev
   ```
4. Open the application in your browser. You will need to provide your own API key (OpenAI, Anthropic, or Gemini) in the UI to generate responses.
