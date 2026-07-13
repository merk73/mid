import fs from "node:fs";
import vm from "node:vm";

const registry = {
  client: {
    "MID-C-0003": { id: "MID-C-0003", name: "Клиент 3" },
    "MID-C-0005": { id: "MID-C-0005", name: "Клиент 5" },
    "MID-C-0007": { id: "MID-C-0007", name: "Клиент 7" },
  },
  anomaly: { "MID-A-0001": { id: "MID-A-0001", name: "Аномалия" } },
  incident: {},
};
const context = { window: { MIDGAS_RECORDS: registry } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL("../web/relations-data.js", import.meta.url), "utf8"), context);

const anomalyLinks = context.window.MIDGAS_RELATIONS.forRecord("anomaly", "MID-A-0001");
const clientLinks = context.window.MIDGAS_RELATIONS.forRecord("client", "MID-C-0003");
const pairLinks = context.window.MIDGAS_RELATIONS.forRecord("client", "MID-C-0007");

if (!anomalyLinks.some((item) => item.id === "MID-C-0003")) throw new Error("outgoing base relation missing");
if (!clientLinks.some((item) => item.id === "MID-A-0001")) throw new Error("inverse base relation missing");
if (!pairLinks.some((item) => item.id === "MID-C-0005")) throw new Error("client relation missing");
if (new Set(anomalyLinks.map((item) => `${item.type}:${item.id}`)).size !== anomalyLinks.length) throw new Error("relations are not unique");

console.log("relations smoke: ok");
