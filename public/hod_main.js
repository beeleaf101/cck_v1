// @ts-nocheck

let instructors=[], courses=[], instData={}, assignments={}, selId=null, deptChip='all';
const CS_PFX=['CST','CSIT','MAT8'];
const GEN_PFX=['ENL','GED','GEN','GECU','GEPH','ICT','MAT0'];
const isCS=c=>CS_PFX.some(p=>c.toUpperCase().startsWith(p));
const isGen=c=>GEN_PFX.some(p=>c.toUpperCase().startsWith(p));
const codeToGroup=c=>isGen(c)?'gen':isCS(c)?'cs':'bus';

// ── Teaching Dept labels (stored per instructor in instData.teachDepts[]) ──
// Values: 'Computer Science' | 'Business' | 'General Education'
function _normDept(v){
  // Normalize to canonical department name regardless of case/spacing
  if(!v||typeof v!=='string') return null;
  const t=v.trim();
  if(/computer.science/i.test(t)) return 'Computer Science';
  if(/business/i.test(t))         return 'Business';
  if(/general.ed/i.test(t))       return 'General Education';
  return null; // discard unknown values
}
function _dedup(arr){
  const s={},o=[];
  (arr||[]).forEach(v=>{ const n=_normDept(v); if(n&&!s[n]){s[n]=1;o.push(n);} });
  return o;
}

function getTeachDepts(id){
  // Try reg2 first (authoritative)
  const reg2=JSON.parse(localStorage.getItem('cck_reg2_inst')||'{}');
  const r2td=(reg2[id]||{}).teachDepts;
  if(r2td&&Array.isArray(r2td)&&r2td.length) return _dedup(r2td);

  // Try instData in memory (set by reg2 on init)
  const dtd=(instData[id]||{}).teachDepts;
  if(dtd&&Array.isArray(dtd)&&dtd.length) return _dedup(dtd);

  // Derive from assigned course prefixes
  const codes=assignments[id]||[];
  const has={cs:codes.some(c=>isCS(c)),gen:codes.some(c=>isGen(c)),bus:codes.some(c=>!isCS(c)&&!isGen(c))};
  const res=[];
  if(has.cs)  res.push('Computer Science');
  if(has.bus) res.push('Business');
  if(has.gen) res.push('General Education');
  if(!res.length){
    const ins=instructors.find(i=>i.id===id);
    res.push(ins?.department==='Computer Science'?'Computer Science':'Business');
  }
  return res;
}
function setTeachDept(id,label){
  if(!instData[id]) instData[id]={};
  if(!instData[id].teachDepts) instData[id].teachDepts=[];
  const arr=instData[id].teachDepts;
  const idx=arr.indexOf(label);
  if(idx>=0) arr.splice(idx,1); else arr.push(label);
  persistInstData(id);
  renderPanel(id); // refresh chips immediately
}
function persistInstData(id){
  // HOD only writes to cck_inst_shared (its own key)
  // cck_reg2_inst is owned exclusively by Registration 2
  const shared=JSON.parse(localStorage.getItem('cck_inst_shared')||'{}');
  shared[id]=instData[id];
  localStorage.setItem('cck_inst_shared',JSON.stringify(shared));
}
const getCr=code=>{const sh=JSON.parse(localStorage.getItem('cck_credits_shared')||'{}'); return sh[code]||(courses.find(c=>c.code===code)?.credits)||3;};
const getMax=id=>{const d=instData[id]; return d?.maxCredits||(d?.employment==='Part-Time'?12:21);};
const assignedCr=id=>(assignments[id]||[]).reduce((s,c)=>s+getCr(c),0);
const ini=n=>n.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i,'').split(' ').filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const fmtT=t=>{if(!t)return'—';const[h,m]=t.split(':').map(Number),ap=h>=12?'PM':'AM';return`${h%12||12}:${String(m).padStart(2,'0')} ${ap}`;};

async function init(){
  // Load JSON data first — completely independent of Supabase
  try {
    const [insRes, crRes] = await Promise.all([
      fetch('instructors.json'),
      fetch('courses.json')
    ]);
    instructors = await insRes.json();
    courses = await crRes.json();
  } catch(e) {
    console.error('Failed to load JSON:', e);
  }

  // Unconditionally rewrite both keys with deduplicated teachDepts
  // (fixes any stale/corrupt data regardless of whether length changed)
  // Normalize + deduplicate teachDepts in both keys on every load
  ['cck_reg2_inst','cck_inst_shared'].forEach(key=>{
    try{
      const store=JSON.parse(localStorage.getItem(key)||'{}');
      Object.keys(store).forEach(id=>{
        if(store[id]) store[id].teachDepts=_dedup(store[id].teachDepts||[]);
      });
      localStorage.setItem(key,JSON.stringify(store));
    }catch(e){}
  });

  // Load saved state from localStorage
  instData = JSON.parse(localStorage.getItem('cck_inst_shared') || '{}');
  assignments = JSON.parse(localStorage.getItem('cck_hod_assignments') || '{}');

  // ── Merge reg2 data into instData (reg2 is authoritative for qualification, timing, teachDepts) ──
  const _reg2Store = JSON.parse(localStorage.getItem('cck_reg2_inst') || '{}');
  Object.keys(_reg2Store).forEach(function(id){
    const r2 = _reg2Store[id];
    if (!instData[id]) instData[id] = {};
    if (r2.qualification)  instData[id].qualification = r2.qualification;
    if (r2.employment)     instData[id].employment    = r2.employment;
    if (r2.maxCredits)     instData[id].maxCredits    = r2.maxCredits;
    if (r2.timeFrom)       instData[id].timeFrom      = r2.timeFrom;
    if (r2.timeTo)         instData[id].timeTo        = r2.timeTo;
    if (r2.notes)          instData[id].notes         = r2.notes;
    if (r2.teachDepts && Array.isArray(r2.teachDepts) && r2.teachDepts.length)
      instData[id].teachDepts = _dedup(r2.teachDepts);
  });

  // ── Always seed from instructors.json baseline, then overlay saved changes ──
  // Build baseline from instructors.json (historical data — always available)
  const baseline = {};
  instructors.forEach(i => { baseline[i.id] = [...(i.courses || [])]; });

  // Load any user-saved changes from localStorage
  const savedHOD = JSON.parse(localStorage.getItem('cck_hod_assignments') || '{}');

  // Merge: start with baseline, overlay saved changes for instructors that have them
  // If an instructor has a saved (possibly empty) array, use that (user deliberately
  // cleared them). If they have no saved entry at all, use the baseline.
  const hasSavedData = Object.keys(savedHOD).length > 0;
  if (hasSavedData) {
    // User has saved at least something — overlay their changes onto baseline
    instructors.forEach(i => {
      // If this instructor was explicitly saved, use saved value (even if empty array)
      // If not in saved at all, fall back to baseline
      assignments[i.id] = Object.prototype.hasOwnProperty.call(savedHOD, i.id)
        ? [...(savedHOD[i.id] || [])]
        : [...(baseline[i.id] || [])];
    });
  } else {
    // Nothing saved yet — use baseline for everyone and persist it immediately
    // so it shows up in all other portals (Instructor Management, Allocation, etc.)
    instructors.forEach(i => { assignments[i.id] = [...(baseline[i.id] || [])]; });
    localStorage.setItem('cck_hod_assignments', JSON.stringify(assignments));
  }

  // Render immediately with local data
  updateStats();
  renderList();

  // Try Supabase — retry after CDN loads
  const dbEl = document.getElementById('db-status');
  async function tryConnectHOD(){
    try{
      const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if(!client) return;
      const {error} = await client.from('instructor_courses').select('instructor_name').limit(1);
      if(!error && dbEl){
        dbEl.textContent = '● Connected to DB';
        dbEl.className = 'portal-sidebar-db online';
      } else if(error) {
        console.warn('[CCK] HOD DB:', error.message);
      }
    }catch(e){ console.warn('[CCK] HOD connect:', e); }
  }
  tryConnectHOD();
  document.addEventListener('supabase-ready', tryConnectHOD);
  setTimeout(tryConnectHOD, 1500);
}

function updateStats(){
  document.getElementById('s-inst').textContent=instructors.length;
  const tot=Object.values(assignments).reduce((s,a)=>s+a.length,0);
  document.getElementById('s-asgn').textContent=tot;
  const over=instructors.filter(i=>assignedCr(i.id)>getMax(i.id)).length;
  document.getElementById('s-over').textContent=over;
  const asgnSet=new Set(Object.values(assignments).flat());
  const un=courses.filter(c=>!asgnSet.has(c.code)).length;
  document.getElementById('s-un').textContent=un;
  const ub=document.getElementById('un-b'); ub.textContent=un; ub.style.display=un>0?'inline':'none';
}

let dcFilter='all';
function setDC(d,btn){dcFilter=d; document.querySelectorAll('#dc .filter-chip').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderList();}
function setDeptNav(d){
  dcFilter=d;
  ['nav-all','nav-cs','nav-bus','nav-gen'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.classList.remove('active');
  });
  const nav={'all':'nav-all','cs':'nav-cs','bus':'nav-bus','gen':'nav-gen'}[d];
  if(nav) document.getElementById(nav)?.classList.add('active');
  renderList();
}

function renderList(){
  const q=(document.getElementById('q')?.value||'').toLowerCase();
  const list=instructors.filter(i=>{
    const cs=i.department==='Computer Science';
    const depts=getTeachDepts(i.id);
    if(dcFilter==='cs'  && !depts.includes('Computer Science'))  return false;
    if(dcFilter==='bus' && !depts.includes('Business'))           return false;
    if(dcFilter==='gen' && !depts.includes('General Education'))  return false;
    if(q&&!i.name.toLowerCase().includes(q)) return false;
    return true;
  });
  const el=document.getElementById('ilist');
  el.innerHTML=list.map(ins=>{
    const cr=assignedCr(ins.id), max=getMax(ins.id);
    const pct=Math.min(100,Math.round(cr/max*100));
    const crClr=pct>100?'#DC2626':pct>80?'#B45309':'#15803D';
    const cs=ins.department==='Computer Science';
    return `<div class="ir ${selId===ins.id?'sel':''}" onclick="selectIns('${ins.id}')">
      <div class="av ${cs?'av-cs':'av-bus'}">${ini(ins.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="ir-name">${ins.name}</div>
        <div class="ir-sub">${(assignments[ins.id]||[]).length} course(s) · ${instData[ins.id]?.employment||'FT'}</div>
      </div>
      <div class="ir-cr">
        <div class="cr-n" style="color:${crClr}">${cr}</div>
        <div class="cr-s">/${max} cr</div>
        <div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${crClr}"></div></div>
      </div>
    </div>`;
  }).join('');
}

