
let FAQ=[], RULES={};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

async function init(){
  [FAQ,RULES]=await Promise.all([
    fetch('./data/faq-2026.json').then(r=>r.json()),
    fetch('./data/rules-2026.json').then(r=>r.json())
  ]);
  bindNav(); bindActions(); buildChips(); renderFaq(); renderWiki(); checkHash();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
}
function nav(id){
  $$('.view').forEach(v=>v.classList.remove('active'));
  const el=$('#'+id); if(el) el.classList.add('active');
  history.replaceState(null,'','#'+id); window.scrollTo({top:0,behavior:'smooth'});
}
function bindNav(){
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-nav]'); if(b) nav(b.dataset.nav);
    const t=e.target.closest('[data-tool]'); if(t){
      const [type,val]=t.dataset.tool.split(':'); if(type==='faq'){ nav('faq'); renderFaq(val); setActiveChip(val); }
    }
  });
}
function checkHash(){ const id=location.hash.slice(1); if(id && $('#'+id)) nav(id); }

function normalize(s){return (s||'').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu,' ');}
function searchFaq(q){
  const toks=normalize(q).split(/\s+/).filter(x=>x.length>1);
  return FAQ.map(x=>{
    const hay=normalize([x.q,x.a,(x.keywords||[]).join(' '),x.category].join(' '));
    let score=0; toks.forEach(t=>{ if(hay.includes(t)) score+=2; if(normalize(x.q).includes(t)) score+=2; });
    return {x,score};
  }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,5).map(r=>r.x);
}

function inferRule(q){
  const n=normalize(q);
  const countMatch=n.match(/(\d+)\s*척/);
  const count=countMatch?+countMatch[1]:null;
  const fishery=n.includes('근해')?'offshore':n.includes('연안')?'coastal':null;
  const tac=n.includes('시범')?'pilot':(n.includes('3단계')?'stage3':'ordinary');
  if(fishery && count!==null && (n.includes('신청')||n.includes('구성')||n.includes('가능'))){
    const key=tac==='stage3'?'tac_stage3':tac==='pilot'?'pilot_tac':'ordinary';
    const min=RULES.group.minimum[key][fishery];
    const ok=count>=min;
    return `<div class="verdict">${ok?'✅ 신청단체 최소 구성요건 충족':'❌ 최소 구성척수 미충족'}</div>
      <p>${fishery==='offshore'?'근해':'연안'} · ${tac==='stage3'?'TAC 3단계':tac==='pilot'?'시범 TAC':'일반'} 기준 최소 <b>${min}척</b>, 입력 <b>${count}척</b>입니다.</p>
      ${tac==='ordinary'?'<p class="warn">TAC 3단계 해당 여부에 따라 최소척수가 달라질 수 있습니다.</p>':''}
      <div class="source">근거: 2026 준수의무 가이드라인 / 공식 Q&A 3~4번</div>`;
  }
  const day=n.match(/(\d+)\s*일/);
  if(day && (n.includes('휴어')||n.includes('조업중단')||n.includes('조업 중단'))){
    const d=+day[1], row=RULES.scores.closure_days.find(r=>d>=r.min && d<=r.max);
    if(row) return `<div class="verdict">휴어 기간점수 예상범위: ${row.score_min}~${row.score_max}점</div><p>최종점수는 중단시기, 주요 어획어종 등을 고려한 전문가 평가로 범위 안에서 결정됩니다.</p><div class="source">근거: 2026 준수의무 가이드라인 / 공식 Q&A 26~27번</div>`;
  }
  return null;
}
function answer(q){
  const rule=inferRule(q);
  if(rule) return rule;
  const hits=searchFaq(q);
  if(hits.length){
    const x=hits[0];
    return `<div class="tag">${x.category}</div><h3>${x.q}</h3><p>${x.a}</p><div class="source">공식 Q&A ${x.id}번 기반 · 유사질문 ${hits.length}건 검색</div>`;
  }
  return `<div class="warn">공식자료에서 바로 일치하는 답을 찾지 못했습니다.</div><p>키워드를 바꾸어 다시 질문하거나, 외부 AI/API가 연결된 운영판에서 보조 설명을 사용할 수 있습니다. 시범판은 근거 없는 답을 생성하지 않습니다.</p>`;
}

