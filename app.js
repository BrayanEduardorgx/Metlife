const STORAGE = { records: 'metlife_records_v1', draft: 'metlife_draft_v1', session: 'metlife_session_v1', batch: 'metlife_batch_v1', credentials: 'metlife_credentials_v1', theme: 'metlife_theme_v1', history: 'metlife_excel_history_v1' };
const firebaseApp = window.firebase?.apps?.length ? window.firebase.app() : window.firebase?.initializeApp(window.METLIFE_FIREBASE_CONFIG);
const firebaseAuth = firebaseApp?.auth();
const firebaseDb = firebaseApp?.database();
const fields = [
  {key:'poliza',label:'PÓLIZA',cell:'A',voice:'chars',placeholder:'EJ. AZG632',help:'Letras y números · siempre mayúsculas'},
  {key:'nombre',label:'NOMBRE COMPLETO',cell:'B',voice:'words',placeholder:'APELLIDO PATERNO, MATERNO Y NOMBRES',required:true,span:2,help:'La lupa busca por cualquier parte del nombre o apellido'},
  {key:'negocio',label:'NEGOCIO',cell:'C',options:['','NUEVA','INCREMENTO','INCLUSION'],required:true},
  {key:'suma',label:'SUMA ASEGURADA',cell:'D',type:'money',voice:'number',placeholder:'100,000',required:true},
  {key:'prima',label:'PRIMA',cell:'E',type:'decimal',voice:'number',placeholder:'239.92',required:true},
  {key:'primaExcedente',label:'PRIMA EXCEDENTE',cell:'F',type:'decimal',voice:'number',placeholder:'0.00'},
  {key:'medio',label:'MEDIO',cell:'G',options:['','FISICA','PRO'],required:true},
  {key:'vendida',label:'VENDIDA',cell:'H',voice:'words',placeholder:'EJ. TOÑO',required:true},
  {key:'estatus',label:'ESTATUS',cell:'I',placeholder:'SE GUARDA EN BLANCO',disabled:true},
  {key:'telefono',label:'TELÉFONO',cell:'J',voice:'digits',type:'tel',placeholder:'10 DÍGITOS',required:true},
  {key:'fecha',label:'FECHA',cell:'K',voice:'date',type:'dateText',placeholder:'DD/MM/AAAA',required:true,help:'Escribe solo los números'},
  {key:'rfc',label:'RFC',cell:'L',voice:'chars',placeholder:'SABE800311LN2',help:'Opcional. Puedes guardar datos incompletos.'},
  {key:'curp',label:'CURP',cell:'M',voice:'chars',placeholder:'SABE800311HVZNTM01',help:'Opcional. Puedes guardar datos incompletos.'},
  {key:'correo',label:'CORREO ELECTRÓNICO',cell:'N',voice:'email',type:'email',placeholder:'nombre@correo.com',span:2,help:'El correo siempre se guarda en minúsculas'},
  {key:'trabajo',label:'LUGAR DE TRABAJO',cell:'O',voice:'words',placeholder:'EMPRESA O INSTITUCIÓN'},
  {key:'comunidad',label:'COMUNIDAD O MUNICIPIO',cell:'P',voice:'words',placeholder:'MUNICIPIO',span:2},
  {key:'talon',label:'TALÓN O CUENTA BANCARIA',cell:'Q',options:['','CTA. BANCARIA','TALON','C. HIBRIDA'],required:true}
];
const labels = { 'POLIZA':'poliza','PÓLIZA':'poliza','NOMBRE':'nombre','NOMBRE COMPLETO':'nombre','NEGOCIO':'negocio','SUMA ASEGURADA':'suma','PRIMA':'prima','PRIMA EXCEDENTE':'primaExcedente','MEDIO':'medio','VENDIDA':'vendida','ESTATUS':'estatus','TELEFONO':'telefono','TELÉFONO':'telefono','FECHA':'fecha','RFC':'rfc','CURP':'curp','CORREO ELECTRONICO':'correo','CORREO ELECTRÓNICO':'correo','LUGAR DE TRABAJO':'trabajo','NOMBRE DE LA COMUNIDAD O MUNICIPIO':'comunidad','COMUNIDAD O MUNICIPIO':'comunidad','TALON O CUENTA BANCARIA':'talon','TALÓN O CUENTA BANCARIA':'talon' };
const $ = s => document.querySelector(s);
let history = {};
let activePendingId=null,activePendingRevision=null,recordsPageSize=50;
const selectedRecords = new Set();
let batch = new Date().toISOString().slice(0,10);
let draftDirty=false,draftVersion=0,draftBaseRevision,writingDraft=false,pendingWorkspace=null;
const cloud=window.createMetlifeCloud({db:firebaseDb,storage:localStorage,getUser:()=>firebaseAuth?.currentUser,emit:handleCloudEvent});
window.metlifeCloud=cloud;
function handleCloudEvent(type,value){
  window.dispatchEvent(new CustomEvent('metlife:cloud-change',{detail:{type,value}}));
  if(type==='records'){renderRecords();checkDuplicate();}
  if(type==='history')renderHistory();
  if(type==='zones')window.dispatchEvent(new CustomEvent('metlife:zones',{detail:value}));
  if(type==='workspace'){
    if(value.revision===draftBaseRevision)return;
    renderRecoveredDrafts(value.recoveredDrafts||{});
    if(value.source===cloud.session&&cloud.state.ready)return;
    if(draftDirty){pendingWorkspace=value;$('#cloudConflict').classList.remove('hidden');}
    else applySharedWorkspace(value);
  }
  if(type==='status'||type==='ready'){
    $('#cloudStatus').textContent=cloud.state.connected?(cloud.state.ready?'Conectado a la nube':'Cargando datos de la nube…'):'Sin conexión';
    $('.sync-pill').classList.toggle('offline',!cloud.state.connected);renderHistory();
    if(type==='status'&&cloud.state.ready&&cloud.state.connected&&draftDirty&&!pendingWorkspace&&!writingDraft)saveDraft();
  }
  if(type==='error')showToast('No se pudo sincronizar','Revisa tu conexión e inténtalo de nuevo.',true);
}
function applySharedWorkspace(value){
 stopVoice();editingRecord=value.editingRecord||null;reviewSignature=null;$('#saveReview').hidden=true;
  clearTimeout(window.draftTimer);batch=value.batch||batch;activePendingId=value.pendingId||null;activePendingRevision=value.pendingRevision||null;recordsPageSize=50;fields.forEach(f=>setField(f.key,value.draft?.[f.key]||'',false));
  history={};draftDirty=false;draftBaseRevision=value.revision;pendingWorkspace=null;$('#cloudConflict').classList.add('hidden');
  $('#draftStatus').textContent=Object.values(value.draft||{}).some(Boolean)?'En la nube':'Sin cambios';
  $('#historyName').value=historyFiles().find(f=>f.batch===batch)?.name||'';renderRecords();checkDuplicate();window.dispatchEvent(new Event('metlife:form-reset'));
}
function markDraftDirty(){if(!draftDirty)draftBaseRevision=cloud.state.workspace.revision;draftDirty=true;draftVersion++;}
function queueDraftSave(){markDraftDirty();$('#draftStatus').textContent='Guardando en nube…';clearTimeout(window.draftTimer);window.draftTimer=setTimeout(saveDraft,500);}

