require('dotenv').config();
const express=require('express'),mongoose=require('mongoose'),crypto=require('crypto'),path=require('path'),helmet=require('helmet'),rateLimit=require('express-rate-limit');
const {MONGODB_URI,ADMIN_USER,ADMIN_PASS,JWT_SECRET,PORT=3000}=process.env;
if(!MONGODB_URI||!ADMIN_USER||!ADMIN_PASS||!JWT_SECRET){console.error('Missing env: MONGODB_URI, ADMIN_USER, ADMIN_PASS, JWT_SECRET');process.exit(1)}
const app=express();app.set('trust proxy',1);app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'20kb'}));
const S=mongoose.Schema;
const Rsvp=mongoose.model('Rsvp',new S({name:String,phone:{type:String,unique:true},attending:Boolean,guests:{type:Number,default:1},message:String},{timestamps:true}));
const Contrib=mongoose.model('Contrib',new S({name:String,phone:String,amount:Number,sms:String,key:{type:String,unique:true},status:{type:String,default:'pending'}},{timestamps:true}));
const Visit=mongoose.model('Visit',new S({vid:{type:String,unique:true},hits:{type:Number,default:1}},{timestamps:true}));
const clean=(s,n)=>String(s||'').replace(/[<>]/g,'').trim().slice(0,n);
const normPhone=p=>String(p||'').replace(/[\s-]/g,'').replace(/^\+?255/,'0');
const okPhone=p=>/^0[67]\d{8}$/.test(p);
const sha=s=>crypto.createHash('sha1').update(s).digest('hex');
const h256=s=>crypto.createHash('sha256').update(String(s)).digest();
const same=(a,b)=>crypto.timingSafeEqual(h256(a),h256(b));
const hm=p=>crypto.createHmac('sha256',JWT_SECRET).update(p).digest('hex');
const sign=p=>p+'.'+hm(p);
const verify=t=>{const [p,s]=String(t||'').split('.');if(!p||!s)return false;const e=hm(p);return s.length===e.length&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e))&&+p>Date.now()};
const auth=(q,r,n)=>verify((q.get('authorization')||'').replace('Bearer ',''))?n():r.status(401).json({error:'Huna ruhusa. Tafadhali ingia tena.'});
const h=f=>(q,r,n)=>f(q,r,n).catch(e=>{console.error(e);r.status(500).json({error:'Hitilafu ya seva. Jaribu tena.'})});
app.use('/api',(q,r,n)=>{r.set('Cache-Control','no-store');n()},rateLimit({windowMs:6e4,max:200,standardHeaders:true,legacyHeaders:false,message:{error:'Maombi mengi. Subiri kidogo.'}}));

app.post('/api/visit',h(async(q,r)=>{const v=clean((q.body||{}).vid,64);if(v.length>=8)await Visit.updateOne({vid:v},{$inc:{hits:1}},{upsert:true});r.json({ok:true})}));

app.post('/api/rsvp',h(async(q,r)=>{const b=q.body||{},name=clean(b.name,80),phone=normPhone(b.phone),attending=b.attending===true;
 if(name.length<3)return r.status(400).json({error:'Tafadhali weka jina kamili.'});
 if(!okPhone(phone))return r.status(400).json({error:'Namba ya simu si sahihi.'});
 const guests=attending?Math.min(4,Math.max(1,parseInt(b.guests)||1)):0;
 const ex=await Rsvp.exists({phone});
 await Rsvp.updateOne({phone},{name,attending,guests,message:clean(b.message,300)},{upsert:true});
 r.json({ok:true,updated:!!ex})}));

app.post('/api/contribute',h(async(q,r)=>{const b=q.body||{},name=clean(b.name,80),phone=normPhone(b.phone),sms=clean(b.sms,600),amount=Math.round(+b.amount);
 if(name.length<3||!okPhone(phone))return r.status(400).json({error:'Taarifa za mchangiaji si sahihi. Ingia tena.'});
 if(sms.length<15)return r.status(400).json({error:'Bandika ujumbe kamili wa muamala.'});
 if(!(amount>=1000&&amount<=1e7))return r.status(400).json({error:'Weka kiasi sahihi.'});
 const m=sms.toUpperCase().match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b/);
 const key=m?m[0]:sha(sms.toLowerCase().replace(/\s+/g,' '));
 try{await Contrib.create({name,phone,amount,sms,key})}catch(e){if(e.code===11000)return r.status(409).json({error:'Muamala huu umeshatumwa tayari.'});throw e}
 r.json({ok:true})}));

app.post('/api/admin/login',rateLimit({windowMs:9e5,max:10,standardHeaders:true,legacyHeaders:false,message:{error:'Majaribio mengi. Subiri dakika chache.'}}),(q,r)=>{
 const{username,password}=q.body||{};
 if(same(username,ADMIN_USER)&&same(password,ADMIN_PASS))return r.json({token:sign(String(Date.now()+432e5))});
 r.status(401).json({error:'Jina au nenosiri si sahihi.'})});

app.get('/api/admin/data',auth,h(async(q,r)=>{
 const[c,s,v]=await Promise.all([Contrib.find().sort('-createdAt').lean(),Rsvp.find().sort('-updatedAt').lean(),Visit.aggregate([{$group:{_id:null,unique:{$sum:1},views:{$sum:'$hits'}}}])]);
 const sum=t=>c.filter(x=>x.status===t).reduce((a,x)=>a+x.amount,0),yes=s.filter(x=>x.attending);
 r.json({stats:{views:v[0]?v[0].views:0,unique:v[0]?v[0].unique:0,accepted:yes.length,guests:yes.reduce((a,x)=>a+x.guests,0),declined:s.length-yes.length,confirmed:sum('approved'),pending:sum('pending'),pendingCount:c.filter(x=>x.status==='pending').length},contributions:c,rsvps:s,at:Date.now()})}));

app.patch('/api/admin/contributions/:id',auth,h(async(q,r)=>{const st=(q.body||{}).status;
 if(!mongoose.isValidObjectId(q.params.id)||!['approved','rejected','pending'].includes(st))return r.status(400).json({error:'Ombi si sahihi.'});
 await Contrib.updateOne({_id:q.params.id},{status:st});r.json({ok:true})}));

app.get('/api/admin/export/:t',auth,h(async(q,r)=>{const c=q.params.t==='contributions';if(!c&&q.params.t!=='guests')return r.sendStatus(404);
 const rows=await(c?Contrib:Rsvp).find().sort('-createdAt').lean(),cols=c?['name','phone','amount','status','sms','createdAt']:['name','phone','attending','guests','message','createdAt'];
 const esc=v=>{v=v==null?'':String(v);if(/^[=+\-@]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
 r.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename=${q.params.t}.csv`}).send('\ufeff'+[cols.join(',')].concat(rows.map(x=>cols.map(k=>esc(x[k])).join(','))).join('\n'))}));

app.get('/health',(q,r)=>r.send('ok'));
app.use(express.static(path.join(__dirname,'public')));
mongoose.connect(MONGODB_URI).then(()=>app.listen(PORT,()=>console.log('Running on '+PORT))).catch(e=>{console.error(e.message);process.exit(1)});
