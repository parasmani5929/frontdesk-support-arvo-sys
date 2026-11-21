# Frontdesk — Candidate Submission Note

**Candidate Role:** Full Stack Developer  
**System:** Frontdesk Support System for Arvo Systems  
**Date:** November 21, 2026  

---

### Question: *What did you not finish, and why?*

> *"Running out of time is normal. Not knowing what you skipped is not."*

In developing **Frontdesk**, the 8-hour constraint required aggressive prioritization of the core domain logic, data integrity guarantees, and critical operational guardrails over secondary bells and whistles.

Here is an honest, transparent breakdown of what was prioritized, what was intentionally deferred, why each decision was made, and how they would be built in the next iteration.

---

### 1. What Was Fully Built & Delivered (Core Scope)

1. **Working Hours & Festival Holiday SLA Engine (`src/lib/sla-engine.ts`)**:
   - Working hours strictly enforced: **09:30 AM to 6:30 PM (18:30), Monday through Friday**.
   - Weekend exclusion: Saturday and Sunday consume **0 business minutes**. A ticket arriving Friday at 6:00 PM is verified to **not** be late on Sunday morning.
   - Festival calendar support: Excludes statutory and festive non-working days.
   - Dynamic SLA target calculations:
     - **Urgent:** 2 working hours first response, same working day resolution.
     - **Medium:** 4.5 working hours (half day) first response, 3 working days resolution.
     - **Small:** 1 working day (9 hours) first response, 1 working week (5 working days) resolution.

2. **SLA Pausing on Customer Wait**:
   - When a ticket status transitions to `WAITING_ON_CUSTOMER`, the SLA timer pauses immediately.
   - When the customer replies, the timer resumes, and target deadlines are extended by the exact business duration elapsed while paused.

3. **Concurrency Control & Collision Prevention (Incident INC-0291)**:
   - Implemented optimistic locking with version increment (`version`) and atomic assignment verification.
   - If two agents attempt to claim the same ticket concurrently, the second claim fails with an HTTP 409 Conflict error and a clear message identifying the claiming agent.
   - Single-screen collision warning informs agents when an assigned colleague is already working on the ticket.

4. **Zero-Trust Private Note Isolation (Incident INC-0304)**:
   - Private team notes (`INTERNAL_NOTE`) are physically excluded at the database query and serialization layers.
   - Dedicated customer API endpoint (`/api/customer/tickets/[id]`) filters out internal notes so they never appear on screens, in JSON responses, exports, or email notifications.

5. **Tamper-Proof Immutable Audit Log (Incident INC-0318)**:
   - Append-only event history log (`audit_events`). Every ticket creation, assignment, public reply, private note, status change, and SLA recalculation records actor name, actor type, timestamp, and metadata.
   - No `UPDATE` or `DELETE` API endpoints exist for audit records.

6. **Middle-of-Ticket Urgency Change Resolution**:
   - Addressed the unanswered meeting question: *"What happens to the timer if we change a ticket to urgent in the middle?"*
   - Implemented an elapsed-time deduction model: Net active business hours elapsed since creation are computed against the urgent SLA policy. If elapsed time exceeds 2 hours, first response SLA is immediately flagged as breached; resolution SLA snaps to the end of the current working day (or breached if already past 18:30). A full explanatory note is appended to the audit timeline.

7. **Auto-Closure and 1-Week Customer Reopening Guardrails**:
   - Auto-close qualification after 5 working days of customer inactivity.
   - Reopening window enforced: Customers can reopen a resolved ticket within 7 calendar days. Beyond 7 days, reopening is blocked and the customer is prompted to create a new ticket.

8. **Dual-Perspective Single-Screen Agent Console & Customer Help Desk**:
   - Single-screen workspace for agents with quick filters (`Already Late`, `Waiting on Customer`, `My Assigned`, `Unassigned`).
   - Integrated Customer Help Desk preview allowing reviewers to experience the customer's perspective and verify zero data leakage of internal notes.
   - Manager Analytics report answering *"Which problems were late and why?"*

---

### 2. What Was Intentionally Deferred (And Why)

#### A. WebSocket / Server-Sent Events (SSE) Live Presence
- **What was skipped:** Real-time bi-directional WebSockets showing active cursor presence (e.g., "Agent Alice is currently typing a reply on this ticket").
- **Why it was skipped:** Concurrency collision (INC-0291) is fully solved by atomic claiming and optimistic concurrency checks on the backend (HTTP 409 Conflict). A full WebSocket cluster requires stateful connections or Redis pub/sub infrastructure, which adds substantial deployment and hosting complexity without altering the transactional outcome.
- **How I would finish it:** Introduce a lightweight Server-Sent Events (SSE) channel on `/api/tickets/[id]/presence` paired with Redis key expiration (TTL 30s) to broadcast typing indicators and live assignee changes.

#### B. Cron Job Daemon for Automatic Auto-Closure Execution
- **What was skipped:** A standalone cron daemon (e.g. BullMQ, Celery, or node-cron) executing the auto-close evaluation every hour on the minute.
- **Why it was skipped:** Background cron daemons hosted on serverless platforms (such as Vercel) require separate paid Cron services or external webhooks. Instead, we implemented `qualifiesForAutoClose()` and an on-demand evaluation sweep (`db.runAutoCloseCheck()`).
- **How I would finish it:** Deploy a GitHub Action or Vercel Cron (`cron: "0 * * * *"`) pinging a secured `/api/cron/auto-close` endpoint protected by a bearer token.

#### C. Outbound Email Transport (SMTP / SendGrid / Postmark)
- **What was skipped:** Actual SMTP email dispatch delivering public replies directly to customer inboxes.
- **Why it was skipped:** External SMTP relays require dedicated domain DNS records (SPF, DKIM, DMARC) and paid third-party API keys that cannot be bundled portably in a GitHub repository test submission.
- **How I would finish it:** Implement a pluggable `EmailNotificationService` using Resend or AWS SES with transactional templates strictly wrapping public replies.

#### D. Full-Text Search Across Historical Message Archives
- **What was skipped:** Elasticsearch / PostgreSQL pg_trgm full-text indexing across 5 years of historical message archives.
- **Why it was skipped:** Arvo currently handles ~40 tickets/day (~1,200/month). For this volume, PostgreSQL indexed column queries and in-memory multi-attribute filtering run in sub-millisecond time.
- **How I would finish it:** Implement PostgreSQL `to_tsvector` and `ts_rank` search indices across ticket title, description, and message contents.

---

### 3. Summary Reflection

Every tradeoff was made consciously to ensure that the **business rules**, **SLA calculation accuracy**, **data isolation security**, and **concurrency safety** specified in Sections 3 and 4 were 100% complete, fully tested, and verifiable.