function bindActions(){
  $('#homeAsk').onclick=()=>{ const q=$('#homeQuestion').value.trim(); if(!q)return; const el=$('#homeAnswer'); el.innerHTML=answer(q); el.classList.remove('hidden'); };
  $('#homeQuestion').addEventListener('keydown',e=>{if(e.key==='Enter')$('#homeAsk').click();});
  $('#checkEligibility').onclick=()=>{
    const f=$('#fisheryType').value,t=$('#tacType').value,c=+$('#vesselCount').value;
    const key=t==='stage3'?'tac_stage3':t==='pilot'?'pilot_tac':'ordinary';
    const min=RULES.group.minimum[key][f], ok=c>=min;
    $('#eligibilityResult').innerHTML=`<div class="verdict">${ok?'✅ 최소 구성요건 충족':'❌ 최소 구성요건 미충족'}</div><p>${f==='offshore'?'근해':'연안'} ${t==='stage3'?'TAC 3단계':t==='pilot'?'시범 TAC':'일반'} 기준 최소 <b>${min}척</b>입니다. 현재 입력은 <b>${c}척</b>입니다.</p><div class="source">공식 Q&A 3~4번 / 2026 준수의무 가이드라인</div>`;
  };
  $('#calcClosure').onclick=()=>{
    const total=+$('#closureTotal').value, join=+$('#closureJoin').value, days=+$('#closureDays').value;
    const pct=total?join/total*100:0;
    const ps=pct>=100?5:pct>=80?3:null;
    const dr=RULES.scores.closure_days.find(r=>days>=r.min && days<=r.max);
    $('#closureResult').innerHTML = ps&&dr ? `참여율 ${pct.toFixed(1)}% → ${ps}점<br>중단기간 ${days}일 → ${dr.score_min}~${dr.score_max}점<br><b>예상 합계 ${ps+dr.score_min}~${ps+dr.score_max}점</b><br><small>중단기간 최종점수는 전문가 평가로 결정됩니다.</small>` : `<b>신청 인정기준을 충족하지 못할 수 있습니다.</b> 참여율 80% 이상, 연속 15일 이상 여부를 확인하세요.`;
  };
  $('#calcReport').onclick=()=>{
    const total=+$('#reportTotal').value, join=+$('#reportJoin').value, pct=total?join/total*100:0;
    const r=RULES.scores.electronic_catch_report.find(x=>pct>=x.min && pct<=x.max);
    $('#reportResult').innerHTML=r?`참여율 <b>${pct.toFixed(1)}%</b> → <b>${r.score}점</b>`:`참여율 ${pct.toFixed(1)}% → 최소 인정기준 50% 미만`;
  };
  $('#calcReduction').onclick=()=>{
    const total=+$('#ineligibleTotal').value, bad=+$('#ineligibleCount').value, pct=total?bad/total*100:0;
    const r=RULES.ineligible_group_reduction.find(x=>pct>=x.min&&pct<=x.max);
    $('#reductionResult').innerHTML=`부적격 비율 <b>${pct.toFixed(1)}%</b> → ${r.reduction_pct===100?'<b>단체 구성원 전원 미지급</b>':`직불금 <b>${r.reduction_pct}% 감액</b>`}`;
  };
  $('#faqSearchBtn').onclick=()=>renderFaq(null,$('#faqSearch').value);
  $('#faqSearch').addEventListener('keydown',e=>{if(e.key==='Enter')$('#faqSearchBtn').click();});
  $('#openWikiForm').onclick=()=>$('#wikiForm').classList.toggle('hidden');
  $('#saveWiki').onclick=saveWiki;
  $('#exportCase').onclick=exportCase;
  [['testInst','instUrl','instToken','instStatus'],['testPaid','paidUrl','paidToken','paidStatus'],['testAi','aiUrl','aiToken','aiStatus']].forEach(a=>$('#'+a[0]).onclick=()=>testApi(...a.slice(1)));
}

