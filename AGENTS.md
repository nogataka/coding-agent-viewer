# Repository Guidelines

## Project Structure & Module Organization
The monorepo hosts distinct packages for the AI agent viewer stack. `backend/` contains the Express + TypeScript API (server, services, utils, scripts). `frontend/` houses the Vite-powered React UI under `src/` plus Tailwind styles. Shared contracts live in `shared/` and should source truth for TypeScript types consumed on both ends. The CLI wrapper that ships to npm resides in `npx-cli/`, while `docs/` stores supplemental ADRs and comparisons. Temporary runtime cache directories (e.g., ports, assets) land under `backend/data/` when running locally.

## Build, Test, and Development Commands
Run `npm run install:all` once to install root, frontend, backend, and CLI dependencies. For iterative work, `npm run dev` launches backend (port 3001) and frontend (port 3000) in parallel; use `npm run backend:dev` or `npm run frontend:dev` when isolating a layer. Ship-ready bundles come from `npm run build`, which compiles the backend (`tsc`) then the frontend (`vite build`). Before publishing the CLI, execute `npm run build:npx` to refresh `npx-cli/dist`.

## Coding Style & Naming Conventions
TypeScript is standard across packages; prefer explicit types on exported functions and shared interfaces. Stick with ESLint + Prettier defaults: run `npm run backend:check` or `npm run frontend:check` to enforce lint, formatting, and type checks. Use PascalCase for React components, camelCase for functions and variables, and uppercase snake case for constants and env keys (e.g., `POSTHOG_API_KEY`).

## Testing Guidelines
The backend currently lacks automated tests (`npm test` is a placeholder). When adding coverage, use Vitest or Jest for backend services and React Testing Library for UI components; store specs beside source files as `*.test.ts` or `*.test.tsx`. Ensure new features include type checks (`npm run check`) and manual smoke tests via `npm run dev`.

## Commit & Pull Request Guidelines
Git history is sparse (`初回コミット` to date). Adopt concise, imperative English subjects (e.g., "Add agent timeline panel") and include context in body paragraphs when touching multiple modules. PRs should link tracking issues, outline behavioural changes, and attach UI screenshots or recordings when the UX shifts.

## Agent-Oriented Tips
When scripting tasks for coding agents, describe the target package (`frontend`, `backend`, `shared`) and desired scripts to run. Provide absolute paths (e.g., `frontend/src/routes/...`) so agents avoid cross-package ambiguity, and remind them to respect `POSTHOG_*` build-time env variables during previews.
