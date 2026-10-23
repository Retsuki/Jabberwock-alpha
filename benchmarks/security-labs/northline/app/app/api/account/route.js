import { json,currentUser,body } from '../../../lib/http.js';
import { getStore,saveStore,publicUser } from '../../../lib/store.js';
export const dynamic='force-dynamic';
export async function GET(request) {const user=await currentUser(request);return user?json({user:publicUser(user)}):json({error:'ログインしてください'},401);}
export async function PATCH(request) {
  const user=await currentUser(request);if(!user)return json({error:'ログインしてください'},401);
  let input;try{input=await body(request);}catch(error){return json({error:error.message},400);}
  const fields=['name','company','shippingAddress'];
  if(Object.keys(input).some(field=>!fields.includes(field))||Object.entries(input).some(([field,value])=>typeof value!=='string'||value.length>500||(field==='name'&&!value.trim())))return json({error:'プロフィールの入力内容を確認してください'},400);
  const store=getStore();const saved=store.users.find(item=>item.id===user.id);for(const field of fields)if(input[field]!==undefined)saved[field]=input[field].trim();saveStore(store);return json({user:publicUser(saved)});
}
