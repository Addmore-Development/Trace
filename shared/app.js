AMDB.ready.then(function(D){'use strict';
var root=document.documentElement,$=function(s,c){return(c||document).querySelector(s)},$$=function(s,c){return[].slice.call((c||document).querySelectorAll(s))};
/* Theme + mobile menu (same behaviour and storage key as the landing page) */
var tb=$('#theme-toggle');function setT(t){root.setAttribute('data-theme',t);if(tb)tb.setAttribute('aria-pressed',String(t==='dark'))}
setT(root.getAttribute('data-theme')||'light');
if(tb)tb.onclick=function(){var n=root.getAttribute('data-theme')==='dark'?'light':'dark';setT(n);try{localStorage.setItem('addmore-theme',n)}catch(e){}};
var mb=$('#menu-toggle'),nv=$('#primary-nav');
if(mb)mb.onclick=function(){var o=mb.getAttribute('aria-expanded')!=='true';mb.setAttribute('aria-expanded',String(o));nv.classList.toggle('is-open',o)};
var ad=$('.nav__list a[href="admin.html"]');if(ad&&!$('.nav__list a[href="manager.html"]')){var li=document.createElement('li');li.innerHTML='<a class="nav__link" href="manager.html"'+(document.body.dataset.page==='manager'?' aria-current="page"':'')+'>Manager</a>';ad.parentNode.parentNode.insertBefore(li,ad.parentNode)}
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Data comes from Supabase (see shared/supabase.js) */
var CATS=D.CATS,A=D.A;
function fail(e){console.error(e);var m=e&&e.message?e.message:String(e);if(/row-level security|permission denied/i.test(m))m='Your role does not allow that';toast(m)}
function save(a,keep){return AMDB.saveAssets(a).then(function(){return true},function(e){fail(e);if(!keep)setTimeout(function(){location.reload()},2200);return false})}
function cn(c){return esc(CATS[c]?CATS[c].n:c)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function R(n){return'R\u00a0'+Number(n).toLocaleString('en-ZA',{minimumFractionDigits:2})}
var IC={Active:['active','i-check-circle'],Assigned:['assigned','i-user'],'In repair':['repair','i-wrench'],Lost:['lost','i-alert']};
function chip(s){var i=IC[s]||IC.Active;return'<span class="status status--'+i[0]+'"><svg class="icon" aria-hidden="true"><use href="#'+i[1]+'"></use></svg>'+s+'</span>'}
function nextTag(c){var n=0;A.forEach(function(a){if(a.c===c)n=Math.max(n,+a.tag.slice(-4))});return'ADM-'+c+'-'+('000'+(n+1)).slice(-4)}
function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2600)}
function count(el,to,fmt){if(reduce){el.textContent=fmt(to);return}var t0=performance.now();(function f(t){var p=Math.min((t-t0)/900,1);el.textContent=fmt(Math.round(to*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(f)})(t0)}
function grow(sel,attr){requestAnimationFrame(function(){requestAnimationFrame(function(){$$(sel).forEach(function(e){e.style[attr||'width']=e.dataset.w+'%'})})})}
var COL={Active:'var(--status-active)',Assigned:'var(--status-assigned)','In repair':'var(--status-repair)',Lost:'var(--status-lost)'};
function by(f){var o={};A.forEach(function(a){var k=f(a);o[k]=(o[k]||0)+1});return o}

/* Usage log: who had which asset, when, where and for what (table usage_log) */
var MGR=D.MGR,LG=D.LG;
function logSave(){}
function log(a,ev,why,who){var g={t:a.tag,n:a.name,c:a.c,w:who==null?a.who:who,l:a.loc,y:why||'',e:ev,at:new Date().toISOString()};LG.unshift(g);AMDB.logEvent(g).catch(fail)}
function seedLog(){}

var P={
detail:function(){var t=new URLSearchParams(location.search).get('tag'),a=A.filter(function(x){return x.tag===t})[0]||A[0];
document.title='Addmore | '+a.tag;$('#nm').textContent=a.name;$('#tg').textContent=a.tag;
var rows=[['Status',chip(a.st)],['Category',cn(a.c)],['Location',esc(a.loc)],['Assigned to',esc(a.who||'Nobody')],['Value','<span class="price">'+R(a.val)+'</span>']];
Object.keys(a.x||{}).forEach(function(k){if(a.x[k])rows.push([esc(k),esc(a.x[k])])});
$('#dl').innerHTML=rows.map(function(r){return'<div><dt>'+r[0]+'</dt><dd>'+r[1]+'</dd></div>'}).join('');
$('#hist').innerHTML=[['Registered','Added to the register by a Manager'],a.who?['Assigned','Handed to '+esc(a.who)]:null,a.st==='In repair'?['Sent for repair','Waiting on the supplier']:null,a.st==='Lost'?['Marked lost','Needs follow-up']:null].filter(Boolean).map(function(h){return'<li><strong>'+h[0]+'</strong><small>'+h[1]+'</small></li>'}).join('');
$('#pr').onclick=function(){print()}},

'new':function(){var cat=$('#cat'),pv=$('#pv');cat.innerHTML=Object.keys(CATS).map(function(k){return'<option value="'+k+'">'+esc(CATS[k].n)+'</option>'}).join('');
function sync(){pv.textContent=nextTag(cat.value);pv.classList.add('pop');setTimeout(function(){pv.classList.remove('pop')},300);
$('#xf').innerHTML=CATS[cat.value].f.map(function(k){return'<label class="a-field">'+esc(k)+'<input data-x="'+esc(k)+'"></label>'}).join('')}
cat.onchange=sync;sync();
$('#fm').onsubmit=function(e){e.preventDefault();var f=new FormData(e.target),x={};$$('[data-x]').forEach(function(i){x[i.dataset.x]=i.value});
var a={tag:nextTag(cat.value),c:cat.value,name:f.get('name'),loc:f.get('loc'),who:f.get('who'),st:f.get('who')?'Assigned':'Active',val:+f.get('val'),x:x,at:new Date().toISOString()};
A.unshift(a);save(A,true).then(function(ok){if(!ok){A.shift();return}if(a.who)log(a,'Assigned','Initial assignment');toast(a.tag+' added');setTimeout(function(){location.href='assets.html?new='+a.tag},reduce?0:900)})}},

manager:function(){seedLog();var MG=D.MG,me=D.me.name,st={q:'',c:'',p:0},PS=10,
fmt=function(s){return new Date(s).toLocaleString('en-ZA',{dateStyle:'medium',timeStyle:'short'})},ks=function(){return Object.keys(CATS).filter(function(k){return MG[k]===me})};
if(MGR.indexOf(me)<0)me=MGR[0];$('#me').innerHTML=MGR.map(function(m){return'<option'+(m===me?' selected':'')+'>'+m+'</option>'}).join('');
function tb(){var K=ks(),r=LG.filter(function(g){return K.indexOf(g.c)>-1&&(!st.c||g.c===st.c)&&(g.t+g.n+g.w+g.l+g.y).toLowerCase().indexOf(st.q)>-1}).sort(function(a,b){return a.at<b.at?1:-1}),pgs=Math.max(1,Math.ceil(r.length/PS));st.p=Math.min(st.p,pgs-1);
$('#lg').innerHTML=r.slice(st.p*PS,st.p*PS+PS).map(function(g){return'<tr><td>'+fmt(g.at)+'</td><td><span class="tag-chip">'+g.t+'</span><small style="display:block;color:var(--muted)">'+esc(g.n)+'</small></td><td>'+cn(g.c)+'</td><td>'+esc(g.w||'Nobody')+'</td><td>'+esc(g.l)+'</td><td>'+esc(g.y||'Not stated')+'</td><td><span class="status">'+esc(g.e)+'</span></td></tr>'}).join('')||'<tr><td colspan="7">'+(K.length?'No usage recorded yet.':'No sectors assigned to '+esc(me)+' yet.')+'</td></tr>';
var b='';for(var i=0;i<pgs;i++)b+='<button data-p="'+i+'" class="'+(i===st.p?'on':'')+'">'+(i+1)+'</button>';$('#pg').innerHTML=b}
function draw(){var K=ks(),as=A.filter(function(a){return K.indexOf(a.c)>-1}),use=as.filter(function(a){return a.who});
[['#n1',as.length],['#n2',use.length],['#n3',use.filter(function(a){return!a.ap}).length],['#n4',as.filter(function(a){return a.al}).length]].forEach(function(x){count($(x[0]),x[1],function(v){return v})});
$('#ms').innerHTML=K.length?K.map(function(k){return'<span class="status">'+esc(CATS[k].n)+'</span>'}).join(''):'<p>No sectors assigned yet. An admin can assign them on the Admin page.</p>';
$('#now').innerHTML=use.length?use.map(function(a){var g=LG.filter(function(x){return x.t===a.tag&&x.e==='Assigned'}).sort(function(p,q){return p.at<q.at?1:-1})[0]||{};return'<li><span><span class="tag-chip">'+a.tag+'</span><small>'+esc(a.name)+' &middot; used by '+esc(a.who)+' &middot; '+esc(a.loc)+' &middot; '+esc(g.y||'purpose not stated')+'</small></span><small>'+(g.at?'Since '+fmt(g.at):'')+'</small></li>'}).join(''):'<li>Nothing in your sectors is in use right now.</li>';
$('#sf').innerHTML='<option value="">All my sectors</option>'+K.map(function(k){return'<option value="'+k+'">'+esc(CATS[k].n)+'</option>'}).join('');st.c='';st.p=0;tb()}
$('#me').onchange=function(e){me=e.target.value;draw()};
$('#sq').oninput=function(e){st.q=e.target.value.toLowerCase();st.p=0;tb()};$('#sf').onchange=function(e){st.c=e.target.value;st.p=0;tb()};
$('#pg').onclick=function(e){var b=e.target.closest('button');if(b){st.p=+b.dataset.p;tb()}};draw()},

admin:function(){var B=[];
function draw(){$('#biz').innerHTML=B.map(function(b,i){return'<tr><td><strong>'+esc(b[0])+'</strong></td><td>'+esc(b[1])+'</td><td>'+esc(b[2])+'</td><td class="price">'+b[3]+'</td><td>'+(b[4]==='Active'?chip('Active'):chip('Lost').replace('Lost','Suspended'))+'</td><td><button class="btn btn--ghost" data-i="'+i+'">'+(b[4]==='Active'?'Suspend':'Reactivate')+'</button></td></tr>'}).join('')}
draw();$('#biz').onclick=function(e){var i=e.target.dataset.i;if(i==null)return;var nx=B[i][4]==='Active'?'Suspended':'Active';AMDB.setOrgStatus(B[i][5],nx).then(function(){B[i][4]=nx;draw();toast(B[i][0]+' is now '+nx.toLowerCase())},fail)};
AMDB.overview().then(function(r){B=r.map(function(o){return[o.name,o.sector,o.plan,Number(o.assets),o.status,o.id]});draw();count($('#nb'),B.length,function(x){return x});count($('#na'),B.reduce(function(s,b){return s+b[3]},0),function(x){return x})},fail);
/* Sector managers, usage approvals and asset alerts (a sector = an asset category) */
var MG=D.MG,MN=MGR,st={q:'',c:'',v:'',p:0},PS=8;
function sv(){save(A)}
function apc(a){return a.ap==='Declined'?'<span class="status status--lost">Declined</span>':!a.who?'<small style="color:var(--muted)">Not in use</small>':a.ap==='Approved'?'<span class="status status--active">Approved</span>':'<span class="status status--repair">Pending</span>'}
function stats(){$('#np').textContent=A.filter(function(a){return a.who&&!a.ap}).length;$('#nl').textContent=A.filter(function(a){return a.al}).length}
function sec(){var cn=by(function(a){return a.c});$('#sec').innerHTML=Object.keys(CATS).map(function(k){return'<tr><td><strong>'+esc(CATS[k].n)+'</strong><small style="display:block;color:var(--muted)">ADM-'+k+'</small></td><td class="price">'+(cn[k]||0)+'</td><td><select class="a-select" data-k="'+k+'" aria-label="Manager for '+esc(CATS[k].n)+' assets"><option value="">Unassigned</option>'+MN.map(function(m){return'<option'+(MG[k]===m?' selected':'')+'>'+m+'</option>'}).join('')+'</select></td></tr>'}).join('')}
function al(){var L=A.filter(function(a){return a.al});$('#al').innerHTML=L.length?L.map(function(a){return'<li><span><span class="tag-chip">'+a.tag+'</span><small>'+esc(a.name)+' &middot; '+esc(a.al.t)+(a.al.m?': '+esc(a.al.m):'')+' &middot; raised '+esc(a.al.d)+' &middot; manager: '+esc(MG[a.c]||'unassigned')+'</small></span><button class="a-mini" data-c="'+a.tag+'">Clear alert</button></li>'}).join(''):'<li>No active alerts.</li>'}
function tb(){var r=A.filter(function(a){return(!st.c||a.c===st.c)&&(st.v==='p'?a.who&&!a.ap:st.v==='a'?a.al:1)&&(a.tag+a.name+a.who+a.loc).toLowerCase().indexOf(st.q)>-1}),pgs=Math.max(1,Math.ceil(r.length/PS));st.p=Math.min(st.p,pgs-1);
$('#ar').innerHTML=r.slice(st.p*PS,st.p*PS+PS).map(function(a){return'<tr><td><span class="tag-chip">'+a.tag+'</span></td><td>'+esc(a.name)+'<small style="display:block;color:var(--muted)">'+esc(a.who||'Nobody')+'</small></td><td>'+cn(a.c)+'</td><td>'+esc(MG[a.c]||'Unassigned')+'</td><td>'+chip(a.st)+'</td><td>'+apc(a)+'</td><td class="a-act" data-t="'+a.tag+'"><button class="a-mini" data-a="ok">Approve</button><button class="a-mini" data-a="no">Decline</button><button class="a-mini" data-a="miss">Missing</button><button class="a-mini" data-a="bad">Can&rsquo;t use</button></td></tr>'}).join('')||'<tr><td colspan="7">No assets match.</td></tr>';
var b='';for(var i=0;i<pgs;i++)b+='<button data-p="'+i+'" class="'+(i===st.p?'on':'')+'">'+(i+1)+'</button>';$('#pg').innerHTML=b}
function all(){sec();al();tb();stats()}
$('#sf').innerHTML+=Object.keys(CATS).map(function(k){return'<option value="'+k+'">'+esc(CATS[k].n)+'</option>'}).join('');
$('#sq').oninput=function(e){st.q=e.target.value.toLowerCase();st.p=0;tb()};$('#sf').onchange=function(e){st.c=e.target.value;st.p=0;tb()};$('#sv').onchange=function(e){st.v=e.target.value;st.p=0;tb()};
$('#pg').onclick=function(e){var b=e.target.closest('button');if(b){st.p=+b.dataset.p;tb()}};
$('#sec').onchange=function(e){var k=e.target.dataset.k;if(k==null)return;var pv=MG[k];if(e.target.value)MG[k]=e.target.value;else delete MG[k];AMDB.setManager(k,e.target.value).catch(function(err){if(pv)MG[k]=pv;else delete MG[k];fail(err);sec();al();tb()});al();tb();toast(e.target.value?e.target.value+' now manages '+CATS[k].n+' assets':CATS[k].n+' has no manager')};
$('#al').onclick=function(e){var b=e.target.closest('button'),a=b&&A.filter(function(x){return x.tag===b.dataset.c})[0];if(!a)return;delete a.al;a.st='Active';sv();all();toast('Alert cleared for '+a.tag)};
$('#ar').onclick=function(e){var b=e.target.closest('button'),a=b&&A.filter(function(x){return x.tag===b.parentNode.dataset.t})[0];if(!a)return;var k=b.dataset.a;
if(k==='ok'||k==='no'){if(!a.who)return toast(a.tag+' is not in use, nothing to '+(k==='ok'?'approve':'decline'));
if(k==='ok'){if(a.al)return toast('Clear the alert on '+a.tag+' before approving');a.ap='Approved';log(a,'Usage approved');toast('Usage of '+a.tag+' approved')}
else{a.ap='Declined';log(a,'Usage declined');a.who='';if(!a.al)a.st='Active';toast('Usage of '+a.tag+' declined and returned to the register')}}
else{var m=prompt((k==='miss'?'Why is '+a.tag+' missing?':'Why can\u2019t '+a.tag+' be used?')+' Add a note (optional):','');if(m===null)return;
a.al={t:k==='miss'?'Missing':'Cannot be used',m:m.trim(),d:new Date().toLocaleDateString('en-ZA')};a.st=k==='miss'?'Lost':'In repair';log(a,k==='miss'?'Reported missing':'Reported unusable',m.trim());a.who='';toast('Alert raised for '+a.tag)}
sv();all()};all()}
};
var fp=$('.footer__bottom p');if(fp)fp.textContent='\u00a9 '+new Date().getFullYear()+' Addmore. '+D.org.name;
$$('[data-logout]').forEach(function(l){l.onclick=function(e){e.preventDefault();AMDB.signOut()}});
window.AM={D:D,LG:LG,fail:fail,A:A,CATS:CATS,P:P,esc:esc,R:R,chip:chip,count:count,toast:toast,nextTag:nextTag,save:save,log:log,seedLog:seedLog,COL:COL,reduce:reduce,$:$,$$:$$};
});