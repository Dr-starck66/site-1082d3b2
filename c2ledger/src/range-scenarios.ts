export type RangeScenario = {
  id:string;
  name:string;
  objective:string;
  threatModel:string;
  environment:string;
  safetyBoundary:string[];
  stages:Array<{
    phase:string;
    adversaryIntent:string;
    simulation:string;
    telemetry:string[];
    expectedDetection:string[];
    containment:string[];
    recovery:string[];
    passCriteria:string[];
  }>;
};

export const RANGE_SCENARIOS:RangeScenario[]=[
 {
  id:"MA-BLOCKCHAIN-DEADDROP-01",
  name:"Blockchain dead-drop to developer execution path",
  objective:"Validate detection of an adversary chain that uses a blockchain transaction as a rendezvous/dead-drop signal before execution-capable developer tooling is reached.",
  threatModel:"A sophisticated actor abuses legitimate public-chain infrastructure to hide control metadata and relies on a compromised developer workflow to resolve the metadata into an execution decision.",
  environment:"Synthetic repository, local mock RPC service, fake transaction corpus, isolated runner, no public targets.",
  safetyBoundary:["No exploit delivery","No live credential theft","No arbitrary command execution","No Internet target selection","All destinations resolve to local/mock services"],
  stages:[
   {
    phase:"1. Initial foothold simulation",
    adversaryIntent:"Place a benign but suspicious dependency/configuration change where a developer or CI system would consume it.",
    simulation:"Inject a synthetic repository diff containing an install-hook marker and a mocked blockchain-RPC lookup. The hook body is inert text and never executes.",
    telemetry:["repository diff","manifest mutation event","CI file-change event"],
    expectedDetection:["supply-chain change classified","install-hook signal correlated","no malicious verdict from hook alone"],
    containment:["quarantine the synthetic commit","block promotion to protected branch"],
    recovery:["restore known-good manifest","re-run dependency and policy checks"],
    passCriteria:["CI gate blocks correlated high-risk chain","benign controls remain allowed","evidence digest produced"]
   },
   {
    phase:"2. Dead-drop resolution",
    adversaryIntent:"Retrieve control metadata from a public-chain-like source without using an attacker-owned domain.",
    simulation:"Query a local mock RPC endpoint that returns a synthetic transaction containing an encoded localhost-only marker.",
    telemetry:["RPC request","transaction decode event","dead-drop correlation event"],
    expectedDetection:["CHAIN_RPC detected","DEAD_DROP detected","on-chain + execution correlation raised"],
    containment:["deny transition from decoded data to execution-capable stage"],
    recovery:["invalidate synthetic IOC","reset watcher cursor to verified checkpoint"],
    passCriteria:["decoded material never reaches an execution sink","incident created with chain-of-custody evidence"]
   },
   {
    phase:"3. Execution-attempt emulation",
    adversaryIntent:"Turn resolved metadata into an execution decision.",
    simulation:"Emit a synthetic execution-attempt event instead of executing code. The event contains a non-executable token and is consumed only by the range harness.",
    telemetry:["execution-attempt event","policy denial","incident escalation"],
    expectedDetection:["execution correlation elevates risk","DUALITY_ARBITER selects attack hypothesis","TARDIGRADE state remains fail-closed"],
    containment:["block execution transition","preserve forensic capsule"],
    recovery:["replay from clean checkpoint","verify rulepack and release fingerprint"],
    passCriteria:["zero command executed","proof capsule generated","replay produces deterministic decision"]
   }
  ]
 },
 {
  id:"MA-CI-TRUST-BOUNDARY-02",
  name:"CI trust-boundary compromise rehearsal",
  objective:"Exercise detection of a pull-request-controlled input crossing into a privileged CI context.",
  threatModel:"A capable actor attempts to exploit CI trust assumptions so untrusted contribution metadata influences a privileged workflow.",
  environment:"Synthetic pull request metadata, local CI fixture, no GitHub secret access, no external callbacks.",
  safetyBoundary:["No real token use","No secret exfiltration","No network callback","No fork execution","Fixture-only repository state"],
  stages:[
   {
    phase:"1. Untrusted contribution",
    adversaryIntent:"Introduce a crafted change that would be dangerous only if a privileged workflow trusted it.",
    simulation:"Load a fixture representing a privileged workflow consuming pull-request-controlled references.",
    telemetry:["workflow parse","trust-boundary marker","privilege-context classification"],
    expectedDetection:["GHA_UNTRUSTED signal raised","workflow tagged as manual-review required"],
    containment:["prevent privileged job promotion","require signed/approved ref"],
    recovery:["replace unsafe trust transition with immutable reviewed ref"],
    passCriteria:["unsafe fixture blocked","safe push workflow remains allowed"]
   },
   {
    phase:"2. Secret-access pressure",
    adversaryIntent:"Attempt to make privileged context and secret references appear in the same chain.",
    simulation:"Add inert secret-name markers to the fixture; no value is present or retrievable.",
    telemetry:["secret-name reference","privilege-context correlation"],
    expectedDetection:["credential + supply-chain correlation increases score"],
    containment:["deny privileged environment exposure"],
    recovery:["rotate synthetic test credential identifiers","re-run audit verification"],
    passCriteria:["no secret material logged","incident evidence records only redacted identifiers"]
   }
  ]
 },
 {
  id:"MA-DEGRADED-OPS-03",
  name:"Degraded network mission-continuity rehearsal",
  objective:"Validate that assurance remains fail-closed when network, evidence storage, or chain providers are partially unavailable.",
  threatModel:"An adversary or infrastructure event causes intermittent dependency loss during an active investigation.",
  environment:"Fault-injection harness with mocked timeouts, unavailable object store responses and RPC errors.",
  safetyBoundary:["No denial-of-service against external systems","Faults are local mocks only","No destructive storage operations"],
  stages:[
   {
    phase:"1. Sensor degradation",
    adversaryIntent:"Create uncertainty by making one or more telemetry sources unavailable.",
    simulation:"Return bounded timeout/error responses from mock RPC providers.",
    telemetry:["provider timeout","partial-chain status","cursor preservation event"],
    expectedDetection:["state becomes SHIELDED/PARTIAL rather than PASS","watcher cursor does not advance on failed verification"],
    containment:["stop promotion decisions relying on missing telemetry"],
    recovery:["resume only after provider health and checkpoint verification"],
    passCriteria:["no false PASS","no cursor regression","recovery requires explicit verified checkpoint"]
   },
   {
    phase:"2. Evidence-store degradation",
    adversaryIntent:"Prevent durable evidence persistence during incident handling.",
    simulation:"Mock storage write failure while keeping analysis engine online.",
    telemetry:["evidence-store failure","proof-gate downgrade"],
    expectedDetection:["Proof Gate changes to PARTIAL/FAIL according to required-evidence policy"],
    containment:["prevent release promotion"],
    recovery:["retry evidence write","verify digest round-trip before ACTIVE state"],
    passCriteria:["promotion remains blocked until evidence round-trip succeeds"]
   }
  ]
 },
 {
  id:"MA-SUPPLYCHAIN-CORRELATION-04",
  name:"Multi-signal software-supply-chain intrusion rehearsal",
  objective:"Test whether weak signals become actionable only when they form a coherent attack chain.",
  threatModel:"A patient actor distributes suspicious behavior across package metadata, build configuration, obfuscated content and an execution-capable surface.",
  environment:"Static fixture repository containing non-executable markers only.",
  safetyBoundary:["No malware binary","No functional downloader","No real persistence","No credential material"],
  stages:[
   {
    phase:"1. Low-signal precursor",
    adversaryIntent:"Blend into normal developer activity.",
    simulation:"Introduce isolated RPC and build-config markers that should not independently trigger a critical verdict.",
    telemetry:["config diff","RPC marker","dependency metadata change"],
    expectedDetection:["WATCH/ELEVATED only","negative-knowledge rules retain benign counterevidence"],
    containment:["manual observation only"],
    recovery:["none required while below block threshold"],
    passCriteria:["false-positive pressure remains low"]
   },
   {
    phase:"2. Correlation escalation",
    adversaryIntent:"Join previously weak signals into a chain associated with execution and credential pressure.",
    simulation:"Add inert execution and secret-reference markers in separate files; the range harness correlates metadata without executing content.",
    telemetry:["cross-file correlation","execution-capability marker","credential-reference marker"],
    expectedDetection:["risk increases because multiple categories converge","incident dedup merges repeated observations"],
    containment:["CI gate blocks promotion","SOC incident opened"],
    recovery:["remove synthetic malicious deltas","verify clean replay"],
    passCriteria:["correlated chain blocked","clean baseline returns to allowed state","evidence hash chain verifies"]
   }
  ]
 }
];

export function rangeCatalog(){
 return {
  schema:"c2ledger-range-catalog/v1",
  mode:"ISOLATED_ADVERSARY_EMULATION",
  scenarios:RANGE_SCENARIOS,
  safety:{
   liveTargeting:false,
   exploitDelivery:false,
   destructiveActions:false,
   credentialTheft:false,
   propagation:false,
   arbitraryExecution:false
  }
 };
}
