// Dados protegidos exclusivamente no Supabase com RLS. Sem chaves privilegiadas neste arquivo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';
const conf = window.PLATAFORMA_CONFIG || {};
const $ = id => document.getElementById(id);
const auth = $('su-auth'), msg = $('su-msg');
if (!conf.SUPABASE_URL || conf.SUPABASE_URL.includes('SEU-NOVO') || !conf.SUPABASE_PUBLISHABLE_KEY || conf.SUPABASE_PUBLISHABLE_KEY.includes('SUBSTITUIR')) {
  msg.textContent = 'Configure site/config.js com a URL e a chave PUBLICÁVEL do NOVO Supabase.';
  throw Error('Configuração ausente');
}
const db = createClient(conf.SUPABASE_URL,conf.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
window.__SSC_GET_ACCESS_TOKEN=async()=>{const {data,error}=await db.auth.getSession();if(error)throw error;return data?.session?.access_token||null;};
let perfil=null, competencia=null, semanas=[], ranking=[], notasMensais=[], superIndicadores=[], liberado='';
const nomes = {criador:'Criador',superint:'Superintendência',gerente:'Gerente',coordenador:'Coordenador'};
const escapeHTML = s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fmt = v => v===null || v===undefined || v==='' ? '—' : typeof v==='number' ? v.toLocaleString('pt-BR',{maximumFractionDigits:3}) : String(v);
const err = e => {console.error(e);msg.textContent=e?.message || String(e)};
async function getAll(table,select='*',filters=q=>q) {
  const out=[];
  for(let from=0;from<100000;from+=1000){
    let q=db.from(table).select(select).range(from,from+999);
    q=filters(q);
    const {data,error}=await q;
    if(error)throw error;
    out.push(...data);
    if(data.length<1000)break;
  }
  return out;
}
async function loadProfile(){
  const {data:{user},error}=await db.auth.getUser();
  if(error || !user)throw error||Error('Sem sessão');
  const {data,error:pe}=await db.from('perfis').select('*').eq('usuario_id',user.id).single();
  if(pe)throw pe;
  if(!data?.aprovado)throw Error('Acesso ainda não habilitado. Confirme seu e-mail de cadastro ou procure o suporte da plataforma.');
  perfil=data;
  $('su-quem').textContent=`${data.nome || data.email} · ${nomes[data.perfil] || data.perfil}`;
}
async function iniciar(){
  await loadProfile();
  const [notas,historico,fotografias]=await Promise.all([
    getAll('notas_mensais','competencia,nivel,regiao,coordenacao,score'),
    getAll('indicadores_mensais','competencia,dados'),
    getAll('indicadores_semanais','competencia,inicio_semana,fim_semana,regiao,coordenacao,indicador,dados',q=>q.order('inicio_semana',{ascending:true}))
  ]);
  notasMensais=notas;
  // A RLS impede usuários regionais e coordenadores de ler indicadores da Superintendência.
  if(['criador','superint'].includes(perfil.perfil)){
    superIndicadores=await getAll('indicadores_mensais','competencia,indicador,dados',
      q=>q.eq('regiao','Superintendência').order('competencia',{ascending:true}));
  }
  const comps=[...new Set(historico.map(x=>x.competencia))].sort().reverse();
  competenciasDisponiveis=comps;
  window.__SSC_SET_HISTORY?.(historico,notas);
  window.__SSC_SET_WEEKS?.(fotografias);
  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const texto=c=>{const [y,m]=c.split('-');return `${meses[Number(m)-1]}/${y}`;};
  for(const field of ['sscPeriodoPrincipal','sscPeriodTables','sscPeriodComparison','sscPeriodMemory']){
    const element=$(field);if(!element)continue;
    const choices=field==='sscPeriodMemory'?comps.slice(0,2):comps;
    element.innerHTML=choices.map(c=>`<option value="${c}">${texto(c)}</option>`).join('');
    element.addEventListener('change',async e=>{
      const value=e.target.value,old=competencia;
      try{await trocarCompetencia(value)}
      catch(ex){e.target.value=old;err(ex)}
    });
  }
  window.__SSC_OPEN_MEMORY=async()=>{
    if(!comps.includes(competencia)||!comps.slice(0,2).includes(competencia)){
      await trocarCompetencia(comps[0]);
    }
  };
  if(!comps.length)throw Error('Conta aprovada. Ainda não há indicadores publicados.');
  const {data:ctl,error:e}=await db.from('controle_publicacao').select('ranking_liberado_ate').eq('id',1).single();
  if(e)throw e;
  liberado=ctl.ranking_liberado_ate;
  competencia=comps[0];
  configurarMesComparacao();
  document.body.classList.add('auth-ok');auth.style.display='none';
  await trocarCompetencia(competencia);
  montarSecoes(comps);
  // Calendário SSC: código e tabela próprios, sem interferir na lógica dos Cards.
  try{
    const {mountCalendar}=await import('./calendario/calendario.js?v=20261126-calendar-view-v10');
    await mountCalendar({db,perfil,navegar});
  }catch(calendarError){console.error('Falha isolada ao iniciar Calendário SSC:',calendarError)}
}
async function trocarCompetencia(comp){
  competencia=comp;
  const [m,s,r]=await Promise.all([
    getAll('indicadores_mensais','dados',q=>q.eq('competencia',comp)),
    getAll('indicadores_semanais','inicio_semana,fim_semana,regiao,coordenacao,indicador,dados',q=>q.eq('competencia',comp).order('inicio_semana')),
    getAll('ranking_mensal','competencia,regiao,score',q=>q.order('competencia',{ascending:false}))
  ]);
  semanas=s;
  ranking=r;
  window.__SSC_SET_CONTEXT?.(comp,semanas);
  window.__CARREGAR_DADOS_SEGUROS(m.map(x=>x.dados),perfil.perfil);
  await mostrarRankingAutorizado();
  for(const id of ['sscPeriodoPrincipal','sscPeriodTables','sscPeriodComparison','sscPeriodMemory']){
    const sel=$(id);
    if(sel && [...sel.options].some(opt=>opt.value===comp))sel.value=comp;
  }
  const compSel=$('su-comp');if(compSel)compSel.value=comp;
  const active=document.querySelector('.view-section.active')?.id;
  if(active==='view-tables')window.__SSC_RENDER_TABLES?.();
  if(active==='view-comparison')await renderComparacaoHistorica();
  if(active==='view-conference')window.__SSC_RENDER_MEMORY?.();
}
function navegar(view){
  document.body.classList.toggle('ssc-calendar-active',String(view).startsWith('calendario-'));
  document.querySelectorAll('.view-section').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const sec=$('view-'+view);if(sec)sec.classList.add('active');
  if(view==='comparison')renderComparacaoHistorica();
  window.__SSC_SUP_SIDEBAR_SYNC?.(view);
  if(view==='superintendencia')renderSuperintendencia();
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
}
function addSection(view,title,inner){
  const nav=document.querySelector('.side-nav');
  const a=document.createElement('div');
  a.className='nav-item'+(['superintendencia','administracao'].includes(view)?' ssc-nav-special ssc-nav-'+view:'');
  a.dataset.view=view;
  if(view==='superintendencia'||view==='administracao'){
    const icon=view==='superintendencia'
      ?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M6 20V9l6-5 6 5v11M9 12h6M9 16h6"/><path d="M12 4v-2"/></svg>'
      :'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.8 6v5.7c0 4.4 3 7.5 7.2 9.3 4.2-1.8 7.2-4.9 7.2-9.3V6L12 3Z"/><path d="M9 12l2 2 4-4"/></svg>';
    a.innerHTML='<span class="nav-icon">'+icon+'</span><span class="ssc-nav-label">'+title+'</span>';
    a.setAttribute('title',title);
    a.setAttribute('aria-label',title);
  }else{
    a.textContent=title;
  }
  a.addEventListener('click',()=>{navegar(view);if(view==='ranking-oficial')renderRanking();if(view==='semanal')renderSemanas()});nav.appendChild(a);
  const main=document.querySelector('.main');
  const section=document.createElement('section');section.id='view-'+view;section.className='view-section su-screen';section.innerHTML=inner;
  main.appendChild(section);
}
const MONTH_LABELS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const competenciaAnterior=comp=>{
  const [y,m]=String(comp||'').split('-').map(Number);
  if(!y||!m)return null;
  return m===1?(y-1)+'-12':y+'-'+String(m-1).padStart(2,'0');
};
const competenciaLabel=comp=>{
  const [y,m]=String(comp||'').split('-').map(Number);
  return MONTH_LABELS[m-1]?MONTH_LABELS[m-1]+'/'+y:comp;
};
let comparisonRequest=0;
let competenciasDisponiveis=[];
const acessoCompleto=()=>perfil&&['criador','superint'].includes(perfil.perfil);
const proximaCompetencia=comp=>{
  const [ano,mes]=String(comp||'').split('-').map(Number);
  if(!ano||!mes)return '';
  return mes===12?String(ano+1)+'-01':ano+'-'+String(mes+1).padStart(2,'0');
};
const mesesComparaveis=()=>competenciasDisponiveis
  .filter(c=>acessoCompleto() || (liberado && c<=liberado))
  .sort().reverse();
function configurarMesComparacao(){
  const sel=$('sscCompMonthSelect');if(!sel)return;
  const permitidos=mesesComparaveis();
  const previo=sel.value;
  sel.innerHTML=permitidos.map(c=>'<option value="'+c+'">'+escapeHTML(competenciaLabel(c))+'</option>').join('');
  if(permitidos.includes(previo))sel.value=previo;
  else if(permitidos.includes(competencia))sel.value=competencia;
  else if(permitidos.length)sel.value=permitidos[0];
  if(!sel.dataset.sscBound){
    sel.dataset.sscBound='true';
    sel.addEventListener('change',()=>renderComparacaoHistorica());
  }
}
const formatarNota=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
function linhasRankingHistorico(lista,regiaoDestaque){
  const ordenadas=(Array.isArray(lista)?lista:[])
    .filter(x=>x&&x.regiao&&x.score!==null&&x.score!==undefined&&Number.isFinite(Number(x.score)))
    .sort((a,b)=>Number(b.score)-Number(a.score)||String(a.regiao).localeCompare(String(b.regiao),'pt-BR'));
  return ordenadas.map((r,i)=>{
    const score=Number(r.score);
    const marker=score>=10?'#009B91':'#F5AA41';
    const nome=escapeHTML(r.regiao);
    const cls=r.regiao===regiaoDestaque?' style="border-color:#009B91"':'';
    return '<div class="ssc-historical-item"'+cls+'>'+
      '<span class="ssc-historical-pos">'+(i+1)+'º</span>'+
      '<strong>'+nome+'</strong>'+
      '<div class="ssc-historical-track"><i style="width:'+Math.max(0,Math.min(100,score*10))+'%;background:'+marker+'"></i></div>'+
      '<span class="ssc-historical-score">'+formatarNota(score)+'</span></div>';
  }).join('');
}
async function buscarHistoricoAutorizado(mes){
  // A RPC usa a competência EM ANÁLISE e devolve o mês anterior.
  // Logo, para consultar setembro enviamos outubro, e nunca o inverso.
  const {data,error}=await db.rpc('comparacao_historica_perfil',{p_competencia_analise:proximaCompetencia(mes)});
  if(error)throw error;
  if(!data?.liberado||data.competencia!==mes)throw Error('O período solicitado ainda não está liberado para comparação.');
  return data;
}
async function mostrarRankingAutorizado(){
  const box=$('sscAuthorizedRanking');
  const sec=box?.closest('.ranking-section');
  const sections=document.querySelectorAll('#view-general .ranking-section');
  const restrito=!acessoCompleto();
  if(sections.length){
    sections.forEach((el,i)=>{
      if(restrito && i>0)el.style.display='none';
      else el.style.removeProperty('display');
    });
  }
  if(!box||!sec)return;
  sec.classList.toggle('ssc-historical-mode',restrito);
  box.hidden=!restrito;
  if(!restrito)return;
  const mes=mesesComparaveis()[0];
  if(!mes){box.innerHTML='<h2>Ranking oficial</h2><p>Nenhum mês liberado para comparação entre Regionais.</p>';return}
  box.innerHTML='<h2>Ranking das Gerências · '+escapeHTML(competenciaLabel(mes))+'</h2><p class="ssc-rank-caption">Ranking divulgado. As suas notas e indicadores operacionais permanecem no mês selecionado.</p><p>Carregando classificação autorizada…</p>';
  try{
    const data=await buscarHistoricoAutorizado(mes);
    if(!acessoCompleto()&&mes!==mesesComparaveis()[0])return;
    const content=linhasRankingHistorico(data.resultados,perfil.regiao);
    box.innerHTML='<h2>Ranking oficial das Gerências · '+escapeHTML(competenciaLabel(mes))+'</h2>'+
      '<p class="ssc-rank-caption">Classificação compartilhada após liberação. Indicadores e notas da sua área seguem o período selecionado.</p>'+
      (content?'<div class="ssc-rank-list">'+content+'</div>':'<p>Nenhum resultado autorizado para este período.</p>');
  }catch(e){
    console.error('Ranking autorizado:',e);
    box.innerHTML='<h2>Ranking oficial</h2><p>Não foi possível consultar o ranking liberado: '+escapeHTML(e.message)+'</p>';
  }
}
window.__SSC_RENDER_COMPARISON=()=>renderComparacaoHistorica();
async function renderComparacaoHistorica(){
  const container=$('sscComparisonOfficial'),visual=$('sscComparisonVisual'),sel=$('sscCompMonthSelect');
  if(!container||!perfil||!competencia)return;
  configurarMesComparacao();
  const mes=sel?.value,seq=++comparisonRequest;
  const integral=acessoCompleto();
  if(!mes){
    if(visual)visual.hidden=true;
    container.hidden=false;
    container.innerHTML='<p>Nenhuma competência liberada para comparação.</p>';
    return;
  }
  const atualIntegral=integral&&mes===competencia;
  const pill=document.querySelector('.comparison-period-pill');
  if(pill)pill.textContent=(atualIntegral?'Comparação do mês em análise: ':'Comparação de indicadores: ')+competenciaLabel(mes);
  if(!integral && (!liberado||mes>liberado)){
    if(visual)visual.hidden=true;
    container.hidden=false;
    container.innerHTML='<p>Este período ainda não foi liberado para comparação entre Regionais.</p>';
    return;
  }
  if(atualIntegral){
    container.hidden=true;
    container.innerHTML='';
    if(visual)visual.hidden=false;
    try{await window.__SSC_RENDER_COMPARISON_VISUAL?.()}
    catch(e){
      console.error('Comparação executiva:',e);
      if(visual)visual.hidden=true;
      container.hidden=false;
      container.innerHTML='<p>Não foi possível apresentar os indicadores do período atual.</p>';
    }
    return;
  }
  container.hidden=false;
  container.innerHTML='<p>Carregando indicadores de '+escapeHTML(competenciaLabel(mes))+'…</p>';
  if(visual)visual.hidden=true;
  try{
    const data=await buscarHistoricoAutorizado(mes);
    if(seq!==comparisonRequest)return;
    const indicators=Array.isArray(data.indicadores)?data.indicadores:[];
    if(!indicators.length){
      container.innerHTML='<p>Não existem valores Planejado/Realizado disponíveis para a comparação de '+escapeHTML(competenciaLabel(mes))+'.</p>';
      return;
    }
    if(typeof window.__SSC_RENDER_COMPARISON_HISTORICAL!=='function')throw Error('Módulo de comparação gráfica não foi carregado.');
    window.__SSC_RENDER_COMPARISON_HISTORICAL(indicators);
    if(visual)visual.hidden=false;
    container.hidden=true;
    container.innerHTML='';
  }catch(e){
    console.error('Comparação histórica de indicadores:',e);
    if(seq===comparisonRequest){
      if(visual)visual.hidden=true;
      container.hidden=false;
      container.innerHTML='<p>Não foi possível carregar a comparação dos indicadores: '+escapeHTML(e?.message||'Tente novamente.')+'</p>';
    }
  }
}
// Superintendência: módulo independente, primeiro na navegação, com página Cards.
// A nota oficial permanece como registrada no Supabase; as contribuições são diagnósticas.
let sscSupRequest=0;
const supNormalize=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const SUPER_LINKS=[
 {match:/PMSO/,label:'OPEX',find:/OPEX/,lower:true,threshold:1},
 {match:/UNITIZACAO/,label:'AIS% Realizado',find:/AIS% REALIZADO/,lower:false,threshold:1},
 {match:/CAPEX/,label:'CAPEX',find:/CAPEX/,lower:false,threshold:.9},
 {match:/ERRO DE LEITURA/,label:'Erro de Leitura',find:/ERRO DE LEITURA/,lower:true,threshold:1},
 {match:/NAO LIDOS/,label:'Clientes Não Lidos',find:/CLIENTES NAO LIDOS|NAO LIDOS TELEMEDIDO/,lower:true,threshold:1},
 {match:/ARRECADACAO/,label:'Arrecadação',find:/ARRECADACAO/,lower:false,threshold:1},
 {match:/PERDAS NAO TECNICAS/,label:null,find:null}
];
function sscSupTrend(rows,chosen){
 const vals=rows.map(r=>Number(r.score)),finite=vals.filter(Number.isFinite);
 if(!finite.length)return '<p>Sem notas históricas disponíveis.</p>';
 const W=840,H=220,L=32,R=822,T=20,B=176,lo=Math.min(...finite)-.5,hi=Math.max(...finite)+.5;
 const x=i=>L+i*(R-L)/Math.max(1,rows.length-1),y=v=>B-(v-lo)/(hi-lo)*(B-T);
 const poly=rows.map((r,i)=>Number.isFinite(Number(r.score))?x(i)+','+y(Number(r.score)):null).filter(Boolean).join(' ');
 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolução oficial mensal da nota da Superintendência" style="width:100%;height:auto;max-height:290px">';
 svg+='<line x1="'+L+'" x2="'+R+'" y1="'+B+'" y2="'+B+'" stroke="#a9c9c2"/>';
 svg+='<polyline points="'+poly+'" fill="none" stroke="#009B91" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>';
 rows.forEach((r,i)=>{const v=Number(r.score);if(!Number.isFinite(v))return;const px=x(i),py=y(v);
  svg+='<circle cx="'+px+'" cy="'+py+'" r="'+(r.competencia===chosen?7:5)+'" fill="'+(r.competencia===chosen?'#F5AA41':'#009B91')+'" stroke="#fff" stroke-width="2"><title>'+escapeHTML(competenciaLabel(r.competencia))+' — '+fmt(v)+'</title></circle>';
  svg+='<text x="'+px+'" y="'+(B+20)+'" text-anchor="middle" font-size="11" fill="#476b63">'+escapeHTML(r.competencia.slice(5))+'/'+escapeHTML(r.competencia.slice(2,4))+'</text>';
  svg+='<text x="'+px+'" y="'+(py-12)+'" text-anchor="middle" font-size="10" font-weight="700" fill="#173d39">'+fmt(v)+'</text>';
 });
 return svg+'</svg>';
}
function sscSupMapImpact(rows,official){
 const link=SUPER_LINKS.find(m=>m.match.test(supNormalize(official.indicador)));
 if(!link||!link.find)return {link:null,ranked:[]};
 const matched=rows.filter(r=>link.find.test(supNormalize(r.indicador))&&r.regiao!=='Superintendência');
 const detailed=matched.filter(r=>r.coordenacao!=='Gerência');
 const source=detailed.length?detailed:matched;
 const ranked=source.map(r=>{
  const real=Number(r.dados?.Realizado),plan=Number(r.dados?.Planejado);
  if(!Number.isFinite(real)||!Number.isFinite(plan)||plan===0)return null;
  const ratio=real/plan;
  const bad=link.lower?Math.max(0,ratio-link.threshold):Math.max(0,link.threshold-ratio);
  return {reg:r.regiao,coord:r.coordenacao,indicador:r.indicador,ratio,loss:bad*100,real,plan};
 }).filter(Boolean).sort((a,b)=>b.loss-a.loss);
 return {link,ranked};
}
function montarSuperintendencia(comps){
 if(!acessoCompleto())return;
 if(!$('view-superintendencia')){
  addSection('superintendencia','Cards',`<div class="page-head"><div class="page-title"><h1>Superintendência · Cards</h1><p>Nota oficial, evolução e diagnóstico das regionais e coordenações relacionadas aos indicadores.</p></div><div class="filters"><div class="filter"><label>Período</label><select id="sscSuperPeriodo" aria-label="Período da Superintendência"></select></div></div></div><div id="sscSuperResultados"></div>`);
  const nav=document.querySelector('.side-nav'),entry=nav.querySelector('[data-view="superintendencia"]');
  // Menu expansível no mesmo padrão de Calendário.
  const group=document.createElement('div');group.className='cal-sidebar-group ssc-sup-sidebar-group';
  const parent=document.createElement('button');parent.type='button';parent.className='nav-item cal-sidebar-parent ssc-sup-sidebar-parent';
  parent.title='Expandir ou recolher páginas da Superintendência';parent.setAttribute('aria-controls','sscSupSidebarChildren');parent.setAttribute('aria-expanded','false');
  parent.innerHTML='<span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20h18M6 20V9l6-5 6 5v11M9 12h6M9 16h6"/></svg></span><span class="ssc-nav-label">Superintendência</span><svg class="cal-sidebar-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const children=document.createElement('div');children.id='sscSupSidebarChildren';children.className='cal-sidebar-children';children.hidden=true;
  entry.className='nav-item cal-sidebar-child ssc-sup-child';entry.innerHTML='<span class="cal-child-dot" aria-hidden="true"></span><span class="ssc-nav-label">Cards</span>';
  entry.title='Cards da Superintendência';
  children.appendChild(entry);group.append(parent,children);nav.insertBefore(group,nav.firstChild);
  const expand=open=>{group.classList.toggle('expanded',Boolean(open));parent.setAttribute('aria-expanded',String(Boolean(open)));children.hidden=!open};
  parent.addEventListener('click',()=>expand(!group.classList.contains('expanded')));
  entry.addEventListener('click',()=>{expand(true);group.classList.add('cal-current')});
  window.__SSC_SUP_SIDEBAR_SYNC=view=>{group.classList.toggle('cal-current',view==='superintendencia');if(view==='superintendencia')expand(true)};

 }
 const select=$('sscSuperPeriodo');
 const options=[...new Set(notasMensais.filter(x=>x.nivel==='Superintendência').map(x=>x.competencia))].sort().reverse();
 select.innerHTML=options.map(c=>'<option value="'+escapeHTML(c)+'">'+escapeHTML(competenciaLabel(c))+'</option>').join('');
 select.addEventListener('change',renderSuperintendencia);
 renderSuperintendencia();
}
async function renderSuperintendencia(){
 const box=$('sscSuperResultados'),select=$('sscSuperPeriodo');
 if(!box||!select||!acessoCompleto())return;
 const seq=++sscSupRequest,comp=select.value;
 const rows=notasMensais.filter(x=>x.nivel==='Superintendência').sort((a,b)=>a.competencia.localeCompare(b.competencia));
 const current=rows.find(x=>x.competencia===comp),prev=rows.filter(x=>x.competencia<comp).at(-1);
 const score=current?Number(current.score):null,old=prev?Number(prev.score):null;
 const variation=Number.isFinite(score)&&Number.isFinite(old)?score-old:null;
 const official=superIndicadores.filter(x=>x.competencia===comp&&x.indicador!=='SCORE DO CARD');
 box.innerHTML='<div class="card">Carregando diagnóstico da Superintendência…</div>';
 let regionRows=[];
 try{regionRows=await getAll('indicadores_mensais','regiao,coordenacao,indicador,dados',q=>q.eq('competencia',comp).neq('regiao','Superintendência'));}catch(e){if(seq!==sscSupRequest)return;box.innerHTML='<div class="card">Não foi possível carregar o detalhamento: '+escapeHTML(e.message)+'</div>';return;}
 if(seq!==sscSupRequest)return;
 const cards='<div class="ssc-sup-kpis">'+[
 ['Resultado oficial',Number.isFinite(score)?fmt(score):'—'],
 ['Mês anterior',Number.isFinite(old)?fmt(old):'—'],
 ['Variação',variation===null?'—':(variation>0?'+':'')+fmt(variation)],
 ['Indicadores da Superintendência',official.length]
 ].map(([title,val])=>'<div class="ssc-sup-kpi"><small>'+title+'</small><strong>'+val+'</strong></div>').join('')+'</div>';
 const indicators=official.map(o=>{
  const d=o.dados||{},impact=sscSupMapImpact(regionRows,o);
  const norm=supNormalize(o.indicador),noMatch=/PERDAS NAO TECNICAS/.test(norm);
  let content='';
  if(noMatch)content='<p class="ssc-sup-unmapped">Indicador acompanhado exclusivamente na Superintendência. Não existe correspondência direta nos Cards regionais.</p>';
  else if(!impact.link)content='<p class="ssc-sup-unmapped">Sem correspondência regional validada para este indicador.</p>';
  else {
   const bad=impact.ranked.filter(x=>x.loss>0).slice(0,5);
   content='<p class="ssc-sup-assoc">Correspondência operacional: <b>'+escapeHTML(impact.link.label)+'</b> · ranking por desvio proporcional da meta (não equivale à perda de pontos na nota oficial).</p>'+
    (bad.length?'<ol class="ssc-sup-impacts">'+bad.map(x=>'<li><span><strong>'+escapeHTML(x.reg)+'</strong> / '+escapeHTML(x.coord)+'<small>Realizado '+fmt(x.real)+' · meta '+fmt(x.plan)+'</small></span><b>Desvio '+fmt(x.loss)+' p.p.</b></li>').join('')+'</ol>':'<p class="ssc-sup-unmapped">Nenhuma coordenação regional fora da referência neste período.</p>');
  }
  return '<article class="ssc-sup-ind"><div class="ssc-sup-ind-head"><h3>'+escapeHTML(o.indicador)+'</h3><span>Realizado '+fmt(d.Realizado)+' · Meta '+fmt(d.Planejado)+'</span></div>'+content+'</article>';
 }).join('');
 box.innerHTML=cards+
  '<div class="card ssc-sup-trend"><h2>Evolução das notas da Superintendência</h2><p>Notas oficiais mensais, sem recálculo a partir dos Cards regionais.</p>'+sscSupTrend(rows,comp)+'</div>'+
  '<div class="card ssc-sup-impact-panel"><h2>Indicadores e maiores impactos negativos</h2><p>Identificação dos desvios de desempenho regional relacionados a cada indicador oficial.</p>'+ (indicators||'<p>Não há indicadores da Superintendência para este mês.</p>')+'</div>';
}
function montarSecoes(comps){
  montarSuperintendencia(comps);
  if($('view-administracao'))return;
  if(perfil.perfil==='criador')addSection('administracao','Administração',`<h2>Administração de acessos</h2><div id="su-users"></div><hr><h2>Liberação do ranking</h2><p class="su-muted">A liberação não altera a base nem exige nova execução do CMD.</p><div class="su-controls"><select id="su-release">${comps.map(c=>`<option value="${c}">${c}</option>`).join('')}</select><button class="su-btn" id="su-release-btn">Liberar competência</button></div><p id="su-release-status"></p><hr><h2>Limpeza do histórico semanal</h2><p class="su-muted">Disponível somente após o ranking divulgado e a carga da competência seguinte.</p><div class="su-controls"><select id="su-clean">${comps.map(c=>`<option value="${c}">${c}</option>`).join('')}</select><button class="su-btn" id="su-clean-btn">Excluir semanas da competência selecionada</button></div><p id="su-clean-status"></p>`);
  if(perfil.perfil==='criador'){
    $('su-release').value=liberado;
    $('su-release-btn').addEventListener('click',liberarRanking);
    $('su-clean-btn').addEventListener('click',limparSemanas);
    listarUsuarios().catch(err);
  }
}
function populate(id,values,keep){
  const el=$(id);if(!el)return;
  const old=keep?el.value:null;
  el.innerHTML=values.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
  if(values.includes(old))el.value=old;
}
function renderSemanas(changed){
  if(!$('su-reg'))return;
  populate('su-reg',[...new Set(semanas.map(r=>r.regiao))].sort(),changed!=='su-comp');
  const reg=$('su-reg').value;
  populate('su-coord',[...new Set(semanas.filter(r=>r.regiao===reg).map(r=>r.coordenacao))].sort(),changed!=='su-reg');
  const coord=$('su-coord').value;
  populate('su-ind',[...new Set(semanas.filter(r=>r.regiao===reg&&r.coordenacao===coord).map(r=>r.indicador))].sort(),changed!=='su-coord');
  const ind=$('su-ind').value;
  const rows=semanas.filter(r=>r.regiao===reg&&r.coordenacao===coord&&r.indicador===ind).sort((a,b)=>a.inicio_semana.localeCompare(b.inicio_semana));
  const view=$('su-visao').value;
  if(!rows.length){$('su-grafico').innerHTML='<p class="su-muted">Sem fotografias semanais.</p>';$('su-tabela').innerHTML='';return}
  const extract=(r,k)=>{const n=Number(r.dados[k]);return Number.isFinite(n)&&r.dados[k]!==null&&r.dados[k]!==''?n:null};
  const vals=rows.map(r=>({semana:`${r.inicio_semana.slice(8,10)}/${r.inicio_semana.slice(5,7)}–${r.fim_semana.slice(8,10)}/${r.fim_semana.slice(5,7)}`,score:extract(r,'Score'),avanco:extract(r,'Avanço'),real:extract(r,'Realizado'),plan:extract(r,'Planejado'),bruto:r.dados['Avanço']}));
  let series=view==='Score'?[['Score','score']]:view==='Avanço'?[['Avanço','avanco']]:[['Realizado','real'],['Planejado','plan']];
  const available=vals.flatMap(v=>series.map(([_,key])=>v[key]).filter(Number.isFinite));
  const min=available.length?Math.min(...available):0,max=available.length?Math.max(...available):1,range=Math.max(max-min,.001);
  const colors=['#009b91','#efaa41'];
  const w=800,h=260;
  let svg=`<svg viewBox="0 0 ${w} ${h}" style="max-width:100%;background:white;border:1px solid #e5ecea;border-radius:10px" role="img" aria-label="Gráfico de evolução semanal"><path d="M50 15V220H780" stroke="#b5ceca" fill="none"/>`;
  series.forEach(([label,key],si)=>{
    const p=vals.map((v,i)=>v[key]===null?null:[55+(i*710/Math.max(1,vals.length-1)),210-((v[key]-min)/range)*175]);
    svg+=`<polyline points="${p.filter(Boolean).map(a=>a.join(',')).join(' ')}" fill="none" stroke="${colors[si]}" stroke-width="3"/>`;
    p.forEach((point,i)=>{if(point)svg+=`<circle cx="${point[0]}" cy="${point[1]}" r="5" fill="${colors[si]}"><title>${vals[i].semana}: ${label} ${fmt(vals[i][key])}</title></circle>`});
  });
  vals.forEach((v,i)=>svg+=`<text x="${55+i*710/Math.max(1,vals.length-1)}" y="241" text-anchor="middle" font-size="13" fill="#47635d">${v.semana}</text>`);
  svg+='</svg>';
  const legend=series.map(([label],i)=>`<span style="margin-right:18px;color:${colors[i]}">● ${label}</span>`).join('');
  $('su-grafico').innerHTML=svg+`<p class="su-muted">${legend}</p>`;
  const headers=view==='Realizado'?'<th>Planejado</th><th>Realizado</th>':`<th>${view}</th><th>Variação</th>`;
  $('su-tabela').innerHTML=`<table><thead><tr><th>Semana</th>${headers}</tr></thead><tbody>${vals.map((v,i)=>{
    const key=view==='Score'?'score':'avanco',current=v[key],previous=vals[i-1]?.[key];
    return `<tr><td>${v.semana}</td>${view==='Realizado'?`<td>${fmt(v.plan)}</td><td>${fmt(v.real)}</td>`:`<td>${view==='Avanço'&&current===null?escapeHTML(v.bruto):fmt(current)}</td><td>${i&&current!==null&&previous!==null?fmt(current-previous):'—'}</td>`}</tr>`
  }).join('')}</tbody></table>`;
}
function renderHistorico(changed){
  if(!$('su-hist-reg'))return;
  const regioes=[...new Set(notasMensais.map(r=>r.regiao))].sort();
  populate('su-hist-reg',regioes,changed!=='reg');
  const reg=$('su-hist-reg').value;
  const coords=[...new Set(notasMensais.filter(r=>r.regiao===reg).map(r=>r.coordenacao))].sort();
  populate('su-hist-coord',coords,changed!=='reg');
  const coord=$('su-hist-coord').value;
  const rows=notasMensais.filter(r=>r.regiao===reg&&r.coordenacao===coord).sort((a,b)=>a.competencia.localeCompare(b.competencia));
  if(!rows.length){$('su-hist-plot').innerHTML='Sem notas oficiais disponíveis';$('su-hist-table').innerHTML='';return}
  const values=rows.map(r=>Number(r.score));
  const min=Math.min(...values),max=Math.max(...values),delta=Math.max(max-min,.1);
  const width=800,height=255;
  const pt=(v,i)=>[50+i*710/Math.max(rows.length-1,1),205-(v-min)/delta*165];
  const pts=values.map(pt);
  let svg=`<svg viewBox="0 0 ${width} ${height}" style="max-width:100%;background:white;border:1px solid #e5ecea;border-radius:10px"><path d="M45 20 V215 H780" fill="none" stroke="#b5ceca"/><polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#009b91" stroke-width="3"/>`;
  pts.forEach((p,i)=>{svg+=`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#009b91"><title>${escapeHTML(rows[i].competencia)}: ${fmt(values[i])}</title></circle><text x="${p[0]}" y="239" text-anchor="middle" font-size="10" fill="#47635d">${escapeHTML(rows[i].competencia.slice(5))}</text>`});
  $('su-hist-plot').innerHTML=svg+'</svg>';
  $('su-hist-table').innerHTML='<table><thead><tr><th>Competência</th><th>Nota oficial</th><th>Origem</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${escapeHTML(r.competencia)}</td><td>${fmt(Number(r.score))}</td><td>${r.competencia<='2026-09'?'Registro histórico':'Calculada'}</td></tr>`).join('')+'</tbody></table>';
}
function renderRanking(){
  if(!$('su-mes-rank'))return;
  const ok=ranking.filter(r=>['criador','superint'].includes(perfil.perfil)||r.competencia<=liberado);
  const meses=[...new Set(ok.map(r=>r.competencia))].sort().reverse();
  populate('su-mes-rank',meses,true);
  const mes=$('su-mes-rank').value;
  const sorted=ok.filter(r=>r.competencia===mes).sort((a,b)=>Number(b.score)-Number(a.score));
  $('su-rank-content').innerHTML=sorted.length?`<table><thead><tr><th>Posição</th><th>Regional</th><th>Score</th></tr></thead><tbody>${sorted.map((r,i)=>`<tr><td>${i+1}º</td><td>${escapeHTML(r.regiao)}</td><td>${fmt(Number(r.score))}</td></tr>`).join('')}</tbody></table>`:'<p class="su-muted">Nenhum ranking divulgado.</p>';
}

const REGIONAIS=['Baixada','Centro Sul','Leste','Oeste','Vale'];
const COORDENACOES=['Varejo','Projetos Especiais e Grandes Clientes','Leitura','Construção'];
const coordsDaRegional=r=>COORDENACOES.filter(c=>(r==='Baixada'||c!=='Construção')&&(r!=='Vale'||['Varejo','Leitura'].includes(c)));
const selectOpts=(items,selected)=>'<option value="">Selecione</option>'+items.map(v=>'<option value="'+escapeHTML(v)+'" '+(v===selected?'selected':'')+'>'+escapeHTML(v)+'</option>').join('');
async function listarUsuarios(){
  const users=await getAll('perfis');
  users.sort((a,b)=>Number(a.aprovado)-Number(b.aprovado)||a.email.localeCompare(b.email));
  const container=$('su-users');container.innerHTML='';
  for(const u of users){
    const row=document.createElement('div');
    row.style='padding:14px;margin:9px 0;border:1px solid #dce9e5;border-radius:10px;background:#fff';
    const roleValue=u.aprovado?u.perfil:(u.solicitacao_perfil||'pendente');
    const regionValue=u.aprovado?u.regiao:u.solicitacao_regiao;
    const coordValue=u.aprovado?u.coordenacao:u.solicitacao_coordenacao;
    row.innerHTML='<b>'+escapeHTML(u.nome||u.email)+'</b> · '+escapeHTML(u.email)+
      '<div class="su-muted">'+(u.aprovado?'Aprovado: '+escapeHTML(u.perfil):'Aguardando: '+escapeHTML(u.solicitacao_perfil||'perfil não informado'))+'</div>'+
      '<div class="su-controls" style="margin:10px 0"><label>Função <select class="adm-role">'+selectOpts(['pendente','criador','superint','gerente','coordenador'],roleValue)+'</select></label>'+
      '<label class="adm-reg-wrap">Regional <select class="adm-reg">'+selectOpts(REGIONAIS,regionValue)+'</select></label>'+
      '<label class="adm-coord-wrap">Coordenação <select class="adm-coord"></select></label></div>'+
      '<div class="su-controls"><button type="button" class="su-btn adm-save">Salvar / Aprovar</button>'+
      '<button type="button" class="su-btn adm-delete" style="background:#ad3030">Excluir conta</button></div>'+
      '<p class="su-muted adm-status" aria-live="polite"></p>';
    container.appendChild(row);
    const role=row.querySelector('.adm-role'),reg=row.querySelector('.adm-reg'),co=row.querySelector('.adm-coord');
    const status=row.querySelector('.adm-status');
    const configure=()=>{
      row.querySelector('.adm-reg-wrap').hidden=!['gerente','coordenador'].includes(role.value);
      row.querySelector('.adm-coord-wrap').hidden=role.value!=='coordenador';
      const items=coordsDaRegional(reg.value);
      const chosen=items.includes(co.value)?co.value:coordValue;
      co.innerHTML=selectOpts(items,chosen);
    };
    role.addEventListener('change',configure);reg.addEventListener('change',configure);configure();
    const self=u.usuario_id===perfil.usuario_id;
    row.querySelector('.adm-delete').disabled=self;
    row.querySelector('.adm-delete').title=self?'Não pode excluir a própria conta':'Excluir permanentemente';
    row.querySelector('.adm-save').addEventListener('click',async()=>{
      const t=role.value;
      if(t==='gerente'&&!reg.value||t==='coordenador'&&(!reg.value||!co.value)){status.textContent='Selecione regional e coordenação';return}
      if(self&&t!=='criador'){status.textContent='Não é possível remover seu próprio acesso de criador';return}
      status.textContent='Salvando...';
      const {error}=await db.rpc('admin_aprovar',{p_usuario:u.usuario_id,p_perfil:t,p_regiao:['gerente','coordenador'].includes(t)?reg.value:null,p_coordenacao:t==='coordenador'?co.value:null,p_aprovado:t!=='pendente'});
      if(error){status.textContent=error.message;return}
      await listarUsuarios();
    });
    row.querySelector('.adm-delete').addEventListener('click',async()=>{
      if(self)return;
      if(!confirm('Excluir definitivamente a conta '+u.email+'? Esta operação removerá o cadastro e o acesso.'))return;
      status.textContent='Excluindo...';
      const {error}=await db.rpc('admin_excluir_usuario',{p_usuario:u.usuario_id});
      if(error){status.textContent=error.message;return}
      await listarUsuarios();
    });
  }
}
async function liberarRanking(){
  const comp=$('su-release').value;
  if(!confirm(`Liberar o ranking geral até ${comp} para todos os perfis autorizados?`))return;
  const {error}=await db.rpc('admin_liberar_ranking',{p_competencia:comp});
  $('su-release-status').textContent=error?error.message:`Liberado até ${comp}.`;
  if(!error){liberado=comp;configurarMesComparacao();await mostrarRankingAutorizado();renderRanking();}
}
async function limparSemanas(){
  const comp=$('su-clean').value;
  if(!confirm(`EXCLUIR o histórico semanal de ${comp}? Não há backup automático.`))return;
  const {data,error}=await db.rpc('admin_limpar_semanas',{p_competencia:comp});
  $('su-clean-status').textContent=error?error.message:`${data} registros semanais excluídos.`;
  if(!error&&comp===competencia){semanas=[];renderSemanas()}
}
$('su-form').addEventListener('submit',async e=>{
  e.preventDefault();msg.textContent='Autenticando...';
  const {error}=await db.auth.signInWithPassword({email:$('su-email').value.trim(),password:$('su-pass').value});
  if(error){err(error);return}
  try{await iniciar()}catch(ex){err(ex)}
});

$('su-cadastrar').addEventListener('click',()=>{
  $('su-form').hidden=true;$('su-cadastrar').hidden=true;$('su-recuperar').hidden=true;$('su-solicitacao').hidden=false;msg.textContent='';
});
$('su-voltar').addEventListener('click',()=>{
  $('su-form').hidden=false;$('su-cadastrar').hidden=false;$('su-recuperar').hidden=false;$('su-solicitacao').hidden=true;msg.textContent='';
});

let sscCadastroEncontrado=null;
const sscMsgCadastro=(text)=>{const el=$('su-email-identificado');if(el)el.textContent=text};
function sscLimparCadastro(){
 sscCadastroEncontrado=null;
 for(const id of ['su-nome','su-funcao','su-regional','su-coordenacao'])$(id).value='';
}
async function sscIdentificarEmail(){
 sscLimparCadastro();
 const email=$('su-email-novo').value.trim().toLowerCase();
 if(!email||!$('su-email-novo').checkValidity()){sscMsgCadastro('');return null}
 sscMsgCadastro('Consultando e-mail autorizado…');
 try{
  const {data,error}=await db.rpc('consultar_cadastro_ssc_v2',{p_email:email});
  if(error)throw error;
  // Evitar que uma resposta antiga preencha dados de outro e-mail.
  if(email!==$('su-email-novo').value.trim().toLowerCase())return null;
  const person=data;
  if(!person){sscMsgCadastro('Email não identificado');return null}
  if(person.ja_cadastrado){sscMsgCadastro('Email já cadastrado. Caso tenha esquecido as credenciais, volte à página inicial e clique em recuperar senha.');msg.textContent='';return null}
  sscCadastroEncontrado={...person,email};
  $('su-nome').value=person.nome||'';
  $('su-funcao').value=person.cargo||'';
  $('su-regional').value=person.regiao||'';
  $('su-coordenacao').value=person.coordenacao||'';
  sscMsgCadastro('E-mail identificado. Confira os dados preenchidos e crie sua senha.');
  return sscCadastroEncontrado;
 }catch(e){sscMsgCadastro('Não foi possível verificar este e-mail. Tente novamente.');console.error('Cadastro SSC',e);return null}
}
$('su-email-novo').addEventListener('input',()=>{sscLimparCadastro();sscMsgCadastro('')});
$('su-email-novo').addEventListener('blur',sscIdentificarEmail);
$('su-recuperar').addEventListener('click',async()=>{
 const email=$('su-email').value.trim().toLowerCase();
 if(!email||!$('su-email').checkValidity()){msg.textContent='Informe seu e-mail na tela de login para recuperar a senha.';return}
 msg.textContent='Enviando instruções de recuperação de senha…';
 try{
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  if(error)throw error;
  msg.textContent='Se a conta estiver cadastrada, você receberá um e-mail com instruções para redefinir a senha.';
 }catch(e){msg.textContent='Não foi possível enviar a recuperação: '+(e.message||e)}
});
db.auth.onAuthStateChange(event=>{
 if(event==='PASSWORD_RECOVERY'){
  setTimeout(()=>{
   document.body.classList.remove('auth-ok');
   auth.style.display='grid';
   $('su-form').hidden=true;
   $('su-cadastrar').hidden=true;
   $('su-solicitacao').hidden=true;
   $('su-recuperar').hidden=true;
   $('su-reset-form').hidden=false;
   msg.textContent='Informe e confirme a nova senha.';
  },0);
 }
});
$('su-reset-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const pass=$('su-reset-pass').value;
 if(pass.length<8){msg.textContent='A senha deve ter pelo menos 8 caracteres.';return}
 const button=e.currentTarget.querySelector('[type=submit]');
 button.disabled=true;
 try{
  const {error}=await db.auth.updateUser({password:pass});
  if(error)throw error;
  msg.textContent='Senha atualizada com sucesso. Entre novamente com a nova senha.';
  $('su-reset-form').hidden=true;
  $('su-form').hidden=false;
  $('su-cadastrar').hidden=false;
  $('su-recuperar').hidden=false;
  await db.auth.signOut();
 }catch(ex){msg.textContent='Falha ao redefinir senha: '+(ex.message||ex)}
 finally{button.disabled=false}
});
$('su-solicitacao').addEventListener('submit',async e=>{
 e.preventDefault();
 const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
 if(button.disabled)return;
 const email=$('su-email-novo').value.trim().toLowerCase();
 if(!sscCadastroEncontrado||sscCadastroEncontrado.email!==email){
  const checked=await sscIdentificarEmail();
  if(!checked){return}
 }
 button.disabled=true;
 msg.textContent='Criando conta e enviando e-mail de confirmação…';
 try{
  const response=await db.auth.signUp({
   email,password:$('su-pass-novo').value,
   options:{emailRedirectTo:location.origin+location.pathname}
  });
  if(response.error)throw response.error;
  if(response.data?.user&&Array.isArray(response.data.user.identities)&&response.data.user.identities.length===0){
   msg.textContent='Email já cadastrado. Caso tenha esquecido as credenciais, volte à página inicial e clique em recuperar senha.';return;
  }
  if(response.data?.session){
   await db.auth.signOut();
   msg.textContent='Cadastro criado. Consulte seu e-mail e siga as instruções de confirmação.';
  }else{
   msg.textContent='Cadastro registrado. Confirme o e-mail em até 10 minutos. Se o prazo expirar, sua conta não será ativada e você precisará se cadastrar novamente.';
  }
  form.reset();sscLimparCadastro();sscMsgCadastro('');
 }catch(ex){
  const errorText=String(ex?.message||ex);
  msg.textContent=/Email não identificado/i.test(errorText)?'Email não identificado':/already registered|already exists|user already|already been registered/i.test(errorText)?'Email já cadastrado. Caso tenha esquecido as credenciais, volte à página inicial e clique em recuperar senha.':'Não foi possível concluir o cadastro: '+errorText;
 }finally{button.disabled=false}
});
$('su-sair').addEventListener('click',async()=>{await db.auth.signOut();document.body.classList.remove('auth-ok');auth.style.display='grid';location.reload()});
const {data:{session}}=await db.auth.getSession();
if(session){try{await iniciar()}catch(ex){err(ex);auth.style.display='grid'}}
