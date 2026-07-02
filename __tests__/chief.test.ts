import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectInvite, parseEmail, parseInviteRole, suggestInviteRole, detectUpgrade, parseTrainingChanges, matchToolKeys, parseChiefAction, stripMd } from '@/lib/agentPlans';

const CAT = [
  { key: 'send_sms', label: 'Send an SMS to a contact' },
  { key: 'create_task', label: 'Create / assign a task' },
  { key: 'watch_competitors', label: 'Watch competitors & draft insights' },
  { key: 'draft_followup', label: 'Draft a client follow-up' },
];
const NAMES = ['Pipeline Mover', 'CRM Assistant', 'Work Assistant', 'Chief of Staff'];

test('parseEmail extracts and lowercases', () => {
  assert.equal(parseEmail('invite Dana.Smith+x@Acme.COM please'), 'dana.smith+x@acme.com');
  assert.equal(parseEmail('no email here'), null);
});

test('parseInviteRole maps words', () => {
  assert.equal(parseInviteRole('make them an administrator'), 'admin');
  assert.equal(parseInviteRole('read-only please'), 'viewer');
  assert.equal(parseInviteRole('member is fine'), 'member');
  assert.equal(parseInviteRole('whatever you think'), null);
});

test('detectInvite: full ask in one message', () => {
  const r = detectInvite('Invite dana@acme.com as an admin');
  assert.deepEqual(r, { email: 'dana@acme.com', role: 'admin' });
});

test('detectInvite: intent without details', () => {
  assert.deepEqual(detectInvite('Invite a teammate'), {});
  assert.deepEqual(detectInvite('add a new user for our accountant'), {});
});

test('detectInvite: email present without login noun', () => {
  const r = detectInvite('set up an account for maria@globex.io as viewer');
  assert.deepEqual(r, { email: 'maria@globex.io', role: 'viewer' });
});

test('detectInvite: never fires on records or HR onboarding', () => {
  assert.equal(detectInvite('add a CRM contact jordan@x.com'), null);
  assert.equal(detectInvite('onboard new employee John Smith'), null);
  assert.equal(detectInvite('create a support agent'), null);
  assert.equal(detectInvite('create a deal for Acme'), null);
  assert.equal(detectInvite('add a social account'), null);
});

test('suggestInviteRole reads duties', () => {
  assert.equal(suggestInviteRole('she will manage billing and settings').role, 'admin');
  assert.equal(suggestInviteRole('external client who only needs to view reports').role, 'viewer');
  assert.equal(suggestInviteRole('developer joining the delivery team').role, 'member');
});

test('matchToolKeys: key-with-spaces, article-tolerant', () => {
  assert.deepEqual(matchToolKeys('give it the send an SMS tool', CAT), ['send_sms']);
  assert.deepEqual(matchToolKeys('teach it to create tasks', CAT), ['create_task']);
  assert.deepEqual(matchToolKeys('nothing relevant', CAT), []);
});

test('detectUpgrade: train verb + agent name', () => {
  const r = detectUpgrade('train the Pipeline Mover', NAMES, CAT);
  assert.ok(r);
  assert.equal(r!.agentName, 'Pipeline Mover');
  assert.deepEqual(r!.changes.tools, []);
});

test('detectUpgrade: grant a specific tool', () => {
  const r = detectUpgrade('give the CRM Assistant the send an sms tool', NAMES, CAT);
  assert.ok(r);
  assert.equal(r!.agentName, 'CRM Assistant');
  assert.deepEqual(r!.changes.tools, ['send_sms']);
  assert.equal(r!.changes.revoke, false);
});

test('detectUpgrade: revoke', () => {
  const r = detectUpgrade('revoke send sms from the CRM Assistant', NAMES, CAT);
  assert.ok(r);
  assert.equal(r!.changes.revoke, true);
  assert.deepEqual(r!.changes.tools, ['send_sms']);
});

test('detectUpgrade: autonomy + sensing', () => {
  assert.equal(detectUpgrade('make the Work Assistant more autonomous', NAMES, CAT)!.changes.autonomy, 'auto_low_risk');
  assert.equal(detectUpgrade('set the Work Assistant to draft-only', NAMES, CAT)!.changes.autonomy, 'draft_only');
  assert.equal(detectUpgrade('enable sensing for the Chief of Staff', NAMES, CAT)!.changes.sensing, true);
  assert.equal(detectUpgrade('turn off sensing for the Chief of Staff', NAMES, CAT)!.changes.sensing, false);
});

test('detectUpgrade: does not fire on plan upsell or unrelated text', () => {
  assert.equal(detectUpgrade('upgrade my plan to pro', NAMES, CAT), null);
  assert.equal(detectUpgrade('what needs my attention today?', NAMES, CAT), null);
  assert.equal(detectUpgrade('add a task for tomorrow', NAMES, CAT), null);
});

test('parseTrainingChanges standalone (pending-step replies)', () => {
  const ch = parseTrainingChanges('grant it draft a client follow-up and make it more autonomous', CAT);
  assert.deepEqual(ch.tools, ['draft_followup']);
  assert.equal(ch.autonomy, 'auto_low_risk');
});

// ---- LLM action-line protocol + plain-texting ----

test('detectInvite: send-a-signup-link phrasing', () => {
  const r = detectInvite('just send him a link or email him so that he can sign up through this link');
  assert.deepEqual(r, {});
  assert.deepEqual(detectInvite('email tariq.test@rainer.dev an invite link'), { email: 'tariq.test@rainer.dev' });
});

test('parseChiefAction: invite with attrs', () => {
  const { shown, action } = parseChiefAction('Setting that up now.\n[[invite email=dana@acme.com role=member]]');
  assert.equal(shown, 'Setting that up now.');
  assert.ok(action);
  assert.equal(action!.kind, 'invite');
  assert.equal(action!.attrs.email, 'dana@acme.com');
  assert.equal(action!.attrs.role, 'member');
});

test('parseChiefAction: bare + multiword values + none', () => {
  assert.equal(parseChiefAction('Sure.\n[[train]]').action!.kind, 'train');
  const wf = parseChiefAction('On it.\n[[workflow kind=client_onboarding name=Acme Corp]]').action!;
  assert.equal(wf.attrs.kind, 'client_onboarding');
  assert.equal(wf.attrs.name, 'Acme Corp');
  const tr = parseChiefAction('Done.\n[[train agent=CRM Assistant]]').action!;
  assert.equal(tr.attrs.agent, 'CRM Assistant');
  assert.equal(parseChiefAction('Just an answer, no action.').action, null);
});

test('stripMd flattens markdown remnants', () => {
  assert.equal(stripMd('**Upgrade** the plan'), 'Upgrade the plan');
  assert.equal(stripMd('## Title\n* item'), 'Title\n- item');
});
