import Image from 'next/image';
import {notFound} from 'next/navigation';
import {getArticle,renderBody} from '../../../lib/articles';
import {site} from '../../../lib/site';

export async function generateMetadata({params}){
  const {slug}=await params; const a=getArticle(slug); if(!a) return {};
  const image=`/article/${slug}/opengraph-image`;
  return {title:a.title,description:a.description,alternates:{canonical:`/article/${slug}`},openGraph:{type:'article',title:a.title,description:a.description,url:`${site.domain}/article/${slug}`,publishedTime:a.published,modifiedTime:a.modified||a.published,authors:[a.author||'Refund Money Now Desk'],images:[{url:image,width:1200,height:675,alt:a.title}]},twitter:{card:'summary_large_image',title:a.title,description:a.description,images:[image]}};
}

function Inline({text='',sources=[]}){
  const parts=[];const re=/(\[([^\]]+)\]\(([^)]+)\)|\[S(\d+)\])/g;let last=0,m,i=0;
  while((m=re.exec(text))){if(m.index>last)parts.push(text.slice(last,m.index));if(m[2]&&m[3])parts.push(<a className="inline-link" key={`l${i++}`} href={m[3]}>{m[2]}</a>);else{const n=Number(m[4]);const href=sources[n-1];parts.push(href?<a className="citation" key={`c${i++}`} href={href} target="_blank" rel="noopener noreferrer">S{n}</a>:m[0])}last=re.lastIndex}if(last<text.length)parts.push(text.slice(last));return parts;
}

export default async function Article({params}){
  const {slug}=await params; const a=getArticle(slug); if(!a) notFound();
  const hero=`/article/${slug}/opengraph-image`;
  const schema={"@context":"https://schema.org","@type":"NewsArticle","headline":a.title,"description":a.description,"image":[`${site.domain}${hero}`],"datePublished":a.published,"dateModified":a.modified||a.published,"author":{"@type":"Organization","name":a.author||'Refund Money Now Desk',"url":`${site.domain}/authors/refund-money-now-desk`},"publisher":{"@type":"NewsMediaOrganization","name":site.name,"url":site.domain},"mainEntityOfPage":`${site.domain}/article/${slug}`};
  const blocks=renderBody(a.body);const sources=Array.isArray(a.sources)?a.sources:[];
  return <main className="section"><article className="article"><span className="tag">{a.category?.replaceAll('-',' ')}</span><h1>{a.title}</h1><p className="meta">Published {new Date(a.published).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} · <a href="/authors/refund-money-now-desk">{a.author||'Refund Money Now Desk'}</a></p><Image className="article-hero" src={hero} width={1200} height={675} sizes="(max-width: 850px) 100vw, 790px" alt={a.title} priority/><div className="notice"><strong>Important:</strong> This article is general information, not individualized financial or legal advice. Rules and deadlines can change; verify current instructions with the cited source.</div>{blocks.map(b=>b.type==='h2'?<h2 key={b.key}>{<Inline text={b.text} sources={sources}/>}</h2>:b.type==='ul'?<ul key={b.key}>{b.items.map((x,i)=><li key={i}><Inline text={x} sources={sources}/></li>)}</ul>:<p key={b.key}><Inline text={b.text} sources={sources}/></p>)}{sources.length?<div className="sources"><strong>Primary and authoritative sources</strong><ol>{sources.map((s,i)=><li key={i}><a href={s} target="_blank" rel="noopener noreferrer">Source S{i+1}: {s}</a></li>)}</ol></div>:null}<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}} /></article></main>
}
