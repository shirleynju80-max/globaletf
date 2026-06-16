import { parseEastMoneyAnnouncementList, pickLimitAnnouncement } from "../src/providers/directChannelLimits/announcements";

async function main() {
  for (const code of ["016452", "016453", "021000", "513390", "016055", "024237"]) {
    const all = [];
    for (let page = 1; page <= 8; page++) {
      const response = await fetch(
        `https://fundf10.eastmoney.com/F10DataApi.aspx?type=jjgg&code=${code}&page=${page}&per=20`,
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
      );
      const rows = parseEastMoneyAnnouncementList(await response.text());
      if (rows.length === 0) break;
      all.push(...rows);
    }
    const picked = pickLimitAnnouncement(all);
    const hits = all.filter((row) => /(限额|大额|暂停|I类|直销|恢复申购)/.test(row.title)).slice(0, 8);
    console.log(code, "total", all.length, "picked", picked?.title?.slice(0, 70) ?? null);
    for (const hit of hits) console.log(" ", hit.date, hit.title.slice(0, 90));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
