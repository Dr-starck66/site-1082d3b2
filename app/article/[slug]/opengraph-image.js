import {ImageResponse} from 'next/og';
import {getArticle} from '../../../lib/articles';

export const runtime='nodejs';
export const size={width:1200,height:675};
export const contentType='image/png';

export default async function Image({params}){
  const {slug}=await params;
  const a=getArticle(slug);
  const title=a?.title||'Refund Money Now';
  const cat=(a?.category||'consumer money').replaceAll('-',' ');
  return new ImageResponse(
    <div style={{
      width:'100%',height:'100%',display:'flex',flexDirection:'column',
      justifyContent:'space-between',padding:'72px',
      background:'linear-gradient(135deg,#071521 0%,#0f766e 62%,#f59e0b 160%)',
      color:'white',fontFamily:'sans-serif'
    }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:30,fontWeight:800}}>
        <div style={{display:'flex'}}>
          Refund<span style={{color:'#99f6e4'}}>MoneyNow</span>
        </div>
        <div style={{display:'flex',fontSize:22,textTransform:'uppercase',letterSpacing:3,color:'#ccfbf1'}}>{cat}</div>
      </div>
      <div style={{display:'flex',maxWidth:1030,fontSize:64,lineHeight:1.03,fontWeight:900,letterSpacing:-2}}>{title}</div>
      <div style={{display:'flex',fontSize:25,color:'#d7f7f0'}}>Source-backed consumer money reporting · refundmoneynow.com</div>
    </div>,
    size
  );
}
