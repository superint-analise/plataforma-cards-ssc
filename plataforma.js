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
let perfil=null, competencia=null, semanas=[], ranking=[], notasMensais=[], liberado='';
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
  if(!data?.aprovado)throw Error('Cadastro recebido. Aguarde a aprovação do criador.');
  perfil=data;
  $('su-quem').textContent=`${data.nome || data.email} · ${nomes[data.perfil] || data.perfil}`;
}
async function iniciar(){
  await loadProfile();
  const [notas,historico]=await Promise.all([
    getAll('notas_mensais','competencia,nivel,regiao,coordenacao,score'),
    getAll('indicadores_mensais','competencia,dados')
  ]);
  notasMensais=notas;
  const comps=[...new Set(historico.map(x=>x.competencia))].sort().reverse();
  window.__SSC_SET_HISTORY?.(historico,notas);
  if(!comps.length)throw Error('Conta aprovada. Ainda não há indicadores publicados.');
  const {data:ctl,error:e}=await db.from('controle_publicacao').select('ranking_liberado_ate').eq('id',1).single();
  if(e)throw e;
  liberado=ctl.ranking_liberado_ate;
  competencia=comps[0];
  document.body.classList.add('auth-ok');auth.style.display='none';
  await trocarCompetencia(competencia);
  montarSecoes(comps);
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
  window.__SSC_SET_PUBLIC_RANKING?.(r,comp,liberado,perfil.perfil);
  const compSel=$('su-comp');if(compSel)compSel.value=comp;
}
function navegar(view){
  document.querySelectorAll('.view-section').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const sec=$('view-'+view);if(sec)sec.classList.add('active');
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
}
function addSection(view,title,inner){
  const nav=document.querySelector('.side-nav');
  const a=document.createElement('div');a.className='nav-item';a.dataset.view=view;a.textContent=title;
  a.addEventListener('click',()=>{navegar(view);if(view==='ranking-oficial')renderRanking();if(view==='semanal')renderSemanas()});nav.appendChild(a);
  const main=document.querySelector('.main');
  const section=document.createElement('section');section.id='view-'+view;section.className='view-section su-screen';section.innerHTML=inner;
  main.appendChild(section);
}
function montarSecoes(comps){
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
  if(!error){liberado=comp;renderRanking()}
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
  $('su-form').hidden=true;$('su-cadastrar').hidden=true;$('su-solicitacao').hidden=false;msg.textContent='';
});
$('su-voltar').addEventListener('click',()=>{
  $('su-form').hidden=false;$('su-cadastrar').hidden=false;$('su-solicitacao').hidden=true;msg.textContent='';
});
function ajustarSolicitacao(){
 const f=$('su-funcao').value,r=$('su-regional').value;
 $('su-regional-grupo').hidden=!f||f==='superint';
 $('su-coordenacao-grupo').hidden=f!=='coordenador';
 $('su-coordenacao').innerHTML=selectOpts(coordsDaRegional(r),'');
}
$('su-funcao').addEventListener('change',ajustarSolicitacao);
$('su-regional').addEventListener('change',ajustarSolicitacao);
ajustarSolicitacao();
$('su-solicitacao').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget, button=form.querySelector('button[type="submit"]');
  if(button.disabled)return;
  const f=$('su-funcao').value, r=$('su-regional').value, c=$('su-coordenacao').value;
  if(!['gerente','coordenador','superint'].includes(f)||
    (f!=='superint'&&!REGIONAIS.includes(r))||
    (f==='coordenador'&&!coordsDaRegional(r).includes(c))){
    msg.textContent='Confira a função, a regional e a coordenação.';return;
  }
  const email=$('su-email-novo').value.trim();
  button.disabled=true;
  msg.textContent='Verificando solicitação...';
  let timerId;
  try {
    const timeout=new Promise((_,reject)=>{
      timerId=setTimeout(()=>reject(new Error('Não foi possível concluir a verificação. Confira sua conexão e tente entrar, caso já possua cadastro.')),15000);
    });
    const response=await Promise.race([
      db.auth.signUp({
        email,password:$('su-pass-novo').value,
        options:{data:{
          nome:$('su-nome').value.trim(),
          funcao:f,
          regional:f==='superint'?null:r,
          coordenacao:f==='coordenador'?c:null
        }}
      }),
      timeout
    ]);
    if(response.error) {
      const reason=String(response.error.message||'');
      if(response.error.status===429 || /email rate limit|over_email_send_rate_limit|rate limit exceeded/i.test(reason)){
        msg.textContent='Limite temporário de e-mails de confirmação do Supabase atingido. Não reenvie a solicitação agora. Se já possui conta, volte à tela de login e clique em Entrar; caso contrário, tente cadastrar mais tarde.';
        return;
      }
      if(/already registered|already exists|user already/i.test(reason)){
        msg.textContent='Este e-mail já possui cadastro. Clique em Voltar ao login e utilize Entrar. Se necessário, recupere sua senha.';
        return;
      }
      throw response.error;
    }
    if(response.data?.user && Array.isArray(response.data.user.identities) && response.data.user.identities.length===0){
      msg.textContent='Este e-mail já possui cadastro. Clique em Voltar ao login e utilize Entrar. Não é necessário solicitar acesso novamente.';
      return;
    }
    msg.textContent='Solicitação recebida. Confirme seu e-mail, se solicitado, e aguarde aprovação. Caso já tenha cadastro, utilize Entrar.';
    form.reset();
    ajustarSolicitacao();
  }catch(ex){
    console.error('Solicitação de acesso:',ex);
    msg.textContent=ex?.message||'Não foi possível enviar a solicitação. Tente entrar se você já possui cadastro.';
  }finally{
    if(timerId!==undefined)clearTimeout(timerId);
    button.disabled=false;
  }
});
$('su-sair').addEventListener('click',async()=>{await db.auth.signOut();document.body.classList.remove('auth-ok');auth.style.display='grid';location.reload()});
const {data:{session}}=await db.auth.getSession();
if(session){try{await iniciar()}catch(ex){err(ex);auth.style.display='grid'}}
