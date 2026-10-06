import './globals.css';
import { site } from '../lib/site';

export const metadata={
  metadataBase:new URL(site.domain),
  title:{default:'Refund Money Now | Claims, Refunds & Consumer Money',template:'%s | Refund Money Now'},
  description:site.description,
  alternates:{canonical:'/'},
  openGraph:{type:'website',siteName:site.name,title:site.name,description:site.description,url:site.domain},
  twitter:{card:'summary_large_image'},
  robots:{index:true,follow:true,googleBot:{index:true,follow:true,'max-image-preview':'large','max-snippet':-1,'max-video-preview':-1}}
};

export default function RootLayout({children}){
  const org={"@context":"https://schema.org","@type":"NewsMediaOrganization","name":site.name,"url":site.domain,"description":site.description};
  return <html lang="en"><body>
    <div className="top"><div className="wrap"><span>Independent consumer-money newsroom • Source-backed reporting</span><span>Not financial or legal advice</span></div></div>
    <header className="header"><div className="wrap"><a className="brand" href="/">Refund<span>MoneyNow</span></a><nav>{site.categories.slice(0,6).map(([s,n])=><a key={s} href={`/category/${s}`}>{n}</a>)}</nav></div></header>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(org)}} />
    {children}
    <footer className="footer"><div className="wrap"><strong>Refund Money Now</strong><p className="disclaimer">We explain consumer-money recovery topics using cited sources. Information is general and may change. Verify deadlines, eligibility and legal rights with the relevant official agency, provider or qualified professional.</p><p className="disclaimer"><a href="/about">About</a> · <a href="/editorial-standards">Editorial Standards</a> · <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a></p><p className="disclaimer">© {new Date().getFullYear()} Refund Money Now.</p></div></footer>
  </body></html>
}
