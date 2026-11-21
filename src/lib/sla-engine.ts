import { Priority, SLAMetrics, Ticket, TicketStatus } from '../types';

export const BUSINESS_HOURS = {
  START_HOUR: 9,
  START_MINUTE: 30, // 09:30
  END_HOUR: 18,
  END_MINUTE: 30,   // 18:30
  TOTAL_MINUTES_PER_DAY: 540, // 9 hours * 60 min
};

// Known festival and public holidays for Arvo Systems (ISO YYYY-MM-DD)
export const DEFAULT_HOLIDAYS: string[] = [
  '2026-01-01', // New Year
  '2026-01-26', // Republic Day
  '2026-03-25', // Holi / Festival
  '2026-05-01', // May Day
  '2026-08-15', // Independence Day
  '2026-10-02', // Gandhi Jayanti
  '2026-10-20', // Diwali Festival
  '2026-10-21', // Diwali Day 2
  '2026-11-01', // Kerala Piravi / Regional Holiday
  '2026-12-25', // Christmas
];

export interface SLAPolicyConfig {
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

export const SLA_POLICIES: Record<Priority, SLAPolicyConfig> = {
  // Urgent: reply within 2 hours, fix same working day (1 day = 540 min)
  URGENT: {
    firstResponseMinutes: 2 * 60,       // 120 minutes (2 business hours)
    resolutionMinutes: 9 * 60,          // 540 minutes (same working day)
  },
  // Medium: reply within half a day (4.5 hours), fix in about 3 days
  MEDIUM: {
    firstResponseMinutes: 4.5 * 60,     // 270 minutes (4.5 business hours)
    resolutionMinutes: 3 * 9 * 60,      // 1620 minutes (3 business days)
  },
  // Small: reply within 1 day (9 hours), finish in about 1 week (5 working days)
  SMALL: {
    firstResponseMinutes: 9 * 60,       // 540 minutes (1 business day)
    resolutionMinutes: 5 * 9 * 60,      // 2700 minutes (5 business days)
  },
};

/**
 * Checks if a given Date is a non-working day (Saturday, Sunday, or Holiday)
 */
export function isNonWorkingDay(date: Date, holidays: string[] = DEFAULT_HOLIDAYS): boolean {
  const day = date.getDay(); // 0 is Sunday, 6 is Saturday
  if (day === 0 || day === 6) {
    return true;
  }
  const isoDate = date.toISOString().slice(0, 10);
  return holidays.includes(isoDate);
}

/**
 * Normalizes a date to start of business day (09:30)
 */
function getDayBusinessStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(BUSINESS_HOURS.START_HOUR, BUSINESS_HOURS.START_MINUTE, 0, 0);
  return d;
}

/**
 * Normalizes a date to end of business day (18:30)
 */
function getDayBusinessEnd(date: Date): Date {
  const d = new Date(date);
  d.setHours(BUSINESS_HOURS.END_HOUR, BUSINESS_HOURS.END_MINUTE, 0, 0);
  return d;
}

/**
 * Advances a date to the next available working business moment
 */
export function moveToNextBusinessStart(date: Date, holidays: string[] = DEFAULT_HOLIDAYS): Date {
  let curr = new Date(date);

  while (true) {
    if (isNonWorkingDay(curr, holidays)) {
      curr.setDate(curr.getDate() + 1);
      curr = getDayBusinessStart(curr);
      continue;
    }

    const start = getDayBusinessStart(curr);
    const end = getDayBusinessEnd(curr);

    if (curr < start) {
      return start;
    }

    if (curr >= end) {
      curr.setDate(curr.getDate() + 1);
      curr = getDayBusinessStart(curr);
      continue;
    }

    return curr;
  }
}

/**
 * Adds business minutes to a starting date, respecting 9:30-18:30 Mon-Fri and festival holidays
 */
export function addBusinessMinutes(
  startDate: Date,
  minutesToAdd: number,
  holidays: string[] = DEFAULT_HOLIDAYS
): Date {
  if (minutesToAdd <= 0) return new Date(startDate);

  let current = moveToNextBusinessStart(startDate, holidays);
  let remainingMinutes = minutesToAdd;

  while (remainingMinutes > 0) {
    const dayEnd = getDayBusinessEnd(current);
    const minutesLeftToday = (dayEnd.getTime() - current.getTime()) / (60 * 1000);

    if (remainingMinutes <= minutesLeftToday) {
      return new Date(current.getTime() + remainingMinutes * 60 * 1000);
    } else {
      remainingMinutes -= minutesLeftToday;
      // Advance to next day's start
      current.setDate(current.getDate() + 1);
      current = moveToNextBusinessStart(getDayBusinessStart(current), holidays);
    }
  }

  return current;
}

