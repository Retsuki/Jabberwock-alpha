import { body,json } from '../../../../lib/http.js';
import { getStore,checkPassword,publicUser } from '../../../../lib/store.js';
import { SESSION_COOKIE,issueSession } from '../../../../lib/session.js';
export const dynamic='force-dynamic';
export async function POST(request) {
  let input; try {input=await body(request);} catch(error) {return json({error:error.message},400);}
  if(typeof input.email!=='string'||typeof input.password!=='string'||input.password.length>256)return json({error:'メールアドレスとパスワードを確認してください'},400);
  const user=getStore().users.find(user=>user.email===input.email.trim().toLowerCase());
  if(!user||!checkPassword(input.password,user.passwordHash))return json({error:'メールアドレスまたはパスワードが違います'},401);
  const response=json({user:publicUser(user)}); response.cookies.set(SESSION_COOKIE,await issueSession(user),{httpOnly:true,sameSite:'lax',secure:false,path:'/',maxAge:28800}); return response;
}
