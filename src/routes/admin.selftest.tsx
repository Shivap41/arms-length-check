import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasscodeGate } from "@/components/passcode-gate";
import { rulesSelftest } from "@/lib/admin.functions";

const description = "Rules self-test: the conflict rules run against synthetic cases, with no live data.";
export const Route = createFileRoute("/admin/selftest")({
  head: () => ({ meta: [{ title: "Rules self-test | Faculty Review" }, { name: "description", content: description }, { name: "robots", content: "noindex" }] }),
  component: Selftest,
});

type Rows = { rows: { id: number; name: string; expected: string; actual: string; pass: boolean }[]; passed: number; total: number };
function Selftest() {
  const run = useServerFn(rulesSelftest);
  const [passcode, setPasscode] = useState("");
  const [data, setData] = useState<Rows>();
  const [busy, setBusy] = useState(false);
  async function load(code: string): Promise<string | null> {
    const result = await run({ data: { passcode: code } });
    if (!result.ok) return result.error;
    setPasscode(code); setData(result); return null;
  }
  if (!data) return <PasscodeGate title="Rules self-test" intro="Runs the conflict rules against 14 synthetic cases. No live data, no API calls." onUnlock={load} />;
  return <div className="session-page admin-page">
    <header className="case-header"><h1>Rules self-test</h1><p className={data.passed === data.total ? "admin-pass" : "admin-fail"}>{data.passed} of {data.total} pass</p></header>
    <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); void load(passcode).finally(() => setBusy(false)); }}><RotateCw />Run again</Button>
    <div className="reviewer-table-scroll"><table className="reviewer-table admin-table"><thead><tr><th>#</th><th>Case</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.id}><td>{row.id}</td><td>{row.name}</td><td>{row.expected}</td><td>{row.actual}</td><td className={row.pass ? "admin-pass" : "admin-fail"}>{row.pass ? <><Check aria-hidden="true" />PASS</> : <><X aria-hidden="true" />FAIL</>}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>Total</td><td className={data.passed === data.total ? "admin-pass" : "admin-fail"}>{data.passed} / {data.total}</td></tr></tfoot>
    </table></div>
  </div>;
}
