import { products } from '../../../lib/store.js';
import { json } from '../../../lib/http.js';
export const dynamic='force-dynamic';
export async function GET(request) { const query=request.nextUrl.searchParams; const search=(query.get('search')??'').slice(0,200).toLowerCase(); const category=query.get('category'); return json({products:products.filter(product=>(!search || `${product.name} ${product.description}`.toLowerCase().includes(search))&&(!category || category==='all' || product.category===category))}); }
