#!/usr/bin/env node
/* Evaluate the live model responses: run each through the workflow's own
   Parse & Validate Reply node and print the model reply + validator verdict. */
const fs = require('fs');
const path = require('path');
const wf = JSON.parse(fs.readFileSync(__dirname + '/workflow-whatsapp-assistant.json', 'utf8'));
const code = {};
for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') code[n.name] = n.parameters.jsCode;

function runNode(name, inputJson, store = {}) {
  const $input = { first: () => ({ json: inputJson }) };
  const $ = (nodeName) => ({ first: () => ({ json: store[nodeName] }) });
  return new Function('$input', '$', code[name])($input, $)[0].json;
}

const D = path.join(__dirname, 'live-prompts');
const cases = JSON.parse(fs.readFileSync(path.join(D, 'cases.json'), 'utf8'));
for (const c of cases) {
  const respFile = path.join(D, `case${c.n}.response.json`);
  const model = fs.readFileSync(path.join(D, `case${c.n}.model.txt`), 'utf8').trim();
  if (!fs.existsSync(respFile)) { console.log(`CASE ${c.n}: NO RESPONSE (model: ${model})`); continue; }
  const resp = JSON.parse(fs.readFileSync(respFile, 'utf8'));
  // rebuild the Knowledge output for this case's message
  const kb = runNode('Knowledge + Build Prompt',
    { customerName: 'Test Customer', customerPhone: '919999999999', text: c.msg,
      isText: true, messageType: 'text', receivedAt: new Date().toISOString() });
  const v = runNode('Parse & Validate Reply', resp, { 'Knowledge + Build Prompt': kb });
  let aiRaw = '(unparseable)';
  try { aiRaw = resp.candidates[0].content.parts.map(p => p.text || '').join(''); } catch (e) {}
  console.log(`\n=== CASE ${c.n} [model: ${model}] ===`);
  console.log('CUSTOMER:', c.msg);
  console.log('EXPECTED:', c.expected);
  console.log('MODEL RAW:', aiRaw.trim());
  console.log('VALIDATOR: validated=' + v.validated + ' status=' + v.status +
              ' intent=' + v.intent + ' needsHuman=' + v.needsHuman +
              ' booking=' + JSON.stringify(v.booking) +
              (v.notes ? ' notes=' + v.notes : ''));
  console.log('REPLY THAT WOULD BE SENT:', v.reply);
}
