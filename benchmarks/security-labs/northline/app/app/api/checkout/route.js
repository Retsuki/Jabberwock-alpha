import { randomUUID } from 'node:crypto';
import { json,currentUser,body } from '../../../lib/http.js';
import { products,getStore,saveStore } from '../../../lib/store.js';
export const dynamic='force-dynamic';
export async function POST(request) {
  const user=await currentUser(request);if(!user)return json({error:'ログインしてください'},401);
  let input;try{input=await body(request);}catch(error){return json({error:error.message},400);}
  if(input.paymentMethod!=='demo'||typeof input.shippingAddress!=='string'||!input.shippingAddress.trim()||input.shippingAddress.length>500||!Array.isArray(input.items)||input.items.length<1||input.items.length>20)return json({error:'配送先と注文内容を確認してください'},400);
  const items=[];const seen=new Set();
  for(const item of input.items){const product=products.find(product=>product.id===item.productId);if(!product||seen.has(product.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>product.stock||!Number.isInteger(item.unitPrice)||item.unitPrice<0||item.unitPrice>1000000)return json({error:'商品・数量・金額を確認してください'},400);seen.add(product.id);items.push({productId:product.id,name:product.name,quantity:item.quantity,unitPrice:item.unitPrice});}
  const subtotal=items.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0);const shippingFee=subtotal>=10000?0:550;
  const order={id:`ORD-2026-${randomUUID().slice(0,8).toUpperCase()}`,userId:user.id,customerName:user.name,email:user.email,items,subtotal,shippingFee,total:subtotal+shippingFee,status:'processing',shippingAddress:input.shippingAddress.trim(),createdAt:new Date().toISOString()};
  const store=getStore();store.orders.unshift(order);saveStore(store);return json({order},201);
}
