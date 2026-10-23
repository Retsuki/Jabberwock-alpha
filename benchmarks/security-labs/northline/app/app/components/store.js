'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
const Store = createContext(null);
export function Providers({ children }) {
 const [user,setUser]=useState(null),[cart,setCart]=useState([]),[ready,setReady]=useState(false);
 useEffect(()=>{try{setCart(JSON.parse(localStorage.getItem('northline-cart')||'[]'));}catch{}setReady(true);fetch('/api/auth/me').then(r=>r.json()).then(d=>setUser(d.user||null));},[]);
 useEffect(()=>{if(ready)localStorage.setItem('northline-cart',JSON.stringify(cart));},[cart,ready]);
 function add(product,quantity=1){setCart(rows=>{const old=rows.find(x=>x.productId===product.id);return old?rows.map(x=>x.productId===product.id?{...x,quantity:Math.min(20,x.quantity+quantity)}:x):[...rows,{productId:product.id,name:product.name,quantity,unitPrice:product.price,emoji:product.emoji,category:product.category}];});}
 return <Store.Provider value={{user,setUser,cart,setCart,add,ready}}><Header/>{children}<Footer/></Store.Provider>;
}
export function useStore(){return useContext(Store);}
export function money(n){return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY'}).format(n||0);}
export function Header(){const{user,cart,setUser}=useStore();return <><div className="announcement">LOCAL DEMO / 架空の商品・データです <span>¥10,000以上のお買い物で送料無料</span></div><header className="header"><Link className="brand" href="/">NORTHLINE<span>OBJECTS FOR EVERYDAY LIFE</span></Link><nav aria-label="メインナビゲーション"><Link href="/#collection">コレクション</Link><Link href="/orders">注文履歴</Link><Link href="/account">{user?user.name+' さん':'マイページ'}</Link>{user?.role==='admin'&&<Link href="/admin">ショップ管理</Link>}<Link className="bag" href="/cart">バッグ <b>{cart.reduce((n,x)=>n+x.quantity,0)}</b></Link>{user&&<button className="text-button" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});setUser(null);location.href='/';}}>ログアウト</button>}</nav></header></>;}
function Footer(){return <footer><div className="brand">NORTHLINE<span>暮らしに、余白と心地よさを。</span></div><div>Designed for the everyday.<p>このショップはローカル検証用のデモです。決済・配送は行われません。</p></div><small>© 2026 NORTHLINE DEMO</small></footer>;}
export function ProductArt({product,large=false}){return <div className={'product-art '+(large?'large':'')} style={{'--art-tone': tones[product.category]||'#e9e4da'}}><span className="art-orbit"/><span className="product-emoji" aria-hidden="true">{product.emoji||'◒'}</span><span className="art-caption">N / {product.category}</span></div>;}
const tones={'バッグ':'#e9dfd3','キッチン':'#e5e8df','ホーム':'#e6dfd8','アウトドア':'#e8e0cf','ステーショナリー':'#dfe6e7'};
export function orderStatus(status){return ({paid:'受付済み',processing:'受付済み',shipped:'発送済み',delivered:'配達済み'})[status]||status;}
export function ProductCard({product}){return <Link className="product-card" href={'/products/'+product.id}><ProductArt product={product}/><div className="product-card-info"><div><small>{product.category}</small><h3>{product.name}</h3></div><span>{money(product.price)}</span></div></Link>;}
export function Notice({children,error=false}){return children?<div role={error?'alert':'status'} className={'notice '+(error?'error':'')}>{children}</div>:null;}
export function Loading(){return <div className="loading"><span/>読み込み中です</div>;}
export function PageTitle({eyebrow,title,description}){return <div className="page-title"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>;}
export function OrderSummary({order}){return <><div className="order-heading"><div><small>ORDER NUMBER</small><h2>{order.id}</h2></div><span className="status-pill">{orderStatus(order.status)}</span></div><p className="muted">{new Date(order.createdAt).toLocaleString('ja-JP')}</p><div className="order-items">{order.items.map((item,i)=><div key={i}><span>{item.name} <small>× {item.quantity}</small></span><strong>{money(item.unitPrice*item.quantity)}</strong></div>)}</div><div className="totals"><div><span>小計</span><span>{money(order.subtotal)}</span></div><div><span>送料</span><span>{money(order.shippingFee)}</span></div><div className="total"><span>合計</span><strong>{money(order.total)}</strong></div></div><div className="delivery"><h3>お届け先</h3><p>{order.customerName} 様</p><p>{order.shippingAddress}</p><p>{order.email}</p></div></>;}
