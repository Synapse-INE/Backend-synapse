# Implementation Plan: Secure Identity and Access

**Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

## Summary

Implement secure sign-in, sessions, external account onboarding, and role/ownership
authorization on the existing NestJS API. Preserve the existing schema history,
rename the generic requester role without losing assignments, and keep DPI/CUI
collection disabled in production until the INE approves its privacy controls.

## Technical Context

**Language/Version**: TypeScript on Node.js 22.12 or later  
**Primary Dependencies**: NestJS 12, Prisma 7, PostgreSQL 16; add Argon2id and a configurable SMTP transport  
**Storage**: PostgreSQL via the existing Prisma schema and migrations  
**Testing**: Vitest, Supertest, Prisma validation, PostgreSQL-compatible migration tests  
**Target Platform**: NestJS API behind a TLS-terminating reverse proxy/CDN  
**Performance Goals**: Auth and authorization checks must not add unbounded database work; rate limits and session lookups use indexed keys.  
**Constraints**: No hardcoded production domains; no arbitrary proxy trust; no DPI/CUI production capture before institutional approval; no business-form CRUD in this feature.

## Constitution Check

- **Security by Default**: PASS — sessions, CSRF, role and ownership checks, rate limits, and negative tests are required.
- **Traceability with Data Minimization**: PASS — actor-linked audit events; encrypted/masked identity data; no document image.
- **Domain and Contract Fidelity**: PASS — role and onboarding decisions are explicit; unresolved INE rules stay configurable or gated.
- **Testable, Incremental Delivery**: PASS — each story has focused unit and E2E acceptance tests; migrations are validated.
- **Minimal, Maintainable Design**: PASS — reuse NestJS, Prisma, PostgreSQL, and existing module boundaries; add only required crypto/mail dependencies.

## Applied Guidelines

No NestJS-specific migration guideline matched this feature in the available
guidelines set. The plan follows the existing NestJS module structure, global
validation, configuration validation, Prisma access layer, and Vitest test
patterns. Security requirements are sourced from the project constitution and
the API acceptance criteria.

## Implementation Steps

### Step 1: [Cross-cutting] Extend identity persistence
- **Plan item**: 1.1
- **Requirements**: REQ-003, REQ-006, REQ-009, REQ-010, REQ-011, REQ-013
- **Design inputs**: `../constitution.md`, `spec.md`, `research.md`, `../../../docs/modelo-datos.md`
- **Description**: Add applicant institution/profile and revocable server-side session persistence; add the manual-review account state; rename `USUARIO` to `SOLICITANTE` without changing assignments.

### Step 2: [Cross-cutting] Configure shared security controls
- **Plan item**: 1.2
- **Requirements**: REQ-007, REQ-012, REQ-014, REQ-015, REQ-016
- **Design inputs**: `../constitution.md`, `spec.md`, `research.md`
- **Description**: Add validated environment configuration for cookies, sessions, SMTP, identity encryption, CORS credentials, and trusted proxy CIDRs. Add mail and shared access-control infrastructure without hardcoded production domains.

### Step 3: [Cross-cutting] Implement credential and session services
- **Plan item**: 2.1
- **Requirements**: REQ-005, REQ-006, REQ-013
- **Design inputs**: `spec.md`, `research.md`
- **Description**: Implement Argon2id password handling and opaque, hashed, expiring, revocable server-side sessions.

### Step 4: [Cross-cutting] Implement shared authorization and request protections
- **Plan item**: 2.2
- **Requirements**: REQ-001, REQ-007, REQ-008, REQ-015, REQ-016, REQ-018
- **Design inputs**: `spec.md`, `research.md`, `../assessment/engines/facts/api-service-contracts.md`
- **Description**: Implement CSRF validation, authenticated-user context, role and ownership guards, generic errors, and endpoint-specific throttling. Keep health public and minimal.

