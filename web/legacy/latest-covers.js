(() => {
  const records = window.MIDGAS_RECORDS;
  if (!records) return;

  const storageRoot = "https://skvwaovkkoxqfwkcpuvh.supabase.co/storage/v1/object/public/record-covers/";
  const latestCovers = {
    "MID-C-0001": "client/covers/1877a388-6104-4d1f-9d3e-632082eef85b.png",
    "MID-C-0002": "client/covers/4b9f1277-48db-4fe7-8710-e679eab5d664.webp",
    "MID-C-0003": "client/covers/e822bef7-ce18-4d25-bb9e-c53a0b58389b.webp",
    "MID-C-0005": "client/covers/f6e2d16f-ad2b-40c2-b77d-0f843741b0b8.png",
    "MID-C-0006": "client/covers/adf9f376-7877-4a20-97c0-45ed37c7b68c.png",
    "MID-C-0013": "client/covers/17e2b16f-568c-4614-9d08-2f512ab89df5.png",
    "MID-C-0014": "client/covers/f7eb75ea-6cd9-4553-8345-45172f1fec78.png",
    "MID-C-0015": "client/covers/6aa8aa4d-521a-41e9-9dde-f06b87386505.webp",
    "MID-C-0016": "client/covers/785faac5-5557-4d8b-adab-35a4770ef93b.png",
    "MID-C-0017": "client/covers/d52c3258-34ea-4824-b658-fb4edef677a8.png",
    "MID-C-0021": "client/covers/6852da7f-6567-409b-9097-7c0222f97cdd.png",
    "MID-C-0023": "client/covers/72f71d86-8f8a-43fc-b042-651b32d8432e.png",
    "MID-C-0025": "client/covers/7578a9f9-cd31-4624-9800-ab30cdaded97.png",
    "MID-C-0026": "client/covers/63e872b9-35b4-4aaa-b123-70043d3dcbe8.png",
  };

  Object.entries(latestCovers).forEach(([id, path]) => {
    const record = records.client?.[id];
    if (!record) return;
    const url = `${storageRoot}${path}`;
    record.image = url;
    record.cardImage = url;
    delete record.imageFit;
  });
})();