function selectIns(id){
  selId=id; renderList(); renderPanel(id);
}

// getInstTeachDepts removed — use getTeachDepts() instead

function buildDeptBadges(id){
  var depts=getTeachDepts(id);
  var CFG={'Computer Science':{bg:'#1E40AF',color:'white'},'Business':{bg:'#92400E',color:'white'},'General Education':{bg:'#166534',color:'white'}};
  var SHORT={'Computer Science':'CS','Business':'Biz','General Education':'Gen Ed'};
  if(!depts.length) return '';
  var CLS={'Computer Science':'dp-cs','Business':'dp-bus','General Education':'dp-gen'};
  var ICONS={'Computer Science':'<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    'Business':'<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    'General Education':'<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>'};
  return depts.map(function(d){
    var cls=CLS[d]||'dp-bus';
    var icon=ICONS[d]||'';
    return '<span class="dept-pill '+cls+'">'+icon+(SHORT[d]||d)+'</span>';
  }).join('');
}

function buildDeptChips(id){
  var depts=getTeachDepts(id);
  var DEPT_CFG=[
    {l:'Computer Science',a:'background:#1E40AF;color:white;border-color:#1E40AF',i:'background:white;color:#1E40AF;border-color:#BFDBFE'},
    {l:'Business',        a:'background:#92400E;color:white;border-color:#92400E',i:'background:white;color:#92400E;border-color:#FDE68A'},
    {l:'General Education',a:'background:#166534;color:white;border-color:#166534',i:'background:white;color:#166534;border-color:#BBF7D0'}
  ];
  return DEPT_CFG.map(function(cfg){
    var active=depts.indexOf(cfg.l)!==-1;
    var style=active?cfg.a:cfg.i;
    return '<button onclick="setTeachDept(\'' + id + '\',\'' + cfg.l.replace(/ /g,'_') + '\')" data-dept="'+cfg.l+'" style="padding:4px 12px;border-radius:20px;border:1.5px solid;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;'+style+'">'+cfg.l+'</button>';
  }).join('');
}

// Note: setTeachDept receives label with underscores for spaces, convert back
var _origSetTeachDept = setTeachDept;
window.setTeachDept = function(id, labelRaw){
  var label = labelRaw.replace(/_/g,' ');
  _origSetTeachDept(id, label);
};

function renderPanel(id){
  const ins=instructors.find(i=>i.id===id);
  if(!ins) return;
  const d=instData[id]||{};
  const cr=assignedCr(id), max=getMax(id);
  const pct=Math.min(100,Math.round(cr/max*100));
  const crClr=pct>100?'#DC2626':pct>80?'#B45309':'#15803D';
  const cs=ins.department==='Computer Science';
  const current=new Set(assignments[id]||[]);
  // Use teach dept labels to determine which courses are eligible
  const teachDepts=getTeachDepts(id);
  const wantCS=teachDepts.includes('Computer Science');
  const wantBus=teachDepts.includes('Business');
  const wantGen=teachDepts.includes('General Education');
  const eligible=courses.filter(c=>{
    const g=codeToGroup(c.code); // 'cs' | 'bus' | 'gen'
    if(g==='cs'  && wantCS)  return true;
    if(g==='bus' && wantBus) return true;
    if(g==='gen' && wantGen) return true;
    return false;
  });
  // Build label for the info banner
  const deptLabel=teachDepts.map(d=>({
    'Computer Science':'CS','Business':'Business','General Education':'Gen Ed'
  }[d]||d)).join(' + ');

  document.getElementById('ap-inner').innerHTML=`
    <div class="ap-hd">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="av ${cs?'av-cs':'av-bus'}" style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">${ini(ins.name)}</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#0F172A">${ins.name}</div>
          <div style="font-size:11px;color:#64748B;margin-top:2px">${d.qualification||'—'} · ${d.employment||'Full-Time'}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;">${buildDeptBadges(id)}</div>
        </div>
      </div>
    </div>
    <div class="cr-summary">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:#64748B;font-weight:500">Credit Load</span>
        <span style="font-size:15px;font-weight:800;color:${crClr}" id="pcr">${cr} / ${max}</span>
      </div>
      <div class="cr-prog"><div class="cr-prog-f" id="pbar" style="width:${pct}%;background:${crClr}"></div></div>
      <div id="ol-pay-btn-wrap">${cr>max?`
        <button onclick="openOverloadModal('${id}')" style="margin-top:8px;width:100%;padding:7px 10px;background:#FEF2F2;border:1.5px solid #FCA5A5;border-radius:7px;color:#DC2626;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5" style="width:12px;height:12px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Overload Pay &nbsp;—&nbsp; +${cr-max} cr over limit
        </button>`:''}</div>
    </div>
    <div class="timing-row">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${fmtT(d.timeFrom)} – ${fmtT(d.timeTo)}${d.notes?' · '+d.notes:''}</span>
    </div>

    <div style="padding:6px 12px 6px 16px;background:#FFFBEB;border-bottom:1px solid #FEF3C7;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <span style="font-size:10px;color:#92400E;font-weight:600;">${eligible.length} eligible courses · ${deptLabel||'All'}</span>
      <span style="font-size:10px;color:#B45309;font-weight:500;" id="panel-count">${current.size} assigned</span>
    </div>
    <div class="course-search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input class="course-search" type="text" placeholder="Search courses…" oninput="filterCourseList(this.value,'${id}')">
    </div>
    <div class="clist" id="panel-clist">
      ${eligible.map(c=>{
        const chk=current.has(c.code);
        const wouldOver=!chk&&(cr+getCr(c.code))>max;
        const grp=codeToGroup(c.code);
        const dotClr=grp==='cs'?'#1D4ED8':grp==='gen'?'#15803D':'#B45309';
        return `<div class="citem" data-code="${c.code.toLowerCase()}" data-name="${c.name.toLowerCase()}">
          <input type="checkbox" ${chk?'checked':''} onchange="toggle('${id}','${c.code}',this.checked)">
          <span class="cc">${c.code}</span>
          <span class="cn">${c.name}</span>
          <span style="width:6px;height:6px;border-radius:50%;background:${dotClr};flex-shrink:0;"></span>
          <span class="ccr">${getCr(c.code)}</span>
          ${wouldOver?'<span class="over-w">⚠</span>':''}
        </div>`;
      }).join('')}
      <div class="no-results" id="panel-no-results">No courses match your search</div>
    </div>
    <div class="ap-foot">
      <button class="btn-save-portal" style="width:100%" onclick="saveAssign('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
        Save Assignment
      </button>
    </div>`;
}

function toggle(id,code,checked){
  if(!assignments[id]) assignments[id]=[];
  if(checked){ if(!assignments[id].includes(code)) assignments[id].push(code); }
  else assignments[id]=assignments[id].filter(c=>c!==code);
  // Live update credit indicator
  const cr=assignedCr(id), max=getMax(id);
  const pct=Math.min(100,Math.round(cr/max*100));
  const clr=pct>100?'#DC2626':pct>80?'#B45309':'#15803D';
  const pe=document.getElementById('pcr'), pb=document.getElementById('pbar');
  if(pe){pe.textContent=`${cr} / ${max}`;pe.style.color=clr;}
  if(pb){pb.style.width=pct+'%';pb.style.background=clr;}
  // Live update assigned count
  const pc=document.getElementById('panel-count');
  if(pc) pc.textContent=assignments[id].length+' assigned';
  // Refresh overload pay button live
  const olWrap=document.getElementById('ol-pay-btn-wrap');
  if(olWrap){
    if(cr>max){
      olWrap.innerHTML=`<button onclick="openOverloadModal('${id}')" style="margin-top:8px;width:100%;padding:7px 10px;background:#FEF2F2;border:1.5px solid #FCA5A5;border-radius:7px;color:#DC2626;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5" style="width:12px;height:12px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Overload Pay &nbsp;—&nbsp; +${cr-max} cr over limit
      </button>`;
    } else {
      olWrap.innerHTML='';
    }
  }
  if(cr>max) toast(`Over limit: ${cr}/${max} credits`,'err');
  updateStats(); renderList();
}

