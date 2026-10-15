(function(){'use strict';
var root=document.documentElement,$=function(s,c){return(c||document).querySelector(s)},$$=function(s,c){return[].slice.call((c||document).querySelectorAll(s))};
/* Theme + mobile menu (same behaviour and storage key as the landing page) */
var tb=$('#theme-toggle');function setT(t){root.setAttribute('data-theme',t);if(tb)tb.setAttribute('aria-pressed',String(t==='dark'))}
setT(root.getAttribute('data-theme')||'light');
if(tb)tb.onclick=function(){var n=root.getAttribute('data-theme')==='dark'?'light':'dark';setT(n);try{localStorage.setItem('addmore-theme',n)}catch(e){}};
var mb=$('#menu-toggle'),nv=$('#primary-nav');
if(mb)mb.onclick=function(){var o=mb.getAttribute('aria-expanded')!=='true';mb.setAttribute('aria-expanded',String(o));nv.classList.toggle('is-open',o)};
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
A.unshift(a);save(A);toast(a.tag+' added');setTimeout(function(){location.href='assets.html?new='+a.tag},reduce?0:900)}},

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

admin:function(){var B=[['Greenfield Primary','Schools','Growth',8,'Active'],['Karabo Dental Clinic','Clinics','Starter',31,'Active'],['Midvaal Municipality','Municipalities','Business',412,'Active'],['Ubuntu Couriers','Businesses','Starter',57,'Suspended']];
function draw(){$('#biz').innerHTML=B.map(function(b,i){return'<tr><td><strong>'+esc(b[0])+'</strong></td><td>'+b[1]+'</td><td>'+b[2]+'</td><td class="price">'+b[3]+'</td><td>'+(b[4]==='Active'?chip('Active'):chip('Lost').replace('Lost','Suspended'))+'</td><td><button class="btn btn--ghost" data-i="'+i+'">'+(b[4]==='Active'?'Suspend':'Reactivate')+'</button></td></tr>'}).join('')}
draw();$('#biz').onclick=function(e){var i=e.target.dataset.i;if(i==null)return;B[i][4]=B[i][4]==='Active'?'Suspended':'Active';draw();toast(B[i][0]+' is now '+B[i][4].toLowerCase())};
var n=B.length,t=B.reduce(function(s,b){return s+b[3]},0);count($('#nb'),n,function(x){return x});count($('#na'),t,function(x){return x})}
};
window.AM={A:A,CATS:CATS,P:P,esc:esc,R:R,chip:chip,count:count,toast:toast,nextTag:nextTag,save:save,COL:COL,reduce:reduce,$:$,$$:$$};
})();