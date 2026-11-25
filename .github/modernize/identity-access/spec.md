# Feature Specification: Secure Identity and Access

> Governed by: `../constitution.md`

**Feature Branch**: `feature/secure-identity-access`  
**Created**: 2026-11-23  
**Status**: First authentication slice implemented; onboarding and production identity-data collection remain gated
**Input**: User-confirmed requirements for secure user accounts, provider invitations, requester registration, and traceability.

## Scope Baseline

- **Discovery method**: Reviewed `api-service-contracts.md`, `prisma/schema.prisma`, and the backend status and data-model documentation.
- **Total items discovered**: Six relevant existing items: one public health endpoint and five identity/access models (`Usuario`, `Rol`, `UsuarioRol`, `TokenVerificacionCorreo`, and `InvitacionProveedor`).
- **Items in scope**: Identity, authentication, sessions, invitations, requester approval, and role/ownership authorization. The health endpoint remains unchanged.

## User Scenarios & Testing

### User Story 1 - Signing in securely (Priority: P1)

An active user signs in with an email and password, receives a protected browser session, and can end that session. A session is not granted to an unverified, pending, blocked, or disabled account.

**Why this priority**: Every future form and protected operation depends on establishing a trustworthy actor.

**Independent Test**: Exercise sign-in, session inspection, logout, expiration, and CSRF rejection through E2E requests; verify unauthenticated requests cannot access a protected test route.

**Acceptance Scenarios**:

1. **Given** an active user with a verified email, **When** valid credentials are submitted, **Then** the API creates a server-side session and sets an `HttpOnly` cookie.
2. **Given** invalid credentials or an inactive account, **When** sign-in is attempted, **Then** the API returns a generic authentication error without revealing whether the email exists.
3. **Given** an expired or revoked session, **When** a protected route is called, **Then** the API returns 401.
4. **Given** an authenticated browser session, **When** a state-changing request omits or misstates its CSRF token, **Then** the API rejects the request.
5. **Given** an authenticated user, **When** logout succeeds, **Then** the server-side session is revoked and cannot be reused.

**Initial API contract**:

| Method | Path | Request | Success response |
|---|---|---|---|
| POST | `/api/v1/auth/iniciar-sesion` | Email and password | 200 with safe user summary and CSRF token; sets the session cookie |
| GET | `/api/v1/auth/yo` | Session cookie | 200 with the current user's safe profile and roles |
| GET | `/api/v1/auth/csrf` | Session cookie | 200 with a session-bound CSRF token |
| POST | `/api/v1/auth/cerrar-sesion` | Session cookie and CSRF header | 204; clears and revokes the session |

### User Story 2 - Creating an eligible external account (Priority: P1)

A requester affiliated with an institution can register, verify control of their email, and wait for manual approval. A provider can create an account only through an invitation issued by the INE.

**Why this priority**: The user requires an account and attributable identity before a person can submit or complete a form.

**Independent Test**: Verify the requester state transitions and email flow, and independently accept or reject a valid, expired, reused, and invalid provider invitation.

**Acceptance Scenarios**:

1. **Given** a new requester registration, **When** its email is verified, **Then** the account remains pending until an administrator completes manual review.
2. **Given** a requester whose account is pending review, **When** the requester tries to sign in or submit a form, **Then** the operation is denied.
3. **Given** no provider invitation, **When** a person attempts provider registration, **Then** the API rejects it without assigning a provider role.
4. **Given** a valid provider invitation, **When** its intended recipient accepts it, **Then** the account is associated only with the invited provider and the invitation cannot be reused.
5. **Given** an email address already registered, **When** public registration is attempted, **Then** the response does not disclose account existence.

### User Story 3 - Reviewing identity and controlling access (Priority: P1)

An administrator reviews requester and institution information, approves or rejects the profile, and manages roles. Users can access only resources owned by their account, institution, or provider as appropriate.

**Why this priority**: Email verification alone does not establish institutional identity, and role checks without ownership checks permit cross-organization access.

**Independent Test**: Exercise profile approval, rejection, role assignment restrictions, and cross-provider/cross-institution access denial with multiple isolated users.

**Acceptance Scenarios**:

1. **Given** a requester awaiting review, **When** an administrator approves or rejects the profile, **Then** the decision, actor, time, and target are audited and the account state changes.
2. **Given** a worker or external user, **When** that user attempts to assign roles or approve an identity, **Then** the API returns 403.
3. **Given** a provider or requester, **When** that user accesses another organization's record, **Then** the API denies access without exposing its contents.
4. **Given** a DPI/CUI value, **When** it is stored or returned, **Then** the database contains only application-encrypted data and responses expose at most a masked value.

### Edge Cases

