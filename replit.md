# Study Notebook

An AI study workspace that explains lecture PDFs and concept prompts in a familiar chat format, with technical terms linked to separate beginner-friendly explanations.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/concept-graph run dev` — run the web app through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `GEMINI_API_KEY` — Gemini API key used only by the API server

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/concept-graph/` — React study workspace, PDF extraction, linked-term explanations, and local persistence
- `artifacts/api-server/src/routes/study.ts` — Gemini-backed study and technical-concept explanation endpoints
- `lib/api-spec/openapi.yaml` — source of truth for API contracts

## Architecture decisions

- PDF text is extracted page-by-page in the browser so citations retain the original slide/page number.
- Uploaded lecture text and chat history are stored locally in IndexedDB; the Gemini key remains server-side.
- The first release does not require accounts or server-side document storage.

## Product

- Upload one or more PDF lectures and extract their text locally.
- Ask for a standard AI explanation from PDFs, a concept prompt, or both.
- Click underlined technical terms to open separate beginner-friendly explanation tabs.
- Continue asking questions while keeping the uploaded lecture context.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Re-run API codegen after changing `lib/api-spec/openapi.yaml`.
- The frontend must continue to support prompt-only explanations with no uploaded files.
- Technical terms in answers must remain clickable and open a separate `/concept` tab.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
