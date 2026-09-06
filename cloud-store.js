/* Firebase is the source of truth. Customer data is kept only in memory in the browser. */
(function(root){
  'use strict';
  function createMetlifeCloud({db,storage,emit=()=>{},getUser=()=>null}){
    const session='device_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const state={records:[],recent:[],recentHasMore:false,history:[],zones:{},workspace:{},pending:[],sellers:[],recordsLoading:false,uid:null,connected:false,ready:false};let epoch=0,listeners=[],batchRef=null,batchFn=null,batchName=null,batchJob=null,batchGeneration=0,recentRef=null,recentFn=null,recentGeneration=0;
    const archiveFactory=root.createMetlifeArchiveStore||(typeof require==='function'?require('./archive-store.js'):null);
    const directoryFactory=root.createMetlifeClientDirectory||(typeof require==='function'?require('./client-directory.js'):null);
    let operationEpoch=0;
    const archives=archiveFactory({db,requireCloud,revision:()=>revision(),isCurrent:()=>epoch===operationEpoch});
    const directory=directoryFactory({db,requireCloud,emit,isCurrent:()=>epoch===operationEpoch});
    const readLegacy=(key,fallback)=>{try{return JSON.parse(storage.getItem(key)||'null')??fallback;}catch{return fallback;}};
    const rawLegacy=key=>{try{return storage.getItem(key);}catch{return null;}};
    async function legacyId(record){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(record)));return 'legacy_'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
    const revision=()=>Date.now()+'_'+Math.random().toString(36).slice(2);
    function stop(){archives.clear();recentGeneration++;if(recentRef)recentRef.off('value',recentFn);recentRef=null;epoch++;batchGeneration++;if(batchRef)batchRef.off('value',batchFn);batchRef=null;batchName=null;listeners.forEach(([ref,fn])=>ref.off('value',fn));listeners=[];Object.assign(state,{records:[],recent:[],recentHasMore:false,history:[],zones:{},workspace:{},pending:[],sellers:[],recordsLoading:false,uid:null,connected:false,ready:false});emit('status',state);}
    function watch(path,receive){return new Promise((resolve,reject)=>{const ref=db.ref(path),currentEpoch=epoch;const fn=snapshot=>{if(epoch!==currentEpoch)return;receive(snapshot.val());resolve();};listeners.push([ref,fn]);ref.on('value',fn,error=>{if(epoch!==currentEpoch)return;emit('error',error);reject(error);});});}
    function requireCloud(){if(!db||!state.ready||!state.uid||getUser()?.uid!==state.uid)throw Error('Espera a que cargue tu cuenta desde la nube.');if(!state.connected)throw Error('Sin conexión: los cambios aún no están guardados en la nube. Mantén la página abierta y vuelve a intentarlo al recuperar internet.');}
    async function start(uid){
      stop();if(!db)throw Error('Firebase no está disponible. Revisa tu conexión.');state.uid=uid;const currentEpoch=epoch;operationEpoch=epoch;
      watch('.info/connected',value=>{state.connected=value===true;emit('status',state);if(state.connected&&state.ready)directory.repair().catch(error=>emit('search-index-error',error.message));}).catch(()=>{});
      const paths=['workspaces/'+uid];
      const snapshots=await Promise.all(paths.map(path=>db.ref(path).once('value')));if(epoch!==currentEpoch)return;
      const existingWorkspace=snapshots[0].val();
      const legacyRecords=readLegacy('metlife_records_v1',[]),legacyHistory=readLegacy('metlife_excel_history_v1',[]);
      // Import only unmigrated legacy records. Old caches must never resurrect deleted cloud records.
      if(!rawLegacy('metlife_firebase_migrated_v1')){
        for(const r of Array.isArray(legacyRecords)?legacyRecords:[]){if(!r||typeof r!=='object')continue;const id=r._id||await legacyId(r);await db.ref('records/'+id).transaction(current=>current??indexed({...r,_id:id,_batch:r._batch||rawLegacy('metlife_batch_v1')||new Date().toISOString().slice(0,10)}));}
        for(const file of Array.isArray(legacyHistory)?legacyHistory:[]){if(file?.id)await db.ref('history/'+file.id).transaction(current=>current??file);}
      }
      const legacyBatch=rawLegacy('metlife_batch_v1');
      const latest=existingWorkspace?null:Object.values((await db.ref('records').orderByKey().limitToLast(1).once('value')).val()||{})[0];
      const initial={batch:legacyBatch||latest?._batch||new Date().toISOString().slice(0,10),draft:readLegacy('metlife_draft_v1',{}),revision:revision(),source:session};
      await db.ref('workspaces/'+uid).transaction(current=>current??initial);
      if(existingWorkspace&&Object.values(initial.draft||{}).some(Boolean)&&JSON.stringify(existingWorkspace.draft||{})!==JSON.stringify(initial.draft)){
        const backupId=await legacyId({draft:initial.draft,batch:initial.batch});
        await db.ref('workspaces/'+uid+'/recoveredDrafts/'+backupId).transaction(current=>current??{draft:initial.draft,batch:initial.batch,recoveredAt:new Date().toISOString()});
      }
      const oldZones=readLegacy('metlife_document_regions_v1',{});
      if(oldZones&&typeof oldZones==='object'&&!Array.isArray(oldZones)&&Object.keys(oldZones).length)await db.ref('settings/documentZones').transaction(current=>current??oldZones);
      if(epoch!==currentEpoch)return;
      // Purge old customer caches only after the server confirms the migration.
      for(const key of ['metlife_records_v1','metlife_excel_history_v1','metlife_draft_v1','metlife_batch_v1','metlife_document_regions_v1'])try{storage.removeItem(key);}catch{}
      try{storage.setItem('metlife_firebase_migrated_v1','1');}catch{}
      await ensureSearchSchema();await ensureClientRetention();await archives.migrate();await directory.prepare();if(epoch!==currentEpoch)return;
      await db.ref('settings/sellers').transaction(current=>current??{tono:{name:'TOÑO'}});
      await Promise.all([
        watch('history',value=>{state.history=Object.values(value||{}).filter(f=>!f._deletedAt);emit('history',state.history);}),
        watch('workspaces/'+uid,value=>{state.workspace=value||{};setBatch(state.workspace.batch).catch(error=>emit('error',error));emit('workspace',state.workspace);}),
        watch('settings/documentZones',value=>{state.zones=value||{};emit('zones',state.zones);}),
        watch('pendingDrafts/'+uid,value=>{state.pending=Object.values(value||{});emit('pending',state.pending);}),
        watch('settings/sellers',value=>{state.sellers=Object.entries(value||{}).map(([id,item])=>({id,...item}));emit('sellers',state.sellers);})
      ]);
      await setBatch(state.workspace.batch);await loadRecent();if(epoch!==currentEpoch)return;state.ready=true;emit('status',state);emit('ready',state);
    }
    async function saveWorkspace(patch,expectedRevision){
      requireCloud();const nextRevision=revision();
      const result=await db.ref('workspaces/'+state.uid).transaction(current=>{
        if(expectedRevision!==undefined&&current?.revision!==expectedRevision)return;
        return {...(current||{}),...patch,revision:nextRevision,source:session};
      },undefined,false);
      if(!result.committed){const error=Error('El borrador cambió en otro dispositivo. Elige qué versión conservar.');error.code='draft-conflict';throw error;}
      return result.snapshot.val();
    }
    const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
    function indexed(item){const value={...item,_schema:1,_directorySeq:(item._directorySeq||0)+1,_directoryPending:true,_activeBatch:item._deletedAt?null:item._batch,_activityAt:item._deletedAt?null:(Date.parse(item._updated||item._saved||'')||1)};value._search=item._deletedAt?null:Object.fromEntries(['poliza','nombre','rfc','curp'].map(k=>[k,k==='nombre'?normalize(item[k]):normalize(item[k]).replace(/\s/g,'')]));return value;}
    async function ensureClientRetention(){
      if((await db.ref('settings/clientRetention').once('value')).val()===1)return;
      let after=null;const token=epoch;
      while(epoch===token){let query=db.ref('records').orderByKey();if(after)query=query.startAfter(after);const entries=Object.entries((await query.limitToFirst(200).once('value')).val()||{}).sort(([a],[b])=>a.localeCompare(b));if(!entries.length)break;
        for(const [id,item] of entries){const oldFile=item._trashFile?.id?(await db.ref('history/'+item._trashFile.id).once('value')).val():null;await db.ref('records/'+id).transaction(current=>{if(!current)return;const recovered=current._deletedAt&&current._trashFile?.id===item._trashFile?.id&&oldFile?._deletedAt;return indexed(recovered?{...current,_batch:'__cloud__',_previousBatch:current._batch,_deletedAt:null,_expiresAt:null,_trashFile:null,_revision:revision(),_updated:new Date().toISOString()}:current);},undefined,false);}after=entries.at(-1)[0];if(entries.length<200)break;
      }
      if(epoch===token)await db.ref('settings/clientRetention').set(1);
    }
    function loadRecent(limit=50){
      if(recentRef)recentRef.off('value',recentFn);const token=epoch,generation=++recentGeneration;recentRef=db.ref('records').orderByChild('_activityAt').startAt(1).limitToLast(limit+1);
      return new Promise((resolve,reject)=>{recentFn=snapshot=>{if(epoch!==token||generation!==recentGeneration)return;const list=Object.values(snapshot.val()||{}).filter(r=>!r._deletedAt).sort((a,b)=>a._activityAt-b._activityAt||a._id.localeCompare(b._id));state.recentHasMore=list.length>limit;state.recent=list.slice(-limit);emit('recent',state.recent);resolve();};recentRef.on('value',recentFn,reject);});
    }
    async function ensureSearchSchema(){
      if((await db.ref('settings/searchSchema').once('value')).val()===1)return;
      let after=null,count=0;const token=epoch;
      do{let query=db.ref('records').orderByKey();if(after)query=query.startAfter(after);const entries=Object.entries((await query.limitToFirst(200).once('value')).val()||{}).sort(([a],[b])=>a.localeCompare(b));
        if(!entries.length)break;
        for(const [id] of entries){if(epoch!==token)return;await db.ref('records/'+id).transaction(current=>current?indexed({...current,_id:current._id||id,_batch:current._batch||new Date().toISOString().slice(0,10)}):undefined,undefined,false);count++;}
        emit('migration',count);after=entries.at(-1)[0];if(entries.length<200)break;
      }while(true);
      if(epoch===token)await db.ref('settings/searchSchema').set(1);
    }
    function setBatch(name){
      if(!name)return Promise.resolve();if(name===batchName&&batchRef)return batchJob;
      if(batchRef)batchRef.off('value',batchFn);batchName=name;const token=++batchGeneration;state.records=[];state.recordsLoading=true;emit('records',state.records);
      batchRef=db.ref('records').orderByChild('_activeBatch').equalTo(name);
      batchJob=new Promise((resolve,reject)=>{batchFn=snapshot=>{if(token!==batchGeneration)return;state.records=Object.values(snapshot.val()||{}).filter(r=>!r._deletedAt).sort((a,b)=>String(a._saved||'').localeCompare(String(b._saved||'')));state.recordsLoading=false;emit('records',state.records);resolve();};batchRef.on('value',batchFn,error=>{state.recordsLoading=false;emit('error',error);reject(error);});});return batchJob;
    }
    async function fetchBatch(name){requireCloud();return Object.values((await db.ref('records').orderByChild('_activeBatch').equalTo(name).once('value')).val()||{}).filter(r=>!r._deletedAt).sort((a,b)=>String(a._saved||'').localeCompare(String(b._saved||'')));}
    async function searchClients(key,text,cursor=null,pageSize=20,exact=false){
      requireCloud();if((key==='nombre'&&!exact)||key==='telefono')return directory.search(key,text,cursor,pageSize);if(!['poliza','nombre','rfc','curp'].includes(key))throw Error('Búsqueda no válida.');const term=key==='nombre'?normalize(text):normalize(text).replace(/\s/g,'');if(!term)return {items:[],cursor:null};
      let query=db.ref('records').orderByChild('_search/'+key);
      if(exact)query=query.equalTo(term);else{query=cursor?query.startAfter(cursor.value,cursor.id):query.startAt(term);query=query.endAt(term+'\uf8ff');}
      const found=Object.values((await query.limitToFirst(pageSize+1).once('value')).val()||{}).filter(r=>!r._deletedAt).sort((a,b)=>a._search[key]<b._search[key]?-1:a._search[key]>b._search[key]?1:a._id<b._id?-1:1);
      const items=found.slice(0,pageSize),last=items.at(-1);return {items,cursor:found.length>pageSize&&last?{value:last._search[key],id:last._id}:null};
    }
    async function findDuplicates(item){const groups=await Promise.all(['poliza','rfc','curp'].filter(k=>normalize(item[k])).map(async key=>{const result=await searchClients(key,item[key],null,20,true);return result.items.map(record=>({record,key}));}));const unique=new Map();groups.flat().forEach(hit=>{if(!unique.has(hit.record._id))unique.set(hit.record._id,hit);});return [...unique.values()];}
    const recordRevision=item=>item?._revision||item?._saved||'';
    const recordData=item=>Object.fromEntries(Object.entries(item).filter(([key])=>!key.startsWith('_')||['_notes','_sources','_needsReview'].includes(key)));
    function auditEntry(item,action){return {at:new Date().toISOString(),actor:getUser()?.email||getUser()?.uid||state.uid,action,data:recordData(item)};}
    async function saveRecord(item){requireCloud();const rev=revision(),value=indexed({...item,_revision:rev,_versions:{[rev]:auditEntry(item,'Creación')}});const result=await db.ref('records/'+item._id).transaction(current=>current?undefined:value,undefined,false);if(!result.committed)throw Error('Este registro ya existe. Vuelve a buscarlo.');await directory.sync(value);emit('archive-dirty',value._batch);return value;}
    async function updateRecord(item,expected){requireCloud();const rev=revision();const result=await db.ref('records/'+item._id).transaction(current=>{if(!current||current._deletedAt||recordRevision(current)!==expected)return;const next={...current,...recordData(item),_id:current._id,_batch:current._batch,_saved:current._saved,_revision:rev,_updated:new Date().toISOString(),_copiedAt:null,_copiedRevision:null};const versions={...(current._versions||{})};if(!Object.keys(versions).length)versions['previous_'+rev]={at:current._updated||current._saved||'',actor:'No registrado',action:'Versión anterior',data:recordData(current)};versions[rev]=auditEntry(next,'Modificación');return indexed({...next,_versions:versions});},undefined,false);if(!result.committed)throw Error('El registro cambió en otro dispositivo. Búscalo de nuevo antes de actualizar.');const saved=result.snapshot.val();await directory.sync(saved);emit('archive-dirty',saved._batch);return saved;}
    async function fetchRecord(id){requireCloud();return (await db.ref('records/'+id).once('value')).val();}
    async function restoreVersion(id,version,expected){const current=await fetchRecord(id);if(!current||current._deletedAt||!current._versions?.[version])throw Error('Esta versión ya no está disponible.');const data=current._versions[version].data;const restored=Object.fromEntries(Object.keys(recordData(current)).map(key=>[key,data[key]??(key==='_sources'?{}:key==='_needsReview'?true:'')]));return updateRecord({...current,...restored,...data},expected);}
    async function refreshHistory(file,expectedUpdated){return archives.refresh(file,expectedUpdated);}
    async function fetchHistoryContent(id){return archives.content(id);}
    async function markCopied(items,clear=false){requireCloud();const results=await Promise.all(items.map(item=>db.ref('records/'+item._id).transaction(current=>{if(!current||current._deletedAt||recordRevision(current)!==recordRevision(item))return;return {...current,_copiedAt:clear?null:new Date().toISOString(),_copiedRevision:clear?null:recordRevision(current)};},undefined,false)));return results.filter(r=>r.committed).length;}
    function threeMonthsLater(timestamp){const date=new Date(timestamp),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+3);const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date.getTime();}
    function trashExpiry(item){return item._trashMonths===3?item._expiresAt:threeMonthsLater(item._deletedAt);}
    async function trashRecord(item,file=null){requireCloud();const result=await db.ref('records/'+item._id).transaction(current=>{if(!current||current._deletedAt||recordRevision(current)!==recordRevision(item))return;const now=Date.now();return indexed({...current,_deletedAt:now,_expiresAt:threeMonthsLater(now),_trashMonths:3,_trashFile:file,_revision:revision()});},undefined,false);if(!result.committed)throw Error('El registro cambió o ya está en la papelera. Actualiza la lista.');await directory.sync(result.snapshot.val());emit('archive-dirty',item._batch);}
    async function listTrash(cursor=null){
      requireCloud();let query=db.ref('records').orderByChild('_deletedAt');query=cursor?query.startAfter(cursor.time,cursor.id):query.startAt(Date.now()-93*86400000);
      const all=Object.values((await query.limitToFirst(51).once('value')).val()||{}).sort((a,b)=>a._deletedAt-b._deletedAt||(a._id<b._id?-1:1));
      const page=all.slice(0,50),last=page.at(-1);const items=page.filter(r=>r._deletedAt&&trashExpiry(r)>Date.now()).map(r=>({...r,_expiresAt:trashExpiry(r)}));
      return {items,cursor:all.length>50?{time:last._deletedAt,id:last._id}:null};
    }
    async function restoreRecord(id){requireCloud();let file;const result=await db.ref('records/'+id).transaction(current=>{if(!current?._deletedAt||trashExpiry(current)<=Date.now())return;file=current._trashFile;const restored={...current,_deletedAt:null,_expiresAt:null,_trashFile:null,_revision:revision()};return indexed(restored);},undefined,false);if(!result.committed)throw Error('El registro ya fue restaurado o venció su plazo.');if(file?.id){const existing=(await db.ref('history/'+file.id).once('value')).val();await archives.save({...existing||file,_deletedAt:null});}await directory.sync(result.snapshot.val());emit('archive-dirty',result.snapshot.val()._batch);return result.snapshot.val();}
    async function saveHistory(file){return archives.save(file);}
    async function detachRecord(item,expected=recordRevision(item)){requireCloud();const result=await db.ref('records/'+item._id).transaction(current=>{if(!current||current._deletedAt||recordRevision(current)!==expected)return;return indexed({...current,_previousBatch:current._batch,_batch:'__cloud__',_copiedAt:null,_copiedRevision:null,_revision:revision(),_updated:new Date().toISOString()});},undefined,false);if(!result.committed)throw Error('El cliente cambió en otro dispositivo. Vuelve a buscarlo.');await directory.sync(result.snapshot.val());emit('archive-dirty',item._batch);return result.snapshot.val();}
    async function attachRecord(id,target,expected){requireCloud();const item=await fetchRecord(id);if(!item||item._deletedAt||recordRevision(item)!==expected)throw Error('El cliente cambió. Vuelve a buscarlo.');const files=Object.values((await db.ref('history').orderByChild('batch').equalTo(target).once('value')).val()||{});if(target!==state.workspace.batch&&!files.some(f=>!f._deletedAt))throw Error('El archivo de destino ya no está disponible.');if(item._batch!==target&&item._batch!=='__cloud__'){const source=Object.values((await db.ref('history').orderByChild('batch').equalTo(item._batch).once('value')).val()||{});if(source.some(f=>!f._deletedAt))throw Error('Este registro pertenece a un Excel guardado. Primero quítalo de ese Excel para cambiarlo de archivo.');}const result=await db.ref('records/'+id).transaction(current=>{if(!current||current._deletedAt||recordRevision(current)!==expected)return;return indexed({...current,_batch:target,_copiedAt:null,_copiedRevision:null,_revision:revision(),_updated:new Date().toISOString()});},undefined,false);if(!result.committed)throw Error('El cliente cambió. Vuelve a buscarlo.');await directory.sync(result.snapshot.val());emit('archive-dirty',target);return result.snapshot.val();}
    async function deleteHistory(file){requireCloud();await db.ref('history/'+file.id).transaction(current=>current?{...current,_deletedAt:Date.now(),_keepsClients:true}:undefined,undefined,false);const items=await fetchBatch(file.batch);for(const item of items)await db.ref('records/'+item._id).transaction(current=>{if(!current||current._deletedAt||current._batch!==file.batch)return;return indexed({...current,_previousBatch:current._batch,_batch:'__cloud__',_revision:revision(),_updated:new Date().toISOString()});},undefined,false);}
    async function attachRecords(items,target,onProgress=()=>{}){requireCloud();const unique=[...new Map(items.map(item=>[item._id,item])).values()],success=[],failed=[];let index=0,done=0;async function worker(){while(index<unique.length){const item=unique[index++];try{const current=await fetchRecord(item._id);if(current&&!current._deletedAt&&current._batch===target)success.push(current);else success.push(await attachRecord(item._id,target,recordRevision(item)));}catch(error){failed.push({id:item._id,name:item.nombre||item.poliza||item._id,message:error.message});}onProgress(++done,unique.length);}}await Promise.all(Array.from({length:Math.min(3,unique.length)},worker));return {success,failed};}
    async function savePending(item,expected){requireCloud();const id=item.id||'pending_'+revision();const result=await db.ref('pendingDrafts/'+state.uid+'/'+id).transaction(current=>{if(expected!==undefined&&current?.revision!==expected)return;return {...item,id,revision:revision(),updated:new Date().toISOString()};},undefined,false);if(!result.committed)throw Error('Este pendiente cambió en otro dispositivo. Vuelve a abrirlo.');return result.snapshot.val();}
    async function removePending(id,expected){requireCloud();const result=await db.ref('pendingDrafts/'+state.uid+'/'+id).transaction(current=>{if(!current)return null;if(expected!==undefined&&current.revision!==expected)return;return null;},undefined,false);if(!result.committed)throw Error('El pendiente cambió en otro dispositivo y se conservó para revisarlo.');}
    async function saveSeller(name){requireCloud();name=String(name||'').trim().toLocaleUpperCase('es-MX');if(!name||name.length>80)throw Error('Escribe un nombre de hasta 80 caracteres.');const id=await legacyId(normalize(name));await db.ref('settings/sellers/'+id).set({name});}
    async function removeSeller(id){requireCloud();await db.ref('settings/sellers/'+id).set(null);}
    async function saveZone(key,zone){requireCloud();if(!/^[a-zA-Z]+$/.test(key))throw Error('Zona no válida.');await db.ref('settings/documentZones/'+key).set(zone);}
    async function clearZones(){requireCloud();await db.ref('settings/documentZones').set(null);}
    return {state,session,start,stop,requireCloud,saveWorkspace,saveRecord,saveHistory,refreshHistory,fetchHistoryContent,fetchRecord,restoreVersion,deleteHistory,detachRecord,attachRecord,attachRecords,loadRecent,saveZone,clearZones,setBatch,fetchBatch,searchClients,findDuplicates,recordRevision,updateRecord,markCopied,trashRecord,listTrash,restoreRecord,savePending,removePending,saveSeller,removeSeller};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=createMetlifeCloud;else root.createMetlifeCloud=createMetlifeCloud;
})(typeof window!=='undefined'?window:globalThis);
