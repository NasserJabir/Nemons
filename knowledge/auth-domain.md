# Example: Authentication Domain Knowledge
# Place at: ~/.nemons/knowledge/auth-domain.md

# Authentication Domain Knowledge

## Architecture
- OAuth 2.1 (PKCE mandatory)
- JWT access tokens (15 min lifetime)
- Refresh tokens (7 days, rotate on use)
- Session storage: Redis (with TTL)
- Rate limiting: 5 attempts per 5 minutes per IP

## Supported Providers
- Google OAuth (for Gmail users)
- GitHub OAuth (for developers)
- Email/password (with bcrypt cost 12)
- Magic link (for passwordless)

## Database Schema
```sql
users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,  -- NULL if OAuth-only
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

oauth_accounts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  provider TEXT NOT NULL,  -- 'google' | 'github'
  provider_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  UNIQUE(provider, provider_user_id)
)

refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ
)
```

## API Endpoints
- `POST /api/v1/auth/register` — email/password
- `POST /api/v1/auth/login` — email/password
- `POST /api/v1/auth/refresh` — refresh token rotation
- `POST /api/v1/auth/logout` — invalidate refresh token
- `GET /api/v1/auth/google` — start Google OAuth
- `GET /api/v1/auth/google/callback` — Google OAuth callback
- `GET /api/v1/auth/github` — start GitHub OAuth
- `GET /api/v1/auth/github/callback` — GitHub OAuth callback
- `POST /api/v1/auth/magic-link` — request magic link
- `POST /api/v1/auth/magic-link/verify` — verify magic link

## Security Rules
- Never log JWTs, refresh tokens, or passwords
- Always validate JWT signatures (RS256)
- Use `Authorization: Bearer <token>` header
- Store refresh tokens hashed (not plaintext)
- Implement CSRF protection for cookie-based auth
- Set httpOnly, secure, sameSite=strict cookies
- Use rate limiting on /login, /register, /magic-link

## Testing
- Unit tests for all auth utilities (JWT, bcrypt, OAuth state)
- Integration tests for the full flow
- E2E tests for critical paths (login, register, refresh)
- Test token expiry handling
- Test rate limiting
- Test concurrent refresh token use (should fail)

## Common Pitfalls
- Forgetting to rotate refresh tokens on use
- Storing refresh tokens in localStorage (XSS risk)
- Not validating JWT exp claim
- Logging tokens in error handlers
- Not using https in production
- Allowing weak passwords (< 12 chars)
- Not implementing account lockout after failed attempts
