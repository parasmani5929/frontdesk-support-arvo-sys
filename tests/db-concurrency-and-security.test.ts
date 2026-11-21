import { test, describe } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/lib/db';

describe('Concurrency Control, Data Isolation & Audit Logging (Problem Reports)', () => {
  // Test 1: INC-0291 - Almost a serious problem (Double assignment collision)
  test('INC-0291: Concurrency control blocks two agents from claiming the same ticket', () => {
    // Create a new unassigned ticket
    const ticket = db.createTicket({
      title: 'Billing webhook retry failed',
      description: 'Customer reports 504 on invoice generation',
      priority: 'URGENT',
      customerName: 'Stripe Merchant Co',
      customerEmail: 'finance@merchant.com',
      actorType: 'CUSTOMER',
    });

    assert.strictEqual(ticket.assignedToId, undefined, 'New ticket should be unassigned');
    assert.strictEqual(ticket.version, 1);

    // Agent Alice (agent-2) claims the ticket
    const claimAlice = db.claimTicket(ticket.id, 'agent-2', 1);
    assert.strictEqual(claimAlice.success, true);
    assert.strictEqual(claimAlice.ticket?.assignedToId, 'agent-2');
    assert.strictEqual(claimAlice.ticket?.assignedToName, 'Alice Chen');
    assert.strictEqual(claimAlice.ticket?.version, 2);

    // Agent Bob (agent-3) tries to claim the EXACT same ticket at the same time
    const claimBob = db.claimTicket(ticket.id, 'agent-3', 1); // Bob had version 1 on his screen
    assert.strictEqual(claimBob.success, false, 'Bob should NOT be allowed to claim an already claimed ticket');
    assert.ok(
      claimBob.error?.includes('already claimed by Alice Chen') || claimBob.error?.includes('Conflict'),
      'Must return clear conflict error naming the assigned agent'
    );
  });

  // Test 2: INC-0304 - Private note isolation from customer
  test('INC-0304: Private team notes are NEVER returned in customer views or exports', () => {
    const ticket = db.createTicket({
      title: 'Data warehouse export request',
      description: 'Export all analytics data',
      priority: 'MEDIUM',
      customerName: 'Difficult Client Corp',
      customerEmail: 'boss@difficult.com',
      actorType: 'CUSTOMER',
    });

    // Agent adds a confidential team note (explaining how to handle difficult customer)
    const privateNote = db.addMessage({
      ticketId: ticket.id,
      senderType: 'AGENT',
      senderId: 'agent-1',
      senderName: 'Meera Patel',
      type: 'INTERNAL_NOTE',
      content: 'CONFIDENTIAL: Customer is high churn risk. Do not mention system bug, emphasize scheduled maintenance.',
    });
    assert.strictEqual(privateNote.success, true);

    // Agent adds a public reply
    const publicReply = db.addMessage({
      ticketId: ticket.id,
      senderType: 'AGENT',
      senderId: 'agent-1',
      senderName: 'Meera Patel',
      type: 'PUBLIC_REPLY',
      content: 'Hello, our engineering team is actively preparing your custom export dataset.',
    });
    assert.strictEqual(publicReply.success, true);

    // Now query the ticket via the Customer View endpoint
    const customerView = db.getCustomerTicketView(ticket.id);
    assert.ok(customerView, 'Customer view should exist');

    // Verify customer messages only contain PUBLIC_REPLY
    assert.strictEqual(customerView.messages.length, 1, 'Only 1 message should be visible to customer');
    assert.strictEqual(customerView.messages[0].content, 'Hello, our engineering team is actively preparing your custom export dataset.');
    assert.strictEqual(customerView.messages[0].type, 'PUBLIC_REPLY');

    // Strict assertion: Private note content must NOT appear anywhere in the customer payload!
    const jsonSerialized = JSON.stringify(customerView);
    assert.ok(
      !jsonSerialized.includes('high churn risk'),
      'CRITICAL SECURITY: Private note content leaked into customer JSON!'
    );
    assert.ok(
      !jsonSerialized.includes('INTERNAL_NOTE'),
      'CRITICAL SECURITY: Internal note marker leaked into customer JSON!'
    );
  });

  // Test 3: INC-0318 - Immutable audit trail solves response time disputes
  test('INC-0318: Immutable audit trail records actor, action, and timestamp with zero modification', () => {
    const ticket = db.createTicket({
      title: 'API latency spike',
      description: 'Latencies jumped to 4 seconds',
      priority: 'URGENT',
      customerName: 'Latency Watch',
      customerEmail: 'dev@latencywatch.com',
    });

    // Agent claims
    db.claimTicket(ticket.id, 'agent-1');

    // Agent sends public reply
    db.addMessage({
      ticketId: ticket.id,
      senderType: 'AGENT',
      senderId: 'agent-1',
      senderName: 'Meera Patel',
      type: 'PUBLIC_REPLY',
      content: 'We identified a bad query and deployed an index fix. Latencies are back under 80ms.',
    });

    // Agent marks status as DONE
    db.updateStatus(ticket.id, 'DONE', 'Meera Patel', 'agent-1');

    // Inspect the audit events
    const reloaded = db.getTicketById(ticket.id);
    assert.ok(reloaded?.auditEvents);
    const actions = reloaded.auditEvents.map((a) => a.action);

    assert.ok(actions.includes('TICKET_CREATED'), 'Must record TICKET_CREATED');
    assert.ok(actions.includes('ASSIGNED'), 'Must record ASSIGNED');
    assert.ok(actions.includes('PUBLIC_REPLY_SENT'), 'Must record PUBLIC_REPLY_SENT');
    assert.ok(actions.includes('STATUS_CHANGED'), 'Must record STATUS_CHANGED');

    // Check that every audit event has a valid ISO timestamp and actor name
    for (const event of reloaded.auditEvents) {
      assert.ok(event.createdAt, 'Audit event must have immutable timestamp');
      assert.ok(event.actorName, 'Audit event must record who did it');
      assert.ok(!isNaN(Date.parse(event.createdAt)), 'Must be valid date string');
    }
  });
});
