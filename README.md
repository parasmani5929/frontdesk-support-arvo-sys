# Frontdesk — Enterprise Support Platform

> **Built for Arvo Systems** to replace shared spreadsheets and WhatsApp groups with a real-time support system featuring a working-hours SLA engine, concurrency controls, private note isolation, and tamper-proof audit trails.

---

## 1. System Overview & The Story Behind Frontdesk

Arvo Systems employs **nine support agents** handling approximately **forty customer problems each day**. Previously, the team managed operations using a shared spreadsheet and a WhatsApp group. 

This ad-hoc setup broke down as the team scaled:
- **No Working-Hours SLA Engine:** The spreadsheet counted all clock hours, falsely marking tickets submitted on Friday evening as overdue on Sunday morning.
- **Lost History & Root Cause Blindness:** When managers asked which problems were late and why, nobody could answer because the spreadsheet only displayed current state without historical records.
- **Race Conditions (Incident INC-0291):** Two agents clicked "take this ticket" simultaneously and sent contradictory replies to the same customer.
- **Data Leaks (Incident INC-0304):** A private internal team note containing sensitive customer-handling instructions leaked to a customer.
- **Disputed Timelines (Incident INC-0318):** A customer disputed a 40-minute response time, claiming Arvo didn't reply until next morning, with no verifiable proof.

**Frontdesk** was engineered to solve every single one of these operational failures.

---

## 2. Business Rules & SLA Engine Specifications

### 2.1 Working Schedule & Calendar
- **Active Hours:** Monday to Friday, **09:30 AM to 6:30 PM (18:30)** (9.0 working hours / 540 minutes per day).
- **Non-Working Time:** All Saturdays, Sundays, and official festival holidays consume **zero business minutes**.
- **The Friday 6:00 PM Rule:** A ticket created on Friday at 18:00 has only 30 minutes consumed by Friday's close (18:30). Over the weekend, the SLA clock halts completely. On Sunday morning, the ticket is **NOT late**; the countdown resumes Monday at 09:30 AM.

### 2.2 Severity Tiers & Targets
| Severity Tier | First Response Target | Resolution Target |
| :--- | :--- | :--- |
| **URGENT** ("Customer cannot work at all") | **2 working hours** (120 business mins) | **Same working day** (by 18:30) |
| **MEDIUM** (Standard problem) | **Half a day** (4.5 working hours / 270 mins) | **3 working days** (27 business hours) |
| **SMALL** (Question / Minor request) | **1 working day** (9 working hours / 540 mins) | **1 working week** (5 working days / 45 hours) |

### 2.3 SLA Pausing ("Waiting on Customer")
- When an agent requests clarification and shifts ticket status to `WAITING_ON_CUSTOMER`, the SLA timer is **PAUSED**.
- The elapsed waiting duration is tracked separately and does not count against Arvo support agents.
- When the customer submits a reply, the status transitions back to `IN_PROGRESS` and the deadline is dynamically extended by the exact business duration spent waiting.

### 2.4 Auto-Closure Policy
- If a ticket remains in `WAITING_ON_CUSTOMER` for **1 working week (5 business days / 45 working hours)** without a customer reply, it automatically qualifies for closure (`CLOSED_AUTO`).

### 2.5 1-Week Customer Reopen Window
- If a customer is unsatisfied after a ticket is marked `DONE`, they can reopen it within **1 week (7 calendar days)**.
- After 7 days, reopening is permanently locked, and the customer is required to submit a new ticket.

### 2.6 Mid-Flight Urgency Escalation (Meeting Question Resolved)
> *"What happens to the timer if we change a ticket to urgent in the middle? Nobody knew the answer. We moved to the next topic."*

**Our Implemented Solution:**
When a ticket is escalated to `URGENT`:
1. The net active business time already elapsed ($T_{active} = T_{total} - T_{paused}$) is computed.
2. If $T_{active} \ge 120$ minutes, First Response is immediately marked **BREACHED (0 minutes remaining)**. If $T_{active} < 120$ mins, the remaining response allowance is granted from the current time.
3. Resolution deadline is snapped to the end of the current working day (18:30), or flagged as breached if today's business day has already ended.
4. An immutable audit record is logged with an explanation of the recalculated deadlines.

---

## 3. Solutions to the Problem Reports

