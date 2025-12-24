import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = await createApp();

app.listen(PORT, () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
});
