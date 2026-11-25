<!--
Sync Impact Report
Version change: none -> 1.0.0 (first ratification)
Modified principles: none
Added: five core principles, security/privacy constraints, delivery controls, governance
Removed: none
Templates reviewed: plan-template.md, spec-template.md, tasks-template.md — no changes needed
Follow-up TODOs: confirm DPI/CUI privacy notice and retention before production collection
-->
# Portal de Precios de Referencia del INE Constitution

## Migration Mode

**Mode**: UPGRADE

**Justification**: This work extends the existing NestJS and Prisma backend without
replacing its data model, runtime, or deployment structure.

## Core Principles

### I. Security by Default

Every protected operation MUST authenticate the actor and authorize both the role
and ownership of the specific resource. Input MUST be validated with explicit
request DTOs. Sessions, verification tokens, password hashes, files, and secrets
MUST use secure handling; public registration MUST NOT grant privileged roles.
Security controls must be verified by negative tests, not only successful flows.

### II. Traceability with Data Minimization

Every consequential action MUST retain its actor, timestamp, target, and outcome
without logging credentials, tokens, full DPI/CUI values, or unnecessary personal
data. Imported source values and historical prices MUST remain distinguishable
from normalized or newly submitted values. Personal identifiers MUST be collected
only for an approved purpose, encrypted at the application layer, masked in
responses, and access-restricted.

### III. Domain and Contract Fidelity

HTTP request and response DTOs MUST be explicit and MUST NOT expose persistence
models by default. Official forms and regulations are sources for workflow rules;
unconfirmed requirements MUST remain configurable or explicitly pending rather
than being encoded as fixed constraints. Contract changes MUST be documented for
the frontend before integration.

### IV. Testable, Incremental Delivery

Each behavior change MUST include focused tests for its success path, invalid
input, and relevant authorization failures. Schema changes MUST include a
reversible or forward-safe migration and validation against PostgreSQL-compatible
behavior. Build, lint, and relevant test suites MUST pass before a change is
considered complete.

### V. Minimal, Maintainable Design

Changes MUST follow existing NestJS, Prisma, and repository conventions. Prefer
small vertical increments and existing framework capabilities over new
abstractions or dependencies. Security complexity, third-party services, and
configuration MUST have a documented need and operational owner.

## Security, Privacy and Institutional Integrity

- Production secrets, encryption keys, mail credentials, and deployment domains
  MUST be supplied through environment or managed secret configuration; they
  MUST NOT be committed or hardcoded.
- Browser sessions SHOULD use `HttpOnly` cookies, `Secure` in production,
  appropriate `SameSite` settings, and CSRF protection for state-changing
  requests. Cookie domain and CORS origins MUST be environment-configurable.
- Trust in forwarded client-IP headers MUST be limited to configured proxies.
  Rate limits MUST protect authentication, registration, invitations, imports,
  and writes; health checks may remain exempt only while returning minimal data.
- Provider access MUST be restricted to that provider's own profile, products,
  prices, and files. Requester access MUST be restricted to the requester's own
  institution and submissions.
- DPI/CUI collection MUST remain disabled in production until purpose, notice,
  access, retention, and deletion are approved. The first proposed workflow
  stores no document image and requires manual review.
- User-submitted text MUST remain data, not executable markup. Uploaded content
  MUST be validated by content and stored outside public web paths.
- The portal MUST NOT claim to replace DGAE or physical/CD requirements unless
  the responsible institution confirms that policy change.

## Delivery, Testing and Review

- Each pull request MUST identify the requirements it implements, affected API
  contracts, migrations, tests, and remaining operational configuration.
- Changes to authorization, identity data, uploads, rate limits, or proxy
  handling MUST receive a security-focused review.
- Tests MUST cover unauthenticated access, wrong-role access, cross-owner access,
  validation failures, and expected error codes where relevant.
- Documentation MUST distinguish implemented behavior from proposals and
  pending decisions. The frontend MUST not depend on routes absent from the API
  inventory.
- Production readiness requires configured TLS, trusted proxy ranges, CORS
  origins, cookie domain, mail delivery, secret management, and approved
  personal-data retention.

## Governance

This constitution governs backend implementation and supersedes conflicting
conventions for the scope of this project. Amendments require a reviewed pull
request that explains the reason, affected principles, compatibility impact,
and necessary migration or rollout steps. Reviewers MUST verify requirement
traceability, data protection, authorization, migrations, and test evidence.

Versioning uses semantic versioning: MAJOR for incompatible principle changes,
MINOR for new principles or materially expanded constraints, and PATCH for
clarifications that do not change obligations.

**Version**: 1.0.0 | **Ratified**: 2026-11-23 | **Last Amended**: 2026-11-23
