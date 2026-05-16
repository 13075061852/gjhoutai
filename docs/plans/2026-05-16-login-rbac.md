# Login, Session, and RBAC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add admin-provisioned authentication and role-based protection so no project data can be read or written without a valid login session.

**Architecture:** Use Cloudflare Worker + D1 as the security boundary. The frontend only renders the app after `/api/auth/me` succeeds, while the Worker enforces authentication and permission checks on every state/blob request using opaque server-side sessions stored in D1 and delivered through HttpOnly cookies.

**Tech Stack:** React 18, TypeScript, Cloudflare Workers, D1, R2, Web Crypto API

---

### Task 1: Add auth schema
- Create `migrations/0002_auth.sql` with users, sessions, and audit log tables.
- Verify schema is compatible with D1 SQLite.

### Task 2: Protect Worker APIs
- Add password hashing, session management, login/logout/me/change-password routes.
- Add one-time bootstrap admin route and admin-only user creation/listing routes.
- Replace wildcard CORS with allowlisted credentialed CORS.
- Require authentication for all `/api/state/*` and `/api/blob/*` routes.

### Task 3: Add frontend auth gate
- Add auth client service and login UI.
- Move cloud hydration behind successful auth.
- Show the legacy app only after the session is confirmed.

### Task 4: Add documentation and verification
- Document bootstrap flow and required secrets/origins.
- Run typecheck/build/tests.
- Verify unauthenticated reads are rejected and authenticated access path is wired.
