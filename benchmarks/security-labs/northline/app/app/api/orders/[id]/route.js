import { json,currentUser } from '../../../../lib/http.js';
import { getStore } from '../../../../lib/store.js';
export const dynamic='force-dynamic';
export async function GET(request,{params}) {if(!await currentUser(request))return json({error:'ログインしてください'},401);const order=getStore().orders.find(order=>order.id===params.id);return order?json({order}):json({error:'注文が見つかりません'},404);}
