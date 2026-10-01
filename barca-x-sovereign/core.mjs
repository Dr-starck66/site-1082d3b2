import { createHash, randomUUID } from "node:crypto";

export const XI = [
  ["TER STEGEN","Source integrity","Vérifie la mission, les prémisses et les informations manquantes. Sépare faits et inconnues."],
  ["KOUNDÉ","Constraints & interfaces","Identifie contraintes, interfaces, dépendances et risques aux frontières du système."],
  ["PUYOL","Robustness","Cherche les scénarios d'échec, failles, abus, erreurs et hypothèses dangereuses."],
  ["CUBARSÍ","Decomposition","Décompose le problème en sous-systèmes, ordre de construction et dépendances."],
  ["BALDE","Alternatives","Cherche des alternatives cloud, gratuites ou plus simples que l'axe central pourrait oublier."],
  ["BUSQUETS","Evidence control","Sépare faits, hypothèses, inconnues et critères de preuve. Contrôle la qualité des sources."],
  ["XAVI","Position graph","Organise les rapports, trouve l'information libre et la prochaine passe à plus forte valeur."],
  ["PEDRI","Builder","Transforme la structure en construction concrète, testable et cloud-first."],
  ["GAVI","Adversary","Conteste la construction, cherche contradictions, omissions et faux consensus."],
  ["YAMAL","Line breaker","Propose une combinaison non évidente qui améliore fortement la solution sans inventer de capacités."],
  ["MESSI","Finisher","Synthétise la meilleure réponse finale, concrète, vérifiable et honnête sans répéter les rapports."]
];

const sha = text => createHash("sha256").update(String(text)).digest("hex");

export function missionMode(mission) {
  return /\b(crée|cree|créer|creer|construis|construire|fabrique|développe|developpe|code|implémente|implemente|produis|build|create|make)\b/i.test(mission)
    ? "BUILD" : "ANALYZE";
}

export async function runMission({ mission, invoke, runId = randomUUID() }) {
  if (typeof mission !== "string" || mission.trim().length < 12) throw new Error("INVALID_MISSION");
  const mode = missionMode(mission);
  const players = [];
  const passes = [];
  let context = "";

  for (let i = 0; i < XI.length; i++) {
    const [name, role, instruction] = XI[i];
    const deep = name === "PEDRI" || name === "MESSI";
    const critic = name === "GAVI";
    const input = [
      "MISSION:", mission.trim(),
      "",
      "MODE:", mode,
      "",
      "PASSES REÇUES:",
      context || "Aucune: tu démarres l'action."
    ].join("\n");

    const report = String(await invoke({
      agent: name,
      role,
      instruction:
        "Tu es " + name + " dans le XI BARÇA-X. " + instruction +
        " Joue collectivement, n'invente pas de preuve et reste concis.",
      input,
      profile: critic ? "CRITIC" : deep ? "STANDARD" : "FAST"
    })).trim();

    if (!report) throw new Error("EMPTY_AGENT_OUTPUT:" + name);
    players.push({ number: i + 1, name, role, report, hash: sha(report) });
    passes.push({ phase: String(i + 1).padStart(2,"0"), agent: name, action: role });
    context += (context ? "\n\n" : "") + name + ": " + report;
    if (context.length > 18000) context = context.slice(-18000);
  }

  const finalAnswer = players.at(-1).report;
  const unique = new Set(players.map(p => p.name)).size;
  const evidence = {
    status: players.length === 11 && unique === 11 && players.every(p => p.hash.length === 64) ? "PASS" : "FAIL",
    xiComplete: players.length === 11 && unique === 11,
    reportHashes: Object.fromEntries(players.map(p => [p.name, p.hash])),
    finalHash: sha(finalAnswer)
  };

  return {
    id: runId,
    createdAt: new Date().toISOString(),
    mission: mission.trim(),
    mode,
    formation: "3-2-5 POSITIONAL",
    players,
    passes,
    finalAnswer,
    evidence,
    provenance: {
      engine: "BARCA-X-SOVEREIGN-V1",
      providerPolicy: "Railway private zero-cost model fabric",
      source: "portable-cloud"
    }
  };
}