// ── Overload Pay Modal ────────────────────────────────────────────────────
function openOverloadModal(id){
  const ins=instructors.find(i=>i.id===id);
  if(!ins) return;
  const d=instData[id]||{};
  const cr=assignedCr(id), max=getMax(id), ol=cr-max;
  if(ol<=0) return;

  const stored=JSON.parse(localStorage.getItem('cck_overload_rates')||'{}');
  const rate=stored[id]!==undefined ? stored[id] : 15;
  const totalPay=(ol*rate).toFixed(3);

  // Build assigned courses with overload flag
  const assignedCodes=assignments[id]||[];
  let running=0;
  const rows=assignedCodes.map(code=>{
    const c=courses.find(x=>x.code===code)||{code,name:code,credits:3};
    const cr=getCr(c.code);
    const prevRunning=running;
    running+=cr;
    return {code:c.code, name:c.name||code, cr, isOver: running>max && prevRunning<running};
  });

  // Remove existing modal if any
  const old=document.getElementById('overload-modal');
  if(old) old.remove();

  const modal=document.createElement('div');
  modal.id='overload-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML=`
    <div style="background:white;border-radius:14px;width:100%;max-width:500px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.25);">

      <!-- Header -->
      <div style="padding:16px 20px 14px;border-bottom:1px solid #F1F5F9;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0">
        <div>
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5" style="width:15px;height:15px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style="font-size:15px;font-weight:800;color:#0F172A">Overload Payment</span>
            <span style="font-size:10px;font-weight:700;color:#DC2626;background:#FEE2E2;border:1px solid #FCA5A5;padding:2px 8px;border-radius:10px">+${ol} cr</span>
          </div>
          <div style="font-size:12px;color:#64748B">${ins.name} · ${d.qualification||'—'} · ${d.employment||'Full-Time'}</div>
          <div style="font-size:11px;color:#64748B;margin-top:2px">Limit: <b>${max}</b> cr &nbsp;·&nbsp; Assigned: <b>${cr}</b> cr &nbsp;·&nbsp; Overload: <span style="color:#DC2626;font-weight:700">${ol} cr</span></div>
        </div>
        <button onclick="closeOverloadModal()" style="width:28px;height:28px;border:none;background:#F1F5F9;border-radius:7px;cursor:pointer;color:#64748B;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:inherit">✕</button>
      </div>

      <!-- Scrollable body -->
      <div style="flex:1;overflow-y:auto;padding:16px 20px;">

        <!-- Course table -->
        <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Assigned Courses</div>
        <div style="border:1px solid #E2E8F0;border-radius:9px;overflow:hidden;margin-bottom:18px">
          <div style="display:grid;grid-template-columns:90px 1fr 36px;padding:6px 12px;background:#F8FAFC;border-bottom:1px solid #E2E8F0">
            <span style="font-size:10px;font-weight:700;color:#64748B">Code</span>
            <span style="font-size:10px;font-weight:700;color:#64748B">Course Name</span>
            <span style="font-size:10px;font-weight:700;color:#64748B;text-align:right">Cr</span>
          </div>
          ${rows.map((c,i)=>`
            <div style="display:grid;grid-template-columns:90px 1fr 36px;padding:8px 12px;${i<rows.length-1?'border-bottom:1px solid #F1F5F9;':''}background:${c.isOver?'#FEF2F2':'white'};">
              <span style="font-size:11px;font-weight:700;color:${c.isOver?'#DC2626':'#0F172A'};font-family:monospace;letter-spacing:.02em">${c.code}</span>
              <span style="font-size:11px;color:${c.isOver?'#B91C1C':'#374151'};padding-right:8px;line-height:1.5">${c.name}</span>
              <span style="font-size:12px;font-weight:700;color:${c.isOver?'#DC2626':'#475569'};text-align:right">${c.cr}</span>
            </div>`).join('')}
        </div>

        <!-- Summary pills -->
        <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Payment Calculation</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:9px;text-align:center">
            <div style="font-size:9px;font-weight:600;color:#64748B;text-transform:uppercase;margin-bottom:3px">Assigned</div>
            <div style="font-size:17px;font-weight:800;color:#0F172A">${cr}<span style="font-size:10px;font-weight:500;color:#64748B"> cr</span></div>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:9px;text-align:center">
            <div style="font-size:9px;font-weight:600;color:#64748B;text-transform:uppercase;margin-bottom:3px">Limit</div>
            <div style="font-size:17px;font-weight:800;color:#0F172A">${max}<span style="font-size:10px;font-weight:500;color:#64748B"> cr</span></div>
          </div>
          <div style="background:#FEE2E2;border:1px solid #FCA5A5;border-radius:8px;padding:9px;text-align:center">
            <div style="font-size:9px;font-weight:600;color:#991B1B;text-transform:uppercase;margin-bottom:3px">Overload</div>
            <div style="font-size:17px;font-weight:800;color:#DC2626">+${ol}<span style="font-size:10px;font-weight:500"> cr</span></div>
          </div>
        </div>

        <!-- Rate input -->
        <div style="background:#FEF2F2;border:1.5px solid #FCA5A5;border-radius:10px;padding:14px 16px;">
          <div style="margin-bottom:12px">
            <label style="font-size:10px;font-weight:700;color:#7F1D1D;display:block;margin-bottom:6px">Rate per overload credit (KWD)</label>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <input type="number" id="ol-rate-inp" value="${rate}" min="0" step="0.5"
                style="width:88px;padding:7px 10px;border:1.5px solid #FCA5A5;border-radius:7px;font-size:14px;font-weight:700;color:#0F172A;font-family:inherit;outline:none;background:white"
                oninput="olCalcFromRate(${ol})"
                onfocus="this.style.borderColor='#DC2626'" onblur="this.style.borderColor='#FCA5A5'">
              <span style="font-size:11px;font-weight:600;color:#7F1D1D">KWD / cr</span>
              <div style="display:flex;gap:4px;margin-left:auto">
                ${[10,15,20,25].map(r=>`<button onclick="olSetRate(${r},${ol})" style="padding:5px 9px;border:1.5px solid #FECACA;border-radius:6px;font-size:11px;font-weight:700;background:white;color:#DC2626;cursor:pointer;font-family:inherit">${r}</button>`).join('')}
              </div>
            </div>
          </div>

          <!-- Total -->
          <div>
            <label style="font-size:10px;font-weight:700;color:#7F1D1D;display:block;margin-bottom:6px">Total overload payment (KWD)</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" id="ol-total-inp" value="${totalPay}" min="0" step="0.001"
                style="flex:1;padding:10px 14px;border:2px solid #FCA5A5;border-radius:8px;font-size:20px;font-weight:900;color:#DC2626;font-family:inherit;outline:none;background:white"
                oninput="olCalcFromTotal(${ol})"
                onfocus="this.style.borderColor='#DC2626'" onblur="this.style.borderColor='#FCA5A5'">
              <span style="font-size:13px;font-weight:700;color:#7F1D1D;flex-shrink:0">KWD</span>
            </div>
            <div style="font-size:11px;color:#64748B;margin-top:5px" id="ol-formula">${ol} cr × ${rate} KWD/cr = ${totalPay} KWD</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:12px 20px;border-top:1px solid #F1F5F9;display:flex;gap:8px;flex-shrink:0">
        <button onclick="olSaveRate('${id}')" style="flex:1;padding:10px;background:#DC2626;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Save Rate</button>
        <button onclick="closeOverloadModal()" style="padding:10px 18px;background:#F8FAFC;color:#475569;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Close</button>
      </div>
    </div>`;

  modal.addEventListener('click', e=>{ if(e.target===modal) closeOverloadModal(); });
  document.body.appendChild(modal);
}

function closeOverloadModal(){
  const m=document.getElementById('overload-modal');
  if(m) m.remove();
}

function olCalcFromRate(ol){
  const r=parseFloat(document.getElementById('ol-rate-inp')?.value)||0;
  const t=(ol*r).toFixed(3);
  const ti=document.getElementById('ol-total-inp');
  const f=document.getElementById('ol-formula');
  if(ti) ti.value=t;
  if(f) f.textContent=`${ol} cr × ${r} KWD/cr = ${t} KWD`;
}

function olCalcFromTotal(ol){
  const t=parseFloat(document.getElementById('ol-total-inp')?.value)||0;
  const r=ol>0?(t/ol):0;
  const ri=document.getElementById('ol-rate-inp');
  const f=document.getElementById('ol-formula');
  if(ri) ri.value=r.toFixed(3);
  if(f) f.textContent=`${ol} cr × ${r.toFixed(3)} KWD/cr = ${t.toFixed(3)} KWD`;
}

function olSetRate(rate,ol){
  const ri=document.getElementById('ol-rate-inp');
  const ti=document.getElementById('ol-total-inp');
  const f=document.getElementById('ol-formula');
  const t=(ol*rate).toFixed(3);
  if(ri) ri.value=rate;
  if(ti) ti.value=t;
  if(f) f.textContent=`${ol} cr × ${rate} KWD/cr = ${t} KWD`;
}

function olSaveRate(id){
  const rate=parseFloat(document.getElementById('ol-rate-inp')?.value)||0;
  const stored=JSON.parse(localStorage.getItem('cck_overload_rates')||'{}');
  stored[id]=rate;
  localStorage.setItem('cck_overload_rates',JSON.stringify(stored));
  closeOverloadModal();
  toast('Overload rate saved','ok');
}

function filterCourseList(q, insId){
  q=q.toLowerCase().trim();
  const items=document.querySelectorAll('#panel-clist .citem');
  let visible=0;
  items.forEach(function(el){
    const code=el.getAttribute('data-code')||'';
    const name=el.getAttribute('data-name')||'';
    const match=!q||code.includes(q)||name.includes(q);
    el.classList.toggle('hidden',!match);
    if(match) visible++;
  });
  const noRes=document.getElementById('panel-no-results');
  if(noRes) noRes.style.display=(visible===0&&q)?'block':'none';
}

async function saveAssign(id){
  const saved=JSON.parse(localStorage.getItem('cck_hod_assignments')||'{}');
  saved[id]=assignments[id]||[];
  localStorage.setItem('cck_hod_assignments',JSON.stringify(saved));

  const client=typeof getSupabaseClient==='function'?getSupabaseClient():null;
  const ins=instructors.find(i=>i.id===id);
  if(client){
    try{
      // Save assignments as instructor_courses records
      const records=(assignments[id]||[]).map(code=>({instructor_name:ins?.name, course_code:code, is_tutoring:false}));
      await client.from('instructor_courses').delete().eq('instructor_name',ins?.name).eq('is_tutoring',false);
      if(records.length) await client.from('instructor_courses').insert(records);
      // Save teach_depts to instructors table
      const teachDepts=getTeachDepts(id);
      await client.from('instructors').update({
        notes:(instData[id]?.notes||''),
        employment_type:(instData[id]?.employment||'Full-Time')
      }).eq('instructor_id',id).catch(()=>{});
      toast(`${ins?.name.split(' ').pop()||id} saved to DB`,'ok');
    }catch(e){
      console.warn('[CCK] saveAssign DB:',e?.message||e);
      toast(`${ins?.name.split(' ').pop()||id} saved locally`,'info');
    }
  } else {
    toast(`${ins?.name.split(' ').pop()||id} assignment saved`,'ok');
  }
  updateStats();
  resetApprovalOnSave();
}

async function saveAll(){
  localStorage.setItem('cck_hod_assignments',JSON.stringify(assignments));
  const client=typeof getSupabaseClient==='function'?getSupabaseClient():null;
  if(client){
    try{
      let dbSaved=0;
      for(const ins of instructors){
        const records=(assignments[ins.id]||[]).map(code=>({instructor_name:ins.name, course_code:code}));
        await client.from('instructor_courses').delete().eq('instructor_name',ins.name);
        if(records.length){ await client.from('instructor_courses').insert(records); }
        dbSaved++;
      }
      toast(`All ${dbSaved} instructors saved to database`,'ok');
    }catch(e){ toast('Saved locally (DB error)','info'); }
  } else { toast(`All assignments saved locally`,'info'); }
  updateStats();
  resetApprovalOnSave();
}

function renderSummary(){
  document.getElementById('sg').innerHTML=instructors.map(ins=>{
    const crs=assignments[ins.id]||[], cr=assignedCr(ins.id), max=getMax(ins.id);
    const pct=Math.min(100,Math.round(cr/max*100));
    const cs=ins.department==='Computer Science';
    const sCls=pct>100?'s-over':pct>80?'s-warn':'s-ok';
    const sTxt=pct>100?'Overloaded':pct>80?'Near Limit':'OK';
    const depts=getTeachDepts(ins.id);
    const deptBadges=depts.map(d=>{
      const cfg={'Computer Science':{bg:'#EFF6FF',c:'#1D4ED8',bd:'#BFDBFE',s:'CS'},
                 'Business':{bg:'#FFFBEB',c:'#B45309',bd:'#FDE68A',s:'Biz'},
                 'General Education':{bg:'#F0FDF4',c:'#15803D',bd:'#BBF7D0',s:'Gen Ed'}}[d]||{bg:'#F1F5F9',c:'#475569',bd:'#E2E8F0',s:d};
      return '<span style="padding:2px 9px;border-radius:5px;font-size:10px;font-weight:700;background:'+cfg.bg+';color:'+cfg.c+';border:1px solid '+cfg.bd+'">'+cfg.s+'</span>';
    }).join('');
    const crBar=`<div style="height:3px;background:#E2E8F0;border-radius:2px;margin-top:5px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct>100?'#DC2626':pct>80?'#B45309':'#15803D'};border-radius:2px"></div></div>`;
    return `<div class="sc">
      <div class="sc-hd">
        <div class="av ${cs?'av-cs':'av-bus'}" style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${ini(ins.name)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ins.name}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">
            <span style="font-size:10px;color:#64748B">${(instData[ins.id]?.qualification)||''} · ${(instData[ins.id]?.employment)||'FT'}</span>
            ${deptBadges}
          </div>
          ${crBar}
        </div>
        <span class="${sCls}" style="flex-shrink:0;margin-left:6px">${sTxt}</span>
      </div>
      <div class="sc-chips" style="min-height:auto;padding:8px 14px">
        ${crs.length?crs.map(c=>`<span class="chip ${codeToGroup(c)==='cs'?'chip-cs':codeToGroup(c)==='gen'?'chip-gen':'chip-bus'}">${c}</span>`).join(''):'<span style="font-size:11px;color:#64748B;font-style:italic">None assigned</span>'}
      </div>
      <div class="sc-ft">
        <span style="font-size:11px;font-weight:700;color:${pct>100?'#DC2626':pct>80?'#B45309':'#374151'}">${cr} / ${max} cr.</span>
        <span style="font-size:11px;color:#64748B">${crs.length} course${crs.length!==1?'s':''}</span>
        <button onclick="downloadSummary('${ins.id}')" style="padding:3px 10px;background:#0F172A;color:white;border:none;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;letter-spacing:.02em">↓ PDF</button>
      </div>
    </div>`;
  }).join('');
}

function renderUnassigned(){
  const asgnSet=new Set(Object.values(assignments).flat());
  const list=courses.filter(c=>!asgnSet.has(c.code));
  document.getElementById('no-un').style.display=list.length?'none':'block';
  document.getElementById('un-tbody').innerHTML=list.map(c=>`<tr>
    <td><strong style="color:#DC2626;font-size:12px">${c.code}</strong></td>
    <td>${c.name}</td>
    <td><span class="dept-badge ${isCS(c.code)?'dept-cs':'dept-bus'}">${isCS(c.code)?'CS':'Biz'}</span></td>
    <td>${getCr(c.code)} cr.</td>
    <td>
      <button onclick="openAssignModal('${c.code}','${c.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;')}',${isCS(c.code)})"
        style="padding:4px 12px;background:#0F172A;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        Assign
      </button>
    </td>
  </tr>`).join('');
  // Also update the table header
  const thead = document.querySelector('#v-unassigned thead tr');
  if(thead && thead.children.length===4){
    const th=document.createElement('th'); th.textContent='Action';
    thead.appendChild(th);
  }
}

// ── ASSIGN INSTRUCTOR MODAL ──
function openAssignModal(code, name, cs){
  document.getElementById('am-course-code').value=code;
  document.getElementById('am-course-name').textContent=code+' · '+name;
  document.getElementById('assign-modal').style.display='flex';

  var eligible=instructors.filter(function(i){return (i.department==='Computer Science')===cs;});
  var container=document.getElementById('am-inst-list');
  container.innerHTML='';

  eligible.forEach(function(ins){
    var cr=assignedCr(ins.id), max=getMax(ins.id);
    var already=(assignments[ins.id]||[]).includes(code);
    var pct=Math.min(100,Math.round(cr/max*100));
    var crClr=pct>100?'#DC2626':pct>80?'#B45309':'#15803D';
    var avCls=cs?'av-cs':'av-bus';

    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #F9FAFB;cursor:'+(already?'default':'pointer')+';background:'+(already?'#F0FDF4':'white')+';transition:background .1s';
    if(!already){
      row.onmouseenter=function(){this.style.background='#F8FAFC';};
      row.onmouseleave=function(){this.style.background='white';};
      row.onclick=function(){quickAssign(ins.id,code);};
    }

    var av=document.createElement('div');
    av.className='av '+avCls;
    av.style.cssText='width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0';
    av.textContent=ini(ins.name);

    var info=document.createElement('div');
    info.style.cssText='flex:1;min-width:0';
    info.innerHTML='<div style="font-size:12px;font-weight:600;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+ins.name+'</div>'
      +'<div style="font-size:10px;color:#64748B">'+cr+'/'+max+' credits used</div>'
      +'<div style="height:3px;background:#E2E8F0;border-radius:2px;margin-top:3px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+crClr+';border-radius:2px"></div></div>';

    row.appendChild(av);
    row.appendChild(info);
    if(already){
      var badge=document.createElement('span');
      badge.style.cssText='font-size:10px;font-weight:700;color:#15803D;background:#DCFCE7;padding:2px 7px;border-radius:10px;flex-shrink:0';
      badge.textContent='Assigned ✓';
      row.appendChild(badge);
    }
    container.appendChild(row);
  });
}

function closeAssignModal(){
  document.getElementById('assign-modal').style.display='none';
}

async function quickAssign(insId, code){
  if(!assignments[insId]) assignments[insId]=[];
  if(!assignments[insId].includes(code)) assignments[insId].push(code);

  // Persist locally
  localStorage.setItem('cck_hod_assignments',JSON.stringify(assignments));

  // Persist to Supabase
  const client=typeof getSupabaseClient==='function'?getSupabaseClient():null;
  const ins=instructors.find(i=>i.id===insId);
  if(client && ins){
    try{
      await client.from('instructor_courses').insert([{instructor_name:ins.name,course_code:code}]);
    }catch(e){}
  }

  closeAssignModal();
  updateStats();
  renderUnassigned();
  toast(code+' assigned to '+ins?.name.split(' ').pop(),'ok');
}

function showView(v,btn){
  ['assign','summary','unassigned','timetable','tutoring'].forEach(s=>document.getElementById('v-'+s).style.display=s===v?'block':'none');
  document.querySelectorAll('.portal-nav-link').forEach(l=>l.classList.remove('active'));
  btn?.classList.add('active');
  if(v==='summary') renderSummary();
  if(v==='unassigned') renderUnassigned();
  if(v==='timetable') renderTimetable();
  if(v==='tutoring') renderTutoring();
}

function toast(msg,type){
  type=type||'ok';
  const c=document.getElementById('ts'),d=document.createElement('div');
  d.className='toast '+type;
  d.textContent=msg;
  c.appendChild(d);
  setTimeout(function(){d.remove();},3200);
}


// ── SUMMER TIME SLOTS ──────────────────────────────
const DAYS=['Sun','Mon','Tue','Wed','Thu'];
const SLOTS=['08:00','09:30','11:00','12:30','14:00','15:30'];
const SLOT_LABELS=['8:00 AM','9:30 AM','11:00 AM','12:30 PM','2:00 PM','3:30 PM'];

function populateTtInstSelect(){
  const sel=document.getElementById('tt-inst');
  if(!sel) return;
  const dept=document.getElementById('tt-dept')?.value||'all';
  const prev=sel.value;
  sel.innerHTML='<option value="all">All Instructors</option>';
  instructors.filter(i=>{
    if(dept==='cs') return i.department==='Computer Science';
    if(dept==='bus') return i.department==='Business';
    return true;
  }).forEach(i=>{
    const o=document.createElement('option');
    o.value=i.id; o.textContent=i.name;
    sel.appendChild(o);
  });
  if(prev) sel.value=prev;
}

function renderTimetable(){
  populateTtInstSelect();
  const dept=(document.getElementById('tt-dept')||{}).value||'all';
  const instSel=(document.getElementById('tt-inst')||{}).value||'all';
  const list=instructors.filter(function(i){
    if(dept==='cs'&&i.department!=='Computer Science') return false;
    if(dept==='bus'&&i.department!=='Business') return false;
    if(instSel!=='all'&&i.id!==instSel) return false;
    return (assignments[i.id]||[]).length>0;
  });

  if(!list.length){
    document.getElementById('tt-grid').innerHTML='<div style="padding:40px;text-align:center;color:#64748B;font-size:13px">No instructors with assignments found.</div>';
    return;
  }

  var html='';
  list.forEach(function(ins){
    var crs=assignments[ins.id]||[];
    var d=instData[ins.id]||{};
    var cs=ins.department==='Computer Science';
    var cr=assignedCr(ins.id), max=getMax(ins.id);
    var pct=Math.min(100,Math.round(cr/max*100));
    var crClr=pct>100?'#DC2626':pct>80?'#B45309':'#15803D';
    var cellBg=cs?'#EFF6FF':'#FFFBEB';
    var cellBorder=cs?'#BFDBFE':'#FDE68A';
    var cellTxt=cs?'#1E40AF':'#92400E';
    var avCls=cs?'av-cs':'av-bus';

    // Build grid
    var grid={};
    DAYS.forEach(function(day){SLOTS.forEach(function(sl){grid[day+sl]=null;});});
    crs.forEach(function(code,idx){
      var day=DAYS[idx%DAYS.length];
      var slot=SLOTS[Math.floor(idx/DAYS.length)%SLOTS.length];
      if(!grid[day+slot]) grid[day+slot]=code;
    });

    // Card header
    html+='<div style="background:white;border-radius:12px;border:1px solid #F1F5F9;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:16px;overflow:hidden">';
    html+='<div style="padding:14px 18px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">';
    html+='<div style="display:flex;align-items:center;gap:10px">';
    html+='<div class="av '+avCls+'" style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">'+ini(ins.name)+'</div>';
    html+='<div><div style="font-size:14px;font-weight:700;color:#0F172A">'+ins.name+'</div>';
    html+='<div style="font-size:11px;color:#64748B">'+(d.qualification||'')+' · '+(d.employment||'FT')+' · '+ins.department+'</div></div>';
    html+='</div>';
    html+='<div style="display:flex;align-items:center;gap:10px">';
    html+='<span style="font-size:13px;font-weight:800;color:'+crClr+'">'+cr+'/'+max+' cr</span>';
    html+='<button data-insid="'+ins.id+'" onclick="downloadSummary(this.dataset.insid)" style="padding:5px 12px;background:#0F172A;color:white;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer">&#8595; Download</button>';
    html+='</div></div>';

    // Grid table
    html+='<div style="overflow-x:auto;padding:14px 18px">';
    html+='<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:500px">';
    html+='<thead><tr><th style="padding:7px 10px;text-align:left;color:#64748B;font-weight:600;border-bottom:2px solid #F1F5F9;width:80px">Time</th>';
    DAYS.forEach(function(day){
      html+='<th style="padding:7px 10px;text-align:center;color:#64748B;font-weight:600;border-bottom:2px solid #F1F5F9">'+day+'</th>';
    });
    html+='</tr></thead><tbody>';
    SLOTS.forEach(function(slot,si){
      html+='<tr><td style="padding:6px 10px;color:#64748B;font-size:10px;font-weight:500;border-bottom:1px solid #F9FAFB;background:#FAFAFA">'+SLOT_LABELS[si]+'</td>';
      DAYS.forEach(function(day){
        var code=grid[day+slot];
        var cObj=code?courses.find(function(c){return c.code===code;}):null;
        html+='<td style="padding:5px 6px;border-bottom:1px solid #F9FAFB;text-align:center">';
        if(code){
          html+='<div style="background:'+cellBg+';border:1px solid '+cellBorder+';border-radius:5px;padding:4px 6px">';
          html+='<div style="font-size:10px;font-weight:700;color:'+cellTxt+'">'+code+'</div>';
          if(cObj) html+='<div style="font-size:9px;color:#64748B;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">'+cObj.name+'</div>';
          html+='</div>';
        } else {
          html+='<div style="height:32px"></div>';
        }
        html+='</td>';
      });
      html+='</tr>';
    });
    html+='</tbody></table></div></div>';
  });
  document.getElementById('tt-grid').innerHTML=html;
}


// ── DOWNLOAD SUMMARY (print-friendly popup) ──────────
function downloadSummary(insId){
  var ins=instructors.find(function(i){return i.id===insId;});
  if(!ins) return;
  var d=instData[insId]||{};
  var crs=assignments[insId]||[], cr=assignedCr(insId), max=getMax(insId);
  var cs=ins.department==='Computer Science';
  var pct=Math.min(100,Math.round(cr/max*100));
  var statusTxt=pct>100?'Overloaded':pct>80?'Near Limit':'Within Limit';
  var statusClr=pct>100?'#DC2626':pct>80?'#B45309':'#15803D';
  var avBg=cs?'#DBEAFE':'#FEF3C7';
  var avClr=cs?'#1E40AF':'#92400E';
  var badgeBg=pct>100?'#FEE2E2':pct>80?'#FEF3C7':'#DCFCE7';
  var cellBg=cs?'#EFF6FF':'#FFFBEB';
  var cellBorder=cs?'#BFDBFE':'#FDE68A';
  var cellTxt=cs?'#1E40AF':'#92400E';

  // Build timetable grid
  var grid={};
  DAYS.forEach(function(day){SLOTS.forEach(function(sl){grid[day+sl]=null;});});
  crs.forEach(function(code,idx2){
    var day=DAYS[idx2%DAYS.length];
    var slot=SLOTS[Math.floor(idx2/DAYS.length)%SLOTS.length];
    if(!grid[day+slot]) grid[day+slot]=code;
  });

  // Build table rows
  var theadCells=DAYS.map(function(day){return '<th>'+day+'</th>';}).join('');
  var tbodyRows=SLOTS.map(function(slot,si){
    var dayCells=DAYS.map(function(day){
      var code=grid[day+slot];
      var cObj=courses.find(function(c){return c.code===code;});
      if(!code) return '<td></td>';
      return '<td><div style="background:'+cellBg+';border:1px solid '+cellBorder+';border-radius:5px;padding:5px 7px;"><div style="font-size:10px;font-weight:800;color:'+cellTxt+'">'+code+'</div>'+(cObj?'<div style="font-size:9px;color:#64748B;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px">'+cObj.name+'</div>':'')+'</div></td>';
    }).join('');
    return '<tr><td>'+SLOT_LABELS[si]+'</td>'+dayCells+'</tr>';
  }).join('');

  var courseRows=crs.map(function(code){
    var c=courses.find(function(x){return x.code===code;})||{name:code,credits:getCr(code)};
    return '<div style="display:flex;align-items:center;padding:9px 18px;border-bottom:1px solid #F9FAFB;gap:10px;"><span style="font-size:11px;font-weight:700;color:#DC2626;min-width:80px">'+code+'</span><span style="font-size:11px;color:#374151;flex:1">'+c.name+'</span><span style="font-size:11px;font-weight:600;color:#64748B">'+getCr(code)+' cr</span></div>';
  }).join('');

  var initials=ini(ins.name);
  var qualification=d.qualification||'';
  var employment=d.employment||'Full-Time';
  var timeFrom=fmtT(d.timeFrom);
  var timeTo=fmtT(d.timeTo);
  var progPct=Math.min(100,pct);

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>' + ins.name + ' - Summer Schedule</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif;}'
    + 'body{background:#F8FAFC;padding:24px;color:#0F172A;}'
    + '.hdr{background:white;border-radius:12px;padding:20px 24px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,.06);}'
    + '.av{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;background:' + avBg + ';color:' + avClr + ';}'
    + 'h1{font-size:20px;font-weight:800;}'
    + '.sub{font-size:12px;color:#64748B;margin-top:3px;}'
    + '.badge{padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:' + badgeBg + ';color:' + statusClr + ';}'
    + '.meta{background:white;border-radius:10px;padding:14px 20px;margin-bottom:16px;border:1px solid #E2E8F0;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}'
    + '.ml label{font-size:10px;color:#64748B;font-weight:600;display:block;text-transform:uppercase;letter-spacing:.04em;}'
    + '.ml span{font-size:14px;font-weight:700;display:block;margin-top:3px;}'
    + '.tt{background:white;border-radius:10px;border:1px solid #E2E8F0;overflow:hidden;margin-bottom:16px;}'
    + '.tt-t{padding:12px 18px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;}'
    + 'table{width:100%;border-collapse:collapse;font-size:11px;}'
    + 'th{padding:9px 12px;text-align:center;color:#64748B;font-weight:600;border-bottom:2px solid #F1F5F9;background:#FAFAFA;}'
    + 'th:first-child{text-align:left;}'
    + 'td{padding:7px 8px;border-bottom:1px solid #F9FAFB;text-align:center;}'
    + 'td:first-child{text-align:left;color:#64748B;font-size:10px;font-weight:500;background:#FAFAFA;width:80px;}'
    + '.crs{background:white;border-radius:10px;border:1px solid #E2E8F0;overflow:hidden;}'
    + '.crs-t{padding:12px 18px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;}'
    + '.pb{height:5px;background:#E2E8F0;border-radius:3px;margin-top:8px;overflow:hidden;}'
    + '.pf{height:100%;border-radius:3px;background:' + statusClr + ';width:' + progPct + '%;}'
    + '@media print{body{background:white;padding:12px;}.np{display:none!important;}}'
    + '</style></head><body>'
    + '<div class="hdr">'
    +   '<div style="display:flex;align-items:center;gap:14px">'
    +     '<div class="av">' + initials + '</div>'
    +     '<div><h1>' + ins.name + '</h1><div class="sub">' + qualification + ' - ' + employment + ' - ' + ins.department + '</div></div>'
    +   '</div>'
    +   '<div style="text-align:right">'
    +     '<div class="badge">' + statusTxt + '</div>'
    +     '<div style="font-size:22px;font-weight:800;color:' + statusClr + ';margin-top:6px">' + cr + ' <span style="font-size:13px;font-weight:500;color:#64748B">/ ' + max + ' cr</span></div>'
    +     '<div class="pb"><div class="pf"></div></div>'
    +   '</div>'
    + '</div>'
    + '<div class="meta">'
    +   '<div class="ml"><label>Department</label><span>' + ins.department + '</span></div>'
    +   '<div class="ml"><label>Employment</label><span>' + employment + '</span></div>'
    +   '<div class="ml"><label>Office Hours</label><span>' + timeFrom + ' - ' + timeTo + '</span></div>'
    +   '<div class="ml"><label>Total Courses</label><span>' + crs.length + '</span></div>'
    + '</div>'
    + '<div class="tt"><div class="tt-t">Summer Timetable</div>'
    +   '<div style="overflow-x:auto;padding:14px 18px">'
    +     '<table><thead><tr><th>Time</th>' + theadCells + '</tr></thead>'
    +     '<tbody>' + tbodyRows + '</tbody></table>'
    +   '</div>'
    + '</div>'
    + '<div class="crs"><div class="crs-t">Assigned Courses (' + crs.length + ')</div>' + courseRows + '</div>'
    + '<div style="margin-top:18px;text-align:center;font-size:10px;color:#64748B" class="np">Canadian College of Kuwait - Student Information System - Generated ' + new Date().toLocaleDateString() + '</div>'
    + '<div style="margin-top:16px;display:flex;justify-content:center;gap:10px" class="np">'
    +   '<button onclick="window.print()" style="padding:8px 20px;background:#0F172A;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Print / Save PDF</button>'
    +   '<button onclick="window.close()" style="padding:8px 20px;background:#F1F5F9;color:#374151;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Close</button>'
    + '</div>'
    + '</body></html>';

  var blob = new Blob([html], {type: 'text/html'});
  var url = URL.createObjectURL(blob);
  var win = window.open(url, '_blank', 'width=920,height=720');
  if(win) {
    win.addEventListener('beforeunload', function(){ URL.revokeObjectURL(url); });
  }
}


function downloadAllSummaries(){
  instructors.forEach((ins,i)=>setTimeout(()=>downloadSummary(ins.id),i*250));
  toast('Opening '+instructors.length+' summary windows…','info');
}



// ─────────────────────────────────────────────────────────────
// TUTORING CLASSES
// tutorData[insId]    = [courseCode, ...]  courses marked as tutoring
// tutorPayment[insId] = { rate:'per_hour'|'per_session'|'fixed', amount:N }
// ─────────────────────────────────────────────────────────────
const COURSE_DB={'ACC0012':{n:'Business Project',cr:3},'ACC0014':{n:'Accounting for Small Business',cr:3},'ACC2201':{n:'Financial Accounting I',cr:3},'ACC2202':{n:'Financial Accounting II',cr:3},'ACC2209':{n:'Financial Accounting III',cr:3},'ACC2211':{n:'Payroll and Compliance',cr:3},'ACC2214':{n:'Financial Information for Marketing',cr:3},'ACC2233':{n:'Management Accounting I',cr:3},'ACC2234':{n:'Management Accounting II',cr:3},'ACC2262':{n:'Introduction to  Personal Taxation',cr:3},'ACC2265':{n:'Audit Principles and Business Issues',cr:3},'ACC2343':{n:'Spreadsheet Applications',cr:3},'ACC2385':{n:'Accounting Software Applications',cr:3},'BUAC3005':{n:'Intermediate Accounting',cr:3},'BUAC3050':{n:'Accounting for Government and Not for Profit Organization',cr:3},'BUAC3100':{n:'Principles of Financial Accounting',cr:3},'BUAC3120':{n:'Managerial Accounting',cr:3},'BUAC3380':{n:'Managerial Finance',cr:3},'BUAC4380':{n:'Intermediate Corporate Finance',cr:3},'BUAC4455':{n:'Advanced Financial Accounting',cr:3},'BUAC4720':{n:'Cost Accounting',cr:3},'BUAC4780':{n:'Advanced Corporate Finance',cr:3},'BUAD3090':{n:'Business Law',cr:3},'BUAD3091':{n:'Employment Law',cr:3},'BUCO3005':{n:'Management Information Systems',cr:3},'BUEN3025':{n:'Enterprise Development and Business Planning',cr:3},'BUEN3100':{n:'Business Analysis and Decision Making',cr:3},'BUEN3230':{n:'Supply Chain & Logistics Management',cr:3},'BUEN4150':{n:'Management of Innovation',cr:3},'BUEN4250':{n:'Entrepreneurial Leadership Practicum I',cr:3},'BUEN4251':{n:'Entrepreneurial leadership Practicum II',cr:3},'BUHR4120':{n:'HR Management for Entrepreneurs',cr:3},'BUMG3015':{n:'Organizational Behaviour',cr:3},'BUMG3105':{n:'Operations Management',cr:3},'BUMG3110':{n:'Advanced Organizational Behaviour',cr:3},'BUMK3099':{n:'Introduction to Marketing',cr:3},'BUMT3030':{n:'Business Statistics',cr:3},'BUS2301':{n:'Business Computer Applications',cr:3},'CSIT3014':{n:'Discrete Mathematics for Information Technology',cr:3},'CSIT3111':{n:'Advanced Networking Technologies',cr:3},'CSIT3115':{n:'Data Structure',cr:3},'CSIT3271':{n:'System Security',cr:3},'CSIT3280':{n:'Information Technology Project Management',cr:3},'CSIT3345':{n:'Advanced Web Application Development',cr:3},'CSIT4105':{n:'Search Engine Principles',cr:3},'CSIT4190':{n:'Integration Project I',cr:3},'CSIT4330':{n:'Data Warehousing and Data Mining',cr:3},'CST2234':{n:'Systems Analysis & Design',cr:3},'CST2335':{n:'Mobile Graphical Interface Programming',cr:3},'CST2355':{n:'Database Systems',cr:3},'CST8101':{n:'Computer Essentials',cr:3},'CST8102':{n:'Operating System Fundamentals (GNU/Linux)',cr:3},'CST8109':{n:'Network Programming',cr:3},'CST8116':{n:'Intro to Computer Programming',cr:3},'CST8117':{n:'Cross-Platform Design',cr:3},'CST8209':{n:'Web Programming',cr:3},'CST8215':{n:'Introduction to Database',cr:3},'CST8254':{n:'Network Operating Systems',cr:3},'CST8256':{n:'Web Programming Languages',cr:3},'CST8259':{n:'Web Programming Languages II',cr:3},'CST8260':{n:'Database Systems and Concepts',cr:3},'CST8265':{n:'Web Security Basics',cr:3},'CST8276':{n:'Advanced Database Topics',cr:3},'CST8277':{n:'Enterprise Application Programming',cr:3},'CST8279':{n:'Intro to Comp Programming using Python',cr:3},'CST8283':{n:'Business Programming',cr:3},'CST8284':{n:'Object-Oriented Programming (Java)',cr:3},'CST8285':{n:'Web Programming',cr:3},'CST8288':{n:'Object-Oriented Programming with Design Patterns',cr:3},'CST8300':{n:'Achieving Success in Changing Environments',cr:3},'CST8333':{n:'Programming Language Research Project',cr:3},'CST8334':{n:'Software Development Project',cr:3},'ECO2200':{n:'Economic Issues',cr:3},'ENL001':{n:'English for Foundation 1',cr:3},'ENL002':{n:'English for Foundation 2',cr:3},'ENL1813':{n:'Communications I',cr:3},'ENL1823':{n:'Communications II',cr:3},'FIN2230':{n:'Business Finance',cr:3},'GECU4100':{n:'Technologies ,Cultures &Societies',cr:3},'GED0022':{n:'Positive Psychology – The Science of Happiness and Well-Being',cr:3},'GED2234':{n:'Contemporary Ethical Issues',cr:3},'GEEC3150':{n:'Principles of Microeconomics',cr:3},'GEEC3250':{n:'Principles of Macroeconomics ​',cr:3},'GEN2003':{n:'Healthy Lifestyle',cr:3},'GEPH3033':{n:'Professional Integrity & Ethics',cr:3},'ICT001':{n:'Computer Skills for Foundation 1',cr:3},'ICT002':{n:'Computer Skills for Foundation 2',cr:3},'LAW1702':{n:'Business Law',cr:3},'MAT001':{n:'Core Math for Foundation 1',cr:3},'MAT002':{n:'Core Math for Foundation 2',cr:3},'MAT8001':{n:'Technical Mathematics for Computer Science',cr:3},'MGT2008':{n:'Business Plan Applied',cr:3},'MGT2201':{n:'Business Fundamentals',cr:3},'MGT2202':{n:'Emerging Technology for Business',cr:3},'MGT2203':{n:'Financial Management for Small Business',cr:3},'MGT2204':{n:'Social Innovation',cr:3},'MGT2223':{n:'Career Preparation for Entrepreneurs',cr:3},'MGT2224':{n:'Managing for Business Success',cr:3},'MGT2225':{n:'Project Management for Business Start-Ups',cr:3},'MGT2228':{n:'Global Entrepreneurship',cr:3},'MGT2232':{n:'Entrepreneurship & Innovation',cr:3},'MKT0018':{n:'Marketing for Management & Entrepreneurship',cr:3},'MKT0019':{n:'Marketing Research',cr:3},'MKT2205':{n:'Marketing Foundations',cr:3},'MKT2207':{n:'Marketing Channels',cr:3},'MKT2208':{n:'Digital Marketing',cr:3},'MKT2213':{n:'Skills for the Workplace',cr:3},'MKT2216':{n:'Skills Transferable to Business',cr:3},'MKT2218':{n:'Digital Marketing',cr:3},'MKT2260':{n:'Industry Marketing Plan',cr:3},'MKT2261':{n:'Marketing Plan Project Field Work',cr:3},'MKT2283':{n:'Sales Management',cr:3},'MKT2285':{n:'Marketing Research',cr:3},'MKT2291':{n:'Integrated Marketing Communications 1',cr:3},'MKT2292':{n:'Integrated Marketing Communications II New Media',cr:3},'QUA0002':{n:'Business Mathematics',cr:3},'QUA0008':{n:'Statistics',cr:3},'QUA2210':{n:'Basic Business Mathematics',cr:3},'RET2213':{n:'eCommerce',cr:3},'RET2214':{n:'Retail Management',cr:3},'RET2223':{n:'Professional Selling',cr:3},'CSIT3211':{n:'Foundations of Computer Security',cr:3},'CSIT3216':{n:'Server Operating Systems',cr:3},'CSIT3225':{n:'Introduction to Programming with Python',cr:3},'CSIT3235':{n:'Software Quality Assurance',cr:3},'CSIT4125':{n:'Website & Cloud Security',cr:3},'CSIT4235':{n:'Special Topics in Web & Mobile App Development',cr:2},'CSIT4290':{n:'Integration Project II',cr:3},'MKT2206':{n:'Product and Pricing Strategies',cr:4},'MKT2217':{n:'Global Marketing',cr:3},'MKT2282':{n:'Professional Selling',cr:4}};
const INST_ELIGIBLE={'INS001':['BUAD3091','BUEN4150','BUAD3090','LAW1702','RET2213','MKT2218','MGT2204','MGT2223','MKT2208','MKT2216'],'INS002':['BUEN4250','BUEN4251','BUEN3230','BUMK3099','BUEN3100','MGT2228','MGT2008','MGT2232','MKT0018','MKT2205'],'INS003':['BUMG3110','BUHR4120','BUS2301','BUMG3015','MKT2260','MKT2261'],'INS004':['BUAC3005','BUAC3120','ACC0012','ACC2385','ACC2209','ACC2234','ACC2214','ACC2233'],'INS005':['GEPH3033','GED2234','GEN2003','ENL1813','ENL002'],'INS006':['BUMT3030','MAT8001','QUA0008','QUA2210','ICT002'],'INS007':['BUCO3005','CSIT4330','CST8276','CSIT4105','CST2355','CST8259'],'INS008':['GEEC3150','MGT2224','MGT2201','MKT2283','RET2223'],'INS009':['BUAC3100','GEEC3250','ACC0014','ACC2265','ECO2200','MGT2203','ACC2201'],'INS010':['BUEN3025','ENL1823','RET2214','GED0022','MKT2291','MKT2292','MGT2202','GEN2003'],'INS011':['BUAC4720','BUAC4455','BUAC4780','BUAC4380'],'INS012':['BUAC3050','ACC2343','ACC2202','ACC2262','ACC2201','ACC2211'],'INS013':['BUMG3105','MGT2225'],'INS014':['FIN2230','BUAC3380','QUA2210','QUA0002'],'INS015':['GECU4100','CST8300','ENL1813','ENL002','ENL001'],'INS016':['MKT0019','MKT2213','MKT2207','MKT2285'],'INS017':['CSIT3014','CSIT3280','CST2234','CST8333','CST8334','CST8101','CST8215','CST8265'],'INS018':['CSIT3111','CST8288','CST8284'],'INS019':['CSIT3115','CSIT3271','CSIT4190','CST8277','CST2335','CST8109','CST8116'],'INS020':['CSIT3345','CST8283','CST8116','CST8102','CST8300','CST8117'],'INS021':['MAT8001','ICT002','ICT001'],'INS022':['CST8285','CST8279','CST8254','CST8256','CST8260','CST8209'],'INS023':['ENL002'],'INS024':['MAT002','MAT001']};

let tutorData    = {};
let tutorPayment = {};
let tutorFilter  = 'all';

function setTutFilter(f, btn){
  tutorFilter = f;
  document.querySelectorAll('#v-tutoring .filter-chip').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  renderTutoring();
}

function getCourseInfo(code){
  // Always use getCr() so credits from Registration 1 (cck_credits_shared) are respected
  var cr = getCr(code);
  var db = COURSE_DB[code];
  if(db) return {n: db.n, cr: cr};
  var c = courses.find(function(x){ return x.code===code; });
  if(c) return {n: c.name, cr: cr};
  return {n: code, cr: cr};
}

function getEligibleCourses(insId){
  // Use teach dept labels (set in Registration 2) to determine eligible courses
  const depts = getTeachDepts(insId);
  const wantCS  = depts.includes('Computer Science');
  const wantBus = depts.includes('Business');
  const wantGen = depts.includes('General Education');
  // Filter full course catalog by matching dept groups
  const eligible = courses.filter(c=>{
    const g = codeToGroup(c.code);
    if(g==='cs'  && wantCS)  return true;
    if(g==='bus' && wantBus) return true;
    if(g==='gen' && wantGen) return true;
    return false;
  }).map(c=>c.code);
  if(eligible.length) return eligible;
  // Fallback: use hardcoded map, then assigned courses
  const mapped = INST_ELIGIBLE[insId];
  if(mapped && mapped.length) return mapped;
  return assignments[insId] || [];
}

function getAllCoursesSorted(insId){
  // All courses in COURSE_DB, sorted: assigned first, then by dept group
  const ins = instructors.find(i=>i.id===insId);
  const cs = ins?.department==='Computer Science';
  const assigned = new Set(assignments[insId]||[]);
  const eligible = new Set(getEligibleCourses(insId));
  return Object.keys(COURSE_DB).sort((a,b)=>{
    const aEl=eligible.has(a), bEl=eligible.has(b);
    const aAs=assigned.has(a), bAs=assigned.has(b);
    if(aAs!==bAs) return bAs-aAs;
    if(aEl!==bEl) return bEl-aEl;
    return a.localeCompare(b);
  });
}

function renderTutoring(){
  tutorData    = JSON.parse(localStorage.getItem('cck_tutor_assignments') || '{}');
  tutorPayment = JSON.parse(localStorage.getItem('cck_tutor_payment')     || '{}');

  var q = (document.getElementById('tut-q') || {value:''}).value.toLowerCase();
  var list = instructors.filter(function(ins){
    var cs = ins.department === 'Computer Science';
    var d  = instData[ins.id] || {};
    if(tutorFilter === 'cs'  && !cs)                         return false;
    if(tutorFilter === 'bus' &&  cs)                         return false;
    if(tutorFilter === 'pt'  && d.employment !== 'Part-Time') return false;
    if(q && !ins.name.toLowerCase().includes(q))              return false;
    return true;
  });

  var grid = document.getElementById('tut-grid');
  if(!grid) return;
  if(!list.length){
    grid.innerHTML = '<p style="color:#64748B;padding:24px">No instructors match filter.</p>';
    return;
  }

  grid.innerHTML = list.map(function(ins){
    var cs       = ins.department === 'Computer Science';
    var d        = instData[ins.id] || {};
    var isPT     = d.employment === 'Part-Time';
    var eligible = getEligibleCourses(ins.id);  // ALL courses from instructors.json
    var tutored  = tutorData[ins.id]    || [];
    var pay      = tutorPayment[ins.id] || {rate:'per_hour', amount:''};
    var avCls    = cs ? 'av-cs' : 'av-bus';
    var initials = ins.name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i,'')
                           .split(' ').filter(Boolean).slice(0,2)
                           .map(function(s){ return s[0]; }).join('').toUpperCase();

    // ── Course rows: ALL courses in DB with search ──
    var allCodes = getAllCoursesSorted(ins.id);
    var eligSet  = new Set(eligible);
    var courseRows;
    if(allCodes.length){
      courseRows = eligible.map(function(code){
        var isTut = tutored.indexOf(code) !== -1;
        var ci    = getCourseInfo(code);
        var rowStyle = isTut
          ? 'background:#F0FDF4;border:1px solid #BBF7D0;border-radius:7px;'
          : 'border:1px solid transparent;border-radius:7px;';
        var cbId = 'cb_' + ins.id + '_' + code.replace(/[^a-zA-Z0-9]/g,'_');

        var row = '<label id="' + cbId + '_lbl" for="' + cbId + '" '
                + 'data-code="' + code.toLowerCase() + '" data-name="' + ci.n.toLowerCase() + '" '
                + 'style="display:flex;align-items:center;gap:9px;padding:8px 10px;cursor:pointer;transition:background .12s;' + rowStyle + '">';
        row += '<input type="checkbox" id="' + cbId + '"'
             + (isTut ? ' checked="checked"' : '')
             + ' style="width:15px;height:15px;accent-color:#15803D;cursor:pointer;flex-shrink:0"'
             + ' onchange="toggleTutor(\'' + ins.id + '\',\'' + code + '\',this.checked)">';
        row += '<span style="font-size:11px;font-weight:700;color:#1E40AF;min-width:80px;flex-shrink:0">' + code + '</span>';
        row += '<span style="font-size:11px;color:#374151;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + ci.n + '">' + ci.n + '</span>';
        row += '<span style="font-size:10px;font-weight:600;color:#64748B;flex-shrink:0">' + ci.cr + ' cr</span>';
        if(isTut){
          row += '<span style="font-size:10px;font-weight:700;color:#15803D;background:#DCFCE7;padding:1px 8px;border-radius:10px;white-space:nowrap;flex-shrink:0">Tutoring</span>';
        }
        row += '</label>';
        return row;
      }).join('');
    } else {
      courseRows = '<p style="font-size:11px;color:#64748B;padding:10px">No eligible courses found.</p>';
    }

    // ── Employment badge ──
    var badge = isPT
      ? '<span style="font-size:10px;font-weight:700;color:#B45309;background:#FEF9C3;border:1px solid #FDE68A;padding:2px 9px;border-radius:10px">Part-Time</span>'
      : '<span style="font-size:10px;font-weight:700;color:#1D4ED8;background:#EFF6FF;border:1px solid #BFDBFE;padding:2px 9px;border-radius:10px">Full-Time</span>';

    // ── Payment section ──
    var paySection;
    if(isPT){
      var rateHr  = pay.rate==='per_hour'    ? ' selected' : '';
      var rateSes = pay.rate==='per_session' ? ' selected' : '';
      var rateFix = pay.rate==='fixed'       ? ' selected' : '';
      paySection = '<div style="padding:10px 14px;background:#FFFBEB;border-top:1px solid #FDE68A;">'
        + '<div style="font-size:11px;font-weight:700;color:#92400E;margin-bottom:6px">Tutoring Payment</div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        + '<select id="pay_rate_' + ins.id + '" onchange="updatePayRate(\'' + ins.id + '\')" '
        + 'style="padding:5px 8px;border:1.5px solid #FDE68A;border-radius:6px;font-size:11px;font-weight:600;color:#92400E;background:white;cursor:pointer;">'
        + '<option value="per_hour"' + rateHr + '>Per Hour</option>'
        + '<option value="per_session"' + rateSes + '>Per Session</option>'
        + '<option value="fixed"' + rateFix + '>Fixed Monthly</option>'
        + '</select>'
        + '<div style="display:flex;align-items:center;gap:4px;">'
        + '<span style="font-size:11px;font-weight:700;color:#64748B">KWD</span>'
        + '<input type="number" id="pay_amt_' + ins.id + '" min="0" step="0.5" '
        + 'value="' + (pay.amount||'') + '" placeholder="0.000" '
        + 'onchange="updatePayAmount(\'' + ins.id + '\')" '
        + 'style="width:90px;padding:5px 8px;border:1.5px solid #FDE68A;border-radius:6px;font-size:11px;font-weight:600;color:#0F172A;">'
        + '</div>'
        + (tutored.length ? '<span style="font-size:10px;color:#64748B">for ' + tutored.length + ' course(s)</span>' : '')
        + '</div></div>';
    } else {
      paySection = '<div style="padding:10px 14px;background:#F0FDF4;border-top:1px solid #BBF7D0;">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2" style="width:14px;height:14px;flex-shrink:0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
        + '<span style="font-size:11px;font-weight:700;color:#166534">Tutoring payment included in salary</span>'
        + '</div></div>';
    }

    // ── Full card ──
    var card = '<div style="background:white;border-radius:12px;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,.06);overflow:hidden;display:flex;flex-direction:column;">';
    // Header
    card += '<div style="padding:13px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;gap:10px;">';
    card += '<div class="av ' + avCls + '" style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0">' + initials + '</div>';
    card += '<div style="flex:1;min-width:0;">';
    card += '<div style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + ins.name + '</div>';

    // Single row: employment + qualification + dept labels all inline
    var qualBg={'PhD':'#EDE9FE','Master':'#DCFCE7','Associate':'#FEF3C7','Bachelor':'#F1F5F9'}[d.qualification]||'#F1F5F9';
    var qualClr={'PhD':'#5B21B6','Master':'#166534','Associate':'#92400E','Bachelor':'#475569'}[d.qualification]||'#475569';
    var qualBadge = d.qualification
      ? '<span style="font-size:10px;font-weight:700;background:'+qualBg+';color:'+qualClr+';padding:2px 8px;border-radius:10px;white-space:nowrap">'+d.qualification+'</span>'
      : '';
    var depts = getTeachDepts(ins.id);
    var DCFG = {'Computer Science':{bg:'#EFF6FF',c:'#1D4ED8',s:'CS'},'Business':{bg:'#FFFBEB',c:'#B45309',s:'Biz'},'General Education':{bg:'#F0FDF4',c:'#15803D',s:'Gen Ed'}};
    var deptBadges = depts.map(function(dep){
      var cfg=DCFG[dep]||{bg:'#F1F5F9',c:'#475569',s:dep};
      return '<span style="font-size:10px;font-weight:700;background:'+cfg.bg+';color:'+cfg.c+';padding:2px 7px;border-radius:5px;white-space:nowrap">'+cfg.s+'</span>';
    }).join('');

    card += '<div style="display:flex;gap:4px;margin-top:4px;align-items:center;flex-wrap:wrap">';
    card += badge + qualBadge + deptBadges;
    card += '</div>';

    // Timing + stats row
    var timeStr = (d.timeFrom && d.timeTo) ? fmtT(d.timeFrom)+' – '+fmtT(d.timeTo) : '';
    var totalCodes = getAllCoursesSorted(ins.id).length;
    card += '<div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap">';
    if(timeStr){
      card += '<span style="font-size:10px;color:#64748B;display:flex;align-items:center;gap:3px;">';
      card += '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      card += timeStr+'</span>';
    }
    card += '<span style="font-size:10px;color:#64748B">' + tutored.length + ' tutoring · ' + eligible.length + ' eligible · ' + totalCodes + ' total</span>';
    card += '</div>';
    card += '</div></div>';
    // Search bar
    card += '<div style="position:relative;padding:7px 10px;border-bottom:1px solid #F1F5F9;background:#FAFAFA;">';
    card += '<svg style="position:absolute;left:19px;top:50%;transform:translateY(-50%);pointer-events:none;color:#64748B" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
    card += '<input type="text" id="tut_search_' + ins.id + '" placeholder="Search courses…" '
          + 'oninput="filterTutorRows(\'' + ins.id + '\',this.value)" '
          + 'style="width:100%;padding:6px 10px 6px 28px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:11px;font-family:inherit;outline:none;background:white;color:#0F172A;" '
          + 'onfocus="this.style.borderColor=\'#0F172A\'" onblur="this.style.borderColor=\'#E5E7EB\'">';
    card += '</div>';
    // Course list
    card += '<div id="tut_list_' + ins.id + '" style="padding:8px;display:flex;flex-direction:column;gap:2px;max-height:280px;overflow-y:auto;flex:1;">';
    card += courseRows;
    card += '<div id="tut_nores_' + ins.id + '" style="display:none;padding:16px;text-align:center;font-size:11px;color:#64748B">No courses match your search</div>';
    card += '</div>';
    // Payment
    card += paySection;
    // Footer
    card += '<div style="padding:8px 12px;background:#F8FAFC;border-top:1px solid #F1F5F9;display:flex;justify-content:flex-end;gap:8px;">';
    card += '<button class="btn-save-portal" style="padding:5px 14px;font-size:11px;" onclick="saveSingleTutor(\'' + ins.id + '\')">Save</button>';
    card += '</div>';
    card += '</div>';
    return card;
  }).join('');
}

function filterTutorRows(insId, q){
  q = (q||'').toLowerCase().trim();
  var list = document.getElementById('tut_list_' + insId);
  var noRes = document.getElementById('tut_nores_' + insId);
  if(!list) return;
  var rows = list.querySelectorAll('label[data-code]');
  var visible = 0;
  rows.forEach(function(row){
    var code = row.getAttribute('data-code')||'';
    var name = row.getAttribute('data-name')||'';
    var match = !q || code.includes(q) || name.includes(q);
    row.style.display = match ? 'flex' : 'none';
    if(match) visible++;
  });
  if(noRes) noRes.style.display = (visible===0 && q) ? 'block' : 'none';
  // Dead code below kept for reference
  var _unused = null;
  if(!card) return;
  card.querySelectorAll('label[data-code]').forEach(function(lbl){
    var code = lbl.getAttribute('data-code')||'';
    var name = lbl.getAttribute('data-name')||'';
    lbl.style.display = (!q || code.includes(q) || name.includes(q)) ? '' : 'none';
  });
}

function toggleTutor(insId, code, checked){
  if(!tutorData[insId]) tutorData[insId] = [];
  if(checked){
    if(tutorData[insId].indexOf(code) === -1) tutorData[insId].push(code);
  } else {
    tutorData[insId] = tutorData[insId].filter(function(c){ return c !== code; });
  }
  // Update the label background immediately without full re-render
  var cbId = 'cb_' + insId + '_' + code.replace(/[^a-zA-Z0-9]/g,'_');
  var lbl = document.getElementById(cbId + '_lbl');
  if(lbl){
    if(checked){
      lbl.style.background = '#F0FDF4';
      lbl.style.border = '1px solid #BBF7D0';
    } else {
      lbl.style.background = '';
      lbl.style.border = '1px solid transparent';
    }
  }
  // Update count badge in header (find nearest ancestor card)
  var cb = document.getElementById(cbId);
  if(cb){
    var card = cb.closest('[style*="flex-direction:column"]');
    if(card){
      var countEl = card.querySelector('[style*="selected for tutoring"]');
      if(countEl){
        var eligible = getEligibleCourses(insId);
        countEl.textContent = tutorData[insId].length + ' / ' + eligible.length + ' selected for tutoring';
      }
    }
  }
}

function updatePayRate(insId){
  var sel = document.getElementById('pay_rate_' + insId);
  if(!tutorPayment[insId]) tutorPayment[insId] = {rate:'per_hour', amount:''};
  tutorPayment[insId].rate = sel.value;
}

function updatePayAmount(insId){
  var inp = document.getElementById('pay_amt_' + insId);
  if(!tutorPayment[insId]) tutorPayment[insId] = {rate:'per_hour', amount:''};
  tutorPayment[insId].amount = inp.value;
}

async function saveSingleTutor(insId){
  localStorage.setItem('cck_tutor_assignments', JSON.stringify(tutorData));
  localStorage.setItem('cck_tutor_payment',     JSON.stringify(tutorPayment));
  localStorage.setItem('cck_tutoring_shared',   JSON.stringify(tutorData));

  var ins = instructors.find(function(i){ return i.id===insId; });
  var client = typeof getSupabaseClient==='function' ? getSupabaseClient() : null;
  if(client && ins){
    try{
      await client.from('instructor_courses')
        .delete().eq('instructor_name', ins.name).eq('is_tutoring', true);
      var records = (tutorData[insId]||[]).map(function(code){
        return {instructor_name: ins.name, course_code: code, is_tutoring: true};
      });
      if(records.length){
        var res = await client.from('instructor_courses').insert(records);
        if(!res.error){ toast(ins.name.split(' ').pop() + ' tutoring saved', 'ok'); return; }
      } else {
        toast(ins.name.split(' ').pop() + ' tutoring cleared', 'ok'); return;
      }
    } catch(e){ console.warn('[CCK] tutoring save:', e?.message||e); }
  }
  toast((ins ? ins.name.split(' ').pop() : insId) + ' tutoring saved locally', 'info');
}

async function saveTutoring(){
  var btn   = document.getElementById('btn-save-tut');
  var icon  = document.getElementById('tut-save-icon');
  var label = document.getElementById('tut-save-label');

  btn.style.opacity='0.7'; btn.style.pointerEvents='none';
  icon.innerHTML='<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>';
  icon.style.animation='spin .7s linear infinite';
  label.textContent='Saving...';

  localStorage.setItem('cck_tutor_assignments', JSON.stringify(tutorData));
  localStorage.setItem('cck_tutor_payment',     JSON.stringify(tutorPayment));
  localStorage.setItem('cck_tutoring_shared',   JSON.stringify(tutorData));

  var client = typeof getSupabaseClient==='function' ? getSupabaseClient() : null;
  var dbSaved = 0;
  if(client){
    for(var i=0; i<instructors.length; i++){
      var ins = instructors[i];
      try{
        await client.from('instructor_courses')
          .delete().eq('instructor_name', ins.name).eq('is_tutoring', true);
        var records = (tutorData[ins.id]||[]).map(function(code){
          return {instructor_name: ins.name, course_code: code, is_tutoring: true};
        });
        if(records.length){
          var res = await client.from('instructor_courses').insert(records);
          if(!res.error) dbSaved++;
        } else { dbSaved++; }
      } catch(e){ console.warn('[CCK] tut save:', ins.name, e?.message||e); }
    }
  }

  btn.style.opacity=''; btn.style.pointerEvents='';
  icon.innerHTML='<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/>';
  icon.style.animation='';
  label.textContent='Save All';

  toast(dbSaved>0 ? 'Saved to DB (' + dbSaved + ' instructors)' : 'Saved locally', dbSaved>0?'ok':'info');
}



init();


// ── SEMESTER SELECTOR ────────────────────────────────────────────────────────
(async function initSemesterSelector(){
  if (typeof CCK === 'undefined') return;
  await CCK.loadSemesters();
  updateSubmitState();
})();

function updateSubmitState(){
  const btn = document.getElementById('btn-submit-admin');
  const lbl = document.getElementById('submit-admin-lbl');
  if (!btn || !lbl) return;
  if (typeof CCK === 'undefined') return;
  const semKey = CCK.getActiveSemKey();
  const status = CCK.getHodStatus(semKey);
  let s, t;
  if (CCK.isArchived(semKey))    { s='archived';  t='Archived – Read Only'; }
  else if (status==='submitted') { s='submitted'; t='⏳ Pending Approval'; }
  else if (status==='approved')  { s='approved';  t='✓ Approved by Admin'; }
  else if (status==='resubmit')  { s='resubmit';  t='🔄 Resubmit to Admin'; }
  else                           { s='draft';     t='Submit to Admin'; }
  btn.dataset.status = s;
  lbl.textContent = t;
  // Allow clicking for draft and resubmit; block submitted/approved/archived
  btn.disabled = (s === 'submitted' || s === 'archived' || s === 'approved');
}

function resetApprovalOnSave(){
  if (typeof CCK === 'undefined') return;
  const semKey = CCK.getActiveSemKey();
  const cur = CCK.getHodStatus(semKey);
  if (cur === 'approved' || cur === 'submitted') {
    CCK.setHodStatus('resubmit', semKey);
    updateSubmitState();
    toast('Assignments changed — resubmit to Admin when ready', 'info');
  }
}

async function submitToAdmin(){
  if (typeof CCK === 'undefined') { toast('CCK shared library not loaded', 'err'); return; }
  const semKey = CCK.getActiveSemKey();
  if (CCK.isArchived(semKey)) { toast('Cannot submit archived semester', 'err'); return; }
  const totalAssigned = Object.values(assignments).reduce((s,a)=>s+a.length, 0);
  if (totalAssigned === 0) { toast('No assignments to submit', 'err'); return; }

  Object.entries(assignments).forEach(([insId, codes]) => {
    CCK.setAssignments(insId, codes, semKey);
  });

  CCK.setHodStatus('submitted', semKey);

  const notifs = JSON.parse(localStorage.getItem('cck_admin_notifications') || '[]');
  const overloadedCount = instructors.filter(i => assignedCr(i.id) > getMax(i.id)).length;
  notifs.unshift({
    id: Date.now(), portal: 'HOD', semKey,
    semLabel: CCK.getSemesterByKey(semKey)?.label || semKey,
    message: `HOD submitted ${totalAssigned} course assignment(s) for ${CCK.getSemesterByKey(semKey)?.label || semKey}${overloadedCount > 0 ? ' (' + overloadedCount + ' overloaded)' : ''}`,
    totalAssignments: totalAssigned,
    overloaded: overloadedCount,
    timestamp: new Date().toISOString(), read: false, type: 'submission'
  });
  localStorage.setItem('cck_admin_notifications', JSON.stringify(notifs));

  if (typeof CCK.syncAssignmentsToSupabase === 'function') {
    CCK.syncAssignmentsToSupabase(semKey).catch(() => {});
  }

  updateSubmitState();
  toast('Assignments submitted to Admin ✓', 'ok');
}
