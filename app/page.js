import Image from 'next/image';
import {getArticles} from '../lib/articles';
import {site} from '../lib/site';

export default function Home(){
  const articles=getArticles().slice(0,6);
  return <main>
    <section className="hero"><div className="wrap hero-grid"><div><div className="eyebrow">Consumer money recovery</div><h1>Find the money you may be entitled to reclaim.</h1><p>Source-backed reporting on refunds, insurance claims, compensation, bank fees, chargebacks, credit disputes and unclaimed money.</p><a className="cta" href="#latest">Read the latest</a><div className="status"><div><b>5/day</b><span className="meta">2 pillars + 3 reactive</span></div><div><b>Evidence Gate</b><span className="meta">fail-closed publishing</span></div><div><b>1200×675</b><span className="meta">article social images</span></div><div><b>US-first</b><span className="meta">commercial intent</span></div></div></div><aside className="trust"><h3>Our publishing standard</h3><ul><li>Primary-source citations where available</li><li>No invented eligibility, payouts or deadlines</li><li>Reactive stories sourced from authoritative feeds</li><li>Automated publication stops when evidence is weak</li></ul></aside></div></section>
    <section className="section"><div className="wrap"><h2>Explore money-recovery topics</h2><div className="category-grid">{site.categories.map(([s,n])=><a className="category" key={s} href={`/category/${s}`}>{n} →</a>)}</div></div></section>
    <section id="latest" className="section"><div className="wrap"><h2>Latest</h2><div className="grid">{articles.map((a,i)=><article className="card" key={a.slug}><a href={`/article/${a.slug}`}><Image className="card-image" src={`/article/${a.slug}/opengraph-image`} width={1200} height={675} sizes="(max-width: 850px) 100vw, 33vw" alt="" priority={i===0}/></a><div className="card-body"><span className="tag">{a.category?.replaceAll('-',' ')}</span><h3><a href={`/article/${a.slug}`}>{a.title}</a></h3><p>{a.description}</p><div className="meta">{new Date(a.published).toLocaleDateString('en-US')} · {a.author||'Refund Money Now Desk'}</div></div></article>)}</div></div></section>
  </main>
}