/**
 * Calculates total business minutes elapsed between two dates
 */
export function calculateBusinessMinutesElapsed(
  start: Date,
  end: Date,
  holidays: string[] = DEFAULT_HOLIDAYS
): number {
  if (end <= start) return 0;

  let current = moveToNextBusinessStart(start, holidays);
  let totalMinutes = 0;

  while (current < end) {
    if (isNonWorkingDay(current, holidays)) {
      current.setDate(current.getDate() + 1);
      current = moveToNextBusinessStart(getDayBusinessStart(current), holidays);
      continue;
    }

    const dayEnd = getDayBusinessEnd(current);
    if (end <= dayEnd) {
      totalMinutes += Math.max(0, (end.getTime() - current.getTime()) / (60 * 1000));
      break;
    } else {
      totalMinutes += Math.max(0, (dayEnd.getTime() - current.getTime()) / (60 * 1000));
      current.setDate(current.getDate() + 1);
      current = moveToNextBusinessStart(getDayBusinessStart(current), holidays);
    }
  }

  return Math.round(totalMinutes);
}

/**
 * Computes remaining business minutes between now and a target due date.
 * Returns negative if target is in the past (breached).
 */
export function calculateRemainingBusinessMinutes(
  now: Date,
  dueDate: Date,
  holidays: string[] = DEFAULT_HOLIDAYS
): number {
  if (now <= dueDate) {
    return calculateBusinessMinutesElapsed(now, dueDate, holidays);
  } else {
    return -calculateBusinessMinutesElapsed(dueDate, now, holidays);
  }
}

/**
 * Initialize SLA metrics for a newly created ticket
 */
export function initializeSLAMetrics(
  priority: Priority,
  createdAt: Date = new Date(),
  holidays: string[] = DEFAULT_HOLIDAYS
): SLAMetrics {
  const policy = SLA_POLICIES[priority];
  const firstResponseDue = addBusinessMinutes(createdAt, policy.firstResponseMinutes, holidays);
  
  let resolutionDue: Date;
  if (priority === 'URGENT') {
    // Urgent resolution is "same working day"
    const nextBiz = moveToNextBusinessStart(createdAt, holidays);
    resolutionDue = getDayBusinessEnd(nextBiz);
  } else {
    resolutionDue = addBusinessMinutes(createdAt, policy.resolutionMinutes, holidays);
  }

  const firstRemaining = calculateRemainingBusinessMinutes(createdAt, firstResponseDue, holidays);
  const resRemaining = calculateRemainingBusinessMinutes(createdAt, resolutionDue, holidays);

  return {
    firstResponseDueAt: firstResponseDue.toISOString(),
    resolutionDueAt: resolutionDue.toISOString(),
    isFirstResponseBreached: false,
    isResolutionBreached: false,
    firstResponseRemainingMinutes: firstRemaining,
    resolutionRemainingMinutes: resRemaining,
    isPaused: false,
    totalPausedBusinessMinutes: 0,
  };
}

/**
 * Recalculates SLA metrics dynamically for current time, taking pausing into account
 */
export function refreshSLAMetrics(
  ticket: Ticket,
  now: Date = new Date(),
  holidays: string[] = DEFAULT_HOLIDAYS
): SLAMetrics {
  const sla = { ...ticket.sla };

  // If already resolved or done, freeze resolution metrics
  if (ticket.status === 'DONE' || ticket.status === 'CLOSED_AUTO' || ticket.resolvedAt) {
    return sla;
  }

  const responseDue = new Date(sla.firstResponseDueAt);
  const resolutionDue = new Date(sla.resolutionDueAt);

  if (sla.isPaused) {
    // Timer is paused (Waiting on Customer). Remaining time is frozen!
    // Remaining time is whatever was left at the moment of pausing
    return sla;
  }

  // First response calculations
  if (!sla.firstRespondedAt) {
    const remaining = calculateRemainingBusinessMinutes(now, responseDue, holidays);
    sla.firstResponseRemainingMinutes = remaining;
    sla.isFirstResponseBreached = remaining < 0;
  }

  // Resolution calculations
  const resRemaining = calculateRemainingBusinessMinutes(now, resolutionDue, holidays);
  sla.resolutionRemainingMinutes = resRemaining;
  sla.isResolutionBreached = resRemaining < 0;

  return sla;
}

