import crypto from "node:crypto";
const json=(s,b)=>({statusCode:s,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},body:JSON.stringify(b)});
const md5=s=>crypto.createHash("md5").update(s,"utf8").digest("hex");
exports.handler=async(event)=>{
 if(event.httpMethod!=="POST")return json(405,{error:"Method Not Allowed"});
 const secret=process.env.TOYYIBPAY_USER_SECRET_KEY;if(!secret)return json(500,{error:"Payment configuration incomplete."});
 let body={};
 try{
  const type=(event.headers["content-type"]||"").toLowerCase();
  if(type.includes("application/json"))body=JSON.parse(event.body||"{}");
  else for(const [k,v] of new URLSearchParams(event.body||""))body[k]=v;
 }catch{return json(400,{error:"Invalid callback payload."})}
 const refno=String(body.refno||"").trim(),status=String(body.status||"").trim(),orderId=String(body.order_id||"").trim(),received=String(body.hash||"").trim().toLowerCase();
 if(!refno||!status||!orderId||!received)return json(400,{error:"Incomplete callback payload."});
 const expected=md5(secret+status+orderId+refno+"ok").toLowerCase();
 const valid=received.length===expected.length&&crypto.timingSafeEqual(Buffer.from(received),Buffer.from(expected));
 if(!valid){console.error("Invalid ToyyibPay callback", {orderId,refno});return json(403,{error:"Invalid callback signature."})}
 console.log("VERIFIED_TOYYIBPAY_PAYMENT",JSON.stringify({order_id:orderId,reference_no:refno,status,reason:body.reason||"",bill_code:body.billcode||"",amount:body.amount||"",transaction_time:body.transaction_time||"",received_at:new Date().toISOString()}));
 return json(200,{ok:true,received:true});
};
