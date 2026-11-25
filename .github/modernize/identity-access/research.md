# Identity and Access Decisions

## Decisions

### Browser authentication

- **Decision**: Use opaque server-side sessions in `HttpOnly` cookies, with CSRF protection for state-changing requests. Enable `Secure` in production and configure `SameSite` deliberately.
- **Rationale**: This avoids exposing reusable bearer tokens to browser JavaScript and permits immediate session revocation.
- **Configuration**: `COOKIE_DOMAIN` is optional and environment-specific; `CORS_ORIGINS` is an explicit allowlist. No production hostname is hardcoded.
- **Alternative considered**: JWT stored in browser storage. Rejected because it increases exposure to script injection and complicates revocation.

### Passwords and tokens

- **Decision**: Hash passwords with Argon2id. Store only cryptographic hashes of session, CSRF, email-verification, and invitation tokens. Tokens are random, single-use where applicable, expiring, and never returned in API bodies or logs.
- **Rationale**: A database disclosure should not directly expose reusable credentials or tokens.
- **Alternatives considered**: Plaintext or reversible password storage is unacceptable. A signed JWT was not selected for browser sessions because immediate revocation would still require server-side state.

### Role mapping

- **Decision**: Rename the seeded generic role `USUARIO` to `SOLICITANTE`, preserving its existing role ID and user assignments.
- **Rationale**: The institution requester is an external actor distinct from the three operational roles. Renaming avoids creating a redundant fifth role.
- **Alternatives considered**: Keeping `USUARIO` leaves its purpose ambiguous; adding a fifth role would duplicate the existing generic requester assignment.

### External account onboarding

- **Decision**: Providers remain invitation-only. Requesters may self-register, verify email, and remain pending until an administrator reviews their institution and identity.
- **Rationale**: This supports traceable requests without allowing a public registration to grant supplier or staff permissions.
- **Alternatives considered**: Open provider registration was rejected because it would allow unverified supplier accounts. Requiring invitations for every requester was not selected because the user expects institutions to create traceable accounts.

### DPI/CUI

- **Decision**: Do not store an identity-document image. If enabled after INE approval, encrypt the DPI/CUI at the application layer, mask it in all responses, and restrict full-value access to reviewers.
- **Rationale**: Collect the minimum data needed for manual review and limit the impact of a database or log disclosure.
- **Production gate**: Do not enable collection until purpose, privacy notice, access policy, retention, and deletion are approved by the INE.
- **Alternatives considered**: Storing document images increases exposure and is unnecessary for the agreed first workflow. Treating a user-entered number as verified would provide false assurance.

### Email and deployment

- **Decision**: Implement a vendor-neutral SMTP adapter. Mail host, sender, and credentials are deployment configuration; tests use a mock transport.
- **Rationale**: Email verification and invitations are required, but no mail vendor has been chosen.
- **Alternatives considered**: A vendor-specific email SDK would couple the backend to a provider the team has not selected.
- **Deployment gate**: Configure TLS, `COOKIE_DOMAIN`, `CORS_ORIGINS`, SMTP, encryption keys, and trusted proxy CIDRs for the actual environment. Do not trust arbitrary `X-Forwarded-For`.

### Quote and delivery requirements

- **Decision**: Quote-count rules remain configurable and are not enforced as a fixed database cardinality until the INE confirms the policy. The portal handles the price-reference request for Contrato Abierto, not the DGAE procurement workflow. Track physical/CD receipt until the INE accepts digital-only delivery.
- **Rationale**: These are institutional workflow decisions and cannot safely be inferred from the current forms.
- **Alternatives considered**: Hard-coding a count or claiming digital-only compliance could contradict official INE procedures.

## Deferred institutional approvals

These are launch gates, not implementation assumptions:

1. DPI/CUI purpose, privacy notice, retention period, and deletion process.
2. The evidence and operating procedure used by an administrator to verify identity.
3. The SMTP service and sender address.
4. Production hostnames and Cloudflare/reverse-proxy CIDR configuration.
5. Whether digital delivery replaces physical/CD delivery and the scope of any minimum quote rule.
