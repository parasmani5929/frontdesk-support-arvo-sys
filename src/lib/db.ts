import fs from 'fs';
import path from 'path';
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

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

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
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Generates initial rich seed tickets depicting realistic real-world situations,
 * including the 3 incidents from Section 4 of the problem description.
 */
function createInitialSeedData(): DatabaseSchema {
  const now = new Date();
  
  // Incident 4.1 from October 14:
  // INC-0291: Two agents clicked take ticket concurrently
  const inc291Date = '2026-10-14T10:15:00.000Z';
  const inc291Ticket: Ticket = {
    id: 'inc-0291',
    ticketNumber: 'INC-0291',
    title: 'SSO Login failing for Enterprise workspace',
    description: 'Our users cannot log in via Okta SAML. Getting 500 error code on callback.',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    customerName: 'Fintech Cloud Corp',
    customerEmail: 'it-sec@fintechcloud.com',
    companyName: 'Fintech Cloud Corp',
    assignedToId: 'agent-2',
    assignedToName: 'Alice Chen',
    version: 2,
    createdAt: inc291Date,
    updatedAt: '2026-10-14T10:20:00.000Z',
    sla: {
      ...initializeSLAMetrics('URGENT', new Date(inc291Date)),
      firstRespondedAt: '2026-10-14T10:20:00.000Z',
    },
  };

  const inc291Messages: Message[] = [
    {
      id: 'm-291-1',
      ticketId: 'inc-0291',
      senderType: 'AGENT',
      senderId: 'agent-2',
      senderName: 'Alice Chen',
      type: 'PUBLIC_REPLY',
      content: 'Hello, we are investigating the Okta SAML certificate rotation right now. Will update shortly.',
      createdAt: '2026-10-14T10:20:00.000Z',
    },
    {
      id: 'm-291-2',
      ticketId: 'inc-0291',
      senderType: 'AGENT',
      senderId: 'agent-2',
      senderName: 'Alice Chen',
      type: 'INTERNAL_NOTE',
      content: 'Note for Meera: Checked the IdP metadata XML, cert expired at midnight. Updating keystore.',
      createdAt: '2026-10-14T10:25:00.000Z',
    },
  ];

  const inc291Audit: AuditEvent[] = [
    {
      id: 'aud-291-1',
      ticketId: 'inc-0291',
      action: 'TICKET_CREATED',
      actorType: 'CUSTOMER',
      actorName: 'Fintech Cloud Corp',
      details: { priority: 'URGENT' },
      createdAt: inc291Date,
    },
    {
      id: 'aud-291-2',
      ticketId: 'inc-0291',
      action: 'ASSIGNED',
      actorType: 'AGENT',
      actorId: 'agent-2',
      actorName: 'Alice Chen',
      details: { assignedTo: 'Alice Chen', note: 'Claimed via Frontdesk Concurrency Lock' },
      createdAt: '2026-10-14T10:18:00.000Z',
    },
    {
      id: 'aud-291-3',
      ticketId: 'inc-0291',
      action: 'PUBLIC_REPLY_SENT',
      actorType: 'AGENT',
      actorId: 'agent-2',
      actorName: 'Alice Chen',
      details: { replyLength: 95 },
      createdAt: '2026-10-14T10:20:00.000Z',
    },
    {
      id: 'aud-291-4',
      ticketId: 'inc-0291',
      action: 'INTERNAL_NOTE_ADDED',
      actorType: 'AGENT',
      actorId: 'agent-2',
      actorName: 'Alice Chen',
      details: { isInternal: true },
      createdAt: '2026-10-14T10:25:00.000Z',
    },
  ];

  // Incident 4.2 from October 22:
  // INC-0304: Private note handling demonstration
  const inc304Date = '2026-10-22T14:00:00.000Z';
  const inc304Ticket: Ticket = {
    id: 'inc-0304',
    ticketNumber: 'INC-0304',
    title: 'Custom export formatting request',
    description: 'We need CSV reports in European comma-separated format with specific date layout.',
    priority: 'MEDIUM',
    status: 'IN_PROGRESS',
    customerName: 'Global Logistics KG',
    customerEmail: 'klaus@globallogistics.de',
    companyName: 'Global Logistics KG',
    assignedToId: 'agent-3',
    assignedToName: 'Bob Miller',
    version: 2,
    createdAt: inc304Date,
    updatedAt: '2026-10-22T14:30:00.000Z',
    sla: {
      ...initializeSLAMetrics('MEDIUM', new Date(inc304Date)),
      firstRespondedAt: '2026-10-22T14:30:00.000Z',
    },
  };

  const inc304Messages: Message[] = [
    {
      id: 'm-304-1',
      ticketId: 'inc-0304',
      senderType: 'AGENT',
      senderId: 'agent-3',
      senderName: 'Bob Miller',
      type: 'INTERNAL_NOTE',
      content: 'CONFIDENTIAL TEAM NOTE: Customer is threatening churn if not resolved by Friday. Escalated to Meera and engineering team.',
      createdAt: '2026-10-22T14:15:00.000Z',
    },
    {
      id: 'm-304-2',
      ticketId: 'inc-0304',
      senderType: 'AGENT',
      senderId: 'agent-3',
      senderName: 'Bob Miller',
      type: 'PUBLIC_REPLY',
      content: 'Hello Klaus, thank you for reaching out. We have queued the custom locale formatter for our upcoming sprint and will deliver the patch this week.',
      createdAt: '2026-10-22T14:30:00.000Z',
    },
  ];

  const inc304Audit: AuditEvent[] = [
    {
      id: 'aud-304-1',
      ticketId: 'inc-0304',
      action: 'TICKET_CREATED',
      actorType: 'CUSTOMER',
      actorName: 'Global Logistics KG',
      details: { priority: 'MEDIUM' },
      createdAt: inc304Date,
    },
    {
      id: 'aud-304-2',
      ticketId: 'inc-0304',
      action: 'ASSIGNED',
      actorType: 'AGENT',
      actorId: 'agent-3',
      actorName: 'Bob Miller',
      details: { assignedTo: 'Bob Miller' },
      createdAt: '2026-10-22T14:10:00.000Z',
    },
    {
      id: 'aud-304-3',
      ticketId: 'inc-0304',
      action: 'INTERNAL_NOTE_ADDED',
      actorType: 'AGENT',
      actorId: 'agent-3',
      actorName: 'Bob Miller',
      details: { isInternal: true },
      createdAt: '2026-10-22T14:15:00.000Z',
    },
    {
      id: 'aud-304-4',
      ticketId: 'inc-0304',
      action: 'PUBLIC_REPLY_SENT',
      actorType: 'AGENT',
      actorId: 'agent-3',
      actorName: 'Bob Miller',
      details: { replyLength: 145 },
      createdAt: '2026-10-22T14:30:00.000Z',
    },
  ];

  // Incident 4.3 from November 04:
  // INC-0318: Dispute solved by immutable audit log
  const inc318Date = '2026-11-04T16:00:00.000Z';
  const inc318Ticket: Ticket = {
    id: 'inc-0318',
    ticketNumber: 'INC-0318',
    title: 'Webhook deliveries timing out intermittently',
    description: 'Webhooks to our production server timed out between 3:45 PM and 4:00 PM.',
    priority: 'MEDIUM',
    status: 'DONE',
    customerName: 'Apex Data Inc',
    customerEmail: 'ops@apexdata.io',
    companyName: 'Apex Data Inc',
    assignedToId: 'agent-1',
    assignedToName: 'Meera Patel',
    version: 3,
    createdAt: inc318Date,
    updatedAt: '2026-11-04T16:40:00.000Z',
    resolvedAt: '2026-11-04T16:40:00.000Z',
    sla: {
      ...initializeSLAMetrics('MEDIUM', new Date(inc318Date)),
      firstRespondedAt: '2026-11-04T16:40:00.000Z',
      resolvedAt: '2026-11-04T16:40:00.000Z',
    },
  };

  const inc318Messages: Message[] = [
    {
      id: 'm-318-1',
      ticketId: 'inc-0318',
      senderType: 'AGENT',
      senderId: 'agent-1',
      senderName: 'Meera Patel',
      type: 'PUBLIC_REPLY',
      content: 'Confirmed webhook queue backlog cleared at 16:38 UTC. All pending events redelivered successfully.',
      createdAt: '2026-11-04T16:40:00.000Z',
    },
  ];

  const inc318Audit: AuditEvent[] = [
    {
      id: 'aud-318-1',
      ticketId: 'inc-0318',
      action: 'TICKET_CREATED',
      actorType: 'CUSTOMER',
      actorName: 'Apex Data Inc',
      details: { priority: 'MEDIUM' },
      createdAt: inc318Date,
    },
    {
      id: 'aud-318-2',
      ticketId: 'inc-0318',
      action: 'ASSIGNED',
      actorType: 'AGENT',
      actorId: 'agent-1',
      actorName: 'Meera Patel',
      details: { assignedTo: 'Meera Patel' },
      createdAt: '2026-11-04T16:05:00.000Z',
    },
    {
      id: 'aud-318-3',
      ticketId: 'inc-0318',
      action: 'PUBLIC_REPLY_SENT',
      actorType: 'AGENT',
      actorId: 'agent-1',
      actorName: 'Meera Patel',
      details: { responseTimeMinutes: 40, verifiedTimestamp: '2026-11-04T16:40:00.000Z' },
      createdAt: '2026-11-04T16:40:00.000Z',
    },
    {
      id: 'aud-318-4',
      ticketId: 'inc-0318',
      action: 'STATUS_CHANGED',
      actorType: 'AGENT',
      actorId: 'agent-1',
      actorName: 'Meera Patel',
      details: { oldStatus: 'IN_PROGRESS', newStatus: 'DONE' },
      createdAt: '2026-11-04T16:40:00.000Z',
    },
  ];

  // Active Demonstrator 1: Arrived Friday 6:00 PM (Section 3 rule: Not late on Sunday!)
  // Friday Nov 20, 2026 18:00
  const fri6pm = new Date('2026-11-20T18:00:00.000Z');
  const friTicket: Ticket = {
    id: 'inc-0322',
    ticketNumber: 'INC-0322',
    title: 'Payment gateway returning 402 on checkout',
    description: 'Customers report payment decline during checkout step. Need urgent review.',
    priority: 'URGENT',
    status: 'OPEN',
    customerName: 'QuickKart Online',
    customerEmail: 'support@quickkart.com',
    companyName: 'QuickKart Online',
    version: 1,
    createdAt: fri6pm.toISOString(),
    updatedAt: fri6pm.toISOString(),
    sla: initializeSLAMetrics('URGENT', fri6pm),
  };

  // Active Demonstrator 2: Waiting on Customer (SLA paused!)
  const waitingTicketDate = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const waitingTicket: Ticket = {
    id: 'inc-0323',
    ticketNumber: 'INC-0323',
    title: 'Need API rate limit increase for holiday sale',
    description: 'We are expecting a 3x traffic spike next week.',
    priority: 'SMALL',
    status: 'WAITING_ON_CUSTOMER',
    customerName: 'Acme Retail',
    customerEmail: 'infra@acmeretail.com',
    companyName: 'Acme Retail',
    assignedToId: 'agent-4',
    assignedToName: 'Charlie Davis',
    version: 2,
    createdAt: waitingTicketDate.toISOString(),
    updatedAt: now.toISOString(),
    sla: {
      ...initializeSLAMetrics('SMALL', waitingTicketDate),
      isPaused: true,
      lastPausedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      firstRespondedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
  };

  const waitingMessages: Message[] = [
    {
      id: 'm-323-1',
      ticketId: 'inc-0323',
      senderType: 'AGENT',
      senderId: 'agent-4',
      senderName: 'Charlie Davis',
      type: 'PUBLIC_REPLY',
      content: 'Could you please confirm the specific IP CIDR ranges and projected requests-per-second requirement?',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // Active Demonstrator 3: Overdue Ticket (Breached SLA)
  // Demonstrates manager view requirement: "Managers asked which problems were late and why"
  const lateTicketDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const lateTicket: Ticket = {
    id: 'inc-0324',
    ticketNumber: 'INC-0324',
    title: 'Search indexing job stuck in running loop',
    description: 'Product catalog search results are outdated. Rebuild job has been hanging.',
    priority: 'MEDIUM',
    status: 'IN_PROGRESS',
    customerName: 'MegaStore India',
    customerEmail: 'devops@megastore.in',
    companyName: 'MegaStore India',
    assignedToId: 'agent-5',
    assignedToName: 'David Kumar',
    version: 2,
    createdAt: lateTicketDate.toISOString(),
    updatedAt: now.toISOString(),
    sla: {
      ...initializeSLAMetrics('MEDIUM', lateTicketDate),
      isFirstResponseBreached: true,
      isResolutionBreached: true,
      firstResponseRemainingMinutes: -120,
      resolutionRemainingMinutes: -340,
    },
  };

  const lateMessages: Message[] = [
    {
      id: 'm-324-1',
      ticketId: 'inc-0324',
      senderType: 'AGENT',
      senderId: 'agent-5',
      senderName: 'David Kumar',
      type: 'INTERNAL_NOTE',
      content: 'Root cause for delay: Elastic cluster out-of-memory. Waiting on infrastructure ops team to resize node volume.',
      createdAt: new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString(),
    },
  ];

  return {
    agents: ARVO_AGENTS,
    tickets: [friTicket, waitingTicket, lateTicket, inc291Ticket, inc304Ticket, inc318Ticket],
    messages: [...inc291Messages, ...inc304Messages, ...inc318Messages, ...waitingMessages, ...lateMessages],
    auditEvents: [...inc291Audit, ...inc304Audit, ...inc318Audit],
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    ensureDataDir();
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.error('Failed to parse database file, reinitializing seeds...', err);
        this.data = createInitialSeedData();
        this.save();
      }
    } else {
      this.data = createInitialSeedData();
      this.save();
    }
  }

  private save(): void {
    ensureDataDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
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

    // Add reopening customer message
    this.data.messages.push({
      id: `msg-${Date.now()}-reopen`,
      ticketId: ticket.id,
      senderType: 'CUSTOMER',
      senderName: customerName,
      type: 'PUBLIC_REPLY',
      content: `[Ticket Reopened by Customer]: ${reason}`,
      createdAt: nowIso,
    });

    this.appendAuditEvent({
      id: `aud-${Date.now()}-reopen`,
      ticketId: ticket.id,
      action: 'REOPENED',
      actorType: 'CUSTOMER',
      actorName: customerName,
      details: { reason },
      createdAt: nowIso,
    });

    this.save();
    return { success: true, ticket: this.getTicketById(ticket.id) };
  }

  /**
   * Create a new ticket (customer or agent initiated)
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
    const count = this.data.tickets.length + 325; // Continuous sequence INC-0325...
    const ticketNumber = `INC-0${count}`;

    const newTicket: Ticket = {
      id: `ticket-${Date.now()}`,
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

    this.appendAuditEvent({
      id: `aud-${Date.now()}-create`,
      ticketId: newTicket.id,
      action: 'TICKET_CREATED',
      actorType: params.actorType || 'CUSTOMER',
      actorName: params.actorName || params.customerName,
      details: { priority: params.priority, title: params.title },
      createdAt: now.toISOString(),
    });

    this.save();
    return newTicket;
  }

  /**
   * Immutable Audit Log Appender (INC-0318)
   * Guaranteed append-only: no updates or deletions are ever exposed!
   */
  private appendAuditEvent(event: AuditEvent): void {
    this.data.auditEvents.push(event);
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

// Singleton database instance
export const db = new Database();