function buildChips(){
  const cats=['전체',...new Set(FAQ.map(x=>x.category))];
  $('#faqChips').innerHTML=cats.map(c=>`<button data-cat="${c}">${c}</button>`).join('');
  $$('#faqChips button').forEach(b=>b.onclick=()=>{setActiveChip(b.dataset.cat);renderFaq(b.dataset.cat==='전체'?null:b.dataset.cat);});
  setActiveChip('전체');
}
function setActiveChip(c){ $$('#faqChips button').forEach(b=>b.classList.toggle('active',b.dataset.cat===c)); }
function renderFaq(cat=null,q=''){
  let items=FAQ;
  if(cat) items=items.filter(x=>x.category===cat);
  if(q) items=searchFaq(q);
  $('#faqList').innerHTML=items.map(x=>`<details class="faq-item"><summary><span class="tag">${x.category}</span><br>${x.id}. ${x.q}</summary><div class="ans">${x.a}<div class="source">2026 수산자원보호 직불제 관련 Q&A ${x.id}번</div></div></details>`).join('');
}

function renderWiki(){
  const sample=[
    {title:'전자어획보고 통신불량 현장 사례 예시',category:'전자어획보고',region:'시범 데이터',body:'현장위키 UI 동작 확인용 예시입니다. 운영 전에는 관리자 검토·신고·버전이력 백엔드를 연결합니다.',verified:true}
  ];
  const local=JSON.parse(localStorage.getItem('fisheriesWikiDemo')||'[]');
  const items=[...local,...sample];
  $('#wikiList').innerHTML=items.map(x=>`<article class="wiki-item"><span class="tag">${x.verified?'🟢 확인 예시':'🟡 이용자 작성'}</span><h3>${escapeHtml(x.title)}</h3><small>${escapeHtml(x.category)} · ${escapeHtml(x.region||'지역 미기재')}</small><p>${escapeHtml(x.body)}</p></article>`).join('');
}
function saveWiki(){
  if(!$('#wikiConfirm').checked) return alert('이용자 현장정보임을 확인해 주세요.');
  const title=$('#wikiTitle').value.trim(), body=$('#wikiBody').value.trim();
  if(!title||!body) return alert('제목과 내용을 입력해 주세요.');
  const arr=JSON.parse(localStorage.getItem('fisheriesWikiDemo')||'[]');
  arr.unshift({title,body,category:$('#wikiCategory').value,region:$('#wikiRegion').value.trim(),verified:false,created:new Date().toISOString()});
  localStorage.setItem('fisheriesWikiDemo',JSON.stringify(arr.slice(0,30)));
  $('#wikiTitle').value='';$('#wikiBody').value='';$('#wikiConfirm').checked=false;$('#wikiForm').classList.add('hidden');renderWiki();
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

function exportCase(){
  const obj={case_id:$('#caseId').value.trim(),region:$('#caseRegion').value.trim(),fishery:$('#caseFishery').value,topic:$('#caseTopic').value,issue:$('#caseIssue').value.trim(),advice:$('#caseAdvice').value.trim(),created_at:new Date().toISOString(),warning:'개인식별정보를 포함하지 않은 시범용 익명 기록'};
  if(!obj.case_id) return alert('익명 사례 ID를 입력하세요.');
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=obj.case_id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function testApi(urlId,tokenId,statusId){
  const url=$('#'+urlId).value.trim(), token=$('#'+tokenId).value.trim(), out=$('#'+statusId);
  if(!url){out.textContent='URL을 입력하세요.';return;}
  out.textContent='연결 확인 중...';
  try{
    const opt={method:'GET',headers:{}}; if(token) opt.headers.Authorization='Bearer '+token;
    const r=await fetch(url,opt); out.textContent=`응답 ${r.status} ${r.ok?'· 연결됨':'· 서버 응답 확인 필요'}`;
  }catch(e){out.textContent='브라우저에서 연결하지 못했습니다(CORS/네트워크/인증 설정 확인).';}
}
init();