/**
 * Pauses SLA when ticket moves to WAITING_ON_CUSTOMER
 */
export function pauseTicketSLA(
  ticket: Ticket,
  pausedAt: Date = new Date()
): SLAMetrics {
  const sla = { ...ticket.sla };
  if (sla.isPaused) return sla;

  sla.isPaused = true;
  sla.lastPausedAt = pausedAt.toISOString();
  return sla;
}

/**
 * Resumes SLA when ticket moves out of WAITING_ON_CUSTOMER (e.g. customer replied)
 * Extends the target deadlines by the exact business duration spent waiting!
 */
export function resumeTicketSLA(
  ticket: Ticket,
  resumedAt: Date = new Date(),
  holidays: string[] = DEFAULT_HOLIDAYS
): SLAMetrics {
  const sla = { ...ticket.sla };
  if (!sla.isPaused || !sla.lastPausedAt) return sla;

  const pausedDate = new Date(sla.lastPausedAt);
  const businessMinutesPaused = calculateBusinessMinutesElapsed(pausedDate, resumedAt, holidays);

  sla.totalPausedBusinessMinutes += businessMinutesPaused;
  sla.isPaused = false;
  sla.lastPausedAt = undefined;

  // Extend deadlines forward by the paused business minutes
  if (!sla.firstRespondedAt) {
    const currentRespDue = new Date(sla.firstResponseDueAt);
    sla.firstResponseDueAt = addBusinessMinutes(currentRespDue, businessMinutesPaused, holidays).toISOString();
  }

  const currentResDue = new Date(sla.resolutionDueAt);
  sla.resolutionDueAt = addBusinessMinutes(currentResDue, businessMinutesPaused, holidays).toISOString();

  // Refresh remaining minutes
  return refreshSLAMetrics({ ...ticket, sla }, resumedAt, holidays);
}

/**
 * Handles the meeting's unanswered question:
 * "What happens to the timer if we change a ticket to urgent in the middle?"
 *
 * Rule implemented:
 * 1. Calculate business minutes already elapsed on this ticket (excluding customer wait time).
 * 2. Urgent requires 2h (120m) first response and same working day (540m) resolution.
 * 3. If elapsed >= urgent SLA allowance: Ticket is immediately due / breached.
 * 4. If elapsed < urgent SLA allowance: Ticket deadline is set to (remaining urgent allowance) from now.
 * 5. Returns new SLAMetrics and audit explanation text.
 */
