import test from "node:test";
import assert from "node:assert/strict";
import { runMission } from "../core.mjs";

test("BARCA-X traverses exactly eleven unique agents and seals evidence", async () => {
  const seen=[];
  const result=await runMission({
    mission:"Construis une architecture cloud vérifiable pour un service de test.",
    invoke:async ({agent})=>{seen.push(agent);return "rapport "+agent;}
  });
  assert.equal(seen.length,11);
  assert.equal(new Set(seen).size,11);
  assert.equal(result.players.length,11);
  assert.equal(result.players.at(-1).name,"MESSI");
  assert.equal(result.evidence.status,"PASS");
  assert.equal(result.evidence.xiComplete,true);
  assert.equal(result.evidence.finalHash.length,64);
});
