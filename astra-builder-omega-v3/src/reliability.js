export function reliabilitySnapshot(env=process.env){
 const configured=(...names)=>names.every(name=>Boolean(String(env[name]||"").trim()));
 const components={
  railwayTracing:{status:configured("OTEL_EXPORTER_OTLP_ENDPOINT")?"CONFIGURED":"PLATFORM_MANAGED_OR_UNVERIFIED"},
  gatus:{status:configured("ASTRA_GATUS_URL")?"CONFIGURED":"UNCONFIGURED"},
  litellm:{status:configured("ASTRA_LLM_GATEWAY_BASE")?"CONFIGURED":"UNCONFIGURED"},
  trigger:{status:configured("TRIGGER_SECRET_KEY")?"CONFIGURED":"UNCONFIGURED"},
  langfuse:{status:configured("LANGFUSE_PUBLIC_KEY","LANGFUSE_SECRET_KEY","LANGFUSE_BASE_URL")?"CONFIGURED":"UNCONFIGURED"}
 };
 const configuredCount=Object.values(components).filter(x=>x.status==="CONFIGURED").length;
 return {schema:"astra-reliability/v1",service:"astra-builder-omega",status:configuredCount>0?"PARTIAL":"UNVERIFIED",components,timestamp:new Date().toISOString()};
}