### Step 5: [US1] Deliver secure sign-in and session lifecycle
- **Plan item**: 3.1
- **Requirements**: REQ-005, REQ-006, REQ-007, REQ-013, REQ-016, REQ-018
- **Design inputs**: `spec.md`, `research.md`
- **Description**: Add sign-in, logout, current-user, and CSRF contracts. Rotate session material at sign-in, revoke at logout, and test inactive accounts, invalid credentials, expired sessions, and CSRF failures.

### Step 6: [US2] Deliver requester registration and email verification
- **Plan item**: 4.1
- **Requirements**: REQ-001, REQ-002, REQ-003, REQ-009, REQ-011, REQ-012, REQ-013, REQ-014, REQ-016
- **Design inputs**: `spec.md`, `research.md`, `../../../docs/modelo-datos.md`
- **Description**: Add requester signup, email verification, institution/profile persistence, and privacy-gated DPI/CUI handling. Requesters remain unable to sign in or submit until approved.

### Step 7: [US2] Deliver provider invitations
- **Plan item**: 4.2
- **Requirements**: REQ-004, REQ-013, REQ-014, REQ-016
- **Design inputs**: `spec.md`, `research.md`, `../../../docs/modelo-datos.md`
- **Description**: Add administrator-created invitations and single-use acceptance tied to the invited provider.

### Step 8: [US3] Deliver administrator review and authorization
- **Plan item**: 5.1
- **Requirements**: REQ-003, REQ-008, REQ-009, REQ-010, REQ-017
- **Design inputs**: `spec.md`, `research.md`
- **Description**: Add administrator-only applicant review and role management, prevent workers and external users from escalating privileges, audit decisions, and provide a safe one-time initial-admin bootstrap.

### Step 9: [Cross-cutting] Verify contracts and operational readiness
- **Plan item**: 6.1
- **Requirements**: REQ-001 through REQ-018
- **Design inputs**: `spec.md`, `../constitution.md`, `../assessment/engines/facts/api-service-contracts.md`
- **Description**: Update the API inventory only after routes exist; document environment settings and deployment gates; run targeted tests, full build/lint, migration validation, and runtime probes for every new route.

## Project Structure

```text
src/
  infrastructure/
    database/
    mail/
  modules/
    auth/
    usuarios/
    invitaciones/
    health/
prisma/
  schema.prisma
  migrations/
test/
  app.e2e-spec.ts
  auth.e2e-spec.ts
  invitaciones.e2e-spec.ts
```

## Testing Strategy

- **appType**: API-only
- **Critical user journeys**:
  1. Active requester signs in, obtains CSRF token, calls a protected route, and logs out.
  2. Requester verifies email and remains blocked until administrator approval.
  3. Provider accepts a valid invitation; invalid, expired, and replayed invitations fail.
  4. Provider and requester cannot access another organization's resources.
- **primaryValidationStack**: Vitest unit tests, Supertest E2E tests, Prisma validation, and PostgreSQL migration/integration tests.
- **fallbackMatrix**:
  - `infra-tier`: PostgreSQL 16 via Compose → PGlite for schema/migration checks only. PGlite is not a substitute for final PostgreSQL integration tests. Prerequisite: Docker for the primary tier.
  - `browser-tier`: Not applicable; API behavior is exercised with Supertest. Frontend cookie/CSRF integration remains a separate validation.
- **Environment requirements**: Node.js 22.12+, npm dependencies, PostgreSQL 16 or PGlite for limited migration checks, test SMTP transport; production requires TLS, SMTP, managed secrets, CORS origins, cookie domain, and trusted proxy ranges.
- **knownGaps**: Production identity proof, DPI/CUI retention policy, and email delivery are blocked until INE/deployment decisions are supplied. No request CRUD is included.
- **Test data strategy**: Use isolated UUID fixtures and a disposable test database; never use real DPI/CUI, provider credentials, or production mail.
- **Acceptance criteria**: Every story's scenarios pass; no auth token or full DPI/CUI appears in response/logs; migration preserves role assignments; build, lint, unit, E2E, and route probes pass.
- **Validation review expectations**: Reviewers verify 401/403 behavior, cross-owner isolation, CSRF, token expiry/replay, rate limits, role migration, configuration defaults, and privacy gates.

