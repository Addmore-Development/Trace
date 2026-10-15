(function(){'use strict';
var root=document.documentElement,$=function(s,c){return(c||document).querySelector(s)},$$=function(s,c){return[].slice.call((c||document).querySelectorAll(s))};
/* Theme + mobile menu (same behaviour and storage key as the landing page) */
var tb=$('#theme-toggle');function setT(t){root.setAttribute('data-theme',t);if(tb)tb.setAttribute('aria-pressed',String(t==='dark'))}
setT(root.getAttribute('data-theme')||'light');
if(tb)tb.onclick=function(){var n=root.getAttribute('data-theme')==='dark'?'light':'dark';setT(n);try{localStorage.setItem('addmore-theme',n)}catch(e){}};
var mb=$('#menu-toggle'),nv=$('#primary-nav');
if(mb)mb.onclick=function(){var o=mb.getAttribute('aria-expanded')!=='true';mb.setAttribute('aria-expanded',String(o));nv.classList.toggle('is-open',o)};
var ad=$('.nav__list a[href="admin.html"]');if(ad&&!$('.nav__list a[href="manager.html"]')){var li=document.createElement('li');li.innerHTML='<a class="nav__link" href="manager.html"'+(document.body.dataset.page==='manager'?' aria-current="page"':'')+'>Manager</a>';ad.parentNode.parentNode.insertBefore(li,ad.parentNode)}
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Data: swap load()/save() for API calls when the backend exists */
var CATS={LT:{n:'Laptop',f:['Serial number','RAM']},MN:{n:'Monitor',f:['Screen size','Serial number']},TL:{n:'Tool',f:['Brand','Last service']},PH:{n:'Phone',f:['IMEI','Network']},FN:{n:'Furniture',f:['Material']},VH:{n:'Vehicle',f:['Registration','Odometer']}};
var SEED=[['LT',42,'Dell Latitude 5440','Staff room','Assigned','Thandi Mokoena',18950],['MN',17,'Samsung 27" monitor','Admin office','Active','',3299],['TL',33,'Makita cordless drill','Workshop','In repair','',2199],['PH',8,'Samsung Galaxy A54','Principal','Assigned','Sipho Dlamini',7999],['FN',121,'Ergonomic office chair','Admin office','Active','',2450],['LT',43,'Lenovo ThinkPad E14','Lab 2','Active','',14500],['VH',2,'Toyota Quantum','Garage','Lost','',489000],['MN',18,'Dell 24" monitor','Lab 2','Assigned','Naledi Khumalo',2799]].map(function(r){return{tag:'ADM-'+r[0]+'-'+('000'+r[1]).slice(-4),c:r[0],name:r[2],loc:r[3],st:r[4],who:r[5],val:r[6],x:{}}});
function load(){try{var s=JSON.parse(localStorage.getItem('addmore-assets'));if(s&&s.length)return s}catch(e){}return SEED}
function save(a){try{localStorage.setItem('addmore-assets',JSON.stringify(a))}catch(e){}}
var A=load();
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

/* Usage log: who had which asset, when, where and for what. Swap for an API later. */
var MGR=['Thandi Mokoena','Zanele Mthembu'],WHY=['Lab lesson','Staff meeting','Site inspection','Admin work','Stock-take','Delivery run','Maintenance job','Reception duty'],
LG=(function(){try{return JSON.parse(localStorage.getItem('addmore-log'))||[]}catch(e){return[]}})();
function logSave(){try{localStorage.setItem('addmore-log',JSON.stringify(LG))}catch(e){}}
function log(a,ev,why,who){LG.push({t:a.tag,n:a.name,c:a.c,w:who==null?a.who:who,l:a.loc,y:why||'',e:ev,at:new Date().toISOString()});logSave()}
/* Placeholder history for assets already in use, so a new log is not empty */
function seedLog(){var h={},k=0,now=Date.now();LG.forEach(function(g){h[g.t]=1});A.forEach(function(a){if(a.who&&!h[a.tag]){LG.push({t:a.tag,n:a.name,c:a.c,w:a.who,l:a.loc,y:WHY[k%WHY.length],e:'Assigned',at:new Date(now-(k+1)*5.5*36e5).toISOString()});k++}});if(k)logSave()}

var P={
dashboard:function(){var n=function(s){return A.filter(function(a){return a.st===s}).length},tot=A.reduce(function(s,a){return s+a.val},0),I=function(x){return x},M=function(x){return R(x).replace(/\.00$/,'')};
var S=[['Total assets',A.length,I],['Assigned to people',n('Assigned'),I],['In repair or lost',n('In repair')+n('Lost'),I],['Register value',tot,M]];
$('#stats').innerHTML=S.map(function(s,i){return'<div class="card a-stat"><span>'+s[0]+'</span><b data-i="'+i+'">0</b></div>'}).join('');
$$('#stats b').forEach(function(b){var s=S[+b.dataset.i];count(b,s[1],s[2])});
$('#bar').innerHTML=Object.keys(COL).map(function(s){return'<i title="'+s+'" style="background:'+COL[s]+'" data-w="'+n(s)/A.length*100+'"></i>'}).join('');grow('#bar i');
$('#legend').innerHTML=Object.keys(COL).map(function(s){return'<li>'+chip(s)+'<span class="price">'+n(s)+'</span></li>'}).join('');
var w=A.filter(function(a){return a.st==='In repair'||a.st==='Lost'});
$('#attn').innerHTML=w.length?w.map(function(a){return'<li><span><a href="asset-detail.html?tag='+a.tag+'" class="tag-chip">'+a.tag+'</a><small>'+esc(a.name)+'</small></span>'+chip(a.st)+'</li>'}).join(''):'<li>Nothing needs attention right now.</li>';
$('#recent').innerHTML=A.slice(0,5).map(function(a){return'<li><span>'+esc(a.name)+'<small>'+esc(a.loc)+'</small></span><span class="tag-chip">'+a.tag+'</span></li>'}).join('')},

assets:function(){var q=$('#q'),f=$('#fs'),c=$('#fc'),fresh=new URLSearchParams(location.search).get('new');
c.innerHTML+=Object.keys(CATS).map(function(k){return'<option value="'+k+'">'+CATS[k].n+'</option>'}).join('');
function draw(){var t=q.value.toLowerCase(),r=A.filter(function(a){return(!f.value||a.st===f.value)&&(!c.value||a.c===c.value)&&(a.tag+a.name+a.who+a.loc).toLowerCase().indexOf(t)>-1});
$('#rows').innerHTML=r.length?r.map(function(a){return'<tr'+(a.tag===fresh?' class="a-new"':'')+'><td><a href="asset-detail.html?tag='+a.tag+'" class="tag-chip">'+a.tag+'</a></td><td>'+esc(a.name)+(a.who?'<small style="display:block;color:var(--muted)">'+esc(a.who)+'</small>':'')+'</td><td>'+esc(a.loc)+'</td><td>'+chip(a.st)+'</td><td class="price">'+R(a.val)+'</td></tr>'}).join(''):'<tr><td colspan="5">No assets match. Clear the search, or <a href="asset-new.html">add this asset</a>.</td></tr>';
$('#cnt').textContent=r.length+' of '+A.length+' assets'}
q.oninput=f.onchange=c.onchange=draw;draw()},

detail:function(){var t=new URLSearchParams(location.search).get('tag'),a=A.filter(function(x){return x.tag===t})[0]||A[0];
document.title='Addmore | '+a.tag;$('#nm').textContent=a.name;$('#tg').textContent=a.tag;
var rows=[['Status',chip(a.st)],['Category',CATS[a.c]?CATS[a.c].n:a.c],['Location',esc(a.loc)],['Assigned to',esc(a.who||'Nobody')],['Value','<span class="price">'+R(a.val)+'</span>']];
Object.keys(a.x||{}).forEach(function(k){if(a.x[k])rows.push([esc(k),esc(a.x[k])])});
$('#dl').innerHTML=rows.map(function(r){return'<div><dt>'+r[0]+'</dt><dd>'+r[1]+'</dd></div>'}).join('');
$('#hist').innerHTML=[['Registered','Added to the register by a Manager'],a.who?['Assigned','Handed to '+esc(a.who)]:null,a.st==='In repair'?['Sent for repair','Waiting on the supplier']:null,a.st==='Lost'?['Marked lost','Needs follow-up']:null].filter(Boolean).map(function(h){return'<li><strong>'+h[0]+'</strong><small>'+h[1]+'</small></li>'}).join('');
$('#pr').onclick=function(){print()}},

'new':function(){var cat=$('#cat'),pv=$('#pv');cat.innerHTML=Object.keys(CATS).map(function(k){return'<option value="'+k+'">'+CATS[k].n+'</option>'}).join('');
function sync(){pv.textContent=nextTag(cat.value);pv.classList.add('pop');setTimeout(function(){pv.classList.remove('pop')},300);
$('#xf').innerHTML=CATS[cat.value].f.map(function(k){return'<label class="a-field">'+k+'<input data-x="'+k+'"></label>'}).join('')}
cat.onchange=sync;sync();
$('#fm').onsubmit=function(e){e.preventDefault();var f=new FormData(e.target),x={};$$('[data-x]').forEach(function(i){x[i.dataset.x]=i.value});
var a={tag:nextTag(cat.value),c:cat.value,name:f.get('name'),loc:f.get('loc'),who:f.get('who'),st:f.get('who')?'Assigned':'Active',val:+f.get('val'),x:x};
A.unshift(a);if(a.who)log(a,'Assigned','Initial assignment');save(A);toast(a.tag+' added');setTimeout(function(){location.href='assets.html?new='+a.tag},reduce?0:900)}},

team:function(){var U=[['Lerato Naidoo','Owner'],['Thandi Mokoena','Manager'],['Sipho Dlamini','Staff'],['Naledi Khumalo','Viewer']],D={Owner:'Billing, team and every asset',Manager:'Add, edit and retire assets',Staff:'Update assets assigned to them',Viewer:'Read-only access'},O=Object.keys(D);
function draw(){$('#users').innerHTML=U.map(function(u,i){return'<li><span><strong>'+esc(u[0])+'</strong><small>'+D[u[1]]+'</small></span><select class="a-select" data-i="'+i+'" aria-label="Role for '+esc(u[0])+'">'+O.map(function(o){return'<option'+(o===u[1]?' selected':'')+'>'+o+'</option>'}).join('')+'</select></li>'}).join('')}
draw();$('#users').onchange=function(e){var i=e.target.dataset.i;U[i][1]=e.target.value;draw();toast(U[i][0]+' is now '+U[i][1])};
$('#inv').onsubmit=function(e){e.preventDefault();var f=new FormData(e.target);U.push([f.get('email'),f.get('role')]);draw();e.target.reset();toast('Invite sent to '+f.get('email'))}},

categories:function(){var C=JSON.parse(JSON.stringify(CATS));
function draw(){$('#cats').innerHTML=Object.keys(C).map(function(k){return'<div class="card"><h3>'+esc(C[k].n)+'</h3><p class="price" style="margin-top:.3rem">Tag prefix ADM-'+k+'</p><div class="a-chips">'+C[k].f.map(function(f){return'<span class="status">'+esc(f)+'</span>'}).join('')+'</div></div>'}).join('');
$('#ck').innerHTML=Object.keys(C).map(function(k){return'<option value="'+k+'">'+esc(C[k].n)+'</option>'}).join('')}
draw();$('#af').onsubmit=function(e){e.preventDefault();var f=new FormData(e.target);C[f.get('c')].f.push(f.get('f'));draw();e.target.reset();toast('Field added to '+C[f.get('c')].n)};
$('#nc').onsubmit=function(e){e.preventDefault();var f=new FormData(e.target),p=f.get('p').toUpperCase().slice(0,3);if(C[p]){toast('Prefix '+p+' is taken');return}C[p]={n:f.get('n'),f:[]};draw();e.target.reset();toast('Category '+C[p].n+' created')}},

reports:function(){var cc=by(function(a){return a.c}),mx=Math.max.apply(null,Object.keys(cc).map(function(k){return cc[k]}));
$('#bc').innerHTML=Object.keys(cc).map(function(k){return'<div><span>'+CATS[k].n+'</span><i data-w="'+cc[k]/mx*100+'"></i><span class="price">'+cc[k]+'</span></div>'}).join('');
var val={};A.forEach(function(a){val[a.st]=(val[a.st]||0)+a.val});var vm=Math.max.apply(null,Object.keys(val).map(function(k){return val[k]}));
$('#bv').innerHTML=Object.keys(val).map(function(k){return'<div><span>'+k+'</span><i data-w="'+val[k]/vm*100+'" style="background:'+COL[k]+'"></i><span class="price">'+Math.round(val[k]/1000)+'k</span></div>'}).join('');grow('.a-bars i');
$('#csv').onclick=function(){var L=['Tag,Name,Category,Location,Assigned to,Status,Value'].concat(A.map(function(a){return[a.tag,a.name,CATS[a.c]?CATS[a.c].n:a.c,a.loc,a.who,a.st,a.val].map(function(v){return'"'+String(v).replace(/"/g,'""')+'"'}).join(',')}));
var l=document.createElement('a');l.href=URL.createObjectURL(new Blob([L.join('\n')],{type:'text/csv'}));l.download='addmore-assets.csv';l.click();toast('Report downloaded')}},

manager:function(){seedLog();var MG=(function(){try{return JSON.parse(localStorage.getItem('addmore-mgrs'))||{}}catch(e){return{}}})(),me=localStorage.getItem('addmore-me'),st={q:'',c:'',p:0},PS=10,
fmt=function(s){return new Date(s).toLocaleString('en-ZA',{dateStyle:'medium',timeStyle:'short'})},ks=function(){return Object.keys(CATS).filter(function(k){return MG[k]===me})};
if(MGR.indexOf(me)<0)me=MGR[0];$('#me').innerHTML=MGR.map(function(m){return'<option'+(m===me?' selected':'')+'>'+m+'</option>'}).join('');
function tb(){var K=ks(),r=LG.filter(function(g){return K.indexOf(g.c)>-1&&(!st.c||g.c===st.c)&&(g.t+g.n+g.w+g.l+g.y).toLowerCase().indexOf(st.q)>-1}).sort(function(a,b){return a.at<b.at?1:-1}),pgs=Math.max(1,Math.ceil(r.length/PS));st.p=Math.min(st.p,pgs-1);
$('#lg').innerHTML=r.slice(st.p*PS,st.p*PS+PS).map(function(g){return'<tr><td>'+fmt(g.at)+'</td><td><span class="tag-chip">'+g.t+'</span><small style="display:block;color:var(--muted)">'+esc(g.n)+'</small></td><td>'+(CATS[g.c]?CATS[g.c].n:g.c)+'</td><td>'+esc(g.w||'Nobody')+'</td><td>'+esc(g.l)+'</td><td>'+esc(g.y||'Not stated')+'</td><td><span class="status">'+esc(g.e)+'</span></td></tr>'}).join('')||'<tr><td colspan="7">'+(K.length?'No usage recorded yet.':'No sectors assigned to '+esc(me)+' yet.')+'</td></tr>';
var b='';for(var i=0;i<pgs;i++)b+='<button data-p="'+i+'" class="'+(i===st.p?'on':'')+'">'+(i+1)+'</button>';$('#pg').innerHTML=b}
function draw(){var K=ks(),as=A.filter(function(a){return K.indexOf(a.c)>-1}),use=as.filter(function(a){return a.who});
[['#n1',as.length],['#n2',use.length],['#n3',use.filter(function(a){return!a.ap}).length],['#n4',as.filter(function(a){return a.al}).length]].forEach(function(x){count($(x[0]),x[1],function(v){return v})});
$('#ms').innerHTML=K.length?K.map(function(k){return'<span class="status">'+esc(CATS[k].n)+'</span>'}).join(''):'<p>No sectors assigned yet. An admin can assign them on the Admin page.</p>';
$('#now').innerHTML=use.length?use.map(function(a){var g=LG.filter(function(x){return x.t===a.tag&&x.e==='Assigned'}).sort(function(p,q){return p.at<q.at?1:-1})[0]||{};return'<li><span><span class="tag-chip">'+a.tag+'</span><small>'+esc(a.name)+' &middot; used by '+esc(a.who)+' &middot; '+esc(a.loc)+' &middot; '+esc(g.y||'purpose not stated')+'</small></span><small>'+(g.at?'Since '+fmt(g.at):'')+'</small></li>'}).join(''):'<li>Nothing in your sectors is in use right now.</li>';
$('#sf').innerHTML='<option value="">All my sectors</option>'+K.map(function(k){return'<option value="'+k+'">'+esc(CATS[k].n)+'</option>'}).join('');st.c='';st.p=0;tb()}
$('#me').onchange=function(e){me=e.target.value;try{localStorage.setItem('addmore-me',me)}catch(x){}draw()};
$('#sq').oninput=function(e){st.q=e.target.value.toLowerCase();st.p=0;tb()};$('#sf').onchange=function(e){st.c=e.target.value;st.p=0;tb()};
$('#pg').onclick=function(e){var b=e.target.closest('button');if(b){st.p=+b.dataset.p;tb()}};draw()},

admin:function(){var B=[['Greenfield Primary','Schools','Growth',8,'Active'],['Karabo Dental Clinic','Clinics','Starter',31,'Active'],['Midvaal Municipality','Municipalities','Business',412,'Active'],['Ubuntu Couriers','Businesses','Starter',57,'Suspended']];
function draw(){$('#biz').innerHTML=B.map(function(b,i){return'<tr><td><strong>'+esc(b[0])+'</strong></td><td>'+b[1]+'</td><td>'+b[2]+'</td><td class="price">'+b[3]+'</td><td>'+(b[4]==='Active'?chip('Active'):chip('Lost').replace('Lost','Suspended'))+'</td><td><button class="btn btn--ghost" data-i="'+i+'">'+(b[4]==='Active'?'Suspend':'Reactivate')+'</button></td></tr>'}).join('')}
draw();$('#biz').onclick=function(e){var i=e.target.dataset.i;if(i==null)return;B[i][4]=B[i][4]==='Active'?'Suspended':'Active';draw();toast(B[i][0]+' is now '+B[i][4].toLowerCase())};
var n=B.length,t=B.reduce(function(s,b){return s+b[3]},0);count($('#nb'),n,function(x){return x});count($('#na'),t,function(x){return x});
/* Sector managers, usage approvals and asset alerts (a sector = an asset category) */
var MG=(function(){try{return JSON.parse(localStorage.getItem('addmore-mgrs'))||{}}catch(e){return{}}})(),MN=MGR,st={q:'',c:'',v:'',p:0},PS=8;
function sv(){save(A);try{localStorage.setItem('addmore-mgrs',JSON.stringify(MG))}catch(e){}}
function apc(a){return a.ap==='Declined'?'<span class="status status--lost">Declined</span>':!a.who?'<small style="color:var(--muted)">Not in use</small>':a.ap==='Approved'?'<span class="status status--active">Approved</span>':'<span class="status status--repair">Pending</span>'}
function stats(){$('#np').textContent=A.filter(function(a){return a.who&&!a.ap}).length;$('#nl').textContent=A.filter(function(a){return a.al}).length}
function sec(){var cn=by(function(a){return a.c});$('#sec').innerHTML=Object.keys(CATS).map(function(k){return'<tr><td><strong>'+esc(CATS[k].n)+'</strong><small style="display:block;color:var(--muted)">ADM-'+k+'</small></td><td class="price">'+(cn[k]||0)+'</td><td><select class="a-select" data-k="'+k+'" aria-label="Manager for '+esc(CATS[k].n)+' assets"><option value="">Unassigned</option>'+MN.map(function(m){return'<option'+(MG[k]===m?' selected':'')+'>'+m+'</option>'}).join('')+'</select></td></tr>'}).join('')}
function al(){var L=A.filter(function(a){return a.al});$('#al').innerHTML=L.length?L.map(function(a){return'<li><span><span class="tag-chip">'+a.tag+'</span><small>'+esc(a.name)+' &middot; '+a.al.t+(a.al.m?': '+esc(a.al.m):'')+' &middot; raised '+a.al.d+' &middot; manager: '+esc(MG[a.c]||'unassigned')+'</small></span><button class="a-mini" data-c="'+a.tag+'">Clear alert</button></li>'}).join(''):'<li>No active alerts.</li>'}
function tb(){var r=A.filter(function(a){return(!st.c||a.c===st.c)&&(st.v==='p'?a.who&&!a.ap:st.v==='a'?a.al:1)&&(a.tag+a.name+a.who+a.loc).toLowerCase().indexOf(st.q)>-1}),pgs=Math.max(1,Math.ceil(r.length/PS));st.p=Math.min(st.p,pgs-1);
$('#ar').innerHTML=r.slice(st.p*PS,st.p*PS+PS).map(function(a){return'<tr><td><span class="tag-chip">'+a.tag+'</span></td><td>'+esc(a.name)+'<small style="display:block;color:var(--muted)">'+esc(a.who||'Nobody')+'</small></td><td>'+(CATS[a.c]?CATS[a.c].n:a.c)+'</td><td>'+esc(MG[a.c]||'Unassigned')+'</td><td>'+chip(a.st)+'</td><td>'+apc(a)+'</td><td class="a-act" data-t="'+a.tag+'"><button class="a-mini" data-a="ok">Approve</button><button class="a-mini" data-a="no">Decline</button><button class="a-mini" data-a="miss">Missing</button><button class="a-mini" data-a="bad">Can&rsquo;t use</button></td></tr>'}).join('')||'<tr><td colspan="7">No assets match.</td></tr>';
var b='';for(var i=0;i<pgs;i++)b+='<button data-p="'+i+'" class="'+(i===st.p?'on':'')+'">'+(i+1)+'</button>';$('#pg').innerHTML=b}
function all(){sec();al();tb();stats()}
$('#sf').innerHTML+=Object.keys(CATS).map(function(k){return'<option value="'+k+'">'+esc(CATS[k].n)+'</option>'}).join('');
$('#sq').oninput=function(e){st.q=e.target.value.toLowerCase();st.p=0;tb()};$('#sf').onchange=function(e){st.c=e.target.value;st.p=0;tb()};$('#sv').onchange=function(e){st.v=e.target.value;st.p=0;tb()};
$('#pg').onclick=function(e){var b=e.target.closest('button');if(b){st.p=+b.dataset.p;tb()}};
$('#sec').onchange=function(e){var k=e.target.dataset.k;if(k==null)return;if(e.target.value)MG[k]=e.target.value;else delete MG[k];sv();al();tb();toast(e.target.value?e.target.value+' now manages '+CATS[k].n+' assets':CATS[k].n+' has no manager')};
$('#al').onclick=function(e){var b=e.target.closest('button'),a=b&&A.filter(function(x){return x.tag===b.dataset.c})[0];if(!a)return;delete a.al;a.st='Active';sv();all();toast('Alert cleared for '+a.tag)};
$('#ar').onclick=function(e){var b=e.target.closest('button'),a=b&&A.filter(function(x){return x.tag===b.parentNode.dataset.t})[0];if(!a)return;var k=b.dataset.a;
if(k==='ok'||k==='no'){if(!a.who)return toast(a.tag+' is not in use, nothing to '+(k==='ok'?'approve':'decline'));
if(k==='ok'){if(a.al)return toast('Clear the alert on '+a.tag+' before approving');a.ap='Approved';log(a,'Usage approved');toast('Usage of '+a.tag+' approved')}
else{a.ap='Declined';log(a,'Usage declined');a.who='';if(!a.al)a.st='Active';toast('Usage of '+a.tag+' declined and returned to the register')}}
else{var m=prompt((k==='miss'?'Why is '+a.tag+' missing?':'Why can\u2019t '+a.tag+' be used?')+' Add a note (optional):','');if(m===null)return;
a.al={t:k==='miss'?'Missing':'Cannot be used',m:m.trim(),d:new Date().toLocaleDateString('en-ZA')};a.st=k==='miss'?'Lost':'In repair';log(a,k==='miss'?'Reported missing':'Reported unusable',m.trim());a.who='';toast('Alert raised for '+a.tag)}
sv();all()};all()}
};
window.AM={A:A,CATS:CATS,P:P,esc:esc,R:R,chip:chip,count:count,toast:toast,nextTag:nextTag,save:save,log:log,seedLog:seedLog,COL:COL,reduce:reduce,$:$,$$:$$};
})();