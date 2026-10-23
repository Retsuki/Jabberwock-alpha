import { json,currentUser } from '../../../lib/http.js';
import { getStore } from '../../../lib/store.js';
export const dynamic='force-dynamic';
export async function GET(request) {const user=await currentUser(request);return user?json({orders:getStore().orders.filter(order=>order.userId===user.id)}):json({error:'ログインしてください'},401);}
