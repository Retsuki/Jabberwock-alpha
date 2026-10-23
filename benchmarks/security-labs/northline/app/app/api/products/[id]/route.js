import { products } from '../../../../lib/store.js';
import { json } from '../../../../lib/http.js';
export const dynamic='force-dynamic';
export async function GET(request,{params}) { const product=products.find(item=>item.id===params.id); return product?json({product}):json({error:'商品が見つかりません'},404); }
