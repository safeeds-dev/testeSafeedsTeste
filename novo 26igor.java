(function () {
  // 1 Encontra dias de entrega Estado
  function diasFrete(estado, tabela) {
    var alvo = String(estado || "").trim().toUpperCase();
    if (alvo === "" || alvo === "0") return null;
    var t = String(tabela || "");
    t = t.split("<p>").join("---").split("</p>").join("---");
    t = t.split("<br>").join("---").split("<br/>").join("---").split("<br />").join("---");
    t = t.split("&nbsp;").join("").split(" ").join("").split("\n").join("---").split(";").join("---");
    t = "---" + t.toUpperCase() + "---";
    var chave = "---" + alvo + ":";
    var pos = t.indexOf(chave);
    if (pos < 0) return null;
    var resto = t.substring(pos + chave.length);
    var txt = resto.substring(0, resto.indexOf("---")).split(",").join(".");
    if (txt === "") return null;
    var v = Number(txt);
    if (v !== v) return null;
    return v;
  }

  const frete = diasFrete("[Venda.Estado de destino]", `[Sua Empresa.DiasFretePorEstado]`);
  if (frete === null) return "";

  // 2. Data: extrai AAAA-MM-DD e trabalha em UTC (sem erro de fuso)
  const m = String("[Produto da venda.Data da venda]").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  const leadTxt = String("[Produto.Leadtime (dia)]").trim();
  const leadtime = Number(leadTxt);
  if (leadTxt === "" || leadtime !== leadtime) return "";

  date.setUTCDate(date.getUTCDate() + leadtime + frete);

  const dia = date.getUTCDay();
  if (dia === 0) date.setUTCDate(date.getUTCDate() + 1);
  else if (dia === 6) date.setUTCDate(date.getUTCDate() + 2);

  const d = ("0" + date.getUTCDate()).slice(-2);
  const mm = ("0" + (date.getUTCMonth() + 1)).slice(-2);
  return d + "/" + mm + "/" + date.getUTCFullYear();
})()