const PRODUCTS={autisme:{name:"Set Anak Autisme",price:15},membaca:{name:"Set Anak Cepat Kenal Huruf & Membaca",price:15},motor:{name:"Set Latihan Motor Skill & Focus",price:15},tahun1:{name:"Set Latihan Tahap 1",price:15}};
const BUNDLE={1:15,2:25,3:35,4:45};
const json=(status,body)=>({statusCode:status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},body:JSON.stringify(body)});
const clean=(v,n)=>typeof v==="string"?v.trim().slice(0,n):"";
const emailOK=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const phoneOK=v=>/^\+?[0-9\s-]{9,16}$/.test(v);
const orderId=()=>`EDU${new Date().toISOString().replace(/\D/g,"").slice(0,14)}${Math.random().toString(36).slice(2,8).toUpperCase()}`;

exports.handler=async(event)=>{
 if(event.httpMethod!=="POST")return json(405,{error:"Method Not Allowed"});
 if(!process.env.TOYYIBPAY_USER_SECRET_KEY||!process.env.TOYYIBPAY_CATEGORY_CODE||!process.env.SITE_URL)
   return json(500,{error:"ToyyibPay belum lengkap dikonfigurasi di Netlify."});
 let p; try{p=JSON.parse(event.body||"{}")}catch{return json(400,{error:"Data checkout tidak sah."})}
 if(p.gateway&&p.gateway!=="toyyibpay")return json(400,{error:"Gateway tidak disokong."});
 const c=p.customer||{},name=clean(c.name,100),email=clean(c.email,150).toLowerCase(),phone=clean(c.phone,20);
 if(!name||!email||!phone)return json(400,{error:"Nama, email dan telefon diperlukan."});
 if(!emailOK(email))return json(400,{error:"Format email tidak sah."});
 if(!phoneOK(phone))return json(400,{error:"Format telefon tidak sah."});
 const ids=[...new Set(Array.isArray(p.products)?p.products.filter(x=>typeof x==="string").map(x=>x.trim()):[])];
 if(ids.length<1||ids.length>4||ids.some(id=>!PRODUCTS[id]))return json(400,{error:"Produk tidak sah."});
 const total=BUNDLE[ids.length]; if(!total)return json(400,{error:"Jumlah pesanan tidak sah."});
 const site=process.env.SITE_URL.replace(/\/+$/,""),base=(process.env.TOYYIBPAY_BASE_URL||"https://toyyibpay.com").replace(/\/+$/,"");
 const id=orderId(),f=new URLSearchParams();
 f.set("userSecretKey",process.env.TOYYIBPAY_USER_SECRET_KEY);
 f.set("categoryCode",process.env.TOYYIBPAY_CATEGORY_CODE);
 f.set("billName",`EduKids ${ids.length} Set`);
 f.set("billDescription",ids.map(x=>PRODUCTS[x].name).join(", ").slice(0,100));
 f.set("billPriceSetting","1"); f.set("billPayorInfo","1"); f.set("billAmount",String(total*100));
 f.set("billReturnUrl",`${site}/payment-success.html`);
 f.set("billCallbackUrl",`${site}/.netlify/functions/payment-callback`);
 f.set("billExternalReferenceNo",id); f.set("billTo",name); f.set("billEmail",email); f.set("billPhone",phone);
 f.set("billPaymentChannel",process.env.TOYYIBPAY_PAYMENT_CHANNEL||"0");
 if(process.env.TOYYIBPAY_ENABLE_DUITNOW_QR==="1"){f.set("enableDuitNowQR","1");f.set("chargeDuitNowQR",process.env.TOYYIBPAY_CHARGE_DUITNOW_QR||"0")}
 try{
  const r=await fetch(`${base}/index.php/api/createBill`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:f.toString()});
  const raw=await r.text(); let data; try{data=JSON.parse(raw)}catch{data=null}
  const code=Array.isArray(data)&&data[0]?.BillCode?data[0].BillCode:null;
  if(!r.ok||!code){console.error("ToyyibPay createBill:",raw);return json(502,{error:"ToyyibPay gagal mencipta bil.",detail:data?.msg})}
  return json(200,{ok:true,order_id:id,payment_url:`${base}/${encodeURIComponent(code)}`,bill_code:code,amount:total});
 }catch(e){console.error(e);return json(500,{error:"Ralat semasa mencipta pembayaran."})}
};
