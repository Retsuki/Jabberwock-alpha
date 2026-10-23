import { json,currentUser } from '../../../../lib/http.js';
import { publicUser } from '../../../../lib/store.js';
export const dynamic='force-dynamic';
export async function GET(request) {const user=await currentUser(request);return json({user:user?publicUser(user):null});}
