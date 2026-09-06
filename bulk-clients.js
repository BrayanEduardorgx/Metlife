let bulkWriteActive=false;
const heldArchives=new Set(),normalScheduleArchive=scheduleArchive;
scheduleArchive=function(id){if(!heldArchives.has(id))normalScheduleArchive(id);};
const bulkButton=textNode('button','Agregar seleccionados a un Excel');bulkButton.id='bulkAttachBtn';bulkButton.className='secondary';bulkButton.type='button';bulkButton.disabled=true;get('copyRecordsBtn').after(bulkButton);
const selectionUpdate=updateRecordSelection;
updateRecordSelection=function(){selectionUpdate();bulkButton.disabled=bulkWriteActive||!selectedRecords.size;};
const unassignedLabel=document.createElement('label'),unassignedInput=document.createElement('input');unassignedInput.type='checkbox';unassignedInput.id='onlyUnassignedClients';unassignedLabel.append(unassignedInput,document.createTextNode('Solo clientes sin Excel guardado'));document.querySelector('.records-toolbar').append(unassignedLabel);
const beforeUnassignedFilter=filteredRecords;
filteredRecords=function(){const list=beforeUnassignedFilter();return unassignedInput.checked?list.filter(r=>!clientFile(r)):list;};unassignedInput.onchange=renderRecords;
const bulkDialog=makeDialog('bulkAttachDialog','Agregar varios clientes a un Excel');
bulkButton.onclick=()=>{
  const selected=tableRecords().filter(r=>selectedRecords.has(recordSelectionKey(r)));if(!selected.length)return;
  bulkDialog.replaceChildren(textNode('h2','Agregar '+selected.length+' clientes a un Excel'),textNode('p','Se conservarán sus datos e identificadores. Los clientes que todavía pertenezcan a otro Excel guardado se omitirán y te indicaremos cuáles son.'));
  const label=textNode('label','Archivo de destino'),target=document.createElement('select');target.id='bulkAttachTarget';for(const [id,name] of new Map([[batch,'Excel actual: '+currentExcelLabel(batch)],...historyFiles().map(f=>[f.batch,f.name]),['__new__','Crear un Excel nuevo']])){const option=textNode('option',name);option.value=id;target.append(option);}label.append(target);
  const newLabel=textNode('label','Nombre del nuevo Excel'),name=document.createElement('input');name.id='bulkAttachName';name.maxLength=80;newLabel.hidden=true;newLabel.append(name);target.onchange=()=>newLabel.hidden=target.value!=='__new__';
  const status=textNode('p','');status.id='bulkAttachStatus';status.setAttribute('role','status');const list=document.createElement('ul');for(const item of selected)list.append(textNode('li',item.nombre||item.poliza||'Sin nombre'));
  const actions=document.createElement('div');actions.className='workflow-actions';const cancel=textNode('button','Cancelar'),confirm=textNode('button','Agregar clientes');cancel.type=confirm.type='button';cancel.className='secondary';confirm.className='primary';cancel.onclick=()=>bulkDialog.close();actions.append(cancel,confirm);bulkDialog.append(label,newLabel,list,status,actions);bulkDialog.oncancel=e=>{if(bulkWriteActive)e.preventDefault();};
  confirm.onclick=async()=>{if(bulkWriteActive)return;let id=target.value;if(id==='__new__'&&!name.value.trim()){status.textContent='Escribe el nombre del Excel.';name.focus();return;}bulkWriteActive=true;confirm.disabled=cancel.disabled=target.disabled=name.disabled=true;try{if(id==='__new__'){id='excel_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);const now=new Date().toISOString();await cloud.saveHistory({id:'hist_'+id,batch:id,name:name.value.trim(),recordCount:0,created:now,updated:now});const option=textNode('option',name.value.trim());option.value=id;target.append(option);target.value=id;}
      heldArchives.add(id);clearTimeout(archiveTimers.get(id));archiveTimers.delete(id);if(archiveJobs.has(id))await archiveJobs.get(id);const result=await cloud.attachRecords(selected,id,(done,total)=>status.textContent='Agregando clientes: '+done+' de '+total);heldArchives.delete(id);if(result.success.length)await refreshArchive(id);bulkDialog.close();selectedRecords.clear();showCloudRecent();
      const lines=result.failed.map(f=>(f.name||f.id)+': '+f.message).join(' · '),error=archiveErrors.get(id);longClientNotice('Se agregaron '+result.success.length+' de '+selected.length+' clientes al archivo «'+currentExcelLabel(id)+'». '+(result.failed.length?'No se agregaron '+result.failed.length+': '+lines:'Todos los clientes seleccionados quedaron incorporados sin duplicarse.')+(error?' La copia Excel está pendiente: '+error:''),result.success.length?[['Ver archivo',()=>viewRecordFile(result.success[0])]]:[]);
    }catch(error){status.textContent=error.message;}finally{heldArchives.delete(id);bulkWriteActive=false;confirm.disabled=cancel.disabled=target.disabled=name.disabled=false;updateRecordSelection();}};
  bulkDialog.showModal();
};
window.addEventListener('beforeunload',e=>{if(bulkWriteActive){e.preventDefault();e.returnValue='';}});
window.addEventListener('metlife:cloud-change',e=>{if(e.detail.type==='search-index-error')showToast('Datos guardados; búsqueda pendiente','El índice se completará cuando vuelva la conexión.',true);});
renderRecords();