function normalizeText(v,key){ return MetlifeFormCore.normalize(v,key).trim(); }
function renderFields(){ $('#fields').innerHTML=fields.map(f=>`<div class="field ${f.span===2?'span-2':''}"><label for="${f.key}"><span>${f.label}</span><span class="cell-tag">CELDA ${f.cell}</span></label><div class="input-wrap ${['poliza','nombre','telefono'].includes(f.key)?'with-lookup':''}">${f.options?`<select id="${f.key}" name="${f.key}" >${f.options.map(o=>`<option value="${o}">${o||'SELECCIONAR'}</option>`).join('')}</select>`:`<input id="${f.key}" name="${f.key}" type="text" ${f.type==='email'?'inputmode="email"':''} placeholder="${f.placeholder||''}"  ${f.disabled?'disabled':''} autocomplete="off" />${f.voice?`<span class="tools">${['poliza','nombre','telefono'].includes(f.key)?`<button type="button" class="tool-btn lookup-client" data-key="${f.key}" title="Buscar cliente" aria-label="Buscar cliente por ${f.label}"><svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>`:''}<button type="button" class="tool-btn voice" data-key="${f.key}" title="Dictar" aria-label="Dictar ${f.label}"><svg class="mic-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></button><button type="button" class="tool-btn clear-field" data-key="${f.key}" title="Vaciar campo" aria-label="Vaciar ${f.label}"><svg class="trash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></span>`:''}`}</div>${f.help?`<small class="field-help">${f.help}</small>`:''}</div>`).join(''); }
function records(){return [...new Map([...(window.metlifeSelectedClient?[window.metlifeSelectedClient]:[]),...(cloud.state.recent||[]),...cloud.state.records].map(r=>[r._id,r])).values()];}
async function shareRecord(item){ return cloud.saveRecord(item); }
function subscribeFirebase(){return cloud.start(firebaseAuth.currentUser.uid);}
function visibleRecords(){return cloud.state.records.filter(r=>r._batch===batch);}
function tableRecords(){return $('#recordScope')?.value==='cloud'?(cloud.state.recent||[]):visibleRecords();}
function historyFiles(){ return cloud.state.history; }
function sameArchive(file,list){if(file._fingerprint)return file._fingerprint===MetlifeArchiveCore.fingerprint(list);return file.snapshot?JSON.stringify(file.snapshot.map(r=>[r._id,...fields.map(f=>r[f.key]||'')]))===JSON.stringify(list.map(r=>[r._id,...fields.map(f=>r[f.key]||'')])):file.recordCount===list.length&&list.every(r=>String(r._updated||r._saved||'')<=String(file.updated||''));}
function archivedCurrent(){return historyFiles().find(f=>f.batch===batch&&sameArchive(f,visibleRecords()));}
function formatDate(v){ const d=v.replace(/\D/g,'').slice(0,8); return [d.slice(0,2),d.slice(2,4),d.slice(4)].filter(Boolean).join('/'); }
function setField(key,value,remember=true){ const el=$(`#${key}`); if(!el)return; if(remember) history[key]=el.value; const f=fields.find(x=>x.key===key); let v=MetlifeFormCore.normalize(value,key); if(f?.type==='dateText') v=formatDate(v); if(f?.type==='tel')v=v.replace(/\D/g,''); if(f?.type==='money')v=formatMoney(v); if(f?.type==='decimal')v=v.replace(/[^\d.]/g,'').replace(/(\..*)\./g,'$1'); if(el.value!==v)el.value=v; updateSuggestions(); }
function formatMoney(v){ const clean=String(v).replace(/[^\d.]/g,''); if(!clean)return ''; const [a,b]=clean.split('.'); return Number(a).toLocaleString('en-US')+(b!==undefined?'.'+b.slice(0,2):''); }
function draft(){ const d={}; fields.forEach(f=>d[f.key]=$(`#${f.key}`)?.value||''); return d; }
async function saveDraft(force=false){
  clearTimeout(window.draftTimer);if(writingDraft){markDraftDirty();return false;}if(!draftDirty)markDraftDirty();
  if(pendingWorkspace&&!force){$('#draftStatus').textContent='Revisa el borrador';return false;}
  const version=draftVersion;writingDraft=true;$('#draftStatus').textContent='Guardando en nube…';
  try{const saved=await cloud.saveWorkspace({batch,draft:draft(),metadata:typeof captureMetadata==='function'?captureMetadata():{},editingRecord,pendingId:activePendingId,pendingRevision:activePendingRevision},force?undefined:draftBaseRevision);
    draftBaseRevision=saved.revision;
    if(version===draftVersion){draftDirty=false;pendingWorkspace=null;$('#cloudConflict').classList.add('hidden');$('#draftStatus').textContent='En la nube';}
    else window.draftTimer=setTimeout(saveDraft,0);return true;
  }catch(error){
    if(error.code==='draft-conflict'){pendingWorkspace=cloud.state.workspace;$('#cloudConflict').classList.remove('hidden');$('#draftStatus').textContent='Revisa el borrador';}
    else $('#draftStatus').textContent='Pendiente de nube';return false;
  }finally{writingDraft=false;}
}
function loadDraft(){if(cloud.state.ready)applySharedWorkspace(cloud.state.workspace);}
function clearForm(){stopVoice();editingRecord=null;reviewSignature=null;$('#saveReview').hidden=true;activePendingId=null;activePendingRevision=null;clearTimeout(window.draftTimer);window.dispatchEvent(new Event('metlife:form-reset'));$('#clientForm').reset();history={};queueDraftSave();}
function parsePositionalImport(text){ let values=[];if(text.includes('\t'))values=text.split(/\t|\r?\n/);else if(text.includes('\n'))values=text.split(/\r?\n/);else if(text.includes('|'))values=text.split('|');else if(text.includes(';'))values=text.split(';');values=values.map(v=>v.trim());while(values.length&&!values[0])values.shift();while(values.length&&!values.at(-1))values.pop();const editable=fields.filter(f=>f.key!=='estatus');const target=values.length===fields.length?fields:editable;if(values.length!==target.length)return 0;target.forEach((field,index)=>{if(field.key!=='estatus')setField(field.key,values[index]);});return target.filter(f=>f.key!=='estatus').length; }
function parseImport(){ const text=$('#importText').value.trim(); if(!text)return showToast('Falta el texto','Pega primero los datos del cliente.'); const keys=Object.keys(labels).sort((a,b)=>b.length-a.length); const pattern=new RegExp(`(?:^|[,\\n])\\s*(${keys.join('|')})[ \\t]*:[ \\t]*(.*?)(?=\\s*(?:,|\\n)\\s*(?:${keys.join('|')})\\s*:|$)`,'giu'); let match,count=0; while((match=pattern.exec(text))!==null){ const label=match[1].toLocaleUpperCase('es-MX'); const key=labels[label]; if(key && key!=='estatus'){ setField(key,match[2].replace(/,$/,'')); count++; } } if(!count)count=parsePositionalImport(text);saveDraft();checkDuplicate();showToast(count?'Formulario completado':'No se reconoció la estructura',count?`${count} campos encontrados. Revisa la información antes de guardar.`:'Sin etiquetas, pega los 16 valores en el orden del formulario, uno por renglón, tabulación o separados con |.'); }
function recordSelectionKey(r){ return JSON.stringify([r._batch,r._id||[r._saved,...fields.map(f=>r[f.key]??'')]]); }
function filteredRecords(){const q=$('#searchInput').value.trim().toUpperCase(),filter=$('#copiedFilter')?.value||'all';return tableRecords().filter(r=>(filter==='all'||(filter==='copied'?!!r._copiedAt:!r._copiedAt))&&(!q||String(r.poliza||'').toUpperCase().includes(q)||String(r.nombre||'').toUpperCase().includes(q)));}
function updateRecordSelection(){
  const current=tableRecords();const valid=new Set(current.map(recordSelectionKey));
  for(const key of selectedRecords)if(!valid.has(key))selectedRecords.delete(key);
  const list=filteredRecords();const count=list.filter(r=>selectedRecords.has(recordSelectionKey(r))).length;
  const all=$('#selectAllRecords');all.disabled=!list.length;all.checked=!!list.length&&count===list.length;all.indeterminate=count>0&&count<list.length;
  $('#selectAllLabel').textContent=$('#searchInput').value.trim()?'Seleccionar resultados':'Seleccionar todos';
  $('#selectionCount').textContent=selectedRecords.size+' seleccionados de '+current.length;
  $('#copyRecordsBtn').disabled=!selectedRecords.size;
}
function renderRecords(){
  updateRecordSelection();const list=filteredRecords();
  $('#recordCount').textContent=visibleRecords().length;$('#emptyState').style.display=list.length?'none':'block';$('#emptyState h3').textContent=cloud.state.recordsLoading?'Cargando registros…':'No hay registros para mostrar';$('#emptyState p').textContent=cloud.state.recordsLoading?'Consultando el archivo en la nube.':'Prueba otro filtro o guarda un nuevo registro.';
  $('#recordsBody').innerHTML=list.slice().reverse().slice(0,recordsPageSize).map(r=>{
    const key=encodeURIComponent(recordSelectionKey(r));const checked=selectedRecords.has(recordSelectionKey(r));
    return '<tr class="'+(checked?'selected':'')+'"><td class="selection-cell"><input type="checkbox" class="record-select" data-record-key="'+key+'" aria-label="Seleccionar registro '+escapeHtml(r.poliza||'').replace(/"/g,'&quot;')+'" '+(checked?'checked':'')+'></td>'+['poliza','nombre','negocio','suma','prima','fecha','rfc','comunidad'].map(k=>'<td>'+escapeHtml(String(r[k]??''))+'</td>').join('')+'<td>'+ (r._copiedAt?'Copiado '+escapeHtml(new Date(r._copiedAt).toLocaleDateString('es-MX')):'Pendiente')+'</td><td><button type="button" class="link-btn record-edit" data-id="'+escapeHtml(r._id)+'">Modificar</button> <button type="button" class="link-btn record-trash" data-id="'+escapeHtml(r._id).replace(/"/g,'&quot;')+'">Eliminar</button> '+(r._copiedAt?'<button type="button" class="link-btn record-uncopy" data-id="'+escapeHtml(r._id)+'">Marcar pendiente</button>':'')+'</td></tr>';
  }).join('');
  if($('#recordsMoreBtn')){$('#recordsMoreBtn').classList.toggle('hidden',list.length<=recordsPageSize);$('#recordsPageStatus').textContent='Mostrando '+Math.min(recordsPageSize,list.length)+' de '+list.length+' en este archivo';}
  const latest=visibleRecords().at(-1);$('#lastSaved').textContent=latest?new Date(latest._saved).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}):'—';renderHistory();
}
function clipboardRows(list){ return list.map(r=>fields.map(f=>String(f.key==='estatus'?'':r[f.key]??'').replace(/[\t\r\n]+/g,' '))); }
async function copySelectedRecords(){
  updateRecordSelection();const list=tableRecords().filter(r=>selectedRecords.has(recordSelectionKey(r))).sort((a,b)=>String(a._saved||'').localeCompare(String(b._saved||'')));
  if(!list.length)return showToast('Selecciona registros','Marca las palomitas de los registros que quieres copiar.');
  const rows=clipboardRows(list);const text=rows.map(row=>row.map(value=>value.includes('"')?'"'+value.replace(/"/g,'""')+'"':value).join('\t')).join('\r\n');
  // Rich clipboard preserves text and leading zeroes when pasted into Excel.
  const html='<html><body><table>'+rows.map(row=>'<tr>'+row.map(value=>'<td style="mso-number-format:\'\\@\'">'+escapeHtml(value)+'</td>').join('')+'</tr>').join('')+'</table></body></html>';
  try{
    if(navigator.clipboard?.write&&window.ClipboardItem){
      try{await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);}
      catch{await navigator.clipboard.writeText(text);}
    }else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);}
    else{
      const area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;left:-9999px';document.body.appendChild(area);const previous=document.activeElement;
      try{area.select();if(!document.execCommand('copy'))throw new Error('Clipboard unavailable');}finally{area.remove();previous?.focus();}
    }
    try{const marked=await cloud.markCopied(list);showToast('Registros copiados',list.length+' filas listas para pegar desde la columna A. '+marked+' marcadas como copiadas.');}catch(error){showToast('Datos copiados; marca pendiente','El portapapeles sí contiene los datos, pero no se pudo guardar la marca en la nube. '+error.message,true);}
  }catch{showToast('No se pudo copiar','Permite el acceso al portapapeles y vuelve a pulsar Copiar seleccionados.',true);}
}
function showToast(title,detail,warning=false){ $('#toast strong').textContent=title; $('#toast small').textContent=detail; $('#toast').classList.toggle('warning',warning); $('#toast').classList.add('show'); setTimeout(()=>$('#toast').classList.remove('show'),3300); }
function duplicateMatch(item){
  const checks=[['poliza','póliza'],['rfc','RFC'],['curp','CURP']];
  for(const [key,label] of checks){const value=normalizeText(item[key]||'',key);if(value&&records().some(r=>normalizeText(r[key]||'',key)===value))return {record:records().find(r=>normalizeText(r[key]||'',key)===value),label};}
  return null;
}
function checkDuplicate(){
  const warning=$('#duplicateWarning');if(!warning)return null;const match=duplicateMatch(draft());
  warning.classList.toggle('show',!!match);warning.textContent=match?`⚠ Posible cliente repetido: la ${match.label} ya pertenece a ${match.record.nombre||'un cliente registrado'}. Revisa los datos antes de guardar.`:'';
  window.metlifeWorkflow?.validate();window.metlifeWorkflow?.scheduleDuplicates();return match;
}
async function exportExcel(batchId=batch){
  if(typeof batchId!=='string')batchId=batch;
  const saved=historyFiles().find(f=>f.batch===batchId),requested=prompt('Nombre del archivo antes de descargar:',saved?.name||'METLIFE_'+batchId);if(requested===null||!requested.trim())return;
  const fileName=requested.trim().replace(/\.xlsx$/i,'').replace(/[\\/:*?"<>|]/g,'-');
  try{const list=await cloud.fetchBatch(batchId);if(!list.length)return showToast('Excel vacio','Guarda al menos un registro.');let data;if(saved?._hasContent&&sameArchive(saved,list)){const content=await cloud.fetchHistoryContent(saved.id);if(sameArchive(content,list))data=content.xlsxBase64;}if(!data)data=await workbookFor(list);const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=fileName+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){showToast('No se pudo descargar',error.message,true);}
}
function renderHistory(){ const files=historyFiles().slice().sort((a,b)=>new Date(b.updated)-new Date(a.updated));$('#historyEmpty').style.display=files.length?'none':'flex';$('#historyList').style.display=files.length?'grid':'none';$('#historyList').innerHTML=files.map(f=>`<article class="history-item ${f.batch===batch?'current':''}" data-batch="${f.batch}"><div class="history-info"><div class="history-file-icon">▦</div><div><strong>${escapeHtml(f.name)}</strong><div class="history-meta"><span>${new Date(f.updated).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}</span><span>${f.recordCount} ${f.recordCount===1?'registro':'registros'}</span>${f.batch===batch?'<span class="current-badge">ABIERTO</span>':''}</div></div></div><div class="history-actions"><button class="history-action view" type="button">Ver</button><button class="history-action download" type="button">Descargar</button><button class="history-action rename" type="button">Modificar</button><button class="history-action delete" type="button">Eliminar</button></div></article>`).join('');const count=visibleRecords().length;const archived=archivedCurrent();$('#newExcelBtn').disabled=!cloud.state.ready||!cloud.state.connected||(count>0&&!archived);$('#newExcelBtn').title=$('#newExcelBtn').disabled?'Guarda primero el Excel actual en el historial':'Crear un Excel nuevo';$('#historyHint').textContent=!count?'El archivo debe tener al menos un registro.':archived?'Este archivo ya está guardado. Puedes actualizar su nombre o contenido.':'Hay cambios pendientes: guarda este Excel antes de crear uno nuevo.';if(archived&&!$('#historyName').value)$('#historyName').value=archived.name; }
function escapeHtml(value){ const div=document.createElement('div');div.textContent=value;return div.innerHTML; }
async function saveCurrentToHistory(){
  const name=$('#historyName').value.trim()||`METLIFE_${batch}`,count=visibleRecords().length;
  if(!count)return showToast('No hay registros','Agrega al menos un cliente antes de guardar este Excel.');
  if(!name){$('#historyName').focus();return showToast('Escribe un nombre','El archivo necesita un nombre.');}
  const existing=historyFiles().find(f=>f.batch===batch),now=new Date().toISOString();
  const file=existing?{...existing,name,recordCount:count,updated:now}:{id:'hist_'+batch,batch,name,recordCount:count,created:now,updated:now};
  $('#saveHistoryBtn').disabled=true;
  try{const list=await cloud.fetchBatch(file.batch);file.recordCount=list.length;file.snapshot=archiveSnapshot(list);file.xlsxBase64=await workbookFor(list);await cloud.saveHistory(file);showToast('Historial guardado en la nube',name);}catch(error){showToast('No se guardó el historial',error.message,true);}finally{$('#saveHistoryBtn').disabled=false;}
}
async function changeBatch(nextBatch,reset=false){
  if(draftDirty&&!(await saveDraft()))throw Error('Primero resuelve o guarda el borrador pendiente.');
  const saved=await cloud.saveWorkspace({batch:nextBatch,draft:reset?{}:draft(),metadata:reset?{}:captureMetadata(),editingRecord:reset?null:editingRecord,pendingId:reset?null:activePendingId,pendingRevision:reset?null:activePendingRevision},cloud.state.workspace.revision);await cloud.setBatch(nextBatch);applySharedWorkspace(saved);
}
function applyTheme(theme){ const dark=theme==='dark'; document.body.classList.toggle('dark',dark); $('.theme-icon').textContent=dark?'☀':'☾'; $('.theme-label').textContent=dark?'Modo claro':'Modo oscuro'; $('#themeToggle').setAttribute('aria-label',dark?'Activar modo claro':'Activar modo oscuro'); document.querySelector('meta[name="theme-color"]').content=dark?'#071d26':'#008f8c'; }
function openApp(user){ $('#login').classList.add('hidden');$('#app').classList.remove('hidden');$('#userName').textContent=user.toUpperCase(); }

applyTheme(localStorage.getItem(STORAGE.theme)||'light');
renderFields(); loadDraft(); renderRecords();
const remembered=JSON.parse(localStorage.getItem(STORAGE.credentials)||'null');
if(remembered){ $('#loginUser').value=remembered.user||'';$('#rememberLogin').checked=true; }
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const user=$('#loginUser').value.trim().toLowerCase();const password=$('#loginPassword').value;$('#loginError').textContent='';try{await firebaseAuth.setPersistence($('#rememberLogin').checked?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);await firebaseAuth.signInWithEmailAndPassword(user,password);if($('#rememberLogin').checked)localStorage.setItem(STORAGE.credentials,JSON.stringify({user}));else localStorage.removeItem(STORAGE.credentials);}catch{$('#loginError').textContent='Correo o contraseña incorrectos.';$('#loginPassword').focus();}});
firebaseAuth?.onAuthStateChanged(async user=>{
  if(user){$('#loginError').textContent='Cargando tu espacio desde la nube…';try{await subscribeFirebase();if(firebaseAuth.currentUser?.uid===user.uid){openApp(user.email);$('#loginError').textContent='';}}catch{$('#loginError').textContent='No se pudieron cargar los datos de la nube. Revisa internet y vuelve a entrar.';}}
  else{cloud.stop();$('#app').classList.add('hidden');$('#login').classList.remove('hidden');}
});
$('#passwordToggle').onclick=()=>{const input=$('#loginPassword');const visible=input.type==='text';input.type=visible?'password':'text';$('#passwordToggle').classList.toggle('password-visible',!visible);$('#passwordToggle').title=visible?'Mostrar contraseña':'Ocultar contraseña';$('#passwordToggle').setAttribute('aria-label',$('#passwordToggle').title);};
$('#themeToggle').onclick=()=>{const theme=document.body.classList.contains('dark')?'light':'dark';localStorage.setItem(STORAGE.theme,theme);applyTheme(theme);};
$('#logoutBtn').onclick=async()=>{if(draftDirty&&!(await saveDraft())&&!confirm('Hay cambios que no llegaron a la nube. ¿Cerrar sesión y descartar esos cambios?'))return;draftDirty=false;clearTimeout(window.draftTimer);cloud.stop();await firebaseAuth?.signOut();location.reload();};
$('#clientForm').addEventListener('input',e=>{const f=fields.find(x=>x.key===e.target.name);if(!f)return;history[f.key]=e.target.value;if(!e.isComposing&&(f.type||!f.options))normalizeInput(e.target,f);reviewSignature=null;$('#saveReview').hidden=true;checkDuplicate();queueDraftSave();});
$('#clientForm').addEventListener('submit',async e=>{
  e.preventDefault();const buttons=[...$('#clientForm').querySelectorAll('button[type="submit"]')];if(buttons.some(b=>b.disabled))return;
  if(pendingWorkspace)return showToast('Revisa el borrador','Resuelve primero el cambio de otro dispositivo.',true);
  if(summaryOpen)return;
  if(!(await requestSaveSummary()))return;
  if(!confirmReview())return;
 const submittedVersion=draftVersion,item=draft(),pendingId=activePendingId,pendingRevision=activePendingRevision,next=e.submitter?.id==='saveNextBtn';Object.assign(item,captureMetadata());item.estatus='';item._batch=batch;item._saved=new Date().toISOString();item._id='record_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
  buttons.forEach(b=>b.disabled=true);
  try{
    const matches=editingRecord?[]:await cloud.findDuplicates(item);let choice=editingRecord?{action:'update',record:editingRecord}:{action:'create'};
    if(matches.length)choice=await window.metlifeWorkflow.chooseDuplicate(matches,item);if(!choice)return;
    const savedRecord=choice.action==='update'?await cloud.updateRecord({...item,_id:choice.record._id},cloud.recordRevision(choice.record)):await shareRecord(item);
    let pendingWarning='';if(pendingId){try{await cloud.removePending(pendingId,pendingRevision);}catch(error){pendingWarning=error.message;}}
    const unchanged=draftVersion===submittedVersion;if(unchanged){clearForm();forgetUndo();}checkDuplicate();renderRecords();showToast(choice.action==='update'?'Registro actualizado en la nube':'Registro guardado en la nube',pendingWarning||'Disponible desde los otros dispositivos con acceso.',!!pendingWarning);
    if(choice.action==='update'){try{await notifyClientUpdate(savedRecord);}catch(error){showToast('Registro actualizado en la nube','No se pudo actualizar el aviso del archivo: '+error.message,true);}}
    if(next&&unchanged)window.dispatchEvent(new Event('metlife:scan-next'));
  }catch(error){showToast('El registro no se guardó',error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}
});
$('#fields').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.classList.contains('voice'))startVoice(b.dataset.key);if(b.classList.contains('clear-field')){clearTimeout(window.draftTimer);setField(b.dataset.key,'',false);delete history[b.dataset.key];saveDraft();checkDuplicate();$('#'+b.dataset.key).focus();}});
$('#parseBtn').onclick=parseImport;$('#clearBtn').onclick=clearForm;$('#downloadBtn').onclick=exportExcel;$('#searchInput').oninput=renderRecords;
$('#copyRecordsBtn').onclick=copySelectedRecords;
$('#selectAllRecords').onchange=e=>{filteredRecords().forEach(r=>{const key=recordSelectionKey(r);if(e.target.checked)selectedRecords.add(key);else selectedRecords.delete(key);});renderRecords();};
$('#recordsBody').addEventListener('change',e=>{if(!e.target.matches('.record-select'))return;const key=decodeURIComponent(e.target.dataset.recordKey);if(e.target.checked)selectedRecords.add(key);else selectedRecords.delete(key);e.target.closest('tr').classList.toggle('selected',e.target.checked);updateRecordSelection();});
$('#saveHistoryBtn').onclick=saveCurrentToHistory;
$('#archiveRecordsBtn').onclick=async()=>{const name=prompt('Nombre para guardar este Excel en el historial:',$('#historyName').value||`METLIFE_${batch}`);if(name===null||!name.trim())return;$('#historyName').value=name.trim();$('#archiveRecordsBtn').disabled=true;try{await saveCurrentToHistory();}finally{$('#archiveRecordsBtn').disabled=false;}};
$('#historyName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveCurrentToHistory();}});
$('#historyList').addEventListener('click',async e=>{
  const button=e.target.closest('.history-action');if(!button||button.disabled)return;
  const batchId=button.closest('.history-item').dataset.batch,file=historyFiles().find(f=>f.batch===batchId);if(!file)return;
  button.disabled=true;
  try{
    if(button.classList.contains('view')){await changeBatch(batchId);$('.records-card').scrollIntoView({behavior:'smooth',block:'start'});showToast('Archivo abierto',file.name);}
    if(button.classList.contains('download'))await exportExcel(batchId);
    if(button.classList.contains('rename')){await changeBatch(batchId);$('.records-card').scrollIntoView({behavior:'smooth'});const name=prompt('Nuevo nombre para el archivo:',file.name);if(name===null)return;const clean=name.trim().toLocaleUpperCase('es-MX');if(!clean)return;await cloud.saveHistory({...file,name:clean,updated:new Date().toISOString()});showToast('Nombre actualizado',clean);}
    if(button.classList.contains('delete')){
      if(!confirm('¿Eliminar el Excel "'+file.name+'" del historial? Sus clientes se conservarán en la nube y seguirán disponibles al buscar por póliza o nombre.'))return;
      await cloud.deleteHistory(file);if(batch===batchId)await changeBatch(new Date().toISOString().slice(0,10)+'_'+Date.now(),true);
      showToast('Excel eliminado; clientes conservados','Puedes buscarlos en la nube y agregarlos a otro Excel cuando quieras.');
    }
  }catch(error){showToast('No se completó la acción',error.message,true);}finally{button.disabled=false;}
});
$('#newExcelBtn').onclick=async()=>{
  if(visibleRecords().length&&!archivedCurrent())return showToast('Guarda primero en el historial','Conserva este archivo antes de crear otro.');
  if(visibleRecords().length&&!confirm('¿Comenzar un archivo nuevo? El actual está guardado en el historial.'))return;
  try{await changeBatch(new Date().toISOString().slice(0,10)+'_'+Date.now(),true);showToast('Nuevo Excel listo','También estará disponible al entrar con tu cuenta desde otro dispositivo.');}catch(error){showToast('No se pudo cambiar de archivo',error.message,true);}
};
$('#loadCloudDraft').onclick=()=>applySharedWorkspace(pendingWorkspace||cloud.state.workspace);
$('#keepOwnDraft').onclick=()=>saveDraft(true);
$('#recoveredDraftSelect').oninput=()=>{$('#restoreRecoveredDraft').disabled=!recoveredDraftEntry();};
$('#restoreRecoveredDraft').onclick=()=>{const entry=recoveredDraftEntry();if(!entry)return;if(fields.some(f=>$('#'+f.key).value)&&!confirm('¿Reemplazar el formulario por este borrador recuperado?'))return;applySharedWorkspace({...cloud.state.workspace,batch:entry.batch,draft:entry.draft,editingRecord:null});$('#recoveredDraftSelect').value='';$('#restoreRecoveredDraft').disabled=true;queueDraftSave();};
window.addEventListener('beforeunload',event=>{if(draftDirty){event.preventDefault();event.returnValue='';}});
$('#toggleImport').onclick=()=>{const body=$('#importBody');const hidden=body.style.display==='none';body.style.display=hidden?'block':'none';$('#toggleImport').textContent=hidden?'Ocultar':'Mostrar';};


function setSidebarOpen(open){
  $('#sidebarPanel').classList.toggle('hidden',!open);
  $('#sidebarBackdrop').classList.toggle('hidden',!open);
  $('#sidebarToggle').setAttribute('aria-expanded',String(open));
  const label=open?'Ocultar men\u00fa lateral':'Mostrar men\u00fa lateral';
  $('#sidebarToggle').setAttribute('aria-label',label);$('#sidebarToggle').title=label;
  if(open)$('#sidebarClose').focus();else $('#sidebarToggle').focus();
}
$('#sidebarToggle').onclick=()=>setSidebarOpen($('#sidebarPanel').classList.contains('hidden'));
$('#sidebarClose').onclick=()=>setSidebarOpen(false);
$('#sidebarBackdrop').onclick=()=>setSidebarOpen(false);
$('#sidebarArchivador').onclick=()=>setSidebarOpen(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sidebarPanel').classList.contains('hidden'))setSidebarOpen(false);});