- Email verification and invitation tokens are expired, already consumed, guessed, or replayed.
- SMTP is unavailable; the account must remain in its prior state and the failure must be observable without exposing the token.
- Two simultaneous registration or invitation-acceptance requests race for the same email or token.
- A requester changes institution details after approval; the change requires re-review.
- The database contains the existing generic `USUARIO` role; the migration must preserve its role ID and assignments when renaming it to `SOLICITANTE`.
- Cookies arrive from a disallowed origin, a direct client spoofs forwarding headers, or the configured cookie domain is invalid.
- DPI/CUI collection is disabled because the INE has not approved the privacy notice and retention policy.

## Requirements

### Functional Requirements

- **REQ-001**: System MUST require an authenticated account to create, complete, or submit any future request form and MUST retain the authenticated actor on the request.
- **REQ-002**: System MUST allow requester self-registration with an email, name, and institution association; NIT is optional. DPI/CUI is collected only when the production privacy gate is approved.
- **REQ-003**: System MUST require requester email verification and administrator approval before enabling sign-in or form submission.
- **REQ-004**: System MUST allow provider accounts to be created only from a valid, unexpired, single-use invitation issued by an administrator.
- **REQ-005**: System MUST authenticate eligible users with email and password and MUST return a generic failure for invalid credentials or ineligible account states.
- **REQ-006**: System MUST create opaque, revocable, expiring server-side sessions; rotate session material at sign-in; and revoke the session at logout.
- **REQ-007**: Browser sessions MUST use `HttpOnly` cookies, `Secure` in production, an appropriate `SameSite` policy, and CSRF protection for state-changing requests.
- **REQ-008**: System MUST authorize each protected operation by role and resource ownership: providers access their own provider data, requesters their own institution and requests, workers manage request workflows, and administrators manage users and roles.
- **REQ-009**: System MUST rename the existing generic role `USUARIO` to `SOLICITANTE` without losing existing role assignments; it MUST NOT allow public self-assignment of privileged roles.
- **REQ-010**: System MUST support manual approval/rejection of requester identity by an administrator and audit the decision.
- **REQ-011**: System MUST NOT store a DPI/CUI image in this feature. When collection is enabled, it MUST encrypt the number at the application layer, mask it in responses, and restrict full-value access to authorized reviewers.
- **REQ-012**: Production collection of DPI/CUI MUST remain disabled until the INE approves the purpose, privacy notice, access policy, retention period, and deletion process.
- **REQ-013**: System MUST store only hashes of verification, invitation, session, and CSRF tokens; each one-time token MUST expire and be rejected after use.
- **REQ-014**: System MUST send verification and invitation messages through a configurable SMTP transport; it MUST NOT return tokens in API responses or logs.
- **REQ-015**: System MUST allow `COOKIE_DOMAIN`, `CORS_ORIGINS`, and trusted proxy ranges to be configured per environment; it MUST NOT hardcode production hostnames or trust arbitrary forwarded-IP headers.
- **REQ-016**: System MUST apply rate limits to sign-in, registration, verification, invitations, and protected writes; rate-limit behavior MUST be tested at the configured thresholds.
- **REQ-017**: System MUST audit authentication state changes, invitation acceptance, profile review, role assignment, and denied authorization attempts without logging passwords, tokens, or full DPI/CUI values.
- **REQ-018**: System MUST keep `GET /api/v1/salud` public and minimal; it MUST NOT expose secrets or personal data.

### Key Entities

- **Usuario**: Account identity, credential hash, state, email-verification state, roles, and session relationship.
- **Rol / UsuarioRol**: Named role and auditable role assignment.
- **InstitucionSolicitante**: Requesting institution, optional NIT, and review state.
- **PerfilSolicitante**: User affiliation, optional title/contact details, encrypted DPI/CUI, and manual review state.
- **SesionUsuario**: Hash of opaque session and CSRF tokens, expiration, revocation, and owning user.
- **TokenVerificacionCorreo / InvitacionProveedor**: Hashed, expiring, single-use verification and invitation tokens.
- **EventoAuditoria**: Actor, action, resource, time, and non-sensitive metadata.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All protected routes return 401 without a valid session and return 403 or policy-approved 404 for unauthorized roles or owners.
- **SC-002**: No requester can submit a form before email verification and administrator approval.
- **SC-003**: No provider account can be created without a valid single-use INE invitation.
- **SC-004**: Automated tests verify expired/replayed tokens, CSRF failures, invalid role, cross-owner access, generic login errors, and rate-limit responses.
- **SC-005**: No password, session token, invitation token, verification token, or full DPI/CUI value appears in API responses or application logs.
- **SC-006**: Changing the deployment host requires environment configuration only; no production domain is embedded in source code.

## Out of Scope

- Request CRUD and the full S.00/S.11/S.21/S.22 workflows; future form endpoints must consume these authentication and authorization controls.
- The DGAE procurement workflow for Contrato Abierto.
- Importing the INE workbook, supplier products and prices, external search, AI matching, statistics, and report generation.
- Fixing a minimum quote count before the INE confirms whether it applies per file or per product.
- Production DPI/CUI capture before the privacy and retention gate in REQ-012 is approved.
