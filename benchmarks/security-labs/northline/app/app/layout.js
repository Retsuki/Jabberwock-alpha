import './globals.css';
import { Providers } from './components/store';
export const metadata={title:{default:'NORTHLINE — 暮らしを整えるデザインストア',template:'%s | NORTHLINE'},description:'日々の暮らしに寄り添う、デザインと道具。ローカルEC検証ショップ。'};
export default function RootLayout({children}){return <html lang="ja"><body><Providers>{children}</Providers></body></html>;}