## Phase 1: Setup

- [x] T001 [Plan:1.1] Add security and onboarding environment documentation in `.env.example` and `README.md`.

## Phase 2: Foundational

- [x] T002 [Plan:1.1] Add applicant institution, applicant profile, session, and pending-approval persistence in `prisma/schema.prisma`.
- [x] T003 [Plan:1.1] Create a forward-safe Prisma migration that renames `USUARIO` to `SOLICITANTE` while preserving role assignments in `prisma/migrations/`.
- [x] T004 [Plan:1.1,1.2] Validate migration behavior, token/session indexes, and privacy-gated identity storage in `test/`.
- [x] T005 [Plan:1.1,1.2] Add validated environment settings in `src/app.module.ts` and the `argon2`, `nodemailer`, and `cookie-parser` dependencies in `package.json` and the lockfile.
- [ ] T006 [Plan:1.2] Add the SMTP mail adapter with explicit configuration errors and a test transport in `src/infrastructure/mail/`.
- [ ] T007 [Plan:1.2] Add shared authenticated-user context, role metadata, and ownership authorization helpers in `src/common/`.
- [x] T008 [Plan:1.2] Add cookie, CSRF, trusted-proxy, and authentication rate-limit tests in `test/`.

## Phase 3: User Story 1 - Signing in securely (Priority: P1)

**Goal**: Active users can create and revoke sessions using secure browser cookies.

**Independent Test**: Exercise login, current-user, CSRF, logout, and session expiry with E2E tests.

- [x] T009 [US1] [Plan:2.1] Implement Argon2id credential verification and generic authentication failures in `src/modules/auth/`.
- [x] T010 [US1] [Plan:2.1] Implement opaque session creation, rotation, expiry, revocation, and token hashing in `src/modules/auth/`.
- [x] T011 [US1] [Plan:2.2] Implement CSRF token issuance and validation bound to the active session in `src/modules/auth/`.
- [x] T012 [US1] [Plan:3.1] Add sign-in, logout, current-user, and CSRF endpoints with DTOs and response contracts in `src/modules/auth/`.
- [x] T013 [US1] [Plan:3.1] Add unit and E2E tests for valid/invalid credentials, inactive users, expired/revoked sessions, cookie flags, and CSRF rejection in `test/`.

## Phase 4: User Story 2 - Creating an eligible external account (Priority: P1)

**Goal**: Requesters register and await approval; providers join only by invitation.

**Independent Test**: Exercise requester verification and provider invitation acceptance without granting access to pending accounts.

- [ ] T014 [US2] [Plan:4.1] Implement requester registration with email normalization, institution association, pending states, and non-enumerating responses in `src/modules/auth/`.
- [ ] T015 [US2] [Plan:4.1] Implement hashed, expiring email-verification tokens and SMTP delivery without returning tokens in API responses in `src/modules/auth/`.
- [ ] T016 [US2] [Plan:4.1] Implement application-layer DPI/CUI encryption and masked response mapping behind the production privacy gate in `src/modules/usuarios/`.
- [ ] T017 [US2] [Plan:4.2] Implement administrator-created provider invitations and single-use acceptance tied to the invited provider in `src/modules/invitaciones/`.
- [ ] T018 [US2] [Plan:4.1,4.2] Add E2E tests for email verification, pending approval, missing/expired/replayed invitations, duplicate-email privacy, and SMTP failure in `test/`.

## Phase 5: User Story 3 - Reviewing identity and controlling access (Priority: P1)

**Goal**: Administrators review requester profiles and role/ownership rules prevent unauthorized access.

