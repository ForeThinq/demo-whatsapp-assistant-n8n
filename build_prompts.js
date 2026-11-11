#!/usr/bin/env node
/* Build the live-test prompt files with the workflow's own Knowledge node,
   one per text case in sample-conversations.md. */
const fs = require('fs');
const path = require('path');
const wf = JSON.parse(fs.readFileSync(__dirname + '/workflow-whatsapp-assistant.json', 'utf8'));
const kbNode = wf.nodes.find(n => n.name === 'Knowledge + Build Prompt');

const cases = [
  { n: 1, msg: 'Hi! What are your prices for a haircut and facial?',
    expected: 'Answers from KB only: Haircut & Styling ₹499–₹899, Facial ₹1,299. Intent price. No handoff.' },
  { n: 2, msg: 'Are you open on Tuesday?',
    expected: 'Says the salon is closed on Tuesdays, offers another day.' },
  { n: 3, msg: 'I want to book a hair spa tomorrow at 4 pm',
    expected: 'Booking complete (service+day+time) → confirms, intent booking, booking filled.' },
  { n: 4, msg: 'Book me a manicure',
    expected: 'Missing day/time → asks for the missing piece only, booking stays null, nothing confirmed.' },
  { n: 5, msg: 'Do you do keratin treatment? How much?',
    expected: 'TRAP: keratin not in KB → needs_human true, polite holding reply, NO invented price.' },
  { n: 6, msg: 'This is ridiculous, my appointment last week was messed up',
    expected: 'TRAP: complaint → holding reply, needs_human true, no arguing, no promises.' },
];

const outDir = path.join(__dirname, 'live-prompts');
fs.mkdirSync(outDir, { recursive: true });
for (const c of cases) {
  const input = { customerName: 'Test Customer', customerPhone: '919999999999',
                  text: c.msg, isText: true, messageType: 'text',
                  receivedAt: new Date().toISOString() };
  const $input = { first: () => ({ json: input }) };
  const $ = () => { throw new Error('Knowledge node must not use $()'); };
  const out = new Function('$input', '$', kbNode.parameters.jsCode)($input, $)[0].json;
  fs.writeFileSync(path.join(outDir, `case${c.n}.txt`), out.promptText);
  c.promptFile = `live-prompts/case${c.n}.txt`;
}
fs.writeFileSync(path.join(outDir, 'cases.json'), JSON.stringify(cases, null, 1));
console.log('wrote', cases.length, 'prompt files');
