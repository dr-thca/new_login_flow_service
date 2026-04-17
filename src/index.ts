import { createSeashellApp } from "./seashell.js";
import { createSealApp } from "./seal.js";

const SEASHELL_PORT = Number(process.env.SEASHELL_PORT) || 3001;
const SEAL_PORT = Number(process.env.SEAL_PORT) || 3002;

const seashell = createSeashellApp({ sealPort: SEAL_PORT });
const seal = createSealApp();

seashell.listen(SEASHELL_PORT, () => {
  console.log(`Seashell (API) running on http://localhost:${SEASHELL_PORT}`);
});

seal.listen(SEAL_PORT, () => {
  console.log(`Seal (Frontend) running on http://localhost:${SEAL_PORT}`);
});
