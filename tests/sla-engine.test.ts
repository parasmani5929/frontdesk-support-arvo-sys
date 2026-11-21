import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isNonWorkingDay,
  addBusinessMinutes,
  calculateBusinessMinutesElapsed,
  calculateRemainingBusinessMinutes,
  initializeSLAMetrics,
  pauseTicketSLA,
  resumeTicketSLA,
  recalculateSLAOnPriorityChange,
  isEligibleForReopening,
  qualifiesForAutoClose,
} from '../src/lib/sla-engine';
import { Ticket } from '../src/types';

describe('SLA Engine & Working Hours Rules (Arvo Systems)', () => {
  // Test scenario 1 from Meera's exact words:
  // "If a ticket arrives at 6 PM on Friday, it should not be late on Sunday morning. Right now our spreadsheet says it is late."
  test('Friday 6:00 PM ticket is NOT late on Sunday morning', () => {
    // Friday Oct 16, 2026 at 18:00 (6:00 PM)
    // Friday working hours end at 18:30 (30 min remaining on Friday)
    const friday6PM = new Date('2026-10-16T18:00:00');
    // Sunday Oct 18, 2026 at 10:00 AM
    const sundayMorning = new Date('2026-10-18T10:00:00');

    // Create an Urgent ticket at Friday 6 PM (First response SLA: 2 hours = 120 minutes)
    const sla = initializeSLAMetrics('URGENT', friday6PM);
    const responseDueDate = new Date(sla.firstResponseDueAt);

    // Business minutes elapsed between Friday 6 PM and Sunday morning:
    // Only 30 business minutes were consumed on Friday (18:00 to 18:30).
    // Saturday and Sunday consume ZERO business minutes!
    const businessMinutesElapsed = calculateBusinessMinutesElapsed(friday6PM, sundayMorning);
    assert.strictEqual(businessMinutesElapsed, 30, 'Should only elapse 30 business minutes over the weekend');

    // On Sunday morning, 90 business minutes are still remaining before breach!
    const remainingOnSunday = calculateRemainingBusinessMinutes(sundayMorning, responseDueDate);
    assert.ok(remainingOnSunday > 0, 'Must have positive remaining time on Sunday morning');
    assert.strictEqual(remainingOnSunday, 90, 'Should have exactly 90 business minutes remaining (due Monday 11:00 AM)');

    // Due date should be Monday Oct 19, 2026 at 11:00 AM (09:30 + 90 min)
    assert.strictEqual(responseDueDate.getDay(), 1, 'Due date must be on Monday');
    assert.strictEqual(responseDueDate.getHours(), 11, 'Due date hour must be 11:00 AM');
    assert.strictEqual(responseDueDate.getMinutes(), 0, 'Due date minute must be 00');
  });

  test('Urgent SLA: 2 hours reply, same working day resolution', () => {
    // Wednesday Oct 14, 2026 at 10:00 AM
    const wednesday10AM = new Date('2026-10-14T10:00:00');
    const sla = initializeSLAMetrics('URGENT', wednesday10AM);

    const firstResponseDue = new Date(sla.firstResponseDueAt);
    const resolutionDue = new Date(sla.resolutionDueAt);

    // First response should be due at 12:00 PM (2 business hours)
    assert.strictEqual(firstResponseDue.getHours(), 12);
    assert.strictEqual(firstResponseDue.getMinutes(), 0);

    // Resolution should be due at 18:30 (same working day)
    assert.strictEqual(resolutionDue.getHours(), 18);
    assert.strictEqual(resolutionDue.getMinutes(), 30);
  });

  test('Medium SLA: 4.5 hours reply, 3 working days resolution', () => {
    // Tuesday Oct 13, 2026 at 10:00 AM
    const tuesday10AM = new Date('2026-10-13T10:00:00');
    const sla = initializeSLAMetrics('MEDIUM', tuesday10AM);

    const firstResponseDue = new Date(sla.firstResponseDueAt);
    const resolutionDue = new Date(sla.resolutionDueAt);

    // First response: 4.5 hours from 10:00 AM -> 14:30 (2:30 PM)
    assert.strictEqual(firstResponseDue.getHours(), 14);
    assert.strictEqual(firstResponseDue.getMinutes(), 30);

    // Resolution: 3 working days (27 business hours) from Tuesday 10:00 AM -> Friday 10:00 AM
    assert.strictEqual(resolutionDue.getDay(), 5, 'Should be due Friday');
    assert.strictEqual(resolutionDue.getHours(), 10);
    assert.strictEqual(resolutionDue.getMinutes(), 0);
  });

  test('Small SLA: 1 working day reply, 5 working days (1 week) resolution', () => {
    // Monday Oct 12, 2026 at 10:00 AM
    const monday10AM = new Date('2026-10-12T10:00:00');
    const sla = initializeSLAMetrics('SMALL', monday10AM);

    const firstResponseDue = new Date(sla.firstResponseDueAt);
    const resolutionDue = new Date(sla.resolutionDueAt);

    // 1 working day = 9 business hours -> Tuesday 10:00 AM
    assert.strictEqual(firstResponseDue.getDay(), 2);
    assert.strictEqual(firstResponseDue.getHours(), 10);

    // 5 working days = next Monday 10:00 AM
    assert.strictEqual(resolutionDue.getDay(), 1);
    assert.strictEqual(resolutionDue.getHours(), 10);
  });

  test('SLA Pausing: Waiting on customer does NOT count against agents', () => {
    const monday10AM = new Date('2026-10-12T10:00:00');
    const initialSla = initializeSLAMetrics('MEDIUM', monday10AM);

    const ticket: Ticket = {
      id: 'test-1',
      ticketNumber: 'INC-TEST',
      title: 'Database connection issue',
      description: 'Customer needs help',
      priority: 'MEDIUM',
      status: 'OPEN',
      customerName: 'Acme Corp',
      customerEmail: 'admin@acme.com',
      version: 1,
      createdAt: monday10AM.toISOString(),
      updatedAt: monday10AM.toISOString(),
      sla: initialSla,
    };

    // Agent asks a question on Monday at 12:00 PM and moves to WAITING_ON_CUSTOMER
    const mondayNoon = new Date('2026-10-12T12:00:00');
    const pausedSla = pauseTicketSLA(ticket, mondayNoon);
    assert.strictEqual(pausedSla.isPaused, true);

    // Customer takes 2 whole working days to reply (Resumes Wednesday 12:00 PM)
    const wednesdayNoon = new Date('2026-10-14T12:00:00');
    const originalResolutionDue = new Date(initialSla.resolutionDueAt);

    const resumedTicket = { ...ticket, sla: pausedSla };
    const resumedSla = resumeTicketSLA(resumedTicket, wednesdayNoon);

    assert.strictEqual(resumedSla.isPaused, false);
    // 2 working days = 2 * 540 = 1080 business minutes paused
    assert.strictEqual(resumedSla.totalPausedBusinessMinutes, 1080);

    // The resolution due date was Thursday Oct 15 10:00 AM (3 working days from Mon 10 AM).
    // Adding 2 working days (Thu -> Fri -> Mon) skips the weekend and lands on Monday Oct 19 10:00 AM!
    const newResolutionDue = new Date(resumedSla.resolutionDueAt);
    assert.strictEqual(newResolutionDue.getDay(), 1, 'New due date should be on Monday (skipping Saturday and Sunday)');
    assert.strictEqual(newResolutionDue.getHours(), 10, 'Hour should remain 10:00 AM');

    const businessMinutesBetween = calculateBusinessMinutesElapsed(originalResolutionDue, newResolutionDue);
    assert.strictEqual(businessMinutesBetween, 1080, 'Business time between old and new deadline must equal exactly 2 working days (1080 mins)');
  });

  test('Auto-Close: Qualifies after 1 working week of no customer reply', () => {
    const monday10AM = new Date('2026-10-12T10:00:00');
    const ticket: Ticket = {
      id: 'test-2',
      ticketNumber: 'INC-AUTO',
      title: 'Stale ticket',
      description: 'Waiting',
      priority: 'SMALL',
      status: 'WAITING_ON_CUSTOMER',
      customerName: 'Inactive Customer',
      customerEmail: 'inactive@example.com',
      version: 1,
      createdAt: monday10AM.toISOString(),
      updatedAt: monday10AM.toISOString(),
      sla: {
        ...initializeSLAMetrics('SMALL', monday10AM),
        isPaused: true,
        lastPausedAt: monday10AM.toISOString(),
      },
    };

    // 3 days later (Thursday 10 AM) -> Does NOT qualify
    const thursday10AM = new Date('2026-10-15T10:00:00');
    assert.strictEqual(qualifiesForAutoClose(ticket, thursday10AM), false);

    // 1 working week later (Next Monday 10 AM, 5 business days) -> Qualifies!
    const nextMonday10AM = new Date('2026-10-19T10:00:00');
    assert.strictEqual(qualifiesForAutoClose(ticket, nextMonday10AM), true);
  });

  test('Customer Reopen Rule: Allowed within 7 days, rejected after 7 days', () => {
    const resolvedDate = new Date('2026-10-10T12:00:00');
    const ticket: Ticket = {
      id: 'test-3',
      ticketNumber: 'INC-REOPEN',
      title: 'Resolved issue',
      description: 'Fixed',
      priority: 'MEDIUM',
      status: 'DONE',
      customerName: 'Test',
      customerEmail: 'test@example.com',
      version: 1,
      createdAt: '2026-10-09T10:00:00',
      updatedAt: resolvedDate.toISOString(),
      resolvedAt: resolvedDate.toISOString(),
      sla: initializeSLAMetrics('MEDIUM', resolvedDate),
    };

    // 4 days later -> Eligible to reopen
    const day4 = new Date('2026-10-14T12:00:00');
    assert.strictEqual(isEligibleForReopening(ticket, day4).eligible, true);

    // 8 days later -> NOT eligible
    const day8 = new Date('2026-10-18T13:00:00');
    const result = isEligibleForReopening(ticket, day8);
    assert.strictEqual(result.eligible, false);
    assert.ok(result.reason?.includes('more than one week ago'));
  });

  test('Meeting Question: Escalating to Urgent mid-flight recalculates fairly', () => {
    // Ticket created as SMALL on Monday 10:00 AM
    const monday10AM = new Date('2026-10-12T10:00:00');
    const initialSla = initializeSLAMetrics('SMALL', monday10AM);

    const ticket: Ticket = {
      id: 'test-4',
      ticketNumber: 'INC-ESCALATE',
      title: 'Was small, now critical outage',
      description: 'System down',
      priority: 'SMALL',
      status: 'OPEN',
      customerName: 'VIP Customer',
      customerEmail: 'vip@example.com',
      version: 1,
      createdAt: monday10AM.toISOString(),
      updatedAt: monday10AM.toISOString(),
      sla: initialSla,
    };

    // 3 hours later (Monday 13:00 / 1:00 PM), customer calls screaming: Escalated to URGENT!
    const monday1PM = new Date('2026-10-12T13:00:00');
    const { updatedSLA, auditNote } = recalculateSLAOnPriorityChange(ticket, 'URGENT', monday1PM);

    // Net active elapsed was 180 minutes (3 hours).
    // Urgent first response SLA is 120 minutes (2 hours).
    // Because 180m > 120m, First Response SLA is immediately flagged as breached!
    assert.strictEqual(updatedSLA.isFirstResponseBreached, true);
    assert.ok(updatedSLA.firstResponseRemainingMinutes < 0);

    // Resolution target is set to same working day (18:30 today)
    const newResDue = new Date(updatedSLA.resolutionDueAt);
    assert.strictEqual(newResDue.getHours(), 18);
    assert.strictEqual(newResDue.getMinutes(), 30);
    assert.ok(auditNote.includes('Priority changed from SMALL to URGENT'));
  });
});