export function recalculateSLAOnPriorityChange(
  ticket: Ticket,
  newPriority: Priority,
  now: Date = new Date(),
  holidays: string[] = DEFAULT_HOLIDAYS
): { updatedSLA: SLAMetrics; auditNote: string } {
  const oldPriority = ticket.priority;
  if (oldPriority === newPriority) {
    return {
      updatedSLA: ticket.sla,
      auditNote: `Priority remained ${newPriority}. No SLA adjustment required.`,
    };
  }

  const createdAt = new Date(ticket.createdAt);
  const totalBusinessElapsed = calculateBusinessMinutesElapsed(createdAt, now, holidays);
  const netActiveBusinessElapsed = Math.max(0, totalBusinessElapsed - ticket.sla.totalPausedBusinessMinutes);

  const newPolicy = SLA_POLICIES[newPriority];
  const updatedSLA = { ...ticket.sla };

  // 1. Recalculate First Response SLA if not yet responded
  if (!updatedSLA.firstRespondedAt) {
    const remainingResponseAllowance = newPolicy.firstResponseMinutes - netActiveBusinessElapsed;
    if (remainingResponseAllowance <= 0) {
      updatedSLA.firstResponseDueAt = now.toISOString();
      updatedSLA.firstResponseRemainingMinutes = remainingResponseAllowance;
      updatedSLA.isFirstResponseBreached = true;
    } else {
      const newResponseDue = addBusinessMinutes(now, remainingResponseAllowance, holidays);
      updatedSLA.firstResponseDueAt = newResponseDue.toISOString();
      updatedSLA.firstResponseRemainingMinutes = remainingResponseAllowance;
      updatedSLA.isFirstResponseBreached = false;
    }
  }

  // 2. Recalculate Resolution SLA
  if (newPriority === 'URGENT') {
    // Urgent is same working day
    const nextBiz = moveToNextBusinessStart(now, holidays);
    const endOfToday = getDayBusinessEnd(nextBiz);
    
    // If ticket has already been open for more than 1 working day (540 min), it's immediately breached
    if (netActiveBusinessElapsed >= BUSINESS_HOURS.TOTAL_MINUTES_PER_DAY || now > endOfToday) {
      updatedSLA.resolutionDueAt = now.toISOString();
      updatedSLA.resolutionRemainingMinutes = 0;
      updatedSLA.isResolutionBreached = true;
    } else {
      updatedSLA.resolutionDueAt = endOfToday.toISOString();
      const rem = calculateRemainingBusinessMinutes(now, endOfToday, holidays);
      updatedSLA.resolutionRemainingMinutes = rem;
      updatedSLA.isResolutionBreached = rem <= 0;
    }
  } else {
    const remainingResAllowance = newPolicy.resolutionMinutes - netActiveBusinessElapsed;
    if (remainingResAllowance <= 0) {
      updatedSLA.resolutionDueAt = now.toISOString();
      updatedSLA.resolutionRemainingMinutes = remainingResAllowance;
      updatedSLA.isResolutionBreached = true;
    } else {
      const newResDue = addBusinessMinutes(now, remainingResAllowance, holidays);
      updatedSLA.resolutionDueAt = newResDue.toISOString();
      updatedSLA.resolutionRemainingMinutes = remainingResAllowance;
      updatedSLA.isResolutionBreached = false;
    }
  }

  const auditNote = `Priority changed from ${oldPriority} to ${newPriority}. Net active time elapsed: ${netActiveBusinessElapsed} business minutes. Recalculated First Response due: ${updatedSLA.firstResponseDueAt}, Resolution due: ${updatedSLA.resolutionDueAt}.`;

  return { updatedSLA, auditNote };
}

/**
 * Checks if ticket qualifies for auto-close:
 * "If a customer does not reply for about one working week, we close the ticket."
 * 1 working week = 5 business days = 45 business hours = 2,700 business minutes
 */
export function qualifiesForAutoClose(
  ticket: Ticket,
  now: Date = new Date(),
  holidays: string[] = DEFAULT_HOLIDAYS
): boolean {
  if (ticket.status !== 'WAITING_ON_CUSTOMER' || !ticket.sla.lastPausedAt) {
    return false;
  }
  const pausedDate = new Date(ticket.sla.lastPausedAt);
  const pausedBusinessMinutes = calculateBusinessMinutesElapsed(pausedDate, now, holidays);
  const ONE_WORKING_WEEK_MINUTES = 5 * BUSINESS_HOURS.TOTAL_MINUTES_PER_DAY; // 2700 minutes
  return pausedBusinessMinutes >= ONE_WORKING_WEEK_MINUTES;
}

/**
 * Checks if a resolved ticket can be reopened by a customer:
 * "If a customer is unhappy after we mark a ticket as done, they should be able to open it again.
 * But only for about one week. After that it is a new ticket, not the old one."
 * 1 week = 7 calendar days
 */
export function isEligibleForReopening(
  ticket: Ticket,
  now: Date = new Date()
): { eligible: boolean; reason?: string } {
  if (ticket.status !== 'DONE' && ticket.status !== 'CLOSED_AUTO') {
    return { eligible: false, reason: 'Only resolved or completed tickets can be reopened.' };
  }

  const referenceDate = ticket.resolvedAt ? new Date(ticket.resolvedAt) : new Date(ticket.updatedAt);
  const diffMilliseconds = now.getTime() - referenceDate.getTime();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  if (diffMilliseconds > SEVEN_DAYS_MS) {
    return {
      eligible: false,
      reason: 'This ticket was marked done more than one week ago. As per Arvo policy, please submit a new ticket.',
    };
  }

  return { eligible: true };
}
