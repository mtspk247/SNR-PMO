import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectInvite, parseEmail, parseInviteRole, suggestInviteRole, detectUpgrade, parseTrainingChanges, matchToolKeys, parseChiefAction, stripMd, detectRemember, detectForget } from '@/lib/agentPlans';

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

// ---- Continuous learning parsers ----

test('detectRemember: facts, preferences, guards', () => {
  assert.deepEqual(detectRemember('Remember that our fiscal year starts in April'), { content: 'our fiscal year starts in April', kind: 'fact' });
  assert.equal(detectRemember('From now on, always cc finance on invoices over $5k')!.kind, 'preference');
  assert.equal(detectRemember('remember to invite dana@acme.com'), null); // action, not a fact
  assert.equal(detectRemember('what should I remember about taxes?'), null);
  assert.equal(detectRemember('how many staff do we have?'), null);
});

test('detectForget: match + bare undo', () => {
  assert.deepEqual(detectForget('forget the note about fiscal year'), { match: 'the note about fiscal year' });
  assert.deepEqual(detectForget('Forget that'), { match: '' });
  assert.equal(detectForget('I forgot my password'), null);
});


// ---- Survey intent + action line (CoS creates draft surveys; fixes the 2026-07-02 misroute) ----
test('detectSurvey: create-a-survey asks route to the survey flow, not workflows', () => {
  const { detectSurvey, detectWorkflow } = require('../lib/agentPlans');
  const msg = 'create a survey and ask tenant what you think about our project and what improvement they would like to have in this.';
  const sv = detectSurvey(msg);
  assert.ok(sv, 'survey intent not detected');
  assert.ok(sv.topic.length > 0, 'topic missing');
  assert.ok(detectSurvey('run an NPS survey for our beta customers'));
  assert.ok(detectSurvey('send a csat questionnaire'));
  assert.equal(detectSurvey('how did the survey perform?'), null); // question, no create verb
  assert.equal(detectSurvey('create a task for the launch'), null); // no survey noun
});
test('parseChiefAction: survey action line parses like the other kinds', () => {
  const { parseChiefAction } = require('../lib/agentPlans');
  const { shown, action } = parseChiefAction('Setting that up now. [[survey topic=tenant feedback]]');
  assert.equal(action?.kind, 'survey');
  assert.equal(action?.attrs.topic, 'tenant feedback');
  assert.ok(!shown.includes('[['));
});


// ---- Generic create registry (chiefCreate): CoS can create records across modules ----
test('detectCreate: routes create-asks to the right registry kind with attrs', () => {
  const { detectCreate } = require('../lib/chiefCreate');
  const t1 = detectCreate('create a task called Review Q3 numbers due tomorrow');
  assert.equal(t1?.kind, 'task'); assert.equal(t1?.attrs.due, 'tomorrow'); assert.ok(/review q3 numbers/i.test(t1?.attrs.name || ''));
  const t2 = detectCreate('add a lead John Smith john@acme.com worth $12k');
  assert.equal(t2?.kind, 'lead'); assert.equal(t2?.attrs.email, 'john@acme.com'); assert.equal(t2?.attrs.value, '12k');
  const t3 = detectCreate('make a deal called "Acme renewal" valued at 8,500');
  assert.equal(t3?.kind, 'deal'); assert.equal(t3?.attrs.name, 'Acme renewal'); assert.equal(t3?.attrs.value, '8,500');
  const t4 = detectCreate('create a qr code for https://wketing.com/pricing');
  assert.equal(t4?.kind, 'qr'); assert.equal(t4?.attrs.url, 'https://wketing.com/pricing');
  const t5 = detectCreate('create a survey and ask tenant what you think about our project and what improvement they would like to have in this.');
  assert.equal(t5?.kind, 'survey'); assert.ok((t5?.attrs.topic || '').length > 0);
  assert.ok(!(t5?.attrs.topic || '').includes('and what improvement'), 'topic should stop before "and what"');
  assert.equal(detectCreate('create an agent called Helper'), null); // agents keep their own flow
  assert.equal(detectCreate('add a teammate dana@acme.com'), null);  // invites keep their own flow
  assert.equal(detectCreate('what tasks are due?'), null);           // no create verb → LLM
});
test('parseChiefAction: create action line carries kind + attrs', () => {
  const { parseChiefAction } = require('../lib/agentPlans');
  const { action } = parseChiefAction('On it. [[create kind=deal name=Acme renewal value=12000]]');
  assert.equal(action?.kind, 'create');
  assert.equal(action?.attrs.kind, 'deal');
  assert.equal(action?.attrs.name, 'Acme renewal');
  assert.equal(action?.attrs.value, '12000');
});
