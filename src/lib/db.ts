import fs from 'fs';
import path from 'path';
import os from 'os';
import seedsData from './seeds.json';
import { Agent, AuditEvent, CustomerTicketView, Message, Priority, Ticket, TicketStatus } from '../types';
import {
  initializeSLAMetrics,
  pauseTicketSLA,
  refreshSLAMetrics,
  resumeTicketSLA,
  recalculateSLAOnPriorityChange,
  isEligibleForReopening,
  qualifiesForAutoClose,
} from './sla-engine';

// In serverless environments (Vercel, AWS Lambda), process.cwd() is read-only.
// os.tmpdir() (/tmp) is guaranteed writable.
const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'frontdesk-db.json');
const SQLITE_FILE = path.join(DATA_DIR, 'frontdesk.sqlite');

// The 9 Support Agents of Arvo Systems
export const ARVO_AGENTS: Agent[] = [
  { id: 'agent-1', name: 'Meera Patel', email: 'meera@arvo.com', role: 'SUPPORT_LEAD' },
  { id: 'agent-2', name: 'Alice Chen', email: 'alice@arvo.com', role: 'SUPPORT_AGENT' },
  { id: 'agent-3', name: 'Bob Miller', email: 'bob@arvo.com', role: 'SUPPORT_AGENT' },
  { id: 'agent-4', name: 'Charlie Davis', email: 'charlie@arvo.com', role: 'SUPPORT_AGENT' },
  { id: 'agent-5', name: 'David Kumar', email: 'david@arvo.com', role: 'SUPPORT_AGENT' },
  { id: 'agent-6', name: 'Elena Rostova', email: 'elena@arvo.com', role: 'SUPPORT_AGENT' },
  { id: 'agent-7', name: 'Farhan Ahmed', email: 'farhan@arvo.com', role: 'SUPPORT_AGENT' },
  { id: 'agent-8', name: 'Grace Hopper', email: 'grace@arvo.com', role: 'SUPPORT_AGENT' },
  { id: 'agent-9', name: 'Henry Clark', email: 'henry@arvo.com', role: 'SUPPORT_AGENT' },
];

export interface DatabaseSchema {
  agents: Agent[];
  tickets: Ticket[];
  messages: Message[];
  auditEvents: AuditEvent[];
}

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    // In restricted / read-only environments (e.g. Vercel), disk writes may fail.
    // The system continues seamlessly in-memory.
  }
}

/**
 * Loads default rich seed tickets depicting realistic real-world situations,
 * including 15 tickets (11 active, 3 late, 1 waiting on customer, 5 urgent).
 */
function createInitialSeedData(): DatabaseSchema {
  return JSON.parse(JSON.stringify(seedsData)) as DatabaseSchema;
}

class Database {
  private data: DatabaseSchema;
  private sqlite: any = null;

  constructor() {
    let loaded: DatabaseSchema | null = null;
    try {
      ensureDataDir();
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        loaded = JSON.parse(raw);
      }
    } catch (err) {
      // Fallback to fresh seed data if reading fails
    }

    if (loaded && Array.isArray(loaded.tickets) && loaded.tickets.length > 0) {
      this.data = loaded;
    } else {
      this.data = createInitialSeedData();
      this.save();
    }

