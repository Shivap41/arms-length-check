import type { AuditRecord } from "@/data/screeningService";
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
export function auditHtml(record: AuditRecord): string {
  const text = escapeHtml;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Audit record — Faculty Review</title></head><body><header><h1>Prototype — not an official record.</h1><h2>Audit record</h2><dl><dt>Case</dt><dd>${text(record.case)}</dd><dt>Candidate</dt><dd>${text(record.candidate)}</dd><dt>Date (UTC)</dt><dd>${text(record.date)}</dd></dl></header><main>${record.reviewers.map(row => `<article><hr><h2>${text(row.name)}</h2><p>${text(row.institution)}</p><dl><dt>Identity method</dt><dd>${text(row.identityMethod)}</dd><dt>Result</dt><dd>${text(row.result)}</dd><dt>Result reason</dt><dd>${text(row.reason)}</dd><dt>Decision</dt><dd>${row.decision.decision === "approve" ? "Approved" : "Excluded"}</dd><dt>Decision reason</dt><dd>${text(row.decision.reason || "No reason provided")}</dd><dt>Who decided</dt><dd>${text(row.decision.decidedBy)}</dd><dt>When (UTC)</dt><dd>${text(row.decision.decidedAt)}</dd></dl><h3>Evidence</h3>${row.evidence.length ? `<ul>${row.evidence.map(item => `<li>${item.url ? `<a href="${text(item.url)}">${text(item.label)}</a>` : text(item.label)}</li>`).join("")}</ul>` : "<p>No evidence links available.</p>"}</article>`).join("")}</main><footer><hr><p>Fictional demo identities and evidence. The tool flags; the chair decides.</p></footer></body></html>`;
}
export function downloadAudit(record: AuditRecord): void {
  const url = URL.createObjectURL(new Blob([auditHtml(record)], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "faculty-review-audit.html";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
