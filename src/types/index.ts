export type Priority = 'URGENT' | 'MEDIUM' | 'SMALL';

export type TicketStatus = 
  | 'OPEN' 
  | 'IN_PROGRESS' 
  | 'WAITING_ON_CUSTOMER' 
  | 'DONE' 
  | 'CLOSED_AUTO';

export type MessageType = 'PUBLIC_REPLY' | 'INTERNAL_NOTE';

export type ActorType = 'AGENT' | 'CUSTOMER' | 'SYSTEM';

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: 'SUPPORT_LEAD' | 'SUPPORT_AGENT';
  avatarUrl?: string;
}

export interface Message {
  id: string;
  ticketId: string;
  senderType: 'AGENT' | 'CUSTOMER';
  senderId?: string;
  senderName: string;
  type: MessageType; // 'PUBLIC_REPLY' is visible to customer; 'INTERNAL_NOTE' is strictly team-only
  content: string;
  createdAt: string; // ISO 8601
}

export type AuditAction =
  | 'TICKET_CREATED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'PUBLIC_REPLY_SENT'
  | 'INTERNAL_NOTE_ADDED'
  | 'SLA_PAUSED'
  | 'SLA_RESUMED'
  | 'AUTO_CLOSED'
  | 'REOPENED';

export interface AuditEvent {
  id: string;
  ticketId: string;
  action: AuditAction;
  actorType: ActorType;
  actorId?: string;
  actorName: string;
  details: Record<string, any>;
  createdAt: string; // ISO 8601, immutable
}

export interface SLAMetrics {
  // Configured target deadlines in absolute ISO strings
  firstResponseDueAt: string;
  resolutionDueAt: string;
  
  // Timestamps of completion (if fulfilled)
  firstRespondedAt?: string;
  resolvedAt?: string;

  // Real-time status flags
  isFirstResponseBreached: boolean;
  isResolutionBreached: boolean;
  
  // Working minutes remaining or overdue
  firstResponseRemainingMinutes: number; // negative if overdue
  resolutionRemainingMinutes: number;    // negative if overdue

  // Pausing tracking
  isPaused: boolean;
  totalPausedBusinessMinutes: number;
  lastPausedAt?: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string; // e.g. "INC-0320"
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  
  // Customer info
  customerName: string;
  customerEmail: string;
  companyName?: string;

  // Assignment & concurrency
  assignedToId?: string;
  assignedToName?: string;
  version: number; // Optimistic locking counter for concurrency control (INC-0291)

  // Timestamps
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;

  // SLA tracking
  sla: SLAMetrics;

  // Relationships (loaded when required)
  messages?: Message[];
  auditEvents?: AuditEvent[];
}

export interface CreateTicketDTO {
  title: string;
  description: string;
  priority: Priority;
  customerName: string;
  customerEmail: string;
  companyName?: string;
}

export interface CustomerTicketView {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  customerName: string;
  createdAt: string;
  resolvedAt?: string;
  isReopenable: boolean; // True if status is DONE and resolved within 7 days
  messages: Array<Omit<Message, 'type'> & { type: 'PUBLIC_REPLY' }>; // Strictly customer visible only
}