    // Initialize local SQLite database
    this.initSQLite();
  }

  private initSQLite() {
    try {
      const sqlite3 = require('sqlite3');
      this.sqlite = new sqlite3.Database(SQLITE_FILE, (err: any) => {
        if (err) console.warn('SQLite connection note:', err.message);
      });

      this.sqlite.serialize(() => {
        this.sqlite.run(`
          CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            ticketNumber TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT NOT NULL,
            status TEXT NOT NULL,
            customerName TEXT NOT NULL,
            customerEmail TEXT NOT NULL,
            companyName TEXT,
            assignedToId TEXT,
            assignedToName TEXT,
            version INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            resolvedAt TEXT,
            closedAt TEXT,
            slaJson TEXT NOT NULL
          );
        `);

        this.sqlite.run(`
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            ticketId TEXT NOT NULL,
            senderType TEXT NOT NULL,
            senderId TEXT,
            senderName TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL
          );
        `);

        this.sqlite.run(`
          CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            ticketId TEXT NOT NULL,
            action TEXT NOT NULL,
            actorType TEXT NOT NULL,
            actorId TEXT,
            actorName TEXT NOT NULL,
            detailsJson TEXT NOT NULL,
            createdAt TEXT NOT NULL
          );
        `);

        // Sync initial tickets to SQLite if empty
        this.sqlite.get('SELECT count(*) as count FROM tickets', (err: any, row: any) => {
          if (!err && (!row || row.count === 0)) {
            for (const t of this.data.tickets) {
              this.sqlite.run(
                `INSERT OR REPLACE INTO tickets (
                  id, ticketNumber, title, description, priority, status,
                  customerName, customerEmail, companyName, assignedToId, assignedToName,
                  version, createdAt, updatedAt, resolvedAt, closedAt, slaJson
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  t.id, t.ticketNumber, t.title, t.description, t.priority, t.status,
                  t.customerName, t.customerEmail, t.companyName || null, t.assignedToId || null, t.assignedToName || null,
                  t.version, t.createdAt, t.updatedAt, t.resolvedAt || null, t.closedAt || null, JSON.stringify(t.sla)
                ]
              );
            }
          }
        });
      });
    } catch (err) {
      console.warn('SQLite optional fallback:', err);
    }
  }

  private save(): void {
    try {
      ensureDataDir();
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      // In serverless / read-only filesystem environments, in-memory state is preserved
    }
  }

  // --- AGENTS ---
  public getAgents(): Agent[] {
    return this.data.agents;
  }

  public getAgentById(id: string): Agent | undefined {
    return this.data.agents.find((a) => a.id === id);
  }

  // --- TICKETS ---
  public getTickets(): Ticket[] {
    const now = new Date();
    // Dynamically refresh SLA calculations in real-time
    return this.data.tickets.map((t) => ({
      ...t,
      sla: refreshSLAMetrics(t, now),
    }));
  }

  public getTicketById(id: string): Ticket | undefined {
    const ticket = this.data.tickets.find((t) => t.id === id || t.ticketNumber === id);
    if (!ticket) return undefined;

    const now = new Date();
    const refreshed = {
      ...ticket,
      sla: refreshSLAMetrics(ticket, now),
      messages: this.data.messages.filter((m) => m.ticketId === ticket.id),
      auditEvents: this.data.auditEvents
        .filter((a) => a.ticketId === ticket.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    };
    return refreshed;
  }

  /**
   * Strictly Customer-Facing View (Addresses Problem INC-0304):
   * "Private team notes must never be shown to a customer. Not on a screen.
   * Not in an API response. Not in an export. Not in a list."
   */
  public getCustomerTicketView(id: string): CustomerTicketView | undefined {
    const ticket = this.getTicketById(id);
    if (!ticket) return undefined;

    const reopenCheck = isEligibleForReopening(ticket);

    // Strictly filter out any INTERNAL_NOTE messages!
    const customerVisibleMessages = (ticket.messages || [])
      .filter((m) => m.type === 'PUBLIC_REPLY')
      .map(({ type, ...msg }) => ({
        ...msg,
        type: 'PUBLIC_REPLY' as const,
      }));

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      customerName: ticket.customerName,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
      isReopenable: reopenCheck.eligible,
      messages: customerVisibleMessages,
    };
  }

  /**
   * Concurrency Control & Atomic Claiming (Addresses Problem INC-0291):
   * "Two agents opened the same ticket. Both clicked 'take this ticket' ...
   * The spreadsheet allowed both agents to take the same ticket."
   */
  public claimTicket(
    ticketId: string,
    agentId: string,
    clientVersion?: number
  ): { success: boolean; ticket?: Ticket; error?: string } {
    const ticket = this.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const agent = this.getAgentById(agentId);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Check concurrency collision:
    if (ticket.assignedToId && ticket.assignedToId !== agentId) {
      return {
        success: false,
        error: `Conflict: This ticket was already claimed by ${ticket.assignedToName || 'another agent'}.`,
      };
    }

    // Optimistic concurrency check
    if (clientVersion !== undefined && ticket.version !== clientVersion) {
      return {
        success: false,
        error: `Concurrency Conflict: Ticket version has changed. Please refresh and try again.`,
      };
    }

    const now = new Date().toISOString();
    ticket.assignedToId = agent.id;
    ticket.assignedToName = agent.name;
    if (ticket.status === 'OPEN') {
      ticket.status = 'IN_PROGRESS';
    }
    ticket.version += 1;
    ticket.updatedAt = now;

    // Append-only immutable audit trail (Addresses INC-0318)
    this.appendAuditEvent({
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ticketId: ticket.id,
      action: 'ASSIGNED',
      actorType: 'AGENT',
      actorId: agent.id,
      actorName: agent.name,
      details: {
        assignedToId: agent.id,
        assignedToName: agent.name,
        newStatus: ticket.status,
        version: ticket.version,
      },
      createdAt: now,
    });

    if (this.sqlite) {
      try {
        this.sqlite.run(
          `UPDATE tickets SET assignedToId = ?, assignedToName = ?, status = ?, version = ?, updatedAt = ? WHERE id = ?`,
          [ticket.assignedToId, ticket.assignedToName, ticket.status, ticket.version, ticket.updatedAt, ticket.id]
        );
      } catch (err) {}
    }

    this.save();
    return { success: true, ticket: this.getTicketById(ticket.id) };
  }

  /**
   * Add a Public Reply or Internal Team Note (INC-0304 isolation)
   */
  public addMessage(params: {
    ticketId: string;
    senderType: 'AGENT' | 'CUSTOMER';
    senderId?: string;
    senderName: string;
    type: 'PUBLIC_REPLY' | 'INTERNAL_NOTE';
    content: string;
  }): { success: boolean; message?: Message; error?: string } {
    const ticket = this.data.tickets.find((t) => t.id === params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ticketId: ticket.id,
      senderType: params.senderType,
      senderId: params.senderId,
      senderName: params.senderName,
      type: params.type,
      content: params.content,
      createdAt: nowIso,
    };

    this.data.messages.push(newMessage);

    // If Agent sends first public reply, complete First Response SLA!
    if (params.senderType === 'AGENT' && params.type === 'PUBLIC_REPLY' && !ticket.sla.firstRespondedAt) {
      ticket.sla.firstRespondedAt = nowIso;
      ticket.sla.isFirstResponseBreached = now > new Date(ticket.sla.firstResponseDueAt);
    }

    // If Customer replies while ticket is WAITING_ON_CUSTOMER, resume SLA!
    if (params.senderType === 'CUSTOMER' && ticket.status === 'WAITING_ON_CUSTOMER') {
      ticket.status = 'IN_PROGRESS';
      ticket.sla = resumeTicketSLA(ticket, now);
      
      this.appendAuditEvent({
        id: `aud-${Date.now()}-resume`,
        ticketId: ticket.id,
        action: 'SLA_RESUMED',
        actorType: 'CUSTOMER',
        actorName: params.senderName,
        details: { reason: 'Customer replied, SLA countdown resumed', totalPausedMinutes: ticket.sla.totalPausedBusinessMinutes },
        createdAt: nowIso,
      });
    }

    ticket.version += 1;
    ticket.updatedAt = nowIso;

    // Log to immutable audit trail
    this.appendAuditEvent({
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ticketId: ticket.id,
      action: params.type === 'PUBLIC_REPLY' ? 'PUBLIC_REPLY_SENT' : 'INTERNAL_NOTE_ADDED',
      actorType: params.senderType,
      actorId: params.senderId,
      actorName: params.senderName,
      details: {
        isInternal: params.type === 'INTERNAL_NOTE',
        contentLength: params.content.length,
      },
      createdAt: nowIso,
    });

    if (this.sqlite) {
      try {
        this.sqlite.run(
          `INSERT OR REPLACE INTO messages (id, ticketId, senderType, senderId, senderName, type, content, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [newMessage.id, newMessage.ticketId, newMessage.senderType, newMessage.senderId || null, newMessage.senderName, newMessage.type, newMessage.content, newMessage.createdAt]
        );
        this.sqlite.run(
          `UPDATE tickets SET version = ?, updatedAt = ?, status = ?, slaJson = ? WHERE id = ?`,
          [ticket.version, ticket.updatedAt, ticket.status, JSON.stringify(ticket.sla), ticket.id]
        );
      } catch (err) {}
    }

    this.save();
    return { success: true, message: newMessage };
  }

  /**
   * Update Ticket Status (handles SLA pause/resume/completion)
   */
  public updateStatus(
    ticketId: string,
    newStatus: TicketStatus,
    actorName: string,
    actorId?: string
  ): { success: boolean; ticket?: Ticket; error?: string } {
    const ticket = this.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return { success: false, error: 'Ticket not found' };

    const oldStatus = ticket.status;
    if (oldStatus === newStatus) return { success: true, ticket };

    const now = new Date();
    const nowIso = now.toISOString();

    // Pausing behavior:
    if (newStatus === 'WAITING_ON_CUSTOMER' && oldStatus !== 'WAITING_ON_CUSTOMER') {
      ticket.sla = pauseTicketSLA(ticket, now);
      this.appendAuditEvent({
        id: `aud-${Date.now()}-pause`,
        ticketId: ticket.id,
        action: 'SLA_PAUSED',
        actorType: 'AGENT',
        actorId,
        actorName,
        details: { oldStatus, newStatus, reason: 'Waiting on customer reply' },
        createdAt: nowIso,
      });
    } else if (oldStatus === 'WAITING_ON_CUSTOMER' && newStatus !== 'WAITING_ON_CUSTOMER') {
      ticket.sla = resumeTicketSLA(ticket, now);
      this.appendAuditEvent({
        id: `aud-${Date.now()}-res`,
        ticketId: ticket.id,
        action: 'SLA_RESUMED',
        actorType: 'AGENT',
        actorId,
        actorName,
        details: { oldStatus, newStatus, totalPausedMinutes: ticket.sla.totalPausedBusinessMinutes },
        createdAt: nowIso,
      });
    }

    if (newStatus === 'DONE') {
      ticket.resolvedAt = nowIso;
      ticket.sla.resolvedAt = nowIso;
      ticket.sla.isResolutionBreached = now > new Date(ticket.sla.resolutionDueAt);
    }

    ticket.status = newStatus;
    ticket.version += 1;
    ticket.updatedAt = nowIso;

    this.appendAuditEvent({
      id: `aud-${Date.now()}-status`,
      ticketId: ticket.id,
      action: 'STATUS_CHANGED',
      actorType: 'AGENT',
      actorId,
      actorName,
      details: { oldStatus, newStatus },
      createdAt: nowIso,
    });

    if (this.sqlite) {
      try {
        this.sqlite.run(
          `UPDATE tickets SET status = ?, resolvedAt = ?, version = ?, updatedAt = ?, slaJson = ? WHERE id = ?`,
          [ticket.status, ticket.resolvedAt || null, ticket.version, ticket.updatedAt, JSON.stringify(ticket.sla), ticket.id]
        );
      } catch (err) {}
    }

    this.save();
    return { success: true, ticket: this.getTicketById(ticket.id) };
  }

  /**
   * Update Ticket Priority (handles mid-flight urgency recalculation)
   */
  public updatePriority(
    ticketId: string,
    newPriority: Priority,
    actorName: string,
    actorId?: string
  ): { success: boolean; ticket?: Ticket; error?: string } {
    const ticket = this.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return { success: false, error: 'Ticket not found' };

    const oldPriority = ticket.priority;
    if (oldPriority === newPriority) return { success: true, ticket };

    const now = new Date();
    const nowIso = now.toISOString();

    const { updatedSLA, auditNote } = recalculateSLAOnPriorityChange(ticket, newPriority, now);
    ticket.priority = newPriority;
    ticket.sla = updatedSLA;
    ticket.version += 1;
    ticket.updatedAt = nowIso;

    this.appendAuditEvent({
      id: `aud-${Date.now()}-priority`,
      ticketId: ticket.id,
      action: 'PRIORITY_CHANGED',
      actorType: 'AGENT',
      actorId,
      actorName,
      details: { oldPriority, newPriority, explanation: auditNote },
      createdAt: nowIso,
    });

    if (this.sqlite) {
      try {
        this.sqlite.run(
          `UPDATE tickets SET priority = ?, version = ?, updatedAt = ?, slaJson = ? WHERE id = ?`,
          [ticket.priority, ticket.version, ticket.updatedAt, JSON.stringify(ticket.sla), ticket.id]
        );
      } catch (err) {}
    }

    this.save();
    return { success: true, ticket: this.getTicketById(ticket.id) };
  }

  /**
   * Customer Reopening Ticket within 7-day grace window
   */
  public customerReopenTicket(
    ticketId: string,
    reason: string,
    customerName: string
  ): { success: boolean; ticket?: Ticket; error?: string } {
    const ticket = this.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return { success: false, error: 'Ticket not found' };

    const eligibility = isEligibleForReopening(ticket);
    if (!eligibility.eligible) {
      return { success: false, error: eligibility.reason };
    }

    const now = new Date();
    const nowIso = now.toISOString();

    ticket.status = 'IN_PROGRESS';
    ticket.resolvedAt = undefined;
    ticket.sla.resolvedAt = undefined;
    ticket.version += 1;
    ticket.updatedAt = nowIso;

    const reopenMessage: Message = {
      id: `msg-${Date.now()}-reopen`,
      ticketId: ticket.id,
      senderType: 'CUSTOMER',
      senderName: customerName,
      type: 'PUBLIC_REPLY',
      content: `[Ticket Reopened by Customer]: ${reason}`,
      createdAt: nowIso,
    };
    this.data.messages.push(reopenMessage);

    this.appendAuditEvent({
      id: `aud-${Date.now()}-reopen`,
      ticketId: ticket.id,
      action: 'REOPENED',
      actorType: 'CUSTOMER',
      actorName: customerName,
      details: { reason },
      createdAt: nowIso,
    });

    if (this.sqlite) {
      try {
        this.sqlite.run(
          `UPDATE tickets SET status = 'IN_PROGRESS', resolvedAt = NULL, version = ?, updatedAt = ? WHERE id = ?`,
          [ticket.version, ticket.updatedAt, ticket.id]
        );
        this.sqlite.run(
          `INSERT OR REPLACE INTO messages (id, ticketId, senderType, senderName, type, content, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [reopenMessage.id, reopenMessage.ticketId, reopenMessage.senderType, reopenMessage.senderName, reopenMessage.type, reopenMessage.content, reopenMessage.createdAt]
        );
      } catch (err) {}
    }

    this.save();
    return { success: true, ticket: this.getTicketById(ticket.id) };
  }

  /**
   * Create a new ticket (customer or agent initiated)
   * Stored in memory, JSON persistence, and local SQLite database!
   */
  public createTicket(params: {
    title: string;
    description: string;
    priority: Priority;
    customerName: string;
    customerEmail: string;
    companyName?: string;
    actorType?: 'CUSTOMER' | 'AGENT';
    actorName?: string;
  }): Ticket {
    const now = new Date();
    const count = this.data.tickets.length + 340; // Continuous sequence INC-0340...
    const ticketNumber = `INC-0${count}`;

    const newTicket: Ticket = {
      id: `ticket-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ticketNumber,
      title: params.title,
      description: params.description,
      priority: params.priority,
      status: 'OPEN',
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      companyName: params.companyName,
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      sla: initializeSLAMetrics(params.priority, now),
    };

    this.data.tickets.unshift(newTicket);

    const createAuditEvent: AuditEvent = {
      id: `aud-${Date.now()}-create`,
      ticketId: newTicket.id,
      action: 'TICKET_CREATED',
      actorType: params.actorType || 'CUSTOMER',
      actorName: params.actorName || params.customerName,
      details: { priority: params.priority, title: params.title },
      createdAt: now.toISOString(),
    };
    this.appendAuditEvent(createAuditEvent);

    // Save to local SQLite database
    if (this.sqlite) {
      try {
        this.sqlite.run(
          `INSERT OR REPLACE INTO tickets (
            id, ticketNumber, title, description, priority, status,
            customerName, customerEmail, companyName, version, createdAt, updatedAt, slaJson
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newTicket.id, newTicket.ticketNumber, newTicket.title, newTicket.description,
            newTicket.priority, newTicket.status, newTicket.customerName, newTicket.customerEmail,
            newTicket.companyName || null, newTicket.version, newTicket.createdAt, newTicket.updatedAt,
            JSON.stringify(newTicket.sla)
          ]
        );
      } catch (err) {
        console.warn('SQLite insert warning:', err);
      }
    }

    this.save();
    return newTicket;
  }

  /**
   * Immutable Audit Log Appender (INC-0318)
   * Guaranteed append-only: no updates or deletions are ever exposed!
   */
  private appendAuditEvent(event: AuditEvent): void {
    this.data.auditEvents.push(event);

    if (this.sqlite) {
      try {
        this.sqlite.run(
          `INSERT OR REPLACE INTO audit_events (id, ticketId, action, actorType, actorId, actorName, detailsJson, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            event.id, event.ticketId, event.action, event.actorType,
            event.actorId || null, event.actorName, JSON.stringify(event.details), event.createdAt
          ]
        );
      } catch (err) {}
    }
  }

  /**
   * Auto-close tickets that have been waiting on customer for >= 1 working week
   */
  public runAutoCloseCheck(): number {
    const now = new Date();
    let closedCount = 0;

    for (const ticket of this.data.tickets) {
      if (qualifiesForAutoClose(ticket, now)) {
        ticket.status = 'CLOSED_AUTO';
        ticket.closedAt = now.toISOString();
        ticket.version += 1;
        ticket.updatedAt = now.toISOString();

        this.appendAuditEvent({
          id: `aud-${Date.now()}-autoclose`,
          ticketId: ticket.id,
          action: 'AUTO_CLOSED',
          actorType: 'SYSTEM',
          actorName: 'Frontdesk Auto-Closer',
          details: { reason: 'No customer reply for 1 working week (5 business days)' },
          createdAt: now.toISOString(),
        });
        closedCount += 1;
      }
    }

    if (closedCount > 0) {
      this.save();
    }
    return closedCount;
  }
}

// Singleton database instance preserved across serverless invocations
const globalForDb = globalThis as unknown as { dbInstance?: Database };
export const db = globalForDb.dbInstance ?? new Database();
globalForDb.dbInstance = db;
