/* ASTRA LEGAL LIQUIDATION BE Ω — deterministic source-grounded triage.
 * No external LLM, API, cookies, storage, analytics, documents or transmission.
 * This is public legal information, not an attorney-client relationship.
 */
export const SOURCES = Object.freeze({
 cessation:{title:"SPF Économie — Arrêter les activités d'une entreprise",url:"https://business.belgium.be/fr/26"},
 notariat:{title:"Fednot — Dissolution et liquidation d'une société",url:"https://www.notaire.be/entreprendre/la-fin-de-lentreprise/dissolution-et-liquidation-dune-societe"},
 csa:{title:"Code des sociétés et des associations, notamment art. 2:71 et 2:80",url:"https://refli.be/fr/lex/2019A40586"},
 justice:{title:"SPF Justice — JustAct (certaines formes juridiques seulement)",url:"https://www.justice.belgium.be/fr/themes/societes_associations_et_fondations/creer_modifier_ou_dissoudre_une_entreprise_ou_une"},
 finances:{title:"SPF Finances — Société en liquidation, e-DEPO",url:"https://finances.belgium.be/fr/pai/e-depo/soci%C3%A9t%C3%A9-liquid%C3%A9e-ou-en-liquidation"}
});
const entry=(title,answer,steps,sourceKeys,urgency="normal")=>({title,answer,steps,sources:sourceKeys.map(k=>SOURCES[k]),urgency,review:"Relecture par un avocat belge nécessaire avant tout acte, délai ou décision."});
const normalize=v=>String(v??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const companyTypes=new Set(["srl","sa","sc","snc","scomm","asbl","independant","inconnu"]);
export function assessClosure({form="inconnu",debts="inconnu",employees="inconnu",objective="cessation"}={}){
 const entity=normalize(form).trim(),debt=normalize(debts).trim(),staff=normalize(employees).trim();
 if(!companyTypes.has(entity))return entry("Forme non identifiée","Impossible de qualifier la procédure sur cette seule description. Faites vérifier le statut et la juridiction.",["Consultez l'inscription BCE et les statuts.","Demandez une vérification à un avocat belge spécialisé."],["cessation"],"review");
 if(entity==="independant")return entry("Entreprise individuelle : procédure distincte","La cessation d'une entreprise individuelle ne suit pas automatiquement la dissolution-liquidation d'une personne morale.",["Vérifier les inscriptions BCE et TVA.","Vérifier les cotisations sociales, autorisations et contrats.","Faire confirmer les dettes et la responsabilité personnelle."],["cessation"],"review");
 if(debt==="impayables")return entry("Alerte : incapacité de payer les dettes exigibles","Ne présumez pas qu'une liquidation amiable suffit. Il faut évaluer sans délai les obligations et voies applicables à une entreprise en difficulté, notamment le risque de cessation des paiements.",["Consulter rapidement un avocat belge en insolvabilité et un professionnel du chiffre.","Préserver les relevés comptables, échéances, courriers et preuves de paiement.","Ne pas promettre une dissolution en un acte ni un effacement automatique des dettes."],["cessation","csa"],"urgent");
 if(entity==="asbl")return entry("ASBL : vérifier le régime associatif","La dissolution d'une ASBL répond à des règles propres. L'éventuel solde ne peut pas être partagé entre membres comme celui d'une société commerciale.",["Vérifier les statuts, l'organe décisionnaire et les rapports requis.","Distinguer dissolution et liquidation; vérifier les conditions spécifiques d'un acte unique.","Faire contrôler la destination désintéressée de l'actif restant."],["cessation","justice","csa"],"review");
 const docs=["Identifier la forme juridique, les statuts et l'organe compétent.","Établir un état actif-passif actualisé et faire vérifier les rapports nécessaires.","Contrôler les créanciers, les contrats et les éventuelles obligations sociales/fiscales."];
 if(staff==="oui")docs.push("Faire vérifier les obligations envers les travailleurs et la clôture ONSS.");
 if(debt==="payees"){
  return entry("Voie d'un acte unique : seulement sous conditions","La dissolution et la clôture en un seul acte peuvent être examinées au regard de l'article 2:80 CSA, mais le paiement des dettes ne suffit pas. Les conditions légales de rapport, de vote, de désignation de liquidateur et de créances doivent toutes être vérifiées.",[...docs,"Vérifier les conditions de l'article 2:80 avec notaire et expert du chiffre; aucune éligibilité n'est présumée."],["csa","notariat","cessation"],"review");
 }
 return entry("Dissolution et liquidation : parcours à instruire","Le schéma habituel comporte dissolution, réalisation de l'actif, règlement du passif et clôture. L'existence de dettes ne signifie pas automatiquement faillite ; l'incapacité de les payer impose une analyse prioritaire.",[...docs,"Consulter un notaire ou un avocat belge avant de choisir la procédure.","Préparer ensuite les formalités BCE, TVA et sociales selon le dossier."],["cessation","notariat","csa"],"review");
}
export function answerQuestion(question){
 const q=normalize(question).trim();
 if(q.length<4)return entry("Précisez votre question","Indiquez la forme juridique et le sujet, sans nom, numéro BCE, dette nominative ni document confidentiel.",["Exemples : « une SRL peut-elle être liquidée en un acte ? » ; « que faire si elle ne peut payer ses dettes ? »"],["cessation"],"review");
 if(/\b(france|francais|francaise|sasu|sarl francaise)\b/.test(q))return entry("Compétence territoriale","Ce module est limité au droit belge ; il ne peut pas transposer ces règles à une société relevant du droit français.",["Identifier l'État de constitution et la juridiction compétente."],["cessation"],"review");
 if(/(impossible de payer|ne peu[xt] plus payer|ne peut pas payer|insolvab|cessation des paiements|faillit|dettes impay(?:ees|ables)|pas assez pour payer)/.test(q))return assessClosure({form:"srl",debts:"impayables"});
 if(/(independant|entreprise individuelle|personne physique)/.test(q))return assessClosure({form:"independant"});
 if(/(asbl|association)/.test(q))return assessClosure({form:"asbl"});
 if(/(turbo|un seul acte|un acte unique|en une fois|liquidation immediate)/.test(q))return assessClosure({form:"srl",debts:"payees"});
 if(/(tva|604c|bce|onss|cotisation|radiation)/.test(q))return entry("Formalités après la cessation","La fermeture exige une vérification des inscriptions, de la TVA, des cotisations sociales et, si applicable, de l'ONSS. Le SPF Économie indique notamment une déclaration TVA de cessation via 604C sous les conditions applicables.",["Vérifier le statut de l'entreprise, la date de cessation et les obligations encore ouvertes.","Vérifier les délais officiels à la date de la démarche; demander conseil pour votre cas."],["cessation"],"review");
 if(/(combien|cout|frais|prix|tarif|honoraire)/.test(q))return entry("Coût : pas de devis automatique fiable","Les frais belges dépendent de la forme, de la procédure, du notaire, des publications et de la situation comptable. Un tarif français vu sur un site commercial ne s'applique pas à une société belge.",["Demander un devis ventilé au notaire, au professionnel du chiffre et au conseil éventuel.","Contrôler les frais et tarifs officiels en vigueur."],["cessation","notariat"],"review");
 if(/(srl|sa |sc |snc|scomm|dissol|liquid|fermer|clotur|societe)/.test(q))return assessClosure({form:"srl",debts:"inconnu"});
 return entry("Hors du corpus documentaire confirmé","Je ne dispose pas d'une référence suffisante pour répondre à cette question spécialisée sans risque d'erreur. Ce chatbot ne génère pas de jurisprudence ni de consultation personnalisée.",["Reformuler avec une forme juridique et un sujet de dissolution-liquidation belge.","Consulter un avocat du barreau compétent en cas de délai ou de litige."],["cessation"],"review");
}