### 3.1 INC-0291: Concurrency Control & Double Assignment Prevention
- **Mechanism:** Optimistic locking via integer `version` tracking and atomic database assignment.
- When Agent A claims a ticket, `version` is incremented.
- If Agent B attempts to claim the same ticket concurrently, the query fails with **HTTP 409 Conflict**:
  `"Conflict: This ticket was already claimed by Agent Alice Chen."`
- Real-time collision alerts in the UI notify agents when a colleague is actively assigned to avoid duplicate work.

### 3.2 INC-0304: Zero-Trust Private Note Isolation
- **Mechanism:** Strict architectural separation between public customer messages (`PUBLIC_REPLY`) and team-only notes (`INTERNAL_NOTE`).
- **Database Query Filtering:** The customer API endpoint (`/api/customer/tickets/[id]`) physically filters out `INTERNAL_NOTE` records at the database level.
- **Serialization Sanitizer:** Internal notes are physically excluded from customer screens, API payloads, exports, and customer lists.
- **High-Contrast Agent UI:** Internal notes in the agent console are rendered in prominent amber warning cards with a padlock icon (`🔒 INTERNAL TEAM NOTE • HIDDEN FROM CUSTOMER`).

### 3.3 INC-0318: Tamper-Proof Immutable Audit Log
- **Mechanism:** Append-only event store (`audit_events`).
- Every lifecycle event (Ticket Created, Claimed, Public Reply, Internal Note, SLA Paused, SLA Resumed, Status Changed, Priority Changed, Reopened) is logged with:
  - Immutable ISO timestamp (accurate to the millisecond)
  - Actor Name and Actor Type (`AGENT`, `CUSTOMER`, `SYSTEM`)
  - Detailed metadata payload (before/after state)
- No `UPDATE` or `DELETE` operations are permitted on audit records.

---

## 4. Tech Stack & Architecture

- **Frontend:** Next.js 14 (React 18), TypeScript, Tailwind CSS, Lucide Icons
- **Backend:** Next.js App Router API Routes, Zod schema validation
- **Database:** PostgreSQL compatible (via `pg` driver) with zero-config local JSON persistence fallback for instant local evaluation without requiring external database setup
- **Testing:** Node.js native test runner (`node:test`) + `tsx` with comprehensive test suites

---

## 5. Getting Started Locally

### Prerequisites
- Node.js (v18.17+ or v20+)
- npm (v9+)

### Installation & Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/parasmani5929/frontdesk-support-arvo-sys.git
   cd frontdesk-support-arvo-sys
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open in your browser:**
   ```
   http://localhost:3000
   ```

The application starts immediately with pre-seeded data including the 9 Arvo support agents, test cases for the 3 incident reports, and demonstrator tickets.

---

## 6. Running the Automated Test Suites

Frontdesk includes 11 automated test cases verifying all business hours arithmetic, weekend skips, SLA pausing, concurrency locks, data isolation, and audit trail immutability.

Run all tests:
```bash
npx tsx tests/sla-engine.test.ts
npx tsx tests/db-concurrency-and-security.test.ts
```

### Verified Test Cases:
1. `Friday 6:00 PM ticket is NOT late on Sunday morning` (Section 3 rule)
2. `Urgent SLA: 2 hours reply, same working day resolution`
3. `Medium SLA: 4.5 hours reply, 3 working days resolution`
4. `Small SLA: 1 working day reply, 5 working days resolution`
5. `SLA Pausing: Waiting on customer does NOT count against agents`
6. `Auto-Close: Qualifies after 1 working week of customer inactivity`
7. `Customer Reopen Rule: Allowed within 7 days, rejected after 7 days`
8. `Mid-flight Urgency escalation recalculates remaining allowance fairly`
9. `INC-0291: Concurrency control blocks two agents from claiming same ticket`
10. `INC-0304: Private team notes are NEVER returned in customer views/APIs`
11. `INC-0318: Immutable audit trail records actor, action, and timestamp`

---

## 7. Submission Note

Please refer to [`SUBMISSION_NOTE.md`](file:///c:/Users/paras/OneDrive/Desktop/iNav/SUBMISSION_NOTE.md) for the answer to the prompt question:
> *"What did you not finish, and why? Running out of time is normal. Not knowing what you skipped is not."*
