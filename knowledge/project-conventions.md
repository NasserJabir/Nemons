# Example: Project Knowledge Base
# Place at: ~/.nemons/knowledge/project-conventions.md

# Project Conventions

## Architecture
- This is a monorepo using pnpm workspaces
- Frontend: `apps/web/` (Next.js 14, App Router)
- Backend: `apps/api/` (Node.js, Fastify, Prisma)
- Shared: `packages/shared/` (types, utils)
- Database: PostgreSQL (managed via Prisma migrations)

## File Structure
```
src/
├── components/      # Reusable UI components
├── features/        # Feature-based modules (auth, billing, etc.)
├── lib/             # Utilities, helpers
├── hooks/           # Custom React hooks
├── stores/          # Zustand stores
└── types/           # TypeScript types
```

## Naming Conventions
- Components: PascalCase (`Button.tsx`, `UserProfile.tsx`)
- Hooks: camelCase with `use` prefix (`useAuth.ts`, `useDebounce.ts`)
- Utils: kebab-case (`format-date.ts`, `parse-json.ts`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`, `API_BASE_URL`)
- Types/Interfaces: PascalCase (`User`, `AuthState`)

## Code Style
- Use TypeScript strict mode everywhere
- Prefer named exports (not default exports)
- Use `import type` for type-only imports
- No `any` — use `unknown` and narrow
- Use `const` by default, `let` only when needed
- Avoid `var`

## Testing
- Use Vitest + React Testing Library
- Test files: `*.test.ts(x)` co-located with source
- Aim for 80%+ coverage on critical paths
- Use `data-testid` for element selection
- Mock at the boundary, not the implementation

## Git Workflow
- Branches: `feat/*`, `fix/*`, `refactor/*`, `chore/*`
- Commit message format: Conventional Commits
  - `feat(auth): add Google OAuth login`
  - `fix(billing): correct Stripe webhook signature check`
- PRs require 2 approvals for main branch
- Squash and merge to main

## API Conventions
- All endpoints under `/api/v1/*`
- Use JSON:API spec for responses
- Errors use RFC 7807 (problem+json)
- Pagination: `?page=1&pageSize=20`
- Use ETags for caching

## Database
- All tables have: `id` (UUID), `created_at`, `updated_at`
- Use Prisma migrations (never raw SQL in app code)
- All foreign keys have indexes
- Use soft deletes (`deleted_at` timestamp)

## Security
- All secrets in environment variables (never in code)
- Use bcrypt (cost >= 12) for passwords
- JWT tokens: short-lived access (15min) + refresh (7 days)
- Rate limit all auth endpoints (5 req/min)
- Use CSRF tokens for stateful auth
- Sanitize all user input (use Zod or Valibot)

## Deployment
- Docker containers (multi-stage builds)
- Deploy via Kubernetes
- Use Helm charts for releases
- Blue/green deployments
- Database migrations run before deployment
- Health checks at `/health` and `/readyz`
