export type MissionState="READY"|"DEGRADED"|"CONTAINED"|"RECOVERING";

export type MissionMetrics={
  criticalAssetsTotal:number;
  criticalAssetsAvailable:number;
  detectionsExpected:number;
  detectionsObserved:number;
  containmentExpected:number;
  containmentSucceeded:number;
  evidenceExpected:number;
  evidenceVerified:number;
  recoveryObjectives:number;
  recoveryMet:number;
};

function ratio(a:number,b:number){
  if(b<=0) return 1;
  return Math.max(0,Math.min(1,a/b));
}

export function evaluateMission(metrics:MissionMetrics){
  const availability=ratio(metrics.criticalAssetsAvailable,metrics.criticalAssetsTotal);
  const detection=ratio(metrics.detectionsObserved,metrics.detectionsExpected);
  const containment=ratio(metrics.containmentSucceeded,metrics.containmentExpected);
  const evidence=ratio(metrics.evidenceVerified,metrics.evidenceExpected);
  const recovery=ratio(metrics.recoveryMet,metrics.recoveryObjectives);
  const score=Math.round((availability*35+detection*20+containment*20+evidence*10+recovery*15)*100)/100;
  const state:MissionState=
    availability<0.5||containment<0.5?"CONTAINED":
    recovery<0.8?"RECOVERING":
    score>=85?"READY":"DEGRADED";
  return {
    schema:"c2ledger-mission-score/v1",
    score,
    state,
    dimensions:{
      availability:Math.round(availability*10000)/100,
      detection:Math.round(detection*10000)/100,
      containment:Math.round(containment*10000)/100,
      evidence:Math.round(evidence*10000)/100,
      recovery:Math.round(recovery*10000)/100
    },
    policy:{
      readyThreshold:85,
      failClosedContainmentThreshold:50,
      weights:{availability:35,detection:20,containment:20,evidence:10,recovery:15}
    }
  };
}

export const MISSION_OPS_PROFILE={
  mode:"AUTHORIZED_DEFENSIVE_OPERATIONS",
  deployable:true,
  operations:[
    "passive telemetry ingestion",
    "software supply-chain assurance",
    "blockchain-C2/dead-drop detection",
    "incident evidence preservation",
    "mission-impact scoring",
    "containment/recovery coordination",
    "isolated adversary-emulation validation"
  ],
  controls:{
    killSwitch:true,
    failClosed:true,
    boundedConnectors:true,
    arbitraryExecution:false,
    internetTargeting:false,
    exploitDelivery:false,
    destructiveActions:false,
    credentialTheft:false,
    propagation:false
  }
} as const;