**Independent Test**: Exercise approval/rejection and cross-role/cross-owner access with isolated users.

- [ ] T019 [US3] [Plan:5.1] Implement administrator-only requester review and role management endpoints in `src/modules/usuarios/`.
- [ ] T020 [US3] [Plan:5.1] Record review, invitation, role, and authorization events without sensitive values in `src/modules/auditoria/`.
- [ ] T021 [US3] [Plan:5.1] Add a one-time initial-administrator bootstrap with no default credentials in `scripts/bootstrap-admin.ts` and `package.json`.
- [ ] T022 [US3] [Plan:5.1] Add tests for role escalation, wrong-role access, cross-provider access, cross-institution access, and audited review decisions in `test/`.

## Phase 6: Polish and Cross-Cutting Concerns

- [ ] T023 [Plan:6.1] Update the actual API endpoint inventory and operational documentation after endpoints are implemented in `.github/modernize/assessment/engines/facts/api-service-contracts.md`.
- [ ] T024 [Plan:6.1] Run Prisma validation, migration tests, unit tests, E2E tests, build, lint, and runtime probes for all new routes.

## Requirement Mapping

| REQ ID | Description | Plan Items | Implementation Evidence |
|---|---|---|---|
| REQ-001 | Require authenticated, attributable users for future form writes. | 2.2, 3.1, 5.1 | Authenticated-user context, guards, E2E authorization tests. |
| REQ-002 | Allow requester self-registration with institutional association. | 1.1, 4.1 | `InstitucionSolicitante`, requester registration endpoint and tests. |
| REQ-003 | Require email verification and administrator approval. | 1.1, 4.1, 5.1 | Account states, verification flow, review endpoint and tests. |
| REQ-004 | Restrict provider account creation to invitations. | 4.2 | Invitation service, acceptance endpoint and replay tests. |
| REQ-005 | Authenticate eligible users with generic errors. | 2.1, 3.1 | Credential service and sign-in endpoint/tests. |
| REQ-006 | Create revocable, expiring server-side sessions. | 1.1, 2.1, 3.1 | Session model/service, rotation and revocation tests. |
| REQ-007 | Protect browser sessions with cookies and CSRF. | 1.2, 2.2, 3.1 | Cookie configuration, CSRF service, E2E tests. |
| REQ-008 | Enforce role and resource ownership. | 1.2, 2.2, 5.1 | Guards, owner checks, cross-role and cross-owner tests. |
| REQ-009 | Rename `USUARIO` to `SOLICITANTE` safely. | 1.1 | Forward-safe role migration and assignment-preservation test. |
| REQ-010 | Support manual identity review and audit it. | 1.1, 5.1 | Applicant review state, admin endpoints, audit events. |
| REQ-011 | Encrypt and mask DPI/CUI without storing an image. | 1.1, 4.1 | Encrypted profile persistence and masked DTO tests. |
| REQ-012 | Gate production DPI/CUI capture on institutional approval. | 1.2, 4.1 | Disabled-by-default configuration gate and tests. |
| REQ-013 | Hash and expire security tokens. | 1.1, 2.1, 4.1, 4.2 | Token storage, verification/invitation/session tests. |
| REQ-014 | Send email through configurable SMTP. | 1.2, 4.1, 4.2 | Mail adapter and transport-mocked tests. |
| REQ-015 | Configure cookie, CORS, and trusted proxies per environment. | 1.2, 2.2 | Validated config and spoofed-header/CORS tests. |
| REQ-016 | Rate-limit sensitive operations. | 1.2, 2.2, 3.1, 4.1 | Endpoint throttles and threshold tests. |
| REQ-017 | Audit access-control lifecycle without secrets. | 5.1 | Audit integration and redaction tests. |
| REQ-018 | Preserve the minimal public health endpoint. | 2.2, 3.1, 6.1 | Health E2E regression test and route probe. |
