import { json } from '../../../../lib/http.js';
import { getStore,publicUser } from '../../../../lib/store.js';
export const dynamic='force-dynamic';
export async function GET() {return json({customers:getStore().users.filter(user=>user.role==='customer').map(publicUser)});}
