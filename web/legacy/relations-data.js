(() => {
  const clientId = (number) => `MID-C-${String(number).padStart(4, "0")}`;
  const pairs = [
    ["MID-A-0001", clientId(3)], ["MID-A-0001", clientId(11)], ["MID-A-0001", clientId(20)],
    ["MID-A-0001", clientId(21)], ["MID-A-0001", clientId(24)], ["MID-A-0001", clientId(18)],
    ["MID-A-0001", clientId(2)], ["MID-A-0001", clientId(8)], ["MID-I-0001", "MID-A-0001"],
    ["MID-I-0001", clientId(24)], ["MID-I-0002", "MID-A-0001"], [clientId(7), clientId(5)],
    [clientId(7), clientId(6)], [clientId(7), clientId(16)], [clientId(6), clientId(5)],
    [clientId(12), clientId(17)], [clientId(12), clientId(9)], [clientId(12), clientId(16)],
    [clientId(13), clientId(2)], [clientId(17), clientId(9)], [clientId(17), clientId(16)],
    [clientId(19), clientId(14)], [clientId(19), clientId(9)], [clientId(19), clientId(1)],
    [clientId(19), clientId(8)], [clientId(19), clientId(2)], [clientId(22), clientId(1)],
    [clientId(25), clientId(9)], [clientId(25), clientId(6)], [clientId(26), clientId(25)],
    [clientId(26), clientId(9)],
  ];

  function typeFromId(id) {
    const value = String(id || "");
    if (value.includes("-C-")) return "client";
    if (value.includes("-A-")) return "anomaly";
    if (value.includes("-I-")) return "incident";
    return "";
  }

  function forRecord(type, id) {
    const recordId = String(id || "");
    const seen = new Set();
    return pairs.reduce((result, pair) => {
      const targetId = pair[0] === recordId ? pair[1] : pair[1] === recordId ? pair[0] : "";
      const targetType = typeFromId(targetId);
      const key = `${targetType}:${targetId}`;
      if (!targetId || !targetType || targetId === recordId || seen.has(key)) return result;
      seen.add(key);
      const target = window.MIDGAS_RECORDS?.[targetType]?.[targetId];
      result.push({
        type: targetType,
        id: targetId,
        label: target?.name || target?.alias || targetId,
      });
      return result;
    }, []);
  }

  window.MIDGAS_RELATIONS = Object.freeze({
    pairs: pairs.map((pair) => [...pair]),
    typeFromId,
    forRecord,
  });
})();
