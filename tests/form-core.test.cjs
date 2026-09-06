const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../form-core.js');
test('email removes accents; identifier suggestions never expose suffix',()=>{
  assert.equal(core.normalize('Jósé @Gmáil.com','correo'),'jose@gmail.com');
  assert.equal(core.prefix('SABE800311LN2'),'SABE800311');
  assert.equal(core.prefix('SABE800311HVZNTM01'),'SABE800311');
  assert.equal(core.prefix('SABE80'),'SABE80');
});
test('voice inserts at cursor and preserves all prior text',()=>{
  assert.deepEqual(core.insert('ANA LOPEZ','MARIA',3,true),{value:'ANA MARIA LOPEZ',position:9});
  assert.equal(core.insert('SABE80','0311',6,false).value,'SABE800311');
});
test('amount dictation understands Spanish words and decimals',()=>{
  assert.equal(core.spokenNumber('cien mil'),'100000');
  assert.equal(core.spokenNumber('doscientos treinta y nueve punto noventa y dos'),'239.92');
  assert.equal(core.spokenNumber('239 punto 92'),'239.92');
  assert.equal(core.spokenNumber('100,000'),'100000');
});
test('review flags missing and invalid fields without truncating identifiers',()=>{
  const fields=[{key:'nombre',label:'Nombre',required:true},{key:'rfc',label:'RFC'},{key:'curp',label:'CURP'},{key:'poliza',label:'Póliza'},{key:'fecha',label:'Fecha'}];
  assert.deepEqual(core.issues({nombre:'ANA',rfc:'SABE80',fecha:'31/02/2026'},fields).map(i=>i.key),['nombre','rfc','curp','fecha']);
});
