import { json } from '../../../../lib/http.js';
import { SESSION_COOKIE } from '../../../../lib/session.js';
export async function POST() {const response=json({ok:true});response.cookies.set(SESSION_COOKIE,'',{httpOnly:true,sameSite:'lax',path:'/',maxAge:0});return response;}
