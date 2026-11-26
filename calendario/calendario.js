
export async function mountCalendar({db,perfil,navegar}){
 if(document.getElementById('view-calendario'))return;
 const admin=perfil?.aprovado===true&&perfil?.perfil==='criador';
 const canSeeSuperint=perfil?.aprovado===true&&['criador','superint'].includes(perfil?.perfil);
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const pad=n=>String(n).padStart(2,'0');
 const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const date=s=>new Date(s+'T12:00:00');
 const month=d=>iso(d).slice(0,7);
 const advance=(m,n)=>{const d=date(m+'-01');return month(new Date(d.getFullYear(),d.getMonth()+n,1))};
 const current=month(new Date()),next=advance(current,1),today=iso(new Date());
 const allowed=m=>m===current||m===next;
 const fmt=s=>s?date(s).toLocaleDateString('pt-BR'):'A definir';
 const monthText=m=>date(m+'-01').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
 const monday=s=>{const d=date(s);d.setDate(d.getDate()-(d.getDay()+6)%7);return d};
 const offset=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
 const tabs=[['monthly','Visão mensal'],['weekly','Visão semanal'],['schedule','Cronograma'],['onepage','One Page da Agenda'],['catalog','Catálogo de Reports']];
 const cats=['Operação','Indicadores','Qualidade','Orçamento','Gestão'];
 const models=[
 ['Card RR','Indicadores','Mensal','Fechamento mensal','Marco de referência: 6º dia útil.'],
 ['Plano de Ação da RR','Qualidade','Mensal','Fechamento mensal','Marco de referência: 9º dia útil, até 14h.'],
 ['RR Técnica da Superintendência','Gestão','Mensal','Fechamento mensal','Marco de referência: 13º dia útil.'],
 ['One Page de Indicadores | 1ª quinzena','Indicadores','Quinzenal','Parcial','Acompanhamento da primeira quinzena.'],
 ['One Page de Indicadores | 2ª quinzena','Indicadores','Quinzenal','Fechamento mensal','Acompanhamento da segunda quinzena.'],
 ['Painel IPP','Indicadores','Mensal','Fechamento mensal','Indicadores de eficiência e utilização.'],
 ['Card ACTIO','Qualidade','Mensal','Fechamento mensal','Consolidação e registro das entregas.'],
 ['PEX','Gestão','Mensal','Fechamento mensal','Material de acompanhamento executivo.'],
 ['Consolidação dos Operativos','Operação','Mensal','Fechamento mensal','Síntese dos operativos realizados.'],
 ['Report de Mobilização de Equipes','Operação','Semanal','Parcial','Mobilização e efetivo das equipes.'],
 ['Plano de Ação','Qualidade','Semanal','Parcial','Acompanhamento dos planos de ação.'],
 ['Plano Aporte','Operação','Semanal','Parcial','Acompanhamento do aporte.'],
 ['Report de Contingência','Operação','Semanal','Parcial','Acompanhamento de contingência.'],
 ['Anexo VI','Qualidade','Semanal','Parcial','Entrega de controle periódico.'],
 ['Plano de Horas Extras','Gestão','Semanal','Parcial','Acompanhamento semanal de horas extras.'],
 ['Gestão Financeira | OPEX / CAPEX','Orçamento','Mensal','Parcial','Aderência financeira, realizado e projeções.']];
 const state={month:current,day:today,week:iso(monday(today)),tab:'monthly',data:[],category:'',status:'',search:'',edit:null,busy:false,superintView:false};
 const nav=document.querySelector('.side-nav'),main=document.querySelector('.main');
 if(!nav||!main)throw Error('A estrutura principal da plataforma não foi encontrada.');
 // O Calendário é um grupo de navegação com CINCO páginas reais (view-section).
 // Apenas o conteúdo compartilhado é movimentado para a página selecionada.
 const group=document.createElement('div');
 group.className='cal-sidebar-group';
 const navButton=document.createElement('button');
 navButton.type='button';
 navButton.className='nav-item cal-sidebar-parent';
 navButton.title='Expandir ou recolher páginas do Calendário';
 navButton.setAttribute('aria-expanded','false');
 navButton.setAttribute('aria-controls','calSidebarChildren');
 navButton.innerHTML='<span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M14 14h3M8 18h3"/></svg></span><span class="ssc-nav-label">Calendário</span><svg class="cal-sidebar-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
 const submenu=document.createElement('div');
 submenu.id='calSidebarChildren';
 submenu.className='cal-sidebar-children';
 submenu.hidden=true;
 const pages=new Map();
 for(const [tab,label] of tabs){
   const key='calendario-'+tab;
   const item=document.createElement('button');
   item.type='button';item.className='nav-item cal-sidebar-child';
   item.dataset.view=key;
   item.setAttribute('aria-label',label+' — Calendário');
   item.title=label;
   item.innerHTML='<span class="cal-child-dot" aria-hidden="true"></span><span class="ssc-nav-label">'+label+'</span>';
   submenu.appendChild(item);
   const page=document.createElement('section');
   page.id='view-'+key;
   page.className='view-section cal-page';
   page.dataset.calendarPage=tab;
   page.setAttribute('aria-label','Calendário — '+label);
   main.appendChild(page);
   pages.set(tab,page);
 }
 group.append(navButton,submenu);
 // Posição fixa: logo depois de Memória de Cálculo, antes dos itens adicionais.
 const memoryItem=nav.querySelector('[data-view="conference"]');
 nav.insertBefore(group,memoryItem?memoryItem.nextSibling:null);
 const panel=document.createElement('div');panel.id='view-calendario';panel.className='cal-module';
 panel.innerHTML='<div class="cal-headline">'+
  '<div class="cal-headline-art" aria-hidden="true"><svg viewBox="0 0 1000 250" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="#9FF2E4" stroke-width="1.4" opacity=".21"><path d="M0 160 Q180 126 360 146 T720 125 T1100 145"/><path d="M0 180 Q180 145 360 165 T720 145 T1100 162"/><path d="M520 250 548 38h35l28 212M541 75h47M532 126h65M527 184h77M548 38l63 212M583 38l-63 212"/></g><circle cx="720" cy="125" r="5" fill="#F5AA41"/></svg></div>'+
  '<div class="cal-headline-main"><div class="cal-kicker">SSC · GOVERNANÇA DOS REPORTS</div><h1>Uma agenda. <em>Todas as entregas.</em></h1><p>Acompanhe quando a informação deve chegar, qual período ela representa e quando o material precisa estar disponível para a gestão.</p><div class="cal-hero-tags"><span>Operação</span><span>Indicadores</span><span>Qualidade</span><span>Orçamento</span></div></div>'+
  '<div class="cal-headline-stats" id="calHeroStats"></div></div>'+
  '<div class="cal-page-heading"><div><div class="cal-kicker cal-light-kicker">SUPERINTENDÊNCIA DE SERVIÇOS COMERCIAIS</div><h2 id="calPageHeading">Visão mensal</h2><p id="calPageSubtitle">Calendário de entregas, responsáveis e orientações</p></div>'+
  '<div class="cal-bar cal-actions"><span class="cal-role">'+(admin?'Administração · edição habilitada':'Consulta · somente leitura')+'</span><button class="cal-btn" data-ca="print">Imprimir / PDF</button>'+(admin?'<button class="cal-btn primary" data-ca="new">+ Novo report</button>':'')+'</div></div>'+
  '<div class="cal-month"><button class="cal-btn" data-ca="prev" aria-label="Mês anterior">‹</button><strong id="calMonthTitle"></strong><button class="cal-btn" data-ca="next" aria-label="Próximo mês">›</button><select id="calMonthPicker" aria-label="Selecionar mês"><option value="'+current+'">'+esc(monthText(current))+'</option><option value="'+next+'">'+esc(monthText(next))+'</option></select><small class="cal-month-hint">Dados compartilhados no Supabase · mês atual e próximo</small></div>'+
  '<div class="cal-visibility-bar"><span class="cal-visibility-explain"><span class="cal-general-symbol" aria-hidden="true">●</span> Gerais: disponíveis para todos os perfis aprovados</span>'+
  (canSeeSuperint?'<button type="button" class="cal-btn cal-superint-toggle" id="calSuperintToggle" data-ca="superint-view" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2 20 5v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5l8-3Z"/><path d="m8.5 11 2.5 2.5 4.5-5"/></svg><span id="calSuperintToggleText">Visão Superint</span></button>':'')+'</div>'+
  '<div class="cal-bar cal-filters"><label class="cal-search-wrap"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg><input id="calSearch" type="search" placeholder="Buscar report ou responsável" aria-label="Buscar"></label><select id="calCategory" aria-label="Frente de atuação"><option value="">Todas as frentes</option>'+cats.map(c=>'<option>'+c+'</option>').join('')+'</select><select id="calStatus" aria-label="Situação"><option value="">Todas as situações</option><option value="done">Concluídos</option><option value="late">Atrasados</option><option value="scheduled">Programados</option><option value="ongoing">Em andamento</option><option value="unscheduled">A programar</option></select></div>'+
  '<p id="calMessage" class="cal-feedback" aria-live="polite"></p><div id="calMetrics" class="cal-metrics"></div><div id="calOutput"></div><div id="calModal"></div>';
 pages.get(state.tab).appendChild(panel);
 function expandGroup(yes){
   const open=Boolean(yes);
   group.classList.toggle('expanded',open);
   navButton.setAttribute('aria-expanded',String(open));
   submenu.hidden=!open;
 }
 function goToPage(tab){
   if(!pages.has(tab))return;
   state.tab=tab;
   pages.get(tab).appendChild(panel);
   navegar('calendario-'+tab);
   document.body.classList.add('ssc-calendar-active');
   group.classList.add('cal-current');
   expandGroup(true);
   render();
   load();
 }
 navButton.addEventListener('click',()=>expandGroup(!group.classList.contains('expanded')));
 submenu.querySelectorAll('.cal-sidebar-child').forEach((item,i)=>{
   item.addEventListener('click',()=>goToPage(tabs[i][0]));
 });
 // Ao abrir outro módulo, só o submenu deixa de ter destaque, mas seu estado pode ser reaberto.
 document.querySelectorAll('.side-nav > .nav-item').forEach(item=>{
   item.addEventListener('click',()=>group.classList.remove('cal-current'));
 });
 const visibleRows=()=>state.data.filter(r=>canSeeSuperint&&state.superintView || !r.atividade_superint);
 const rows=()=>visibleRows().filter(r=>r.report_month===state.month);
 const audienceBadge=r=>r.atividade_superint
  ?'<span class="cal-audience cal-audience-superint" title="Atividade restrita à Superintendência"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 20 5v6c0 5-3.5 8-8 11-4.5-3-8-8-11V5l8-3Z"/></svg> Superint</span>'
  :'<span class="cal-audience cal-audience-general" title="Atividade Geral">Geral</span>';
 const status=r=>r.done?['done','Concluído']:r.publish_due&&r.publish_due<today?['late','Com atraso']:r.recurring?['ongoing','Em andamento']:r.publish_due?['scheduled','Programado']:['unscheduled','A programar'];
 const filtered=()=>rows().filter(r=>(!state.category||r.category===state.category)&&(!state.status||status(r)[0]===state.status)&&(!state.search||[r.name,r.info_owner,r.notes,r.category].join(' ').toLowerCase().includes(state.search.toLowerCase()))).sort((a,b)=>(a.publish_due||'9999').localeCompare(b.publish_due||'9999')||a.name.localeCompare(b.name,'pt-BR'));
 const badge=r=>'<span class="cal-state '+status(r)[0]+'">'+status(r)[1]+'</span>'+audienceBadge(r);
 const edit=r=>admin?'<button class="cal-btn" data-ca="edit" data-id="'+esc(r.id)+'">Editar</button>':'';
 const note=(msg,error=false)=>{const el=$('calMessage');el.textContent=msg;el.style.color=error?'#a94242':'#496f65'};
 async function load(){
   if(state.busy)return;state.busy=true;note('Carregando dados compartilhados do Supabase…');
   try{
     const {data,error}=await db.from('ssc_agenda_reports').select('id,report_month,name,category,frequency,info_type,period_start,period_end,info_owner,publish_due,recurring,done,notes,atividade_superint,updated_at').in('report_month',[current,next]).order('publish_due',{ascending:true,nullsFirst:false}).limit(3000);
     if(error)throw error;state.data=data||[];render();note(state.data.length?'Dados sincronizados com o Supabase.':'Nenhum report cadastrado na janela atual.');
   }catch(e){note('Erro ao consultar Agenda: '+(e.message||e),true)}
   finally{state.busy=false}
 }

 function hero(){
  const rs=rows(),completed=rs.filter(r=>r.done).length,pct=rs.length?Math.round(completed/rs.length*100):0;
  const late=rs.filter(r=>status(r)[0]==='late').length;
  const nextUp=rs.filter(r=>!r.done&&r.publish_due&&r.publish_due>=today).sort((a,b)=>a.publish_due.localeCompare(b.publish_due)).slice(0,3);
  const radius=47,circ=2*Math.PI*radius;
  $('calHeroStats').innerHTML='<div class="cal-progress-ring" role="img" aria-label="'+pct+'% concluído">'+
    '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="cal-ring-track" cx="60" cy="60" r="'+radius+'"/><circle class="cal-ring-value" cx="60" cy="60" r="'+radius+'" stroke-dasharray="'+(circ*pct/100).toFixed(2)+' '+circ.toFixed(2)+'" transform="rotate(-90 60 60)"/></svg>'+
    '<span class="cal-ring-center"><b>'+pct+'%</b><small>CONCLUÍDO</small></span></div>'+
    '<div class="cal-upcoming"><header>PRÓXIMAS ENTREGAS <small>'+esc(monthText(state.month))+'</small></header>'+
    (nextUp.length?nextUp.map(r=>'<div class="cal-upcoming-row"><span class="cal-next-date"><b>'+r.publish_due.slice(8)+'</b><small>'+esc(date(r.publish_due).toLocaleDateString('pt-BR',{month:'short'}).replace('.',''))+'</small></span><span class="cal-next-description"><strong>'+esc(r.name)+'</strong><small>'+esc(r.info_owner||'Responsável a definir')+'</small></span></div>').join(''):'<p class="cal-no-upcoming">Nenhuma entrega pendente a partir de hoje neste mês.</p>')+
    '<footer><span>'+completed+' de '+rs.length+' concluídos</span><span class="'+(late?'has-late':'')+'">'+(late?late+' com atraso':'Sem atrasos')+'</span></footer></div>';
 }
 function metrics(){
   const rs=filtered(),count=rs.length||1;
   const values=[
    {value:rs.length,label:'Reports no mês',sub:'Registros no filtro atual',tone:'#009B91',icon:'▤'},
    {value:rs.filter(r=>r.publish_due).length,label:'Reports programados',sub:'Data de entrega definida',tone:'#59AFC4',icon:'▦'},
    {value:rs.filter(r=>r.done).length,label:'Reports concluídos',sub:'Entregas marcadas com check',tone:'#007C73',icon:'✓'},
    {value:rs.filter(r=>!r.done&&(!r.publish_due||r.publish_due<today)).length,label:'Pontos de atenção',sub:'Sem data ou com atraso',tone:'#F5AA41',icon:'!'}
   ];
   $('calMetrics').innerHTML=values.map((x,i)=>'<div class="cal-metric" style="--tone:'+x.tone+';--tone-soft:'+x.tone+'19"><div class="cal-metric-icon" aria-hidden="true">'+x.icon+'</div><div class="cal-metric-info"><b class="cal-num">'+x.value+'</b><strong>'+x.label+'</strong><span>'+x.sub+'</span><div class="cal-metric-meter"><i style="width:'+(i===0?100:Math.round(x.value/count*100))+'%"></i></div></div></div>').join('');
 }
 function monthly(){
  const d=date(state.month+'-01'),off=(d.getDay()+6)%7,n=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(),cells=Math.ceil((off+n)/7)*7;
  const head='<div class="cal-day-head">'+['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map(t=>'<span>'+t+'</span>').join('')+'</div>';
  const days=Array.from({length:cells},(_,i)=>{const x=offset(d,i-off),ds=iso(x),ev=filtered().filter(r=>r.publish_due===ds);
   return '<button class="cal-day '+(ds.slice(0,7)!==state.month?'dim ':'')+(ds===today?'today ':'')+(ds===state.day?'chosen':'')+'" data-cal-day="'+ds+'"><span class="cal-day-num">'+x.getDate()+'</span>'+ev.slice(0,3).map(r=>'<span class="cal-event '+status(r)[0]+(r.atividade_superint?' superint':'')+'" title="'+esc((r.atividade_superint?'Superint · ':'Geral · ')+status(r)[1]+' · '+r.name)+'">'+(r.done?'✓ ':'')+esc(r.name)+(r.recurring?' ↻':'')+(r.atividade_superint?' ◆':'')+'</span>').join('')+(ev.length>3?'<small>+'+(ev.length-3)+' entregas</small>':'')+'</button>'
  }).join('');
  const selected=filtered().filter(r=>r.publish_due===state.day);
  return '<div class="cal-month-layout"><div class="cal-panel"><div class="cal-panel-title"><div><h3>Mapa mensal de entregas</h3><p>Selecione uma data para visualizar os reports.</p></div></div><div style="overflow-x:auto"><div style="min-width:590px">'+head+'<div class="cal-grid">'+days+'</div></div></div></div><aside class="cal-panel cal-side"><h3>'+fmt(state.day)+'</h3><p style="font-size:11px">'+selected.length+' report(s) para o dia</p>'+(selected.length?selected.map(r=>'<div class="cal-item"><strong>'+esc(r.name)+'</strong>'+audienceBadge(r)+'<small>'+esc(r.info_owner||'Responsável a definir')+'</small><br>'+badge(r)+' '+edit(r)+'</div>').join(''):'<div class="cal-empty">Sem entregas nesta data.</div>')+(admin?'<button class="cal-btn primary" data-ca="newday">+ Agendar neste dia</button>':'')+'</aside></div>';
 }
 function weekly(){
  const start=monday(state.week),end=offset(start,6);
  const days=Array.from({length:7},(_,i)=>{const d=offset(start,i),key=iso(d),rs=visibleRows().filter(r=>r.publish_due===key).filter(r=>(!state.category||r.category===state.category)&&(!state.status||status(r)[0]===state.status)&&(!state.search||[r.name,r.info_owner,r.notes].join(' ').toLowerCase().includes(state.search.toLowerCase())));
   return '<div class="cal-week-day'+(key===today?' cal-week-today':'')+'"><h4>'+esc(d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}))+' <span class="cal-week-count">'+rs.length+'</span></h4>'+(i===0?'<div class="cal-week-entry">Lembrete · Report semanal</div>':'')+(rs.length?rs.map(r=>'<div class="cal-week-entry '+status(r)[0]+(r.atividade_superint?' superint':'')+'"><strong>'+esc(r.name)+'</strong>'+audienceBadge(r)+(r.recurring?' <span class="cal-recurring-tag">↻ Recorrente</span>':'')+'<br>'+esc(r.info_owner||'A definir')+'<br>'+badge(r)+(r.notes?'<p>'+esc(r.notes)+'</p>':'')+edit(r)+'</div>').join(''):'<small>Sem entregas</small>')+(admin&&allowed(key.slice(0,7))?'<button class="cal-btn" data-ca="newday" data-date="'+key+'">+ Report</button>':'')+'</div>'
  }).join('');
  return '<div class="cal-panel"><div class="cal-panel-title"><div><h3>Visão semanal</h3><p>'+fmt(iso(start))+' a '+fmt(iso(end))+'</p></div><div class="cal-bar"><button class="cal-btn" data-ca="weekprev">Anterior</button><button class="cal-btn" data-ca="weeknow">Atual</button><button class="cal-btn" data-ca="weeknext">Próxima</button><button class="cal-btn" data-ca="print">PDF / Imprimir</button></div></div><div class="cal-week-scroll"><div class="cal-week">'+days+'</div></div></div>';
 }
 function schedule(){
  const rs=filtered();
  return '<div class="cal-panel"><div class="cal-panel-title"><div><h3>Cronograma detalhado</h3><p>Dados de reporte, responsáveis, status e observações.</p></div><div class="cal-bar">'+(admin?'<button class="cal-btn" data-ca="copy">Copiar para próximo mês</button><button class="cal-btn primary" data-ca="new">+ Report</button>':'')+'</div></div><div class="cal-table-scroll"><table><thead><tr><th>REPORT / MATERIAL</th><th>TIPO / PERÍODO</th><th>DATA DO REPORT</th><th>RESPONSÁVEL</th><th>CONCLUÍDO</th><th>OBSERVAÇÕES / ORIENTAÇÕES</th>'+(admin?'<th>AÇÕES</th>':'')+'</tr></thead><tbody>'+(rs.length?rs.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong>'+audienceBadge(r)+'<small>'+esc(r.category)+' · '+esc(r.frequency)+'</small></td><td>'+esc(r.info_type)+'<small>'+esc(r.period_start?fmt(r.period_start):'')+(r.period_end?' até '+fmt(r.period_end):'')+'</small></td><td>'+fmt(r.publish_due)+'</td><td>'+esc(r.info_owner||'A definir')+'</td><td>'+badge(r)+(admin?'<div><label style="font-size:10px"><input type="checkbox" data-cal-done="'+r.id+'" '+(r.done?'checked':'')+'> Feito</label></div>':'')+'</td><td style="white-space:pre-wrap;overflow-wrap:anywhere;max-width:260px">'+esc(r.notes||'—')+'</td>'+(admin?'<td>'+edit(r)+'</td>':'')+'</tr>').join(''):'<tr><td colspan="7" style="text-align:center;padding:30px">Nenhum report encontrado.</td></tr>')+'</tbody></table></div></div>';
 }
 function onepage(){const rs=filtered();return '<div class="cal-panel"><div class="cal-panel-title"><div><h3>One Page da Agenda</h3><p>Visão executiva para impressão / PDF.</p></div><button class="cal-btn primary" data-ca="print">Gerar PDF</button></div><div class="cal-one-scroll"><div class="cal-onepage"><small>SSC · AGENDA EXECUTIVA</small><h2>'+esc(monthText(state.month))+'</h2><p>'+rs.length+' entregas · '+rs.filter(r=>r.done).length+' concluídas</p><table><thead><tr><th>DATA</th><th>REPORT</th><th>RESPONSÁVEL</th><th>OBSERVAÇÕES</th><th>STATUS</th></tr></thead><tbody>'+(rs.length?rs.map(r=>'<tr><td>'+fmt(r.publish_due)+'</td><td><strong>'+esc(r.name)+'</strong>'+audienceBadge(r)+'<small>'+esc(r.category)+'</small></td><td>'+esc(r.info_owner||'A definir')+'</td><td style="white-space:pre-wrap">'+esc(r.notes||'—')+'</td><td>'+esc(status(r)[1])+'</td></tr>').join(''):'<tr><td colspan="5">Sem entregas no período.</td></tr>')+'</tbody></table></div></div></div>'}
 function catalog(){return '<div class="cal-panel"><div class="cal-panel-title"><div><h3>Catálogo de Reports</h3><p>Modelos de entregas recorrentes.</p></div>'+(admin?'<button class="cal-btn primary" data-ca="loadmodels">Carregar modelos no mês</button>':'')+'</div><div class="cal-catalog">'+models.map((m,i)=>'<div class="cal-catalog-card"><div class="cal-catalog-icon" aria-hidden="true">'+(m[1]==='Indicadores'?'▥':m[1]==='Operação'?'⚡':m[1]==='Orçamento'?'▤':m[1]==='Qualidade'?'✓':'▣')+'</div><strong>'+esc(m[0])+'</strong><p>'+esc(m[4])+'</p><small>'+esc(m[1])+' · '+esc(m[2])+'</small>'+(admin?'<button class="cal-btn" data-ca="template" data-index="'+i+'">+ Adicionar</button>':'')+'</div>').join('')+'</div></div>'}
 function render(){
  const switcher=$('calSuperintToggle');
  if(switcher){
    switcher.setAttribute('aria-pressed',String(state.superintView));
    switcher.classList.toggle('active',state.superintView);
    $('calSuperintToggleText').textContent=state.superintView?'Exibir somente Gerais':'Visão Superint';
  }
  $('calMonthTitle').textContent=monthText(state.month);$('calMonthPicker').value=state.month;
  panel.querySelector('[data-ca="prev"]').disabled=state.month===current;panel.querySelector('[data-ca="next"]').disabled=state.month===next;
  submenu.querySelectorAll('.cal-sidebar-child').forEach(item=>item.classList.toggle('active',item.dataset.view==='calendario-'+state.tab));
  group.classList.toggle('cal-current',pages.get(state.tab)?.classList.contains('active')||false);
  $('calPageHeading').textContent=tabs.find(x=>x[0]===state.tab)?.[1]||'Agenda de Reports';
  $('calPageSubtitle').textContent=state.tab==='monthly'?'Calendário de entregas, responsáveis e orientações':state.tab==='weekly'?'Acompanhamento das entregas por semana':state.tab==='schedule'?'Prazos, responsáveis, conclusão e observações':state.tab==='onepage'?'Síntese executiva das entregas do mês':'Modelos e referências dos reports recorrentes';
  hero();metrics();$('calOutput').innerHTML=state.tab==='monthly'?monthly():state.tab==='weekly'?weekly():state.tab==='schedule'?schedule():state.tab==='onepage'?onepage():catalog();
 }
 const field=(name,title,type='text',value='',more='')=>'<div class="cal-field"><label for="calF_'+name+'">'+esc(title)+'</label><input id="calF_'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value||'')+'" '+more+'></div>';
 const select=(name,title,items,value)=>'<div class="cal-field"><label>'+title+'</label><select name="'+name+'">'+items.map(x=>'<option value="'+esc(x)+'" '+(value===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>';
 const check=(name,title,yes)=>'<div class="cal-field"><label><input type="checkbox" name="'+name+'" '+(yes?'checked':'')+'> '+title+'</label></div>';
 function close(){ $('calModal').innerHTML='';document.body.style.overflow='';state.edit=null }
 function open(record=null,due='',template=null){
  if(!admin)return;
  const r=record||{atividade_superint:false,report_month:state.month,name:template?.[0]||'',category:template?.[1]||'Gestão',frequency:template?.[2]||'Mensal',info_type:template?.[3]||'Parcial',period_start:'',period_end:'',publish_due:due,info_owner:'',notes:template?.[4]||'',recurring:false,done:false};
  if(!allowed(r.report_month))return note('Mês fora da janela operacional.',true);
  state.edit=record?.id||null;
  $('calModal').innerHTML='<div class="cal-overlay"><form id="calForm" class="cal-dialog"><header><h3>'+(record?'Editar report':'Novo report')+'</h3><button type="button" class="cal-btn" data-ca="close">Fechar</button></header><div class="cal-fields">'+
   field('name','Nome do report *','text',r.name,'required maxlength="160"')+
   select('report_month','Mês da agenda',[current,next],r.report_month)+
   select('category','Frente de atuação',cats,r.category)+
   select('frequency','Periodicidade',['Mensal','Quinzenal','Semanal','Diário','Eventual','A definir'],r.frequency)+
   select('info_type','Tipo de informação',['Parcial','Fechamento mensal','Fechamento acumulado'],r.info_type)+
   field('period_start','Referência início','date',r.period_start)+field('period_end','Referência fim','date',r.period_end)+
   field('publish_due','Data do report','date',r.publish_due)+field('info_owner','Responsável','text',r.info_owner,'maxlength="100"')+
   '<div class="cal-field wide cal-audience-field"><label class="cal-superint-check"><input type="checkbox" name="atividade_superint" '+(r.atividade_superint?'checked':'')+'><span><strong>Atividade Superint</strong><small>Quando marcada, só Criador e Superintendência podem consultar esta atividade. Desmarcada, a atividade é Geral.</small></span></label></div>'+
   check('recurring','Recorrente',r.recurring)+check('done','Concluído',r.done)+
   (!record?'<div class="cal-field wide" id="calDailyExtra" hidden><label>Datas sem expediente (opcional, DD/MM/AAAA separadas por vírgula)</label><input name="excluded_days" type="text" placeholder="Ex.: 02/11/2026, 25/12/2026"><small>Diário: gera uma ocorrência por dia útil entre as datas de referência.</small></div>':'')+
   '<div class="cal-field wide"><label>Observações e orientações</label><textarea name="notes" rows="4" maxlength="1800">'+esc(r.notes)+'</textarea></div></div>'+
   '<footer>'+(record?'<button type="button" class="cal-btn danger" data-ca="delete">Excluir report</button>':'<span></span>')+'<div class="cal-bar"><button type="button" class="cal-btn" data-ca="close">Cancelar</button><button type="submit" class="cal-btn primary">Salvar</button></div></footer></form></div>';
  document.body.style.overflow='hidden';$('calForm').addEventListener('submit',saveForm);
  if(!record){
    const form=$('calForm'),syncDaily=()=>{
      const daily=form.elements.namedItem('frequency').value==='Diário';
      $('calDailyExtra').hidden=!daily;
      form.elements.namedItem('publish_due').disabled=daily;
      form.elements.namedItem('period_start').required=daily;
      form.elements.namedItem('period_end').required=daily;
      if(daily)form.elements.namedItem('recurring').checked=true;
    };
    form.elements.namedItem('frequency').addEventListener('change',syncDaily);
    syncDaily();
  }
 }
 async function saveForm(event){
  event.preventDefault();if(!admin)return;
  const btn=event.currentTarget.querySelector('[type=submit]'),form=event.currentTarget,f=new FormData(form),v=Object.fromEntries(f.entries());
  if(!allowed(v.report_month))return note('Mês não permitido.',true);
  if(v.period_start&&v.period_end&&v.period_end<v.period_start)return note('O período final não pode preceder o início.',true);
  const data={report_month:v.report_month,name:(v.name||'').trim(),category:v.category,frequency:v.frequency,info_type:v.info_type,
    period_start:v.period_start||null,period_end:v.period_end||null,publish_due:v.publish_due||null,info_owner:(v.info_owner||'').trim(),
    recurring:f.has('recurring'),done:f.has('done'),atividade_superint:f.has('atividade_superint'),notes:(v.notes||'').trim(),updated_at:new Date().toISOString()};
  if(!data.name)return note('Informe o nome do report.',true);
  if(!state.edit && data.frequency!=='Diário' && data.publish_due && data.publish_due.slice(0,7)!==data.report_month){
    return note('A data do report deve pertencer ao mês selecionado.',true);
  }
  let batch=null;
  if(!state.edit&&data.frequency==='Diário'){
    if(!data.period_start||!data.period_end)return note('Informe o início e o fim do período diário.',true);
    const excluded=new Set();
    for(const text of (v.excluded_days||'').split(/[;,\s]+/).filter(Boolean)){
      const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
      const day=match?match[3]+'-'+match[2]+'-'+match[1]:text;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||iso(date(day))!==day)return note('Data sem expediente inválida: '+text,true);
      excluded.add(day);
    }
    const dates=[];
    for(let d=date(data.period_start);iso(d)<=data.period_end;d=offset(d,1)){
      const day=iso(d);
      if(allowed(day.slice(0,7))&&d.getDay()>=1&&d.getDay()<=5&&!excluded.has(day))dates.push(day);
      if(dates.length>65)return note('Período diário excede a janela operacional permitida.',true);
    }
    if(!dates.length)return note('Nenhum dia útil disponível no período.',true);
    batch=dates.map(day=>({...data,report_month:day.slice(0,7),publish_due:day,done:false,recurring:true}));
  }
  btn.disabled=true;
  try{
    const req=state.edit?db.from('ssc_agenda_reports').update(data).eq('id',state.edit):db.from('ssc_agenda_reports').insert(batch||data);
    const {error}=await req;if(error)throw error;
    state.month=batch?batch[0].report_month:data.report_month;close();await load();note(batch?batch.length+' entregas diárias salvas no Supabase.':'Report salvo no Supabase.');
  }catch(e){note('Erro ao salvar report: '+(e.message||e),true)}
  finally{btn.disabled=false}
 }
 async function del(){if(!admin||!state.edit)return;const r=state.data.find(x=>x.id===state.edit);if(!r||!confirm('Excluir o report "'+r.name+'"?'))return;
   const {error}=await db.from('ssc_agenda_reports').delete().eq('id',r.id);if(error)return note('Erro ao excluir: '+error.message,true);close();await load();}
 async function done(id,checked){if(!admin)return;const {error}=await db.from('ssc_agenda_reports').update({done:checked,updated_at:new Date().toISOString()}).eq('id',id);if(error)return note('Erro ao atualizar: '+error.message,true);await load();}
 async function loadModels(){
   if(!admin)return;
   const registered=new Set(rows().filter(r=>!r.atividade_superint).map(r=>r.name.toLocaleLowerCase('pt-BR').trim()));
   const pending=models.filter(m=>!registered.has(m[0].toLocaleLowerCase('pt-BR').trim()));
   if(!pending.length)return note('Todos os modelos do catálogo já estão cadastrados neste mês.');
   if(!confirm('Adicionar '+pending.length+' modelos a '+monthText(state.month)+'? Os prazos ficarão em branco.'))return;
   const data=pending.map(m=>({report_month:state.month,name:m[0],category:m[1],frequency:m[2],info_type:m[3],info_owner:'',period_start:null,period_end:null,publish_due:null,recurring:false,done:false,atividade_superint:false,notes:''}));
   const {error}=await db.from('ssc_agenda_reports').insert(data);
   if(error)return note('Falha ao carregar modelos: '+error.message,true);
   await load();note(data.length+' modelos adicionados sem duplicação.');
 }
 async function copyNext(){if(!admin||state.month!==current)return;const arr=rows();if(!arr.length)return note('Nenhum report para copiar.');
   if(!confirm('Copiar '+arr.length+' reports para '+monthText(next)+'? Datas e checks serão limpos.'))return;
   const existing=new Set(state.data.filter(r=>r.report_month===next).map(r=>r.name.toLocaleLowerCase('pt-BR').trim()+'|'+Boolean(r.atividade_superint)));
   const data=arr.filter(r=>!existing.has(r.name.toLocaleLowerCase('pt-BR').trim()+'|'+Boolean(r.atividade_superint))).map(r=>({report_month:next,name:r.name,category:r.category,frequency:r.frequency,info_type:r.info_type,info_owner:r.info_owner,period_start:null,period_end:null,publish_due:null,recurring:r.recurring,done:false,atividade_superint:Boolean(r.atividade_superint),notes:''}));
   if(!data.length)return note('Todos os modelos já existem no próximo mês; nenhuma duplicação realizada.');
   const {error}=await db.from('ssc_agenda_reports').insert(data);if(error)return note('Falha na cópia: '+error.message,true);state.month=next;await load();}
 function print(){document.body.classList.add('cal-print');const end=()=>document.body.classList.remove('cal-print');window.addEventListener('afterprint',end,{once:true});window.print();setTimeout(end,1800)}
 panel.addEventListener('click',e=>{
  const day=e.target.closest('[data-cal-day]');if(day){state.day=day.dataset.calDay;render();return}
  const btn=e.target.closest('[data-ca]');if(!btn)return;const act=btn.dataset.ca;
  if(act==='prev'||act==='next'){state.month=advance(state.month,act==='prev'?-1:1);state.day=state.month+'-01';state.week=iso(monday(state.day));render();return}
  if(act==='weekprev'||act==='weeknext'||act==='weeknow'){
    const ref=act==='weeknow'?today:iso(offset(date(state.week),act==='weekprev'?-7:7));
    state.week=iso(monday(ref));if(allowed(ref.slice(0,7)))state.month=ref.slice(0,7);render();return;
  }
  if(act==='superint-view'&&canSeeSuperint){
    state.superintView=!state.superintView;
    render();
    return;
  }
  if(act==='print'){print();return}
  if(!admin)return;
  if(act==='new')open();
  if(act==='newday')open(null,btn.dataset.date||state.day);
  if(act==='edit')open(state.data.find(r=>r.id===btn.dataset.id));
  if(act==='template')open(null,'',models[Number(btn.dataset.index)]);
  if(act==='close')close();
  if(act==='delete')del();
  if(act==='copy')copyNext();
  if(act==='loadmodels')loadModels();
 });
 panel.addEventListener('change',e=>{
  if(e.target.id==='calMonthPicker'){state.month=e.target.value;state.day=state.month+'-01';state.week=iso(monday(state.day));render()}
  if(e.target.id==='calCategory'){state.category=e.target.value;render()}
  if(e.target.id==='calStatus'){state.status=e.target.value;render()}
  if(e.target.matches('[data-cal-done]')&&admin)done(e.target.dataset.calDone,e.target.checked);
 });
 panel.addEventListener('input',e=>{if(e.target.id==='calSearch'){state.search=e.target.value;render()}});
 // A primeira página será aberta a partir do menu lateral, após a autenticação.
 render();
}
