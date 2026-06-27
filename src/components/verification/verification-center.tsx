import {
  ensureVerificationWorkflowAction,
  updateVerificationRequestAction
} from "@/lib/actions/verification";

type Provider = {
  id: string;
  name: string;
  provider_type: string;
  notes?: string | null;
};

type Request = {
  id: string;
  student_id: string;
  provider_id: string;
  status: string;
  portal_reference?: string | null;
  instructions?: string | null;
  provider?: Provider | null;
};

const statuses = [
  "not_required",
  "required",
  "pending",
  "verified",
  "failed",
  "suspicious",
  "manual_review",
  "api_not_connected"
];

export function VerificationCenter({
  studentId,
  providers,
  requests
}: {
  studentId: string;
  providers: Provider[];
  requests: Request[];
}) {
  const requestByProvider = new Map(requests.map((request) => [request.provider_id, request]));

  return (
    <div className="section-stack">
      <div className="panel">
        <div className="section-title">
          <div>
            <h1>Verification center</h1>
            <p>NADRA, IBCC, HEC, Board, University, Bank, and Manual workflows are tracked here. API integrations are future/not connected.</p>
          </div>
          <form action={ensureVerificationWorkflowAction}>
            <input type="hidden" name="student_id" value={studentId} />
            <button className="button" type="submit">
              Create workflow
            </button>
          </form>
        </div>
      </div>
      {providers.map((provider) => {
        const request = requestByProvider.get(provider.id);
        return (
          <section className="panel compact" key={provider.id}>
            <div className="section-title">
              <div>
                <h2>{provider.name}</h2>
                <p>{provider.provider_type.replaceAll("_", " ")} - future/not connected</p>
              </div>
              <span className="chip info">{request?.status || "not started"}</span>
            </div>
            {request ? (
              <form action={updateVerificationRequestAction} className="form-grid two">
                <input type="hidden" name="id" value={request.id} />
                <input type="hidden" name="student_id" value={studentId} />
                <label>
                  Status
                  <select name="status" defaultValue={request.status}>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Reference number
                  <input name="portal_reference" defaultValue={request.portal_reference || ""} />
                </label>
                <label className="span-2">
                  Notes
                  <textarea name="instructions" rows={3} defaultValue={request.instructions || ""} />
                </label>
                <button className="button secondary" type="submit">
                  Save verification
                </button>
              </form>
            ) : (
              <p className="muted">Create the workflow to start tracking this provider.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
