/* Pure rules shared by OCR, review and client lookup. No network or storage. */
(function(root){
  'use strict';
  const manual=['prima','medio','fecha','talon','estatus'];
  const definitions=[
    {key:'poliza',label:'PÓLIZA',pattern:/(?:N\s*[°ºO.*#]*\s*(?:DE\s*)?|NUMERO\s+DE\s+)POLIZA\s*:?/g},
    {key:'paterno',label:'APELLIDO PATERNO',pattern:/APELLIDO\s+PATERNO\s*:?/g},
    {key:'materno',label:'APELLIDO MATERNO',pattern:/APELLIDO\s+MATERNO\s*:?/g},
    {key:'nombres',label:'NOMBRES',pattern:/\bNOMBRES?(?:\s*\(S\))?\s*:?/g},
    {key:'suma',label:'SUMA ASEGURADA BÁSICA',pattern:/SUMA\s+ASEGURADA\s+BASICA\s*(?:\(\s*BAS\s*\))?\s*:?/g},
    {key:'primaExcedente',label:'PRIMA EXCEDENTE',pattern:/PRIMA\s+EX[CE]*DENTE\s*:?/g},
    {key:'vendida',label:'VENDIDA',pattern:/\bVENDIDA\s*:?/g},
    {key:'telefono',label:'CELULAR',pattern:/\bCELULAR\s*:?/g},
    {key:'rfc',label:'RFC',pattern:/\bR\.?\s*F\.?\s*C\.?\s*:?/g},
    {key:'curp',label:'CURP',pattern:/\bC\.?\s*U\.?\s*R\.?\s*P\.?\s*:?/g},
    {key:'correo',label:'EMAIL',pattern:/\bE[ -]?MAIL\s*:?/g},
    {key:'trabajo',label:'NOMBRE DE LA EMPRESA',pattern:/NOMBRE\s+DE\s+LA\s+EMPRESA\s*:?/g},
    {key:'comunidad',label:'LUGAR Y FECHA',pattern:/LUGAR\s+Y\s+FECHA(?!\s+DE\s+NACIMIENTO)\s*:?/g}
  ];
  function normalize(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();}
  function searchClients(items,key,query){
    if(!['poliza','nombre'].includes(key))return [];
    const q=normalize(query);if(!q)return [];
    const compare=v=>key==='poliza'?normalize(v).replace(/\s/g,''):normalize(v);
    const term=compare(q);
    return items.filter(r=>compare(r[key]).includes(term)).sort((a,b)=>Number(compare(b[key])===term)-Number(compare(a[key])===term)||String(b._saved||'').localeCompare(String(a._saved||'')));
  }
  function clean(value){return String(value??'').replace(/[\t\r\n]+/g,' ').replace(/^[\s:;|_\-]+|[\s|_]+$/g,'').replace(/\s+/g,' ').trim();}
  function amount(value){
    let v=clean(value).replace(/[$\s]/g,'');
    if(!v||!/^\d[\d.,]*$/.test(v))return '';
    if(/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(v))return v.replace(/,/g,'');
    if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v))return v.replace(/\./g,'').replace(',','.');
    if(/^\d+,\d{1,2}$/.test(v))return v.replace(',','.');
    return /^\d+(\.\d{1,2})?$/.test(v)?v:'';
  }
  function sanitize(key,value){
    const v=clean(value);if(manual.includes(key))return '';
    if(key==='negocio')return ['NUEVA','INCREMENTO','INCLUSION'].includes(normalize(v))?normalize(v):'';
    if(['suma','primaExcedente'].includes(key))return amount(v);
    if(key==='telefono')return /^[+\d() .-]+$/.test(v)?v.replace(/\D/g,''):'';
    if(key==='correo')return v.toLowerCase().replace(/\s/g,'');
    if(['rfc','curp','poliza'].includes(key))return v.toUpperCase().replace(/\s/g,'');
    if(key==='comunidad')return v.replace(/(?:,?\s+(?:A\s+)?\d{1,2}(?:\s*DE\s*|[/.-]).*)$/i,'').replace(/,?\s+(?:VER\.?|VERACRUZ)\.?$/i,'').trim().toLocaleUpperCase('es-MX');
    return v.toLocaleUpperCase('es-MX');
  }
  function valuesToForm(values){
    const result={};definitions.forEach(d=>{if(!['paterno','materno','nombres'].includes(d.key))result[d.key]=sanitize(d.key,values[d.key]);});
    result.nombre=['paterno','materno','nombres'].map(k=>sanitize(k,values[k])).filter(Boolean).join(' ');
    result.negocio=sanitize('negocio',values.negocio);manual.forEach(k=>result[k]='');return result;
  }
  function anchors(text){
    // Keep character positions stable so slices refer to the original accented text.
    const upper=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();const hits=[];
    for(const def of [...definitions].sort((a,b)=>b.label.length-a.label.length)){
      const pattern=new RegExp(def.pattern.source,'g');let match;
      while((match=pattern.exec(upper))){const start=match.index,end=start+match[0].length;if(!hits.some(h=>start<h.end&&end>h.start))hits.push({key:def.key,start,end});}
    }
    // Stop extraction at other known form labels; never consume the rest of the page.
    const stop=/\b(?:PRIMA(?!\s+EX[CE]*DENTE)|MEDIO|VENDIDA|TELEFONO\s+FIJO|DOMICILIO|SEXO|FECHA\s+DE\s+NACIMIENTO|FIRMA|BENEFICIARIOS?|DATOS\s+DEL|LUGAR\s+Y\s+FECHA\s+DE\s+NACIMIENTO|ESTADO\s+CIVIL|EDAD|ESTATURA|PESO|OCUPACION|SUELDO\s+MENSUAL|POLIZA\s+NUEVA|INCREMENTO|INCLUSION)\b/g;let m;
    while((m=stop.exec(upper)))if(!hits.some(h=>m.index>=h.start&&m.index<h.end))hits.push({key:null,start:m.index,end:m.index+m[0].length});
    return hits.sort((a,b)=>a.start-b.start);
  }
  function extractText(text){
    const values={},hits=anchors(text);
    hits.forEach((hit,i)=>{if(!hit.key||values[hit.key])return;const fragment=text.slice(hit.end,hits[i+1]?.start??text.length);const lines=fragment.split(/\r?\n/).map(clean).filter(Boolean);values[hit.key]=sanitize(hit.key,lines[0]||'');});
    const marked=[];const upper=normalize(text);
    const choices=[...upper.matchAll(/POLIZA NUEVA|INCREMENTO|INCLUSION/g)];
    const box='(?:\\[\\s*[X✓✔✗✘]?\\s*\\]|[☑☒✓✔✗✘]|\\(\\s*X?\\s*\\))';
    const markedBox=/[X☑☒✓✔✗✘]/;
    const prefix=choices.length&&new RegExp(box+'\\s*$').test(upper.slice(0,choices[0].index));
    choices.forEach((choice,index)=>{
      const fragment=prefix?upper.slice(index?choices[index-1].index+choices[index-1][0].length:0,choice.index):upper.slice(choice.index+choice[0].length,choices[index+1]?.index??upper.length);
      const match=fragment.match(new RegExp(prefix?box+'\\s*$':'^\\s*'+box));
      if(match&&markedBox.test(match[0]))marked.push(choice[0]==='POLIZA NUEVA'?'NUEVA':choice[0]);
    });
    values.negocio=marked[0]||'';
    return {values,marked,warning:marked.length>1?'Hay varias casillas marcadas; revisa NEGOCIO.':''};
  }
  function flattenWords(data){return (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>(l.words||[])))).filter(w=>w.bbox&&w.text);}
  function fieldRegions(words,width,height){
    // Locate labels from printed words, then offer the nearby writing area for review/cropping.
    const text=words.map(w=>w.text).join(' ');let offset=0;const ranges=words.map(w=>{const r={...w,start:offset,end:offset+w.text.length};offset=r.end+1;return r;});
    return anchors(text).filter(h=>h.key).map(hit=>{
      const label=ranges.filter(w=>w.end>hit.start&&w.start<hit.end);if(!label.length)return null;
      const x0=Math.min(...label.map(w=>w.bbox.x0)),x1=Math.max(...label.map(w=>w.bbox.x1)),y0=Math.min(...label.map(w=>w.bbox.y0)),y1=Math.max(...label.map(w=>w.bbox.y1));
      const lineHeight=Math.max(12,y1-y0);const right=ranges.filter(w=>w.bbox.x0>x1&&Math.abs(w.bbox.y0-y0)<lineHeight*.65);
      const otherLabel=anchors(text).filter(h=>h.key!==hit.key).flatMap(h=>ranges.filter(w=>w.end>h.start&&w.start<h.end));
      const nextX=Math.min(width,...otherLabel.filter(w=>w.bbox.x0>x1&&Math.abs(w.bbox.y0-y0)<lineHeight*2).map(w=>w.bbox.x0-5));
      const values=right.filter(w=>w.bbox.x0<nextX&&!otherLabel.some(label=>label.start===w.start));
      let rect={left:Math.max(0,x0-3),top:Math.max(0,y1+2),width:Math.max(20,Math.min(nextX-x0,width*.38)),height:Math.min(height-y1-2,lineHeight*2.8)};
      if(values.length){const left=Math.max(0,Math.min(...values.map(w=>w.bbox.x0))-4),top=Math.max(0,Math.min(...values.map(w=>w.bbox.y0))-3);rect={left,top,width:Math.min(width,Math.max(...values.map(w=>w.bbox.x1))+4)-left,height:Math.min(height,Math.max(...values.map(w=>w.bbox.y1))+3)-top};}
      return {key:hit.key,label:{x0,y0,x1,y1},rect,inline:values.length>0};
    }).filter(Boolean);
  }
  function extractLayout(data,width,height){
    const result=extractText(data.text||''),words=flattenWords(data),regions=fieldRegions(words,width,height);
    const labels=regions.map(r=>r.label);
    const isLabel=w=>labels.some(b=>w.bbox.x0>=b.x0-2&&w.bbox.x1<=b.x1+2&&w.bbox.y0>=b.y0-2&&w.bbox.y1<=b.y1+2);
    for(const region of regions){
      const b=region.label,h=Math.max(12,b.y1-b.y0);
      // Names are separate columns; the nearest writing line may be above or below its printed label.
      if(!['paterno','materno','nombres'].includes(region.key)||b.y0>height*.5)continue;
      if(region.inline&&result.values[region.key])continue;
      const peers=regions.filter(r=>r.key!==region.key&&Math.abs(r.label.y0-b.y0)<h*1.5);
      const right=Math.min(width,...peers.filter(r=>r.label.x0>b.x0).map(r=>r.label.x0-4));
      const candidates=words.filter(w=>!isLabel(w)&&w.bbox.x0>=b.x0-h*.5&&w.bbox.x1<=right&&Math.abs(w.bbox.y0-b.y0)<h*3&&Math.abs(w.bbox.y0-b.y0)>h*.5);
      if(!candidates.length){result.values[region.key]='';continue;}
      candidates.sort((a,c)=>Math.abs(a.bbox.y0-b.y0)-Math.abs(c.bbox.y0-b.y0));const baseline=candidates[0].bbox.y0;
      const row=candidates.filter(w=>Math.abs(w.bbox.y0-baseline)<h*.65).sort((a,c)=>a.bbox.x0-c.bbox.x0);
      result.values[region.key]=sanitize(region.key,row.map(w=>w.text).join(' '));
    }
    return {...result,regions};
  }
  const api={extractLayout,definitions,manual,normalize,searchClients,sanitize,valuesToForm,extractText,flattenWords,fieldRegions};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MetlifeDocument=api;
})(typeof window!=='undefined'?window:globalThis);
