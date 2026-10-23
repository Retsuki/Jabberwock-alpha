import { json } from '../../../lib/http.js';
export const dynamic='force-dynamic';
export async function GET() {return json({ok:true,service:'northline-store',mode:'local-demo'});}
