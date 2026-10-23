import { json } from '../../../../lib/http.js';
import { getStore } from '../../../../lib/store.js';
export const dynamic='force-dynamic';
export async function GET() {return json({orders:getStore().orders});}
