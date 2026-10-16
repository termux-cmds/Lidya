const {MongoClient,ObjectId}=require('mongodb'),crypto=require('crypto');
const {MONGODB_URI,ADMIN_USER,ADMIN_PASS,JWT_SECRET,DB_NAME='lidya'}=process.env;
let conn;
function db(){if(!conn){conn=(async()=>{const c=await new MongoClient(MONGODB_URI,{maxPoolSize:5}).connect(),d=c.db(DB_NAME);
 await Promise.all([d.collection('rsvps').createIndex({phone:1},{unique:true}),d.collection('contribs').createIndex({key:1},{unique:true}),d.collection('visits').createIndex({vid:1},{unique:true})]);return d})();conn.catch(()=>{conn=null})}return conn}
const J=(s,b,h={})=>({statusCode:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...h},body:JSON.stringify(b)});
const clean=(s,n)=>String(s||'').replace(/[<>]/g,'').trim().slice(0,n);
const normPhone=p=>String(p||'').replace(/[\s-]/g,'').replace(/^\+?255/,'0');
const okPhone=p=>/^0[67]\d{8}$/.test(p);
const sha=s=>crypto.createHash('sha1').update(s).digest('hex'),h256=s=>crypto.createHash('sha256').update(String(s)).digest();
const same=(a,b)=>crypto.timingSafeEqual(h256(a),h256(b));
const hm=p=>crypto.createHmac('sha256',JWT_SECRET).update(p).digest('hex'),sign=p=>p+'.'+hm(p);
const verify=t=>{const [p,s]=String(t||'').split('.');if(!p||!s)return false;const e=hm(p);return s.length===e.length&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e))&&+p>Date.now()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

exports.handler=async e=>{
 if(!MONGODB_URI||!ADMIN_USER||!ADMIN_PASS||!JWT_SECRET)return J(500,{error:'Seva haijawekwa vizuri (environment variables).'});
 if((e.body||'').length>20000)return J(413,{error:'Ombi ni kubwa mno.'});
 let b={};try{b=e.body?JSON.parse(e.body):{}}catch(x){return J(400,{error:'Ombi si sahihi.'})}
 const route=e.path.replace(/^.*?\/api(?=\/|$)/,'').replace(/\/$/,''),m=e.httpMethod,isAdmin=route.startsWith('/admin')&&route!=='/admin/login';
 try{
  if(isAdmin&&!verify((e.headers.authorization||'').replace('Bearer ','')))return J(401,{error:'Huna ruhusa. Tafadhali ingia tena.'});
  const d=await db(),now=new Date();

  if(m==='POST'&&route==='/visit'){const v=clean(b.vid,64);if(v.length>=8)await d.collection('visits').updateOne({vid:v},{$inc:{hits:1},$setOnInsert:{createdAt:now}},{upsert:true});return J(200,{ok:true})}

  if(m==='POST'&&route==='/rsvp'){const name=clean(b.name,80),phone=normPhone(b.phone),attending=b.attending===true;
   if(name.length<3)return J(400,{error:'Tafadhali weka jina kamili.'});if(!okPhone(phone))return J(400,{error:'Namba ya simu si sahihi.'});
   const guests=attending?Math.min(4,Math.max(1,parseInt(b.guests)||1)):0;
   const old=await d.collection('rsvps').findOneAndUpdate({phone},{$set:{name,attending,guests,message:clean(b.message,300),updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true});
   return J(200,{ok:true,updated:!!old})}

  if(m==='POST'&&route==='/contribute'){const name=clean(b.name,80),phone=normPhone(b.phone),sms=clean(b.sms,600),amount=Math.round(+b.amount);
   if(name.length<3||!okPhone(phone))return J(400,{error:'Taarifa za mchangiaji si sahihi. Ingia tena.'});
   if(sms.length<15)return J(400,{error:'Bandika ujumbe kamili wa muamala.'});
   if(!(amount>=1000&&amount<=1e7))return J(400,{error:'Weka kiasi sahihi.'});
   const t=sms.toUpperCase().match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b/),key=t?t[0]:sha(sms.toLowerCase().replace(/\s+/g,' '));
   try{await d.collection('contribs').insertOne({name,phone,amount,sms,key,status:'pending',createdAt:now})}catch(x){if(x.code===11000)return J(409,{error:'Muamala huu umeshatumwa tayari.'});throw x}
   return J(200,{ok:true})}

  if(m==='POST'&&route==='/admin/login'){
   if(same(b.username,ADMIN_USER)&&same(b.password,ADMIN_PASS))return J(200,{token:sign(String(Date.now()+432e5))});
   await sleep(800);return J(401,{error:'Jina au nenosiri si sahihi.'})}

  if(m==='GET'&&route==='/admin/data'){
   const[c,s,v]=await Promise.all([d.collection('contribs').find().sort({createdAt:-1}).toArray(),d.collection('rsvps').find().sort({updatedAt:-1}).toArray(),d.collection('visits').aggregate([{$group:{_id:null,unique:{$sum:1},views:{$sum:'$hits'}}}]).toArray()]);
   const sum=t=>c.filter(x=>x.status===t).reduce((a,x)=>a+x.amount,0),yes=s.filter(x=>x.attending);
   return J(200,{stats:{views:v[0]?v[0].views:0,unique:v[0]?v[0].unique:0,accepted:yes.length,guests:yes.reduce((a,x)=>a+x.guests,0),declined:s.length-yes.length,confirmed:sum('approved'),pending:sum('pending'),pendingCount:c.filter(x=>x.status==='pending').length},contributions:c,rsvps:s,at:Date.now()})}

  const pm=route.match(/^\/admin\/contributions\/([0-9a-f]{24})$/);
  if(m==='PATCH'&&pm){if(!['approved','rejected','pending'].includes(b.status))return J(400,{error:'Ombi si sahihi.'});
   await d.collection('contribs').updateOne({_id:new ObjectId(pm[1])},{$set:{status:b.status}});return J(200,{ok:true})}

  const xm=route.match(/^\/admin\/export\/(contributions|guests)$/);
  if(m==='GET'&&xm){const c=xm[1]==='contributions',rows=await d.collection(c?'contribs':'rsvps').find().sort({createdAt:-1}).toArray(),
   cols=c?['name','phone','amount','status','sms','createdAt']:['name','phone','attending','guests','message','createdAt'];
   const esc=v=>{v=v==null?'':String(v);if(/^[=+\-@]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
   return {statusCode:200,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename=${xm[1]}.csv`},body:'\ufeff'+[cols.join(',')].concat(rows.map(x=>cols.map(k=>esc(x[k])).join(','))).join('\n')}}

  return J(404,{error:'Haipatikani.'});
 }catch(err){console.error(err);return J(500,{error:'Hitilafu ya seva. Jaribu tena.'})}
};
